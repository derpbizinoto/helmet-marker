// core/markers.js — Helmet Marker
// Lógica pura sobre marcadores já lidos (objetos simples, sem Premiere):
// identidade, cores, seleção e validação de deslocamento.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HMMarkers = factory();
})(typeof window !== "undefined" ? window : this, function () {
    "use strict";

    // ---------- identidade ----------
    // Com Premiere 26.3+ cada marcador tem guid. Sem ele (versões antigas ou se a leitura
    // falhar), a identidade é tempo + nome + tipo. Dois marcadores idênticos no mesmo frame
    // ganham um sufixo #2, #3… pela ordem da lista, para nunca colidirem.
    function assignKeys(records) {
        var seen = {};
        records.forEach(function (r) {
            var base = r.guid ? "g:" + r.guid : "t:" + r.startTicks + "|" + r.type + "|" + r.name;
            var n = (seen[base] || 0) + 1;
            seen[base] = n;
            r.key = n === 1 ? base : base + "#" + n;
        });
        return records;
    }

    // ---------- cores ----------
    // Nomes das cores como aparecem nas constantes da API (app.Constants.MarkerColor).
    // A ordem/índice real vem da própria API em tempo de execução (buildColorTable); aqui
    // ficam só o nome na interface e uma cor aproximada para a bolinha da lista.
    var COLOR_INFO = {
        GREEN:   { label: "Verde",    hex: "#47C45A" },
        RED:     { label: "Vermelho", hex: "#E5484D" },
        MAGENTA: { label: "Magenta",  hex: "#D45FD8" },
        ORANGE:  { label: "Laranja",  hex: "#F08A3C" },
        YELLOW:  { label: "Amarelo",  hex: "#F2D14B" },
        BLUE:    { label: "Azul",     hex: "#4F8FF0" },
        CYAN:    { label: "Ciano",    hex: "#45C8D8" }
    };

    // constants: o objeto app.Constants.MarkerColor (nome -> índice numérico).
    // "MAGNETA" é um nome antigo com erro de digitação, mantido pela Adobe; se existir
    // junto com MAGENTA e com o mesmo índice, fica só um.
    function buildColorTable(constants) {
        var byIndex = {};
        Object.keys(constants || {}).forEach(function (name) {
            var index = constants[name];
            if (typeof index !== "number" || !isFinite(index)) return;
            var canonical = name === "MAGNETA" ? "MAGENTA" : name;
            if (byIndex[index] && name === "MAGNETA") return;
            var info = COLOR_INFO[canonical] || { label: canonical, hex: "#B9A8CB" };
            byIndex[index] = { index: index, name: canonical, label: info.label, hex: info.hex };
        });
        return Object.keys(byIndex).map(Number).sort(function (a, b) { return a - b; })
            .map(function (i) { return byIndex[i]; });
    }

    function colorFor(table, index) {
        for (var i = 0; i < table.length; i++) if (table[i].index === index) return table[i];
        return { index: index, name: "?", label: "Cor " + index, hex: "#B9A8CB" };
    }

    // ---------- seleção (fase 0: clique e Ctrl+clique) ----------
    // selected: objeto { chave: true }. Devolve um novo objeto.
    function clickSelect(selected, key, additive) {
        var next = {};
        if (additive) {
            Object.keys(selected || {}).forEach(function (k) { next[k] = true; });
            if (next[key]) delete next[key]; else next[key] = true;
        } else {
            next[key] = true;
        }
        return next;
    }

    // Mantém só as chaves que ainda existem depois de reler os marcadores.
    function pruneSelection(selected, records) {
        var exists = {};
        records.forEach(function (r) { exists[r.key] = true; });
        var next = {};
        Object.keys(selected || {}).forEach(function (k) { if (exists[k]) next[k] = true; });
        return next;
    }

    function selectedRecords(selected, records) {
        return records.filter(function (r) { return selected && selected[r.key]; });
    }

    // ---------- mover ----------
    // Calcula os frames de destino. Recusa (em vez de "encostar" em 0) se algum marcador
    // ficaria antes do início da sequência — nada é alterado pela metade.
    function planMove(records, deltaFrames) {
        deltaFrames = Number(deltaFrames);
        if (!isFinite(deltaFrames) || Math.round(deltaFrames) !== deltaFrames) {
            throw new Error("O deslocamento precisa ser um número inteiro de frames.");
        }
        var plan = records.map(function (r) {
            return { record: r, fromFrame: r.startFrame, toFrame: r.startFrame + deltaFrames };
        });
        var bad = plan.filter(function (p) { return p.toFrame < 0; });
        if (bad.length) {
            throw new Error("Mover " + deltaFrames + " frames deixaria " + bad.length +
                " marcador(es) antes do início da sequência. Nada foi alterado.");
        }
        return plan;
    }

    // ---------- marcadores de teste ----------
    // Plano para criar N marcadores espaçados de "step" frames, começando em startFrame,
    // com as cores em rodízio. Só dados; quem cria é a camada premiere/.
    function planTestMarkers(count, stepFrames, startFrame, colorTable, prefix) {
        prefix = prefix == null ? "Teste " : String(prefix);
        count = Number(count);
        stepFrames = Number(stepFrames);
        startFrame = Number(startFrame) || 0;
        if (!(count >= 1 && count <= 5000 && Math.round(count) === count)) {
            throw new Error("A quantidade precisa ser um número inteiro entre 1 e 5000.");
        }
        if (!(stepFrames >= 1 && Math.round(stepFrames) === stepFrames)) {
            throw new Error("O espaçamento precisa ser um número inteiro de frames (1 ou mais).");
        }
        var digits = String(count).length < 3 ? 3 : String(count).length;
        var out = [];
        for (var i = 0; i < count; i++) {
            var n = String(i + 1);
            while (n.length < digits) n = "0" + n;
            var color = colorTable && colorTable.length ? colorTable[i % colorTable.length].index : null;
            out.push({ name: prefix + n, frame: startFrame + i * stepFrames, colorIndex: color });
        }
        return out;
    }

    return {
        assignKeys: assignKeys,
        buildColorTable: buildColorTable,
        colorFor: colorFor,
        COLOR_INFO: COLOR_INFO,
        clickSelect: clickSelect,
        pruneSelection: pruneSelection,
        selectedRecords: selectedRecords,
        planMove: planMove,
        planTestMarkers: planTestMarkers
    };
});
