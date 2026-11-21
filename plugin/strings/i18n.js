// strings/i18n.js — Helmet Marker
// TODOS os textos da interface passam por aqui. Mesmo padrão do Helmet DL/Cutter/Library:
// o texto fica em português no código e no index.html (o português é a "chave"); em inglês,
// tr() troca pela tradução do dicionário EN abaixo. Inglês é o padrão; a escolha fica salva.
// Para traduzir para outra língua no futuro: copie o EN, traduza os valores e adicione a sigla.
//
//   tr("{0} marcadores", 3)  -> "3 markers"  ({0}, {1}… trocados pelos argumentos)
//   N("frase")               -> sempre a frase em português; marca textos guardados em constantes
//                               (traduzidos depois, ao mostrar, com tr())
//   trMsg(texto)             -> traduz uma mensagem pronta (erros do core/ e premiere/), inclusive
//                               as que têm partes variáveis ({0})
//   HMI18n.apply()           -> traduz o texto fixo do index.html
//
// Diferença para as extensões CEP: o UXP só tem document.createTreeWalker atrás de um
// "feature flag", então o index.html é percorrido à mão (childNodes).
var HMI18n = (function () {

    var LANGS = ["en", "pt"];
    var KEY = "helmetmarker.lang";

    var EN = {
        // --- index.html ---------------------------------------------------------------
        "Prova de conceito": "Proof of concept",
        "Nenhuma sequência ativa": "No active sequence",
        "Atualizar": "Refresh",
        "Nome": "Name",
        "Comentário": "Comment",
        "Tipo": "Type",
        "Duração": "Duration",
        "Abra uma sequência na timeline e clique em Atualizar.": "Open a sequence in the timeline and click Refresh.",
        "Clique para selecionar. Ctrl+clique para adicionar ou tirar da seleção.": "Click to select. Ctrl+click to add to or remove from the selection.",
        "Testes da fase 0": "Phase 0 tests",
        "Mover +10 frames": "Move +10 frames",
        "Com 1 marcador selecionado.": "With 1 marker selected.",
        "Mudar cor": "Change color",
        "Com 2 marcadores selecionados (uma única operação).": "With 2 markers selected (a single operation).",
        "Gerador de marcadores de teste": "Test marker generator",
        "Quantidade": "Count",
        "a cada (frames)": "every (frames)",
        "Criar": "Create",
        "Cria marcadores do tipo Comentário a partir do início da sequência, numa única operação.": "Creates Comment markers from the start of the sequence, in a single operation.",
        "Diagnóstico": "Diagnostics",

        // --- painel ---------------------------------------------------------------------
        "Erro: {0}": "Error: {0}",
        "Lendo marcadores…": "Reading markers…",
        "{0} marcadores lidos em {1} ms.": "{0} markers read in {1} ms.",
        "{0} fps": "{0} fps",
        "{0} (suposto)": "{0} (assumed)",
        "Este marcador não está no frame exato.": "This marker is not on an exact frame.",
        "Esta sequência não tem marcadores. Crie alguns com M na timeline ou use o gerador de teste abaixo.":
            "This sequence has no markers. Add some with M in the timeline or use the test generator below.",
        "Eventos registrados: {0}": "Registered events: {0}",
        "nenhum": "none",
        "Último evento recebido: {0}": "Last event received: {0}",
        "Ticks por frame: {0}": "Ticks per frame: {0}",
        "Início da sequência: {0}": "Sequence start: {0}",
        "Formato de tempo informado pela API: {0}": "Time format reported by the API: {0}",
        "Marcadores com guid: {0} de {1}": "Markers with guid: {0} of {1}",
        "Marcadores fora do frame exato: {0}": "Markers off an exact frame: {0}",
        "{0} selecionado(s)": "{0} selected",
        "Helmet Marker: mover marcador": "Helmet Marker: move marker",
        "Marcador movido 10 frames. Ctrl+Z desfaz.": "Marker moved 10 frames. Ctrl+Z undoes it.",
        "Helmet Marker: mudar cor": "Helmet Marker: change color",
        "Cor alterada em 2 marcadores numa única operação. Um Ctrl+Z desfaz as duas.":
            "Color changed on 2 markers in a single operation. One Ctrl+Z undoes both.",
        "Teste": "Test",
        "Helmet Marker: criar marcadores de teste": "Helmet Marker: create test markers",
        "{0} marcadores criados em {1} ms. Um Ctrl+Z desfaz todos.": "{0} markers created in {1} ms. One Ctrl+Z undoes them all.",
        "Fora do Premiere: a API premierepro não está disponível.": "Outside Premiere: the premierepro API is not available.",

        // --- cores e tipos (core/markers.js e ui/panel.js) -------------------------------
        "Verde": "Green",
        "Vermelho": "Red",
        "Magenta": "Magenta",
        "Laranja": "Orange",
        "Amarelo": "Yellow",
        "Azul": "Blue",
        "Ciano": "Cyan",
        "Cor {0}": "Color {0}",
        "Capítulo": "Chapter",
        "Segmentação": "Segmentation",
        "Link da Web": "Web Link",
        "Ponto de sinalização Flash": "Flash Cue Point",

        // --- mensagens de erro (core/ e premiere/, chegam em português) -------------------
        "Selecione exatamente 1 marcador.": "Select exactly 1 marker.",
        "Selecione exatamente 2 marcadores.": "Select exactly 2 markers.",
        "Escolha uma cor.": "Choose a color.",
        "Nenhum projeto aberto.": "No project open.",
        "O Premiere não informou a taxa de quadros da sequência.": "Premiere didn't report the sequence frame rate.",
        "O Premiere não criou a ação.": "Premiere didn't create the action.",
        "O Premiere recusou uma das ações.": "Premiere refused one of the actions.",
        "O Premiere recusou a operação. Nada foi alterado.": "Premiere refused the operation. Nothing was changed.",
        "Atualize a lista antes de alterar marcadores.": "Refresh the list before changing markers.",
        "Taxa de quadros inválida: {0}": "Invalid frame rate: {0}",
        "Tempo inválido: {0}": "Invalid time: {0}",
        "Ticks por frame inválido: {0}": "Invalid ticks per frame: {0}",
        "Sem informações da taxa de quadros.": "No frame rate information.",
        "O deslocamento precisa ser um número inteiro de frames.": "The offset must be a whole number of frames.",
        "Mover {0} frames deixaria {1} marcador(es) antes do início da sequência. Nada foi alterado.":
            "Moving {0} frames would put {1} marker(s) before the start of the sequence. Nothing was changed.",
        "A quantidade precisa ser um número inteiro entre 1 e 5000.": "The count must be a whole number between 1 and 5000.",
        "O espaçamento precisa ser um número inteiro de frames (1 ou mais).": "The spacing must be a whole number of frames (1 or more)."
    };

    // Iguais nas duas línguas (os testes não cobram tradução para estes).
    var SAME_IN_BOTH = ["HELMET MARKER", "Language / Idioma", "English", "Português", "Timecode", "Magenta", "DF", "NDF"];

    var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    var lang = "en";
    try {
        var saved = window.localStorage.getItem(KEY);
        if (LANGS.indexOf(saved) >= 0) lang = saved;
    } catch (e) { /* sem localStorage (testes): fica o padrão */ }

    var listeners = [];

    function format(text, args) {
        return text.replace(/\{(\d)\}/g, function (m, i) {
            var v = args[+i];
            return v === undefined || v === null ? m : String(v);
        });
    }

    function t(key) {
        key = String(key);
        var text = lang === "en" && hasOwn(EN, key) ? EN[key] : key;
        return format(text, Array.prototype.slice.call(arguments, 1));
    }

    function N(key) {
        return format(String(key), Array.prototype.slice.call(arguments, 1));
    }

    var patterns = null;
    function buildPatterns() {
        patterns = [];
        Object.keys(EN).forEach(function (key) {
            if (!/\{\d\}/.test(key) || key.charAt(0) === "{") return;
            var order = [];
            var src = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{(\d)\\\}/g, function (m, i) {
                order.push(+i);
                return "([\\s\\S]*?)";
            });
            patterns.push({ key: key, re: new RegExp("^" + src + "$"), order: order });
        });
        patterns.sort(function (a, b) { return b.key.length - a.key.length; });
    }

    function msg(text) {
        if (text === undefined || text === null) return "";
        text = String(text);
        if (lang !== "en") return text;
        if (hasOwn(EN, text)) return EN[text];
        if (!patterns) buildPatterns();
        for (var i = 0; i < patterns.length; i++) {
            var m = patterns[i].re.exec(text);
            if (!m) continue;
            var args = [];
            patterns[i].order.forEach(function (n, j) { args[n] = msg(m[j + 1]); });
            return format(EN[patterns[i].key], args);
        }
        return text;
    }

    // ---------- texto fixo do index.html ----------
    var ATTRS = ["title", "placeholder"];
    var fixed = null;

    function walk(node, out) {
        var kids = node.childNodes || [];
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k.nodeType === 3) {
                var key = String(k.nodeValue || "").trim();
                if (key && hasOwn(EN, key)) out.push({ node: k, pt: k.nodeValue, key: key });
            } else if (k.nodeType === 1) {
                if (k.tagName === "SCRIPT" || k.tagName === "STYLE") continue;
                ATTRS.forEach(function (attr) {
                    var v = k.getAttribute && k.getAttribute(attr);
                    if (v && hasOwn(EN, v)) out.push({ el: k, attr: attr, key: v });
                });
                walk(k, out);
            }
        }
    }

    function apply() {
        if (typeof document === "undefined" || !document.body) return;
        if (!fixed) { fixed = []; walk(document.body, fixed); }
        fixed.forEach(function (f) {
            var text = t(f.key);
            if (f.node) f.node.nodeValue = f.pt.replace(f.key, function () { return text; });
            else f.el.setAttribute(f.attr, text);
        });
    }

    function setLang(next) {
        if (LANGS.indexOf(next) < 0 || next === lang) return;
        lang = next;
        try { window.localStorage.setItem(KEY, lang); } catch (e) { /* fica só nesta sessão */ }
        apply();
        listeners.forEach(function (fn) { fn(lang); });
    }

    return {
        t: t,
        N: N,
        message: msg,
        apply: apply,
        setLang: setLang,
        lang: function () { return lang; },
        onChange: function (fn) { listeners.push(fn); },
        EN: EN,
        SAME_IN_BOTH: SAME_IN_BOTH,
        _setLangForTests: function (l) { lang = l; }
    };
})();

var tr = HMI18n.t;
var N = HMI18n.N;
var trMsg = HMI18n.message;

// Os scripts ficam no fim do <body>: a tela já existe aqui.
HMI18n.apply();
