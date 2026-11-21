// core/export.js — Helmet Marker
// Exportações em texto: capítulos do YouTube e CSV. Lógica pura.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("./timecode.js"));
    else root.HMExport = factory(root.HMTimecode);
})(typeof window !== "undefined" ? window : this, function (T) {
    "use strict";

    function pad2(n) { return n < 10 ? "0" + n : String(n); }

    // Segundos REAIS desde o início da sequência (o YouTube conta tempo de relógio; em 29,97
    // o frame 1800 é 60,06 s). Arredonda para baixo, para o capítulo nunca começar depois
    // do marcador.
    function realSeconds(frame, fps) {
        return Math.floor(frame / fps + 1e-9);
    }

    function clock(totalSeconds, withHours) {
        var h = Math.floor(totalSeconds / 3600);
        var m = Math.floor(totalSeconds / 60) % 60;
        var s = totalSeconds % 60;
        return withHours ? h + ":" + pad2(m) + ":" + pad2(s) : pad2(Math.floor(totalSeconds / 60)) + ":" + pad2(s);
    }

    // records: marcadores (qualquer ordem). info: HMTimecode.rateInfo.
    // Título = nome do marcador; sem nome, usa o comentário.
    // Devolve { text, warnings: [mensagens em português], lines }.
    function youtubeChapters(records, info) {
        var list = records.slice().sort(function (a, b) { return a.startFrame - b.startFrame; });
        var warnings = [];
        if (!list.length) return { text: "", lines: [], warnings: ["Nenhum marcador para exportar."] };

        var withHours = realSeconds(list[list.length - 1].startFrame, info.fps) >= 3600;
        var lines = [];
        var untitled = 0, dupes = 0, shortOnes = 0;
        var prevSec = null;
        list.forEach(function (r) {
            var sec = realSeconds(r.startFrame, info.fps);
            var title = String(r.name || "").trim() || String(r.comments || "").trim();
            title = title.replace(/[\r\n]+/g, " ");
            if (!title) untitled++;
            if (prevSec !== null && sec === prevSec) dupes++;
            if (prevSec !== null && sec - prevSec < 10 && sec !== prevSec) shortOnes++;
            prevSec = sec;
            lines.push(clock(sec, withHours) + " " + title);
        });
        // (as mensagens não começam com o número, para o trMsg conseguir traduzir)
        if (realSeconds(list[0].startFrame, info.fps) !== 0) {
            warnings.push("Não há marcador em 00:00. O YouTube exige que o primeiro capítulo comece em 00:00.");
        }
        if (list.length < 3) warnings.push("O YouTube exige pelo menos 3 capítulos.");
        if (dupes) warnings.push("Marcadores no mesmo segundo de outro: " + dupes + ".");
        if (shortOnes) warnings.push("Capítulos com menos de 10 segundos (o YouTube exige 10 s ou mais): " + shortOnes + ".");
        if (untitled) warnings.push("Marcadores sem nome nem comentário: " + untitled + ".");
        return { text: lines.join("\n"), lines: lines, warnings: warnings };
    }

    // CSV. opts: { sep: ";" ou ",", info, dropFrame, startFrame, colorLabel(index), typeLabel(type) }
    // Começa com BOM UTF-8 para o Excel reconhecer os acentos. Linhas terminam em \r\n.
    function csv(records, opts) {
        var sep = opts.sep === "," ? "," : ";";
        var info = opts.info;
        var colorLabel = opts.colorLabel || function (i) { return String(i); };
        var typeLabel = opts.typeLabel || function (t) { return String(t); };
        var head = opts.headers || ["Timecode", "Frame", "Segundos", "Nome", "Comentário", "Cor", "Tipo", "Duração", "Duração (frames)"];

        function cell(v) {
            var s = String(v == null ? "" : v);
            if (s.indexOf(sep) >= 0 || s.indexOf("\"") >= 0 || /[\r\n]/.test(s) || /^\s|\s$/.test(s)) {
                s = "\"" + s.replace(/"/g, "\"\"") + "\"";
            }
            return s;
        }

        var rows = [head.map(cell).join(sep)];
        records.slice().sort(function (a, b) { return a.startFrame - b.startFrame; }).forEach(function (r) {
            var seconds = (r.startFrame / info.fps).toFixed(3);
            if (sep === ";") seconds = seconds.replace(".", ",");
            rows.push([
                T.framesToTimecode(r.startFrame, info, opts.dropFrame, opts.startFrame),
                r.startFrame,
                seconds,
                r.name,
                r.comments,
                colorLabel(r.colorIndex),
                typeLabel(r.type),
                r.durationFrames ? T.framesToTimecode(r.durationFrames, info, false, 0) : "",
                r.durationFrames || 0
            ].map(cell).join(sep));
        });
        return "﻿" + rows.join("\r\n") + "\r\n";
    }

    // ---------- fase 3: outros formatos ----------
    var EOL = "\r\n";
    function byStart(records) { return records.slice().sort(function (a, b) { return a.startFrame - b.startFrame; }); }
    function oneLine(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim(); }
    function joinLines(list) { return list.length ? list.join(EOL) + EOL : ""; }

    // TXT simples: timecode, nome e comentário separados por tabulação, um por linha.
    function txt(records, opts) {
        return joinLines(byStart(records).map(function (r) {
            var parts = [T.framesToTimecode(r.startFrame, opts.info, opts.dropFrame, opts.startFrame), oneLine(r.name)];
            if (oneLine(r.comments)) parts.push(oneLine(r.comments));
            return parts.join("\t");
        }));
    }

    // Lista de revisão (para mandar ao cliente / equipe): "1. 01:00:05:12 — comentário".
    // Sem comentário, usa o nome.
    function reviewList(records, opts) {
        return joinLines(byStart(records).map(function (r, i) {
            var text = oneLine(r.comments) || oneLine(r.name);
            return (i + 1) + ". " + T.framesToTimecode(r.startFrame, opts.info, opts.dropFrame, opts.startFrame) + (text ? " — " + text : "");
        }));
    }

    // JSON completo (o Helmet Marker importa de volta). opts.meta: dados da sequência.
    function json(records, opts) {
        var colorLabel = opts.colorLabel || function (i) { return String(i); };
        var data = {
            app: "Helmet Marker",
            format: 1,
            sequence: opts.meta || {},
            markers: byStart(records).map(function (r) {
                return {
                    frame: r.startFrame,
                    timecode: T.framesToTimecode(r.startFrame, opts.info, opts.dropFrame, opts.startFrame),
                    name: String(r.name || ""),
                    comments: String(r.comments || ""),
                    colorIndex: r.colorIndex,
                    color: colorLabel(r.colorIndex),
                    type: String(r.type || ""),
                    durationFrames: r.durationFrames || 0
                };
            })
        };
        return JSON.stringify(data, null, 2) + "\n";
    }

    return { youtubeChapters: youtubeChapters, csv: csv, realSeconds: realSeconds, txt: txt, reviewList: reviewList, json: json };
});
