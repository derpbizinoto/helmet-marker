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

    return {
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
        planRemove: planRemove
    };
});
