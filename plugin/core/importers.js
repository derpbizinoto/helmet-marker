// core/importers.js — Helmet Marker (fase 3)
// Lê texto de vários formatos e devolve os marcadores a criar. Lógica pura (testada no Node);
// quem cria os marcadores é a camada premiere/.
//
// Formatos: lista de tempos colada (inclusive capítulos do YouTube), CSV (o do Helmet Marker, o
// "Exportar marcadores" do Premiere e planilhas com cabeçalho), SRT, EDL (CMX3600: linhas
// "* LOC:" ou, sem elas, um marcador por evento) e JSON (o exportado pelo Helmet Marker).
//
// Tempos:
//   timecode com frames (01:00:05:12) -> "da timeline": desconta o início da sequência
//   relógio sem frames (1:05, 00:01:05.5) e SRT -> "do início" (00:00 = começo da sequência)
//   opts.timeBase "timeline" ou "start" força uma das duas leituras.
//
// Saída: { format, items: [{ frame, durationFrames, name, comments, colorIndex|null, type }],
//          warnings: [mensagens em português] }
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("./timecode.js"));
    else root.HMImport = factory(root.HMTimecode);
})(typeof window !== "undefined" ? window : this, function (T) {
    "use strict";

    var MAX_ITEMS = 5000;

    function fold(s) {
        return String(s == null ? "" : s).toLowerCase()
            .replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
            .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").trim();
    }

    // ---------- cores e tipos por nome ----------
    // Nomes extras usados por Avid/Resolve, levados para a cor mais parecida do Premiere.
    var COLOR_ALIASES = {
        GREEN: ["green", "verde", "mint", "menta"],
        RED: ["red", "vermelho"],
        MAGENTA: ["magenta", "magneta", "pink", "rosa", "rose", "fuchsia", "purple", "roxo", "lavender", "lavanda", "violet", "violeta"],
        ORANGE: ["orange", "laranja", "sand", "cocoa", "cream", "brown", "marrom"],
        YELLOW: ["yellow", "amarelo", "lemon", "limao"],
        BLUE: ["blue", "azul", "sky"],
        CYAN: ["cyan", "ciano", "teal"]
    };

    // colors: tabela do painel (HMMarkers.buildColorTable): [{ index, name, label }]
    function colorIndexByName(value, colors) {
        var v = fold(value).replace(/^resolvecolor/, "").replace(/[^a-z0-9 ]/g, "");
        if (!v) return null;
        var num = /^(?:cor|color|colour)\s*(\d+)$/.exec(v);
        if (num) return Number(num[1]);
        if (/^\d+$/.test(v)) return Number(v);
        for (var i = 0; i < (colors || []).length; i++) {
            var c = colors[i];
            var names = (COLOR_ALIASES[c.name] || []).concat([fold(c.name), fold(c.label)]);
            if (names.indexOf(v) >= 0) return c.index;
        }
        return null;
    }

    var TYPE_ALIASES = {
        Comment: ["comment", "comentario", "comments"],
        Chapter: ["chapter", "capitulo"],
        Segmentation: ["segmentation", "segmentacao"],
        WebLink: ["weblink", "linkdaweb", "link"]
    };

    function typeByName(value) {
        var v = fold(value).replace(/[^a-z]/g, "");
        if (!v) return "";
        var found = "";
        Object.keys(TYPE_ALIASES).forEach(function (t) { if (TYPE_ALIASES[t].indexOf(v) >= 0) found = t; });
        return found;
    }

    // ---------- tempo ----------
    // Lê um tempo (timecode ou relógio) e devolve o frame relativo ao início da sequência.
    // forceDrop: drop-frame avisado pelo arquivo (EDL). defaultBase: base quando opts.timeBase
    // é "auto" ("timeline" para timecode, "start" para relógio).
    function timeToFrame(text, opts, forceDrop) {
        var base = opts.timeBase && opts.timeBase !== "auto" ? opts.timeBase : null;
        var tc = T.timecodeToFrames(text, opts.info, forceDrop);
        if (tc !== null) {
            return (base || "timeline") === "timeline" ? tc - (opts.startFrame || 0) : tc;
        }
        var sec = T.clockToSeconds(text);
        if (sec !== null) {
            var f = Math.round(sec * opts.info.fps);
            return (base || "start") === "timeline" ? f - (opts.startFrame || 0) : f;
        }
        return null;
    }

    function secondsToFrame(sec, opts) {
        var f = Math.round(sec * opts.info.fps);
        return opts.timeBase === "timeline" ? f - (opts.startFrame || 0) : f;
    }

    // Duração escrita como timecode é uma contagem de frames (sempre non-drop).
    function durationToFrames(text, opts) {
        var s = String(text || "").trim();
        if (!s) return 0;
        if (/^\d+$/.test(s)) return Number(s);
        var tc = T.timecodeToFrames(s.replace(/;/g, ":"), opts.info, false);
        if (tc !== null) return tc;
        var sec = T.clockToSeconds(s);
        return sec === null ? 0 : Math.round(sec * opts.info.fps);
    }

    // ---------- resultado ----------
    function Result(format) {
        this.format = format;
        this.items = [];
        this.warnings = [];
        this.before = 0;      // tempos antes do início da sequência
        this.noTime = 0;      // linhas sem tempo reconhecido
    }

    function clean(s) { return String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim(); }

    function push(res, item) {
        if (item.frame === null || item.frame === undefined || !isFinite(item.frame)) { res.noTime++; return; }
        if (item.frame < 0) { res.before++; return; }
        res.items.push({
            frame: Math.round(item.frame),
            durationFrames: Math.max(0, Math.round(item.durationFrames || 0)),
            name: clean(item.name),
            comments: clean(item.comments),
            colorIndex: typeof item.colorIndex === "number" && isFinite(item.colorIndex) ? item.colorIndex : null,
            type: item.type || ""
        });
    }

    function finish(res) {
        if (res.noTime) res.warnings.push("Linhas sem tempo reconhecido (ignoradas): " + res.noTime + ".");
        if (res.before) res.warnings.push("Tempos antes do início da sequência (ignorados): " + res.before + ".");
        if (res.items.length > MAX_ITEMS) {
            res.warnings.push("Só os primeiros " + MAX_ITEMS + " marcadores serão importados.");
            res.items = res.items.slice(0, MAX_ITEMS);
        }
        res.items.sort(function (a, b) { return a.frame - b.frame; });
        return { format: res.format, items: res.items, warnings: res.warnings, before: res.before };
    }

    function lines(text) { return String(text || "").replace(/^﻿/, "").split(/\r\n|\r|\n/); }

    // ---------- lista de tempos ----------
    // "01:00:05:12 Nome", "1:05 - Nome", "00:01:05.5 | Nome | Comentário", capítulos do YouTube…
    var LIST_TIME = /^\s*(\d{1,2}[:;]\d{2}[:;]\d{2}[:;.]\d{2,3}|\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)(?=\s|$|[-–—|:\t])/;

    function parseList(text, opts) {
        var res = new Result("list");
        lines(text).forEach(function (line) {
            if (!line.trim() || /^\s*#/.test(line)) return;
            var m = LIST_TIME.exec(line);
            if (!m) { res.noTime++; return; }
            var rest = line.slice(m[0].length).replace(/^[\s\-–—|:]+/, "");
            var parts = rest.split(/\t| \| /);
            push(res, { frame: timeToFrame(m[1], opts), name: parts[0], comments: parts.slice(1).join(" ") });
        });
        return finish(res);
    }

    // ---------- CSV ----------
    function detectSep(headerLine) {
        var counts = { ";": 0, ",": 0, "\t": 0 };
        var inQ = false;
        for (var i = 0; i < headerLine.length; i++) {
            var ch = headerLine[i];
            if (ch === "\"") inQ = !inQ;
            else if (!inQ && counts[ch] !== undefined) counts[ch]++;
        }
        var best = ";";
        Object.keys(counts).forEach(function (k) { if (counts[k] > counts[best]) best = k; });
        return best;
    }

    function csvRows(text, sep) {
        var rows = [], row = [], cell = "", inQ = false;
        var s = String(text || "").replace(/^﻿/, "");
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (inQ) {
                if (ch === "\"") {
                    if (s[i + 1] === "\"") { cell += "\""; i++; } else inQ = false;
                } else cell += ch;
            } else if (ch === "\"") inQ = true;
            else if (ch === sep) { row.push(cell); cell = ""; }
            else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && s[i + 1] === "\n") i++;
                row.push(cell); rows.push(row); row = []; cell = "";
            } else cell += ch;
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
    }

    var HEADERS = {
        frame: ["frame", "frames"],
        time: ["timecode", "tc", "in", "start", "inicio", "entrada", "time", "tempo", "record in", "rec in"],
        seconds: ["segundos", "seconds", "secs", "s"],
        name: ["nome", "name", "marker name", "nome do marcador", "titulo", "title"],
        comments: ["comentario", "comentarios", "comment", "comments", "description", "descricao", "notes", "notas", "nota", "note"],
        color: ["cor", "color", "colour", "marker color"],
        type: ["tipo", "type", "marker type", "tipo de marcador"],
        durFrames: ["duracao (frames)", "duration (frames)"],
        duration: ["duracao", "duration"],
        out: ["out", "saida", "fim", "end", "record out", "rec out"]
    };

    function mapHeader(row) {
        var map = {};
        row.forEach(function (h, i) {
            var v = fold(h);
            Object.keys(HEADERS).forEach(function (k) {
                if (map[k] === undefined && HEADERS[k].indexOf(v) >= 0) map[k] = i;
            });
        });
        return map;
    }

    function looksLikeCsvHeader(line) {
        var map = mapHeader(csvRows(line, detectSep(line))[0] || []);
        return (map.frame !== undefined || map.time !== undefined || map.seconds !== undefined) &&
            (map.name !== undefined || map.comments !== undefined);
    }

    function parseCsv(text, opts) {
        var res = new Result("csv");
        var first = lines(text).filter(function (l) { return l.trim(); })[0] || "";
        var sep = detectSep(first);
        var rows = csvRows(text, sep);
        if (!rows.length) return finish(res);
        var map = mapHeader(rows[0]);
        if (map.frame === undefined && map.time === undefined && map.seconds === undefined) {
            throw new Error("O CSV não tem coluna de tempo (Timecode, In, Frame ou Segundos).");
        }
        rows.slice(1).forEach(function (r) {
            function col(k) { return map[k] === undefined ? "" : String(r[map[k]] == null ? "" : r[map[k]]).trim(); }
            var frame = null;
            if (col("frame") && /^-?\d+$/.test(col("frame"))) frame = Number(col("frame"));
            else if (col("time")) frame = timeToFrame(col("time"), opts);
            else if (col("seconds")) {
                var sec = Number(col("seconds").replace(",", "."));
                frame = isFinite(sec) ? secondsToFrame(sec, opts) : null;
            }
            var dur = 0;
            if (col("durFrames") && /^\d+$/.test(col("durFrames"))) dur = Number(col("durFrames"));
            else if (col("duration")) dur = durationToFrames(col("duration"), opts);
            else if (col("out") && frame !== null) {
                var outF = timeToFrame(col("out"), opts);
                if (outF !== null && outF > frame) dur = outF - frame;
            }
            push(res, {
                frame: frame,
                durationFrames: dur,
                name: col("name"),
                comments: col("comments"),
                colorIndex: colorIndexByName(col("color"), opts.colors),
                type: typeByName(col("type"))
            });
        });
        return finish(res);
    }

    // ---------- SRT ----------
    var SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

    function srtSeconds(h, m, s, ms) { return +h * 3600 + +m * 60 + +s + Number("0." + ms); }

    function parseSrt(text, opts) {
        var res = new Result("srt");
        var o = { info: opts.info, startFrame: opts.startFrame, timeBase: opts.timeBase === "timeline" ? "timeline" : "start" };
        String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/).forEach(function (block) {
            var ls = block.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
            var at = -1;
            for (var i = 0; i < ls.length; i++) if (SRT_TIME.test(ls[i])) { at = i; break; }
            if (at < 0) { if (ls.length) res.noTime++; return; }
            var m = SRT_TIME.exec(ls[at]);
            var a = secondsToFrame(srtSeconds(m[1], m[2], m[3], m[4]), o);
            var b = secondsToFrame(srtSeconds(m[5], m[6], m[7], m[8]), o);
            var txt = ls.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "");
            push(res, { frame: a, durationFrames: b > a ? b - a : 0, name: txt });
        });
        return finish(res);
    }

    // ---------- EDL (CMX3600) ----------
    var TC4 = "\\d{2}[:;]\\d{2}[:;]\\d{2}[:;]\\d{2}";
    var EDL_EVENT = new RegExp("^\\s*(\\d{1,6})\\s+(\\S+)\\s+\\S+\\s+\\S+(?:\\s+\\d+)?\\s+(" + TC4 + ")\\s+(" + TC4 + ")\\s+(" + TC4 + ")\\s+(" + TC4 + ")");
    var EDL_LOC = new RegExp("^\\s*\\*\\s*LOC:\\s*(" + TC4 + ")\\s+(\\S+)?\\s*(.*)$", "i");
    var EDL_CLIP = /^\s*\*\s*FROM CLIP NAME:\s*(.*)$/i;

    function parseEdl(text, opts) {
        var res = new Result("edl");
        var drop = false;
        var o = { info: opts.info, startFrame: opts.startFrame, timeBase: opts.timeBase === "start" ? "start" : "timeline" };
        var locs = [], events = [], last = null;
        lines(text).forEach(function (line) {
            var fcm = /^\s*FCM:\s*(.*)$/i.exec(line);
            if (fcm) { drop = /^drop/i.test(fcm[1].trim()); return; }
            var loc = EDL_LOC.exec(line);
            if (loc) {
                // Resolve: "* LOC: 01:00:05:00 ResolveColorBlue  Nome |C:... |M:Nome |D:1"
                var rest = loc[3] || "";
                var nameTag = /\|M:([^|]*)/.exec(rest);
                var durTag = /\|D:(\d+)/.exec(rest);
                var textPart = rest.split("|")[0].trim();
                var colorIdx = colorIndexByName(loc[2], opts.colors);
                // sem cor reconhecida, a "cor" era a primeira palavra do texto
                if (colorIdx === null && loc[2]) textPart = (loc[2] + " " + textPart).trim();
                locs.push({
                    frame: timeToFrame(loc[1], o, drop),
                    name: nameTag ? nameTag[1].trim() : textPart,
                    comments: nameTag ? textPart : "",
                    colorIndex: colorIdx,
                    durationFrames: durTag && Number(durTag[1]) > 1 ? Number(durTag[1]) : 0
                });
                return;
            }
            var ev = EDL_EVENT.exec(line);
            if (ev) {
                last = { frame: timeToFrame(ev[5], o, drop), name: ev[2] === "BL" ? "" : ev[2] };
                events.push(last);
                return;
            }
            var clip = EDL_CLIP.exec(line);
            if (clip && last) last.name = clip[1].trim();
        });
        (locs.length ? locs : events).forEach(function (it) { push(res, it); });
        if (!locs.length && events.length) res.warnings.push("A EDL não tem marcadores (LOC): foi criado um marcador por corte (evento).");
        return finish(res);
    }

    // ---------- JSON (exportado pelo Helmet Marker) ----------
    function parseJson(text, opts) {
        var res = new Result("json");
        var data;
        try { data = JSON.parse(String(text || "").replace(/^﻿/, "")); }
        catch (e) { throw new Error("O JSON não pôde ser lido."); }
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.markers) ? data.markers : null);
        if (!list) throw new Error("O JSON não tem uma lista de marcadores.");
        list.forEach(function (m) {
            if (!m || typeof m !== "object") { res.noTime++; return; }
            var frame = typeof m.frame === "number" ? m.frame : (m.timecode ? timeToFrame(m.timecode, opts) : null);
            push(res, {
                frame: frame,
                durationFrames: typeof m.durationFrames === "number" ? m.durationFrames : 0,
                name: m.name,
                comments: m.comments,
                colorIndex: typeof m.colorIndex === "number" ? m.colorIndex : colorIndexByName(m.color, opts.colors),
                type: typeByName(m.type)
            });
        });
        return finish(res);
    }

    // ---------- formato ----------
    function detectFormat(text, fileName) {
        var ext = (/\.([a-z0-9]+)$/i.exec(String(fileName || "")) || [])[1];
        ext = ext ? ext.toLowerCase() : "";
        if (ext === "srt") return "srt";
        if (ext === "edl") return "edl";
        if (ext === "json") return "json";
        if (ext === "csv" || ext === "tsv") return "csv";
        var s = String(text || "").replace(/^﻿/, "").trim();
        if (/^[\[{]/.test(s)) return "json";
        if (/-->/.test(s) && SRT_TIME.test(s)) return "srt";
        if (/^\s*(TITLE:|FCM:)/im.test(s) || EDL_EVENT.test(s.split(/\r?\n/).filter(function (l) { return EDL_EVENT.test(l); })[0] || "")) return "edl";
        var firstLine = s.split(/\r\n|\r|\n/)[0] || "";
        if (looksLikeCsvHeader(firstLine)) return "csv";
        return "list";
    }

    // opts: { format: "auto"|"list"|"csv"|"srt"|"edl"|"json", fileName, info, startFrame,
    //         timeBase: "auto"|"timeline"|"start", colors }
    function parse(text, opts) {
        if (!opts || !opts.info) throw new Error("Sem informações da taxa de quadros.");
        if (!String(text || "").trim()) throw new Error("Nada para importar: abra um arquivo ou cole o texto.");
        var format = !opts.format || opts.format === "auto" ? detectFormat(text, opts.fileName) : opts.format;
        var r = parseAs(format, text, opts);
        // Automático: se TODOS os timecodes caíram antes do início da sequência (ex.: lista em
        // 00:00:10:00 numa sequência que começa em 01:00:00:00), eles eram contados do início.
        if ((!opts.timeBase || opts.timeBase === "auto") && !r.items.length && r.before && opts.startFrame > 0) {
            var o = {};
            Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
            o.timeBase = "start";
            r = parseAs(format, text, o);
            r.warnings.unshift("Os tempos são anteriores ao início da sequência: foram lidos como contados do início (00:00).");
        }
        return r;
    }

    function parseAs(format, text, opts) {
        if (format === "csv") return parseCsv(text, opts);
        if (format === "srt") return parseSrt(text, opts);
        if (format === "edl") return parseEdl(text, opts);
        if (format === "json") return parseJson(text, opts);
        return parseList(text, opts);
    }

    // Tira os que já existem na sequência (mesmo frame e mesmo nome).
    function skipExisting(items, records) {
        var have = {};
        (records || []).forEach(function (r) { have[r.startFrame + "|" + String(r.name || "")] = true; });
        var kept = items.filter(function (it) { return !have[it.frame + "|" + it.name]; });
        return { items: kept, skipped: items.length - kept.length };
    }

    // Texto de arquivo: decodifica UTF-16 (o "Exportar marcadores" do Premiere pode gerar assim)
    // a partir dos bytes. bytes: Uint8Array. Devolve o texto ou null se não for UTF-16 com BOM.
    function decodeUtf16(bytes) {
        if (!bytes || bytes.length < 2) return null;
        var le = bytes[0] === 0xFF && bytes[1] === 0xFE, be = bytes[0] === 0xFE && bytes[1] === 0xFF;
        if (!le && !be) return null;
        // junta em pedaços (fromCharCode com listas grandes estoura a pilha)
        var text = "", chunk = [];
        for (var j = 2; j + 1 < bytes.length; j += 2) {
            chunk.push(le ? bytes[j] | (bytes[j + 1] << 8) : (bytes[j] << 8) | bytes[j + 1]);
            if (chunk.length === 4096) { text += String.fromCharCode.apply(null, chunk); chunk = []; }
        }
        if (chunk.length) text += String.fromCharCode.apply(null, chunk);
        return text;
    }

    return {
        MAX_ITEMS: MAX_ITEMS,
        fold: fold,
        colorIndexByName: colorIndexByName,
        typeByName: typeByName,
        detectFormat: detectFormat,
        parse: parse,
        skipExisting: skipExisting,
        decodeUtf16: decodeUtf16,
        csvRows: csvRows
    };
});
