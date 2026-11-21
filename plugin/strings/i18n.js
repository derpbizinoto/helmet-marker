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
        // --- index.html: lista, filtros e seleção ------------------------------------
        "Nenhuma sequência ativa": "No active sequence",
        "Atualizar": "Refresh",
        "Buscar no nome ou comentário": "Search name or comment",
        "Todos os tipos": "All types",
        "Pontuais e com duração": "Point and ranged",
        "Só pontuais": "Point markers only",
        "Só com duração": "Ranged markers only",
        "Mostra só os marcadores entre o In e o Out da sequência": "Shows only the markers between the sequence In and Out",
        "Só entre In e Out": "Only between In and Out",
        "Limpar filtros": "Clear filters",
        "Selecionar tudo": "Select all",
        "Limpar seleção": "Clear selection",
        "Inverter": "Invert",
        "Selecionar antes": "Select before",
        "Selecionar depois": "Select after",
        "de": "of",
        "o marcador clicado": "the clicked marker",
        "o playhead": "the playhead",
        "Nome": "Name",
        "Comentário": "Comment",
        "Tipo": "Type",
        "Duração": "Duration",
        "Timecode": "Timecode",
        "Abra uma sequência na timeline e clique em Atualizar.": "Open a sequence in the timeline and click Refresh.",
        "Clique: seleciona e leva o playhead até o marcador. Ctrl+clique: soma ou tira da seleção. Shift+clique: seleciona o intervalo.":
            "Click: selects and moves the playhead to the marker. Ctrl+click: adds to or removes from the selection. Shift+click: selects the range.",

        // --- index.html: editar, mover, exportar, testes ------------------------------
        "Editar selecionados": "Edit selected",
        "Cor": "Color",
        "Aplicar": "Apply",
        "Novo nome": "New name",
        "Texto": "Text",
        "Substituir": "Replace",
        "Acrescentar no fim": "Append at the end",
        "Acrescentar no começo": "Add at the start",
        "Excluir selecionados": "Delete selected",
        "Confirmar": "Confirm",
        "Cancelar": "Cancel",
        "Mover": "Move",
        "Deslocar": "Shift",
        "frames": "frames",
        "Mover tudo a partir do playhead (ignora a seleção)": "Move everything from the playhead on (ignores the selection)",
        "Exportar": "Export",
        "Exporta os marcadores selecionados. Sem seleção, exporta todos os que estão na lista (respeitando os filtros).":
            "Exports the selected markers. With no selection, exports everything in the list (filters apply).",
        "Capítulos do YouTube": "YouTube chapters",
        "Copiar": "Copy",
        "Salvar .txt": "Save .txt",
        "Planilha (CSV)": "Spreadsheet (CSV)",
        "Separador": "Separator",
        "Ponto e vírgula (Excel em português)": "Semicolon (Excel in Portuguese)",
        "Vírgula": "Comma",
        "Salvar .csv": "Save .csv",
        "Ferramentas de teste": "Test tools",
        "Criar": "Create",
        "marcadores, a cada": "markers, every",
        "Marcadores do tipo Comentário a partir do início da sequência, numa única operação.": "Comment markers from the start of the sequence, in a single operation.",
        "Diagnóstico": "Diagnostics",

        // --- painel: lista e leitura ------------------------------------------------------
        "Erro: {0}": "Error: {0}",
        "Lendo marcadores…": "Reading markers…",
        "{0} marcadores lidos em {1} ms.": "{0} markers read in {1} ms.",
        "Lista atualizada ({0}).": "List updated ({0}).",
        "{0} fps": "{0} fps",
        "{0} (suposto)": "{0} (assumed)",
        "Este marcador não está no frame exato.": "This marker is not on an exact frame.",
        "Esta sequência não tem marcadores. Crie alguns com M na timeline ou use as ferramentas de teste no fim do painel.":
            "This sequence has no markers. Add some with M in the timeline or use the test tools at the bottom of the panel.",
        "Nenhum marcador passa pelos filtros.": "No marker matches the filters.",
        "{0} marcadores": "{0} markers",
        "{0} na lista": "{0} in the list",
        "{0} selecionado(s)": "{0} selected",
        "In/Out: {0} – {1}": "In/Out: {0} – {1}",
        "Clique num marcador da lista primeiro.": "Click a marker in the list first.",
        "Nenhum marcador nessa posição.": "No markers in that position.",

        // --- painel: prévia e operações ------------------------------------------------
        "Nada a alterar.": "Nothing to change.",
        "Selecione marcadores na lista.": "Select markers in the list.",
        "Vai alterar {0} marcador(es).": "Will change {0} marker(s).",
        "Vai excluir {0} marcador(es).": "Will delete {0} marker(s).",
        "Vai mover todos os marcadores a partir do playhead.": "Will move every marker from the playhead on.",
        "Vai mover {0} marcador(es).": "Will move {0} marker(s).",
        "Nada a alterar: os marcadores já estão assim.": "Nothing to change: the markers are already like that.",
        "Helmet Marker: mudar cor": "Helmet Marker: change color",
        "Cor alterada em {0} marcador(es). Um Ctrl+Z desfaz.": "Color changed on {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: mudar nome": "Helmet Marker: change name",
        "Nome alterado em {0} marcador(es). Um Ctrl+Z desfaz.": "Name changed on {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: mudar comentário": "Helmet Marker: change comment",
        "Comentário alterado em {0} marcador(es). Um Ctrl+Z desfaz.": "Comment changed on {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: mudar tipo": "Helmet Marker: change type",
        "Tipo alterado em {0} marcador(es). Um Ctrl+Z desfaz.": "Type changed on {0} marker(s). One Ctrl+Z undoes it.",
        "Não há marcadores a partir do playhead.": "There are no markers from the playhead on.",
        "Helmet Marker: mover marcadores": "Helmet Marker: move markers",
        "Marcadores movidos: {0}. Um Ctrl+Z desfaz.": "Markers moved: {0}. One Ctrl+Z undoes it.",
        "Digite quantos frames deslocar (negativo volta).": "Type how many frames to shift (negative goes back).",
        "Helmet Marker: excluir marcadores": "Helmet Marker: delete markers",
        "Marcadores excluídos: {0}. Um Ctrl+Z desfaz.": "Markers deleted: {0}. One Ctrl+Z undoes it.",
        "Excluir {0} marcador(es)? Dá para desfazer com Ctrl+Z.": "Delete {0} marker(s)? You can undo it with Ctrl+Z.",
        "Teste": "Test",
        "Helmet Marker: criar marcadores de teste": "Helmet Marker: create test markers",
        "{0} marcadores criados em {1} ms. Um Ctrl+Z desfaz todos.": "{0} markers created in {1} ms. One Ctrl+Z undoes them all.",
        "Fora do Premiere: a API premierepro não está disponível.": "Outside Premiere: the premierepro API is not available.",

        // --- painel: exportar ----------------------------------------------------------
        "{0} capítulo(s).": "{0} chapter(s).",
        "Nenhum marcador para exportar.": "No markers to export.",
        "Frame": "Frame",
        "Segundos": "Seconds",
        "Duração (frames)": "Duration (frames)",
        "Arquivo salvo: {0}": "File saved: {0}",
        "Salvamento cancelado.": "Save canceled.",
        "Capítulos copiados. Cole na descrição do vídeo.": "Chapters copied. Paste them into the video description.",
        "capítulos": "chapters",
        "marcadores": "markers",
        "CSV copiado.": "CSV copied.",
        "Não há marcador em 00:00. O YouTube exige que o primeiro capítulo comece em 00:00.":
            "There is no marker at 00:00. YouTube requires the first chapter to start at 00:00.",
        "O YouTube exige pelo menos 3 capítulos.": "YouTube requires at least 3 chapters.",
        "Marcadores no mesmo segundo de outro: {0}.": "Markers in the same second as another: {0}.",
        "Capítulos com menos de 10 segundos (o YouTube exige 10 s ou mais): {0}.": "Chapters shorter than 10 seconds (YouTube requires 10 s or more): {0}.",
        "Marcadores sem nome nem comentário: {0}.": "Markers with no name or comment: {0}.",

        // --- diagnóstico ----------------------------------------------------------------
        "Eventos registrados: {0}": "Registered events: {0}",
        "nenhum": "none",
        "nenhuma": "none",
        "Último evento recebido: {0}": "Last event received: {0}",
        "Última leitura: {0}": "Last read: {0}",
        "Verificação automática: a cada {0} s (leitura levou {1} ms)": "Automatic check: every {0} s (read took {1} ms)",
        "abertura do painel": "panel opened",
        "botão Atualizar": "Refresh button",
        "verificação automática": "automatic check",
        "antes de uma operação do painel": "before a panel operation",
        "depois de uma operação do painel": "after a panel operation",
        "Ticks por frame: {0}": "Ticks per frame: {0}",
        "Início da sequência: {0}": "Sequence start: {0}",
        "Formato de tempo informado pela API: {0}": "Time format reported by the API: {0}",
        "Marcadores com guid: {0} de {1}": "Markers with guid: {0} of {1}",
        "Marcadores fora do frame exato: {0}": "Markers off an exact frame: {0}",

        // --- cores e tipos ----------------------------------------------------------------
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
        "Escolha uma cor.": "Choose a color.",
        "Digite o novo nome.": "Type the new name.",
        "Modo de comentário inválido.": "Invalid comment mode.",
        "Tipo de marcador inválido.": "Invalid marker type.",
        "O marcador de referência não está na lista (filtro?).": "The reference marker is not in the list (filter?).",
        "Sem referência para antes/depois.": "No reference for before/after.",
        "Nenhum projeto aberto.": "No project open.",
        "O Premiere não informou a taxa de quadros da sequência.": "Premiere did not report the sequence frame rate.",
        "O Premiere não criou a ação.": "Premiere did not create the action.",
        "O Premiere recusou uma das ações.": "Premiere refused one of the actions.",
        "O Premiere recusou a operação. Nada foi alterado.": "Premiere refused the operation. Nothing was changed.",
        "Atualize a lista antes de alterar marcadores.": "Refresh the list before changing markers.",
        "O Premiere não moveu o playhead.": "Premiere did not move the playhead.",
        "O Premiere não informou o In/Out da sequência.": "Premiere did not report the sequence In/Out.",
        "A área de transferência não está disponível.": "The clipboard is not available.",
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
    var SAME_IN_BOTH = ["Language / Idioma", "English", "Português", "Timecode", "Magenta", "DF", "NDF", "−1 s", "+1 s", "−1 frame", "+1 frame", "frames"];

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
