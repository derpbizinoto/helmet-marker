// core/selection.js — Helmet Marker
// Filtros e seleção da lista. Lógica pura: recebe e devolve objetos simples.
// A seleção é um objeto { chave: true }; "anchor" é a chave do último marcador clicado
// (ponto de partida do Shift+clique e referência do "antes/depois do marcador").
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HMSelection = factory();
})(typeof window !== "undefined" ? window : this, function () {
    "use strict";

    // ---------- filtros ----------

    // minúsculas e sem acento ("Cômodo" acha "comodo")
    function fold(s) {
        s = String(s || "").toLowerCase();
        try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* sem normalize */ }
        return s;
    }

    function emptyFilters() {
        return { text: "", colors: [], type: "", duration: "all", inOut: null };
    }

    function isFiltering(f) {
        return !!(f && (String(f.text || "").trim() || (f.colors && f.colors.length) || f.type ||
            (f.duration && f.duration !== "all") || f.inOut));
    }

    // f.inOut: { inFrame, outFrame } ou null. O marcador entra se começa entre o In e o Out
    // (os dois inclusive).
    function applyFilters(records, f) {
        if (!isFiltering(f)) return records.slice();
        var words = fold(f.text).split(/\s+/).filter(Boolean);
        var colors = {};
        (f.colors || []).forEach(function (c) { colors[c] = true; });
        var hasColors = f.colors && f.colors.length;
        var type = fold(f.type);
        return records.filter(function (r) {
            if (hasColors && !colors[r.colorIndex]) return false;
            if (type && fold(r.type) !== type) return false;
            if (f.duration === "point" && r.durationFrames > 0) return false;
            if (f.duration === "ranged" && !(r.durationFrames > 0)) return false;
            if (f.inOut && (r.startFrame < f.inOut.inFrame || r.startFrame > f.inOut.outFrame)) return false;
            if (words.length) {
                var hay = fold(r.name) + "\n" + fold(r.comments);
                for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
            }
            return true;
        });
    }

    // ---------- seleção ----------

    function copy(sel) {
        var out = {};
        Object.keys(sel || {}).forEach(function (k) { if (sel[k]) out[k] = true; });
        return out;
    }

    // Clique na lista. mods: { ctrl, shift }. visibleKeys: chaves na ordem mostrada.
    //   clique simples: só este
    //   Ctrl+clique:    liga/desliga este
    //   Shift+clique:   intervalo do anchor até este (substitui a seleção)
    //   Ctrl+Shift:     soma o intervalo à seleção
    function click(state, key, mods, visibleKeys) {
        mods = mods || {};
        var sel = state.selected || {};
        var anchor = state.anchor;
        if (mods.shift && anchor && visibleKeys.indexOf(anchor) >= 0 && visibleKeys.indexOf(key) >= 0) {
            var a = visibleKeys.indexOf(anchor), b = visibleKeys.indexOf(key);
            var lo = Math.min(a, b), hi = Math.max(a, b);
            var next = mods.ctrl ? copy(sel) : {};
            for (var i = lo; i <= hi; i++) next[visibleKeys[i]] = true;
            return { selected: next, anchor: anchor };
        }
        if (mods.ctrl) {
            var t = copy(sel);
            if (t[key]) delete t[key]; else t[key] = true;
            return { selected: t, anchor: key };
        }
        var one = {};
        one[key] = true;
        return { selected: one, anchor: key };
    }

    function selectAll(visibleKeys) {
        var out = {};
        visibleKeys.forEach(function (k) { out[k] = true; });
        return out;
    }

    // Inverte dentro da lista visível (o que está escondido pelo filtro sai da seleção).
    function invert(sel, visibleKeys) {
        var out = {};
        visibleKeys.forEach(function (k) { if (!(sel && sel[k])) out[k] = true; });
        return out;
    }

    // Mantém só as chaves presentes em keys (depois de reler ou de mudar o filtro).
    function keepOnly(sel, keys) {
        var exists = {};
        keys.forEach(function (k) { exists[k] = true; });
        var out = {};
        Object.keys(sel || {}).forEach(function (k) { if (sel[k] && exists[k]) out[k] = true; });
        return out;
    }

    function selectedRecords(sel, records) {
        return records.filter(function (r) { return sel && sel[r.key]; });
    }

    function count(sel) { return Object.keys(sel || {}).filter(function (k) { return sel[k]; }).length; }

    // Antes/depois de uma referência, entre os marcadores visíveis (ordenados por tempo).
    //   ref = { frame } (playhead): antes = frame menor; depois = frame igual ou maior
    //   ref = { key }   (marcador): antes/depois na ordem da lista, sem o próprio marcador
    function selectRelative(visible, ref, side) {
        var out = {};
        if (ref && ref.key) {
            var idx = -1;
            for (var i = 0; i < visible.length; i++) if (visible[i].key === ref.key) { idx = i; break; }
            if (idx < 0) throw new Error("O marcador de referência não está na lista (filtro?).");
            visible.forEach(function (r, j) {
                if ((side === "before" && j < idx) || (side === "after" && j > idx)) out[r.key] = true;
            });
            return out;
        }
        if (!ref || typeof ref.frame !== "number") throw new Error("Sem referência para antes/depois.");
        visible.forEach(function (r) {
            if ((side === "before" && r.startFrame < ref.frame) || (side === "after" && r.startFrame >= ref.frame)) out[r.key] = true;
        });
        return out;
    }

    return {
        fold: fold,
        emptyFilters: emptyFilters,
        isFiltering: isFiltering,
        applyFilters: applyFilters,
        click: click,
        selectAll: selectAll,
        invert: invert,
        keepOnly: keepOnly,
        selectedRecords: selectedRecords,
        count: count,
        selectRelative: selectRelative
    };
});
