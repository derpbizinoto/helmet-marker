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
        COLOR_INFO: COLOR_INFO,
        planTestMarkers: planTestMarkers
    };
});
