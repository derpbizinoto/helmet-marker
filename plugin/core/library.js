// core/library.js — Helmet Marker (fase 2)
// Listas com nome guardadas pelo painel: seleções salvas e modelos de marcador.
// Só lógica (o painel guarda o texto no localStorage do UXP).
//
// Seleção salva: { name, keys: [chaves dos marcadores] }. As chaves vêm do guid do marcador
// (Premiere 26.3+), então continuam valendo depois de mover ou renomear o marcador.
// Modelo: { name, markerName, color (número ou null), type ("" = não muda), comments, commentMode }
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HMLibrary = factory();
})(typeof window !== "undefined" ? window : this, function () {
    "use strict";

    function clean(name) { return String(name == null ? "" : name).trim(); }
    function same(a, b) { return clean(a).toLowerCase() === clean(b).toLowerCase(); }

    // Texto guardado -> lista. Qualquer coisa estranha vira lista vazia (nunca quebra o painel).
    function parseList(text) {
        if (!text) return [];
        try {
            var v = JSON.parse(text);
            if (!Array.isArray(v)) return [];
            return v.filter(function (x) { return x && typeof x === "object" && clean(x.name); });
        } catch (e) {
            return [];
        }
    }

    function sortByName(list) {
        return list.slice().sort(function (a, b) {
            var x = clean(a.name).toLowerCase(), y = clean(b.name).toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }

    // Acrescenta, ou troca o item de mesmo nome (sem diferenciar maiúsculas).
    function upsert(list, item) {
        var out = list.filter(function (x) { return !same(x.name, item.name); });
        out.push(item);
        return sortByName(out);
    }

    function remove(list, name) {
        return list.filter(function (x) { return !same(x.name, name); });
    }

    function find(list, name) {
        for (var i = 0; i < list.length; i++) if (same(list[i].name, name)) return list[i];
        return null;
    }

    // ---------- seleções salvas ----------
    function makeSelection(name, selectedKeys) {
        name = clean(name);
        if (!name) throw new Error("Dê um nome à seleção.");
        if (!selectedKeys.length) throw new Error("Selecione marcadores na lista.");
        return { name: name, keys: selectedKeys.slice() };
    }

    // Quais marcadores da seleção salva estão na lista agora. missing = excluídos ou
    // escondidos pelos filtros.
    function resolveSelection(saved, visibleRecords) {
        var want = {};
        (saved.keys || []).forEach(function (k) { want[k] = true; });
        var selected = {}, found = 0;
        visibleRecords.forEach(function (r) {
            if (want[r.key]) { selected[r.key] = true; found++; }
        });
        return { selected: selected, found: found, missing: (saved.keys || []).length - found };
    }

    // ---------- modelos ----------
    // form: { name, markerName, color ("keep" ou índice), type ("keep" ou tipo), comments, commentMode }
    function makeTemplate(form) {
        var name = clean(form.name);
        if (!name) throw new Error("Dê um nome ao modelo.");
        var color = form.color === "keep" || form.color === "" || form.color == null ? null : Number(form.color);
        if (color !== null && !isFinite(color)) color = null;
        var tpl = {
            name: name,
            markerName: String(form.markerName || ""),
            color: color,
            type: form.type === "keep" ? "" : String(form.type || ""),
            comments: String(form.comments || ""),
            commentMode: form.commentMode || "replace"
        };
        if (!tpl.markerName && tpl.color === null && !tpl.type && !tpl.comments) {
            throw new Error("O modelo precisa mudar pelo menos uma coisa: nome, cor, tipo ou comentário.");
        }
        return tpl;
    }

    return {
        parseList: parseList,
        upsert: upsert,
        remove: remove,
        find: find,
        makeSelection: makeSelection,
        resolveSelection: resolveSelection,
        makeTemplate: makeTemplate
    };
});
