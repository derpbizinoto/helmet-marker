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

    // "Impressão digital" da lista: muda se qualquer marcador for criado, apagado, movido ou
    // editado. A verificação periódica relê e só redesenha o painel se ela mudar.
    function signature(records) {
        return records.map(function (r) {
            return [r.key, r.startTicks, r.durationFrames, r.colorIndex, r.type, r.name, r.comments].join("");
        }).join("");
    }

    return {
        signature: signature,
        assignKeys: assignKeys,
        buildColorTable: buildColorTable,
        colorFor: colorFor,
        COLOR_INFO: COLOR_INFO
    };
});
