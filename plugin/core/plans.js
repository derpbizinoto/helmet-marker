// core/plans.js — Helmet Marker
// "Planos" de alteração em massa: calculam, sem tocar no Premiere, exatamente o que vai mudar
// em cada marcador. O painel mostra o tamanho do plano ("isso vai alterar N marcadores") e a
// camada premiere/ aplica o plano inteiro numa única transação (um Ctrl+Z).
//
// Cada item do plano: { record, color?, name?, comments?, type?, toFrame?, remove? }
// Marcadores que já estão como pedido ficam de fora (não contam como alteração).
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HMPlans = factory();
})(typeof window !== "undefined" ? window : this, function () {
    "use strict";

    // Tipos aceitos por Marker.createSetTypeAction (doc oficial).
    var TYPES = ["Comment", "Chapter", "Segmentation", "WebLink"];

    function sameType(a, b) {
        return String(a || "").toLowerCase().replace(/[^a-z]/g, "") === String(b || "").toLowerCase().replace(/[^a-z]/g, "");
    }

    function planColor(records, colorIndex) {
        colorIndex = Number(colorIndex);
        if (!isFinite(colorIndex)) throw new Error("Escolha uma cor.");
        return records.filter(function (r) { return r.colorIndex !== colorIndex; })
            .map(function (r) { return { record: r, color: colorIndex }; });
    }

    // Nome vazio é recusado (um clique sem querer apagaria o nome de todos os selecionados).
    function planName(records, name) {
        name = String(name == null ? "" : name);
        if (!name.trim()) throw new Error("Digite o novo nome.");
        return records.filter(function (r) { return r.name !== name; })
            .map(function (r) { return { record: r, name: name }; });
    }

    // mode: "replace" (substituir), "append" (acrescentar no fim), "prepend" (no começo).
    // Ao acrescentar, um espaço separa o texto antigo do novo (se o antigo não estiver vazio).
    function newComment(old, text, mode) {
        old = String(old || "");
        text = String(text == null ? "" : text);
        if (mode === "replace") return text;
        if (!text) return old;
        if (!old) return text;
        return mode === "prepend" ? text + " " + old : old + " " + text;
    }

    function planComments(records, text, mode) {
        if (["replace", "append", "prepend"].indexOf(mode) < 0) throw new Error("Modo de comentário inválido.");
        return records.map(function (r) { return { record: r, comments: newComment(r.comments, text, mode) }; })
            .filter(function (p) { return p.comments !== p.record.comments; });
    }

    function planType(records, type) {
        var t = null;
        TYPES.forEach(function (x) { if (sameType(x, type)) t = x; });
        if (!t) throw new Error("Tipo de marcador inválido.");
        return records.filter(function (r) { return !sameType(r.type, t); })
            .map(function (r) { return { record: r, type: t }; });
    }

    // Deslocamento em frames inteiros. Recusa tudo se algum marcador iria para antes do
    // início da sequência (nada é alterado pela metade).
    function planShift(records, deltaFrames) {
        deltaFrames = Number(deltaFrames);
        if (!isFinite(deltaFrames) || Math.round(deltaFrames) !== deltaFrames) {
            throw new Error("O deslocamento precisa ser um número inteiro de frames.");
        }
        if (deltaFrames === 0) return [];
        var plan = records.map(function (r) { return { record: r, toFrame: r.startFrame + deltaFrames }; });
        var bad = plan.filter(function (p) { return p.toFrame < 0; }).length;
        if (bad) {
            throw new Error("Mover " + deltaFrames + " frames deixaria " + bad +
                " marcador(es) antes do início da sequência. Nada foi alterado.");
        }
        return plan;
    }

    // "Mover tudo após o playhead": todos os marcadores da sequência que começam no playhead
    // ou depois dele (ignora seleção e filtros).
    function afterPlayhead(allRecords, playheadFrame) {
        return allRecords.filter(function (r) { return r.startFrame >= playheadFrame; });
    }

    // 1 segundo de timecode = fps nominal em frames (30 em 29,97; 24 em 23,976).
    function secondsToFrames(seconds, info) {
        return Math.round(Number(seconds)) * info.nominal;
    }

    function planRemove(records) {
        return records.map(function (r) { return { record: r, remove: true }; });
    }

    // ---------- fase 2: localizar e substituir ----------
    // Texto simples (não é expressão regular): troca TODAS as ocorrências.
    function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function replaceText(text, find, repl, matchCase) {
        text = String(text || "");
        if (!find) return text;
        return text.replace(new RegExp(escapeRe(find), matchCase ? "g" : "gi"), function () { return repl; });
    }

    // fields: "both" (nome e comentário), "name" ou "comments".
    function planReplace(records, find, repl, fields, matchCase) {
        find = String(find == null ? "" : find);
        repl = String(repl == null ? "" : repl);
        if (!find) throw new Error("Digite o texto a procurar.");
        if (["both", "name", "comments"].indexOf(fields) < 0) throw new Error("Escolha onde procurar.");
        var plan = [];
        records.forEach(function (r) {
            var item = { record: r }, changed = false;
            if (fields !== "comments") {
                var n = replaceText(r.name, find, repl, matchCase);
                if (n !== r.name) { item.name = n; changed = true; }
            }
            if (fields !== "name") {
                var c = replaceText(r.comments, find, repl, matchCase);
                if (c !== r.comments) { item.comments = c; changed = true; }
            }
            if (changed) plan.push(item);
        });
        return plan;
    }

    // ---------- fase 2: numeração automática ----------
    function isInt(n) { return typeof n === "number" && isFinite(n) && Math.round(n) === n; }

    function padNumber(n, digits) {
        var s = String(Math.abs(n));
        while (s.length < digits) s = "0" + s;
        return (n < 0 ? "-" : "") + s;
    }

    function numberedName(prefix, n, digits, suffix) {
        return String(prefix || "") + padNumber(n, digits) + String(suffix || "");
    }

    // Numera em ordem de tempo: prefixo + número (com zeros à esquerda) + sufixo.
    // opts: { prefix, start, step, digits, suffix }
    function planNumber(records, opts) {
        var start = Number(opts.start), step = Number(opts.step), digits = Number(opts.digits);
        if (!isInt(start)) throw new Error("O número inicial precisa ser um número inteiro.");
        if (!isInt(step) || step === 0) throw new Error("O passo precisa ser um número inteiro diferente de zero.");
        if (!isInt(digits) || digits < 1 || digits > 6) throw new Error("Os dígitos precisam ser um número inteiro de 1 a 6.");
        var ordered = records.map(function (r, i) { return { r: r, i: i }; });
        ordered.sort(function (a, b) { return (a.r.startFrame - b.r.startFrame) || (a.i - b.i); });
        return ordered.map(function (o, k) {
            return { record: o.r, name: numberedName(opts.prefix, start + k * step, digits, opts.suffix) };
        }).filter(function (p) { return p.name !== p.record.name; });
    }

    // ---------- fase 2: modelos de marcador ----------
    // Modelo: { name, markerName, color (número ou null), type ("" = não muda),
    //           comments, commentMode }. Campos vazios não mudam nada.
    function planTemplate(records, tpl) {
        if (!tpl) throw new Error("Escolha um modelo.");
        var type = null;
        if (tpl.type) {
            TYPES.forEach(function (x) { if (sameType(x, tpl.type)) type = x; });
            if (!type) throw new Error("Tipo de marcador inválido.");
        }
        var mode = tpl.commentMode || "replace";
        var plan = [];
        records.forEach(function (r) {
            var item = { record: r }, changed = false;
            if (tpl.markerName && tpl.markerName !== r.name) { item.name = tpl.markerName; changed = true; }
            if (typeof tpl.color === "number" && tpl.color !== r.colorIndex) { item.color = tpl.color; changed = true; }
            if (type && !sameType(type, r.type)) { item.type = type; changed = true; }
            if (tpl.comments) {
                var c = newComment(r.comments, tpl.comments, mode);
                if (c !== r.comments) { item.comments = c; changed = true; }
            }
            if (changed) plan.push(item);
        });
        return plan;
    }

    // ---------- fase 2 (parte B): duração ----------
    // Mesma duração para todos (0 = pontual).
    function planDuration(records, frames) {
        frames = Number(frames);
        if (!isInt(frames) || frames < 0) throw new Error("A duração precisa ser um número inteiro de 0 ou mais.");
        return records.filter(function (r) { return r.durationFrames !== frames; })
            .map(function (r) { return { record: r, durationFrames: frames }; });
    }

    function byFrame(records) {
        return records.map(function (r, i) { return { r: r, i: i }; })
            .sort(function (a, b) { return (a.r.startFrame - b.r.startFrame) || (a.i - b.i); })
            .map(function (o) { return o.r; });
    }

    // ---------- fase 2 (parte B): distribuir ----------
    // O primeiro e o último ficam no lugar; os do meio ficam igualmente espaçados (em frames
    // inteiros, arredondados).
    function planDistribute(records) {
        if (records.length < 3) throw new Error("Selecione pelo menos 3 marcadores.");
        var list = byFrame(records);
        var first = list[0].startFrame, last = list[list.length - 1].startFrame;
        var n = list.length - 1;
        var plan = [];
        list.forEach(function (r, i) {
            var to = Math.round(first + i * (last - first) / n);
            if (to !== r.startFrame) plan.push({ record: r, toFrame: to });
        });
        return plan;
    }

    // ---------- fase 2 (parte B): grade ----------
    // Grade a partir de originFrame, com passo stepFrames (pode ser fracionário no caso do BPM).
    // Cada marcador vai para a linha da grade mais próxima, arredondada para um frame inteiro.
    function nearestOnGrid(frame, originFrame, stepFrames) {
        var k = Math.round((frame - originFrame) / stepFrames);
        var to = Math.round(originFrame + k * stepFrames);
        while (to < 0) { k++; to = Math.round(originFrame + k * stepFrames); }
        return to;
    }

    function gridStep(opts, info) {
        if (opts.mode === "frames") {
            var f = Number(opts.value);
            if (!isInt(f) || f < 1) throw new Error("O intervalo da grade precisa ser um número inteiro de frames (1 ou mais).");
            return f;
        }
        if (opts.mode === "bpm") {
            var bpm = Number(opts.value), beats = Number(opts.beats || 1);
            if (!isFinite(bpm) || bpm <= 0 || bpm > 999) throw new Error("O BPM precisa ser um número maior que 0 (até 999).");
            if (!isFinite(beats) || beats <= 0) throw new Error("Divisão da batida inválida.");
            if (!info || !info.fps) throw new Error("Sem informações da taxa de quadros.");
            return info.fps * 60 / bpm * beats;    // frames por linha da grade (fps real: 29,97 etc.)
        }
        throw new Error("Escolha o tipo de grade.");
    }

    function planQuantize(records, opts, info) {
        var step = gridStep(opts, info);
        var origin = Number(opts.originFrame || 0);
        if (!isInt(origin) || origin < 0) throw new Error("Início da grade inválido.");
        return records.map(function (r) { return { record: r, toFrame: nearestOnGrid(r.startFrame, origin, step) }; })
            .filter(function (p) { return p.toFrame !== p.record.startFrame; });
    }

    // ---------- fase 2 (parte B): encaixar no corte ----------
    // cuts: frames de início/fim dos clipes. Só encaixa se o corte estiver a até maxDistance frames.
    // Empate: o corte anterior.
    function planSnap(records, cuts, maxDistance) {
        maxDistance = Number(maxDistance);
        if (!isInt(maxDistance) || maxDistance < 1) throw new Error("A distância máxima precisa ser um número inteiro de frames (1 ou mais).");
        var list = (cuts || []).filter(function (c) { return isInt(c) && c >= 0; }).sort(function (a, b) { return a - b; });
        if (!list.length) throw new Error("Não há clipes nas trilhas escolhidas.");
        var plan = [];
        records.forEach(function (r) {
            var best = null;
            list.forEach(function (c) {
                var d = Math.abs(c - r.startFrame);
                if (best === null || d < Math.abs(best - r.startFrame)) best = c;
            });
            if (best !== r.startFrame && Math.abs(best - r.startFrame) <= maxDistance) plan.push({ record: r, toFrame: best });
        });
        return plan;
    }

    // ---------- fase 2 (parte B): duplicados e mesclar ----------
    // Grupos: marcadores a até "tolerance" frames do PRIMEIRO do grupo (0 = mesmo frame).
    function clusters(records, tolerance) {
        tolerance = Number(tolerance);
        if (!isInt(tolerance) || tolerance < 0) throw new Error("A distância precisa ser um número inteiro de 0 ou mais frames.");
        var groups = [];
        byFrame(records).forEach(function (r) {
            var g = groups[groups.length - 1];
            if (g && r.startFrame - g[0].startFrame <= tolerance) g.push(r);
            else groups.push([r]);
        });
        return groups.filter(function (g) { return g.length > 1; });
    }

    // Fica o primeiro de cada grupo; os outros são excluídos.
    function planDedupe(records, tolerance) {
        var plan = [];
        clusters(records, tolerance).forEach(function (g) {
            g.slice(1).forEach(function (r) { plan.push({ record: r, remove: true }); });
        });
        return plan;
    }

    // Fica o primeiro de cada grupo, com os comentários de todos juntos (" | ", sem repetir) e,
    // se ele não tiver nome, o primeiro nome que existir no grupo. Os outros são excluídos.
    function planMerge(records, tolerance) {
        var plan = [];
        clusters(records, tolerance).forEach(function (g) {
            var keep = g[0];
            var texts = [];
            g.forEach(function (r) {
                var c = String(r.comments || "").trim();
                if (c && texts.indexOf(c) < 0) texts.push(c);
            });
            var item = { record: keep };
            var joined = texts.join(" | ");
            if (joined !== keep.comments) item.comments = joined;
            if (!keep.name) {
                var named = g.filter(function (r) { return r.name; })[0];
                if (named) item.name = named.name;
            }
            if (item.comments !== undefined || item.name !== undefined) plan.push(item);
            g.slice(1).forEach(function (r) { plan.push({ record: r, remove: true }); });
        });
        return plan;
    }

    return {
        planDuration: planDuration,
        planDistribute: planDistribute,
        nearestOnGrid: nearestOnGrid,
        gridStep: gridStep,
        planQuantize: planQuantize,
        planSnap: planSnap,
        clusters: clusters,
        planDedupe: planDedupe,
        planMerge: planMerge,
        TYPES: TYPES,
        sameType: sameType,
        planColor: planColor,
        planName: planName,
        newComment: newComment,
        planComments: planComments,
        planType: planType,
        planShift: planShift,
        afterPlayhead: afterPlayhead,
        secondsToFrames: secondsToFrames,
        planRemove: planRemove,
        replaceText: replaceText,
        planReplace: planReplace,
        padNumber: padNumber,
        numberedName: numberedName,
        planNumber: planNumber,
        planTemplate: planTemplate
    };
});
