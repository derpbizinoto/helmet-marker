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
        "Buscar": "Search",
        "Todos os tipos": "All types",
        "Qualquer duração": "Any duration",
        "Pontuais": "Point markers",
        "Com duração": "With duration",
        "Mostra só os marcadores entre o In e o Out da sequência": "Shows only the markers between the sequence In and Out",
        "Entre In e Out": "Between In and Out",
        "Tudo": "All",
        "Nenhum": "None",
        "Inverter": "Invert",
        "Antes": "Before",
        "Depois": "After",
        "do marcador clicado": "the clicked marker",
        "do playhead": "the playhead",
        "Nome": "Name",
        "Comentário": "Comment",
        "Tipo": "Type",
        "Duração": "Duration",
        "Timecode": "Timecode",
        "Abra uma sequência na timeline e clique em Atualizar.": "Open a sequence in the timeline and click Refresh.",
        "Clique seleciona · Ctrl soma · Shift pega o intervalo · Duplo clique edita": "Click selects · Ctrl adds · Shift takes the range · Double-click edits",

        // --- index.html: editar, mover, exportar, testes ------------------------------
        "Editar selecionados": "Edit selected",
        "Cor": "Color",
        "Aplicar": "Apply",
        "Novo nome": "New name",
        "Texto": "Text",
        "Substituir": "Replace",
        "No fim": "At the end",
        "No começo": "At the start",
        "Excluir": "Delete",
        "Confirmar": "Confirm",
        "Cancelar": "Cancel",
        "Mover": "Move",
        "Deslocar": "Shift",
        "frames": "frames",
        "Tudo após o playhead": "Everything after the playhead",
        "Exportar": "Export",
        "Selecionados ou, sem seleção, todos da lista.": "Selected markers or, with none selected, all in the list.",
        "Capítulos do YouTube": "YouTube chapters",
        "Copiar": "Copy",
        "Salvar .txt": "Save .txt",
        "Planilha (CSV)": "Spreadsheet (CSV)",
        "Separador": "Separator",
        "Ponto e vírgula": "Semicolon",
        "Vírgula": "Comma",
        "Salvar .csv": "Save .csv",
        "Ferramentas de teste": "Test tools",
        "Criar": "Create",
        "marcadores, a cada": "markers, every",
        "Diagnóstico": "Diagnostics",

        // --- painel: lista e leitura ------------------------------------------------------
        "Erro: {0}": "Error: {0}",
        "Lendo marcadores…": "Reading markers…",
        "{0} marcadores lidos em {1} ms.": "{0} markers read in {1} ms.",
        "Lista atualizada ({0}).": "List updated ({0}).",
        "{0} fps": "{0} fps",
        "{0} (suposto)": "{0} (assumed)",
        "Este marcador não está no frame exato.": "This marker is not on an exact frame.",
        "Esta sequência não tem marcadores.": "This sequence has no markers.",
        "Nenhum marcador passa pelos filtros.": "No marker matches the filters.",
        "{0} marcadores": "{0} markers",
        "{0} na lista": "{0} in the list",
        "{0} selecionado(s)": "{0} selected",
        "In/Out: {0} – {1}": "In/Out: {0} – {1}",
        "Clique num marcador da lista primeiro.": "Click a marker in the list first.",
        "Nenhum marcador nessa posição.": "No markers in that position.",

        // --- painel: prévia e operações ------------------------------------------------
        "Selecione marcadores na lista.": "Select markers in the list.",
        "Vai alterar {0} marcador(es).": "Will change {0} marker(s).",
        "Vai excluir {0} marcador(es).": "Will delete {0} marker(s).",
        "Vai mover todos os marcadores a partir do playhead.": "Will move every marker from the playhead on.",
        "Vai mover {0} marcador(es).": "Will move {0} marker(s).",
        "Nada a alterar: os marcadores já estão assim.": "Nothing to change: the markers are already like that.",
        "✓ Já estão assim.": "✓ Already like this.",
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

        // --- fase 2: seleções salvas, localizar/numerar, modelos, edição na lista ---------
        "Salvas": "Saved",
        "Selecionar": "Select",
        "Apagar": "Delete",
        "Nenhuma seleção salva": "No saved selections",
        "Seleção salva: {0} ({1} marcador(es)).": "Selection saved: {0} ({1} marker(s)).",
        "Selecionados: {0}.": "Selected: {0}.",
        "Selecionados: {0}. Outros {1} da seleção salva não estão na lista (excluídos ou escondidos pelos filtros).":
            "Selected: {0}. Another {1} from the saved selection are not in the list (deleted or hidden by the filters).",
        "Seleção apagada: {0}": "Selection deleted: {0}",
        "Dê um nome à seleção.": "Give the selection a name.",
        "Localizar e numerar": "Find and number",
        "Localizar e substituir": "Find and replace",
        "Procurar": "Find",
        "Trocar por": "Replace with",
        "Nome e comentário": "Name and comment",
        "Só nome": "Name only",
        "Só comentário": "Comment only",
        "Maiúsculas": "Match case",
        "Numeração": "Numbering",
        "Prefixo": "Prefix",
        "Ex.: Cena": "e.g. Scene",
        "Início": "Start",
        "Passo": "Step",
        "Dígitos": "Digits",
        "Sufixo": "Suffix",
        "Numerar": "Number",
        "Primeiro nome: {0}": "First name: {0}",
        "Helmet Marker: localizar e substituir": "Helmet Marker: find and replace",
        "Texto substituído em {0} marcador(es). Um Ctrl+Z desfaz.": "Text replaced in {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: numerar nomes": "Helmet Marker: number names",
        "Nomes numerados: {0}. Um Ctrl+Z desfaz.": "Names numbered: {0}. One Ctrl+Z undoes it.",
        "Digite o texto a procurar.": "Type the text to find.",
        "Escolha onde procurar.": "Choose where to search.",
        "O número inicial precisa ser um número inteiro.": "The start number must be a whole number.",
        "O passo precisa ser um número inteiro diferente de zero.": "The step must be a whole number other than zero.",
        "Os dígitos precisam ser um número inteiro de 1 a 6.": "Digits must be a whole number from 1 to 6.",
        "Modelos de marcador": "Marker templates",
        "Criar no playhead": "Create at playhead",
        "Nenhum modelo salvo": "No saved templates",
        "Crie um modelo abaixo.": "Create a template below.",
        "Escolha um modelo.": "Choose a template.",
        "Editar modelo": "Edit template",
        "Escolher um modelo preenche os campos. Campo vazio não muda.": "Picking a template fills the fields. Empty fields don't change.",
        "Modelo": "Template",
        "Nome do modelo": "Template name",
        "Nome do marcador": "Marker name",
        "Não mudar": "Don't change",
        "Salvar modelo": "Save template",
        "Modelo com cor: desfazer leva dois Ctrl+Z.": "Template with a color: undoing takes two Ctrl+Z.",
        "Modelo salvo: {0}": "Template saved: {0}",
        "Modelo apagado: {0}": "Template deleted: {0}",
        "Dê um nome ao modelo.": "Give the template a name.",
        "O modelo precisa mudar pelo menos uma coisa: nome, cor, tipo ou comentário.": "The template must change at least one thing: name, color, type or comment.",
        "Helmet Marker: aplicar modelo": "Helmet Marker: apply template",
        "Modelo aplicado em {0} marcador(es). Um Ctrl+Z desfaz.": "Template applied to {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: criar marcador do modelo": "Helmet Marker: create marker from template",
        "Helmet Marker: cor do marcador do modelo": "Helmet Marker: template marker color",
        "Marcador criado no playhead. Um Ctrl+Z desfaz.": "Marker created at the playhead. One Ctrl+Z undoes it.",
        "Marcador criado no playhead. Para desfazer, use Ctrl+Z duas vezes (criação e cor).": "Marker created at the playhead. To undo, press Ctrl+Z twice (creation and color).",
        "Marcador criado no playhead, mas não consegui achá-lo para mudar a cor.": "Marker created at the playhead, but I couldn't find it to change its color.",
        "Helmet Marker: editar marcador": "Helmet Marker: edit marker",
        "Marcador alterado. Um Ctrl+Z desfaz.": "Marker changed. One Ctrl+Z undoes it.",
        "O marcador não está mais na lista. Nada foi alterado.": "The marker is no longer in the list. Nothing was changed.",
        "Não consegui guardar no painel.": "Couldn't save it in the panel.",

        // --- fase 2 (parte B): duração, distribuir, cortes, limpeza ----------------
        "Tempo e limpeza": "Timing and cleanup",
        "segundos": "seconds",
        "Tornar pontuais": "Make point markers",
        "Distribuir": "Distribute",
        "Mesmo espaço entre o primeiro e o último.": "Even spacing between the first and the last.",
        "Encaixar no corte": "Snap to cut",
        "Clipes de vídeo e áudio": "Video and audio clips",
        "Só clipes de vídeo": "Video clips only",
        "Só clipes de áudio": "Audio clips only",
        "até": "up to",
        "Encaixar": "Snap to cut",
        "Corte = começo ou fim de clipe.": "Cut = start or end of a clip.",
        "Duplicados e próximos": "Duplicates and nearby markers",
        "Distância": "Distance",
        "Remover": "Remove",
        "Mesclar": "Merge",
        "Remover deixa o primeiro; Mesclar junta os comentários nele.": "Remove keeps the first; Merge joins the comments into it.",
        "A duração precisa ser um número inteiro de 0 ou mais.": "The duration must be a whole number, 0 or more.",
        "Helmet Marker: mudar duração": "Helmet Marker: change duration",
        "Duração alterada em {0} marcador(es). Um Ctrl+Z desfaz.": "Duration changed on {0} marker(s). One Ctrl+Z undoes it.",
        "Helmet Marker: tornar pontuais": "Helmet Marker: make point markers",
        "Marcadores que viraram pontuais: {0}. Um Ctrl+Z desfaz.": "Markers made point markers: {0}. One Ctrl+Z undoes it.",
        "Helmet Marker: distribuir marcadores": "Helmet Marker: distribute markers",
        "Marcadores distribuídos: {0} movidos. Um Ctrl+Z desfaz.": "Markers distributed: {0} moved. One Ctrl+Z undoes it.",
        "Helmet Marker: encaixar no corte": "Helmet Marker: snap to cut",
        "Marcadores encaixados no corte: {0}. Um Ctrl+Z desfaz.": "Markers snapped to a cut: {0}. One Ctrl+Z undoes it.",
        "Nenhum duplicado ou marcador próximo nessa distância.": "No duplicates or nearby markers at this distance.",
        "Grupos encontrados: vai excluir {0} marcador(es).": "Groups found: will delete {0} marker(s).",
        "Helmet Marker: mesclar marcadores": "Helmet Marker: merge markers",
        "Helmet Marker: remover duplicados": "Helmet Marker: remove duplicates",
        "Mesclagem feita: {0} alteração(ões). Um Ctrl+Z desfaz.": "Merge done: {0} change(s). One Ctrl+Z undoes it.",
        "Duplicados removidos: {0}. Um Ctrl+Z desfaz.": "Duplicates removed: {0}. One Ctrl+Z undoes it.",
        "Mesclar e excluir {0} marcador(es)? Dá para desfazer com Ctrl+Z.": "Merge and delete {0} marker(s)? You can undo with Ctrl+Z.",
        "Excluir {0} marcador(es) duplicado(s)? Dá para desfazer com Ctrl+Z.": "Delete {0} duplicate marker(s)? You can undo with Ctrl+Z.",
        "Selecione pelo menos 3 marcadores.": "Select at least 3 markers.",
        "A distância máxima precisa ser um número inteiro de frames (1 ou mais).": "The maximum distance must be a whole number of frames (1 or more).",
        "Não há clipes nas trilhas escolhidas.": "There are no clips on the chosen tracks.",
        "A distância precisa ser um número inteiro de 0 ou mais frames.": "The distance must be a whole number of frames, 0 or more.",

        "Painel": "Panel",
        "Rolagem": "Scrolling",
        "Normal": "Normal",
        "Roda do mouse no painel: {0}": "Mouse wheel in the panel: {0}",
        "recebida": "received",
        "ainda não recebida": "not received yet",
        "Aviso de rolagem no painel: {0}": "Scroll notice in the panel: {0}",
        "recebido": "received",
        "ainda não recebido": "not received yet",
        "Última atualização da lista: {0} ms": "Last list update: {0} ms",

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
        "O espaçamento precisa ser um número inteiro de frames (1 ou mais).": "The spacing must be a whole number of frames (1 or more).",
        // fase 3 (parte B)
        "Levar ao playhead": "Move to playhead",
        "O primeiro vai ao playhead; os outros acompanham.": "The first one goes to the playhead; the others follow.",
        "Vai levar {0} marcador(es) ao playhead.": "Will move {0} marker(s) to the playhead.",
        "Só funciona com marcadores seguidos (nenhum outro no meio, nem escondido pelos filtros).": "Only works with adjacent markers (none in between, not even hidden by the filters).",
        "O Premiere não informou a posição do playhead.": "Premiere did not report the playhead position.",
        "Helmet Marker: levar ao playhead": "Helmet Marker: move to playhead",
        "Marcadores levados ao playhead: {0}. Um Ctrl+Z desfaz.": "Markers moved to the playhead: {0}. One Ctrl+Z undoes it.",
        "A duração precisa ser um número de 0 ou mais.": "The duration must be a number of 0 or more.",
        "Últimos avisos de rolagem (área, ms, posição, passo, o que o painel fez):": "Latest scroll notices (area, ms, position, step, what the panel did):",
        "ponta": "edge (not multiplied)",
        "multiplicou": "multiplied",
        "barra": "scrollbar",
        "ignorou": "ignored",
        "Sequências e clipes": "Sequences and clips",
        "Copiar para outra sequência": "Copy to another sequence",
        "Selecionados (ou todos da lista), no mesmo tempo contado do início.": "Selected (or all in the list), at the same time from the start.",
        "Clipe e sequência": "Clip and sequence",
        "Trazer do clipe": "Bring from clip",
        "Enviar para o clipe": "Send to clip",
        "Selecione clipes na timeline antes. Clipes com velocidade alterada ficam de fora.": "Select clips in the timeline first. Clips with changed speed are skipped.",
        "Checklist e legenda": "Checklist and legend",
        "Marcar feito": "Mark done",
        "Desmarcar": "Unmark",
        "Pendentes": "Pending",
        "Feitos": "Done",
        "Feito põe ✓ no começo do nome.": "Done adds ✓ to the start of the name.",
        "Legenda das cores": "Color legend",
        "O que cada cor significa (ex.: Vermelho = corrigir).": "What each color means (e.g. Red = fix).",
        "Nenhuma outra sequência no projeto": "No other sequence in the project",
        "Clique em Atualizar": "Click Refresh",
        "Escolha a sequência de destino.": "Choose the target sequence.",
        "Nenhum marcador para copiar.": "No markers to copy.",
        "Todos já existem na sequência de destino.": "They all already exist in the target sequence.",
        "Helmet Marker: copiar marcadores": "Helmet Marker: copy markers",
        "Helmet Marker: cores dos copiados": "Helmet Marker: colors of copied markers",
        "Copiados para {0}: {1}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.": "Copied to {0}: {1}. The colors went in as a second step: it takes two Ctrl+Z to undo everything.",
        "Copiados para {0}: {1}. Um Ctrl+Z desfaz.": "Copied to {0}: {1}. One Ctrl+Z undoes it.",
        "A sequência de destino não existe mais. Atualize a lista de sequências.": "The target sequence no longer exists. Refresh the list of sequences.",
        "Selecione um ou mais clipes na timeline.": "Select one or more clips in the timeline.",
        "Clipes com velocidade alterada ficaram de fora: {0}.": "Clips with changed speed were left out: {0}.",
        "Marcadores na parte cortada do clipe (ignorados): {0}.": "Markers in the trimmed part of the clip (ignored): {0}.",
        "Nenhum marcador novo para trazer do clipe.": "No new markers to bring from the clip.",
        "Helmet Marker: trazer marcadores do clipe": "Helmet Marker: bring markers from clip",
        "Marcadores trazidos do clipe: {0}. Um Ctrl+Z desfaz.": "Markers brought from the clip: {0}. One Ctrl+Z undoes it.",
        "Helmet Marker: cores dos trazidos": "Helmet Marker: colors of brought markers",
        "Marcadores trazidos do clipe: {0}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.": "Markers brought from the clip: {0}. The colors went in as a second step: it takes two Ctrl+Z to undo everything.",
        "Nenhum marcador da sequência está em cima dos clipes selecionados.": "No sequence marker sits over the selected clips.",
        "Helmet Marker: enviar marcadores para o clipe": "Helmet Marker: send markers to clip",
        "Helmet Marker: cores dos enviados": "Helmet Marker: colors of sent markers",
        "Marcadores enviados para {0} clipe(s): {1}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.": "Markers sent to {0} clip(s): {1}. The colors went in as a second step: it takes two Ctrl+Z to undo everything.",
        "Marcadores enviados para {0} clipe(s): {1}. Um Ctrl+Z desfaz.": "Markers sent to {0} clip(s): {1}. One Ctrl+Z undoes it.",
        "Significado": "Meaning",
        "Feitos: {0} de {1}": "Done: {0} of {1}",
        "Helmet Marker: marcar como feito": "Helmet Marker: mark as done",
        "Helmet Marker: desmarcar feito": "Helmet Marker: unmark done",
        "Marcados como feitos: {0}. Um Ctrl+Z desfaz.": "Marked as done: {0}. One Ctrl+Z undoes it.",
        "Desmarcados: {0}. Um Ctrl+Z desfaz.": "Unmarked: {0}. One Ctrl+Z undoes it.",
        "Feitos selecionados: {0}.": "Done markers selected: {0}.",
        "Pendentes selecionados: {0}.": "Pending markers selected: {0}.",
        // fase 3 (parte A)
        "Maior travada do painel (últimos 30 s): {0} ms": "Longest panel freeze (last 30 s): {0} ms",
        "Importar e gerar": "Import and generate",
        "De um arquivo (CSV, SRT, EDL, JSON, TXT) ou de uma lista colada.": "From a file (CSV, SRT, EDL, JSON, TXT) or a pasted list.",
        "Abrir arquivo…": "Open file…",
        "Limpar": "Clear",
        "Um por linha. Ex.: 1:05 Entrevista": "One per line. E.g.: 1:05 Interview",
        "Formato": "Format",
        "Automático": "Automatic",
        "Lista de tempos": "List of times",
        "CSV / planilha": "CSV / spreadsheet",
        "Legenda SRT": "SRT subtitles",
        "JSON do Helmet Marker": "Helmet Marker JSON",
        "Tempos": "Times",
        "Timecode da timeline": "Timeline timecode",
        "Contados do início (00:00)": "Counted from the start (00:00)",
        "Pular existentes": "Skip existing",
        "Importar": "Import",
        "Automático: 01:00:05:12 é da timeline; 1:05 conta do início.": "Auto: 01:00:05:12 is timeline time; 1:05 counts from the start.",
        "Marcador em cada corte": "Marker on every cut",
        "Numerados. Pula os cortes que já têm marcador.": "Numbered. Skips cuts that already have a marker.",
        "Corte": "Cut",
        "… e mais {0}.": "… and {0} more.",
        "Vai criar {0} marcador(es).": "Will create {0} marker(s).",
        "{0} já existe(m) e fica(m) de fora.": "{0} already exist(s) and will be left out.",
        "Abertura cancelada.": "Open cancelled.",
        "Arquivo aberto: {0}. Confira a prévia e clique em Importar.": "File opened: {0}. Check the preview and click Import.",
        "Nada para importar: nenhum marcador novo reconhecido.": "Nothing to import: no new marker recognized.",
        "Helmet Marker: importar marcadores": "Helmet Marker: import markers",
        "Marcadores importados: {0}. Um Ctrl+Z desfaz.": "Markers imported: {0}. One Ctrl+Z undoes it.",
        "Helmet Marker: cores dos importados": "Helmet Marker: colors of imported markers",
        "Marcadores importados: {0}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.": "Markers imported: {0}. The colors went in as a second step: it takes two Ctrl+Z to undo everything.",
        "Todos os cortes já têm marcador.": "Every cut already has a marker.",
        "Helmet Marker: marcadores nos cortes": "Helmet Marker: markers on cuts",
        "Marcadores criados nos cortes: {0}. Um Ctrl+Z desfaz.": "Markers created on cuts: {0}. One Ctrl+Z undoes it.",
        "O CSV não tem coluna de tempo (Timecode, In, Frame ou Segundos).": "The CSV has no time column (Timecode, In, Frame or Seconds).",
        "O JSON não pôde ser lido.": "The JSON could not be read.",
        "O JSON não tem uma lista de marcadores.": "The JSON has no list of markers.",
        "Nada para importar: abra um arquivo ou cole o texto.": "Nothing to import: open a file or paste the text.",
        "Linhas sem tempo reconhecido (ignoradas): {0}.": "Lines without a recognized time (ignored): {0}.",
        "Tempos antes do início da sequência (ignorados): {0}.": "Times before the start of the sequence (ignored): {0}.",
        "Só os primeiros {0} marcadores serão importados.": "Only the first {0} markers will be imported.",
        "A EDL não tem marcadores (LOC): foi criado um marcador por corte (evento).": "The EDL has no markers (LOC): one marker was created per cut (event).",
        "Os tempos são anteriores ao início da sequência: foram lidos como contados do início (00:00).": "The times are earlier than the start of the sequence: they were read as counted from the start (00:00).",
        "Outros formatos": "Other formats",
        "Lista de revisão (.txt)": "Review list (.txt)",
        "Texto simples (.txt)": "Plain text (.txt)",
        "JSON (.json)": "JSON (.json)",
        "Salvar": "Save",
        "revisão": "review",
        "Texto copiado.": "Text copied."
    };

    // Iguais nas duas línguas (os testes não cobram tradução para estes).
    var SAME_IN_BOTH = ["Language / Idioma", "English", "Português", "Timecode", "Magenta", "DF", "NDF", "−1 s", "+1 s", "−1 frame", "+1 frame", "frames", "2x", "3x", "4x", "6x", "EDL"];

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
                if (!key || !hasOwn(EN, key)) continue;
                // <option>: o UXP não redesenha a lista se só o texto interno mudar; a lista
                // inteira é recriada (ver apply)
                if (node.tagName === "OPTION") out.push({ option: node, key: key });
                else out.push({ node: k, pt: k.nodeValue, key: key });
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
        var selects = [];
        fixed.forEach(function (f) {
            var text = t(f.key);
            if (f.option) {
                f.option.textContent = text;
                var sel = f.option.parentNode;
                if (sel && selects.indexOf(sel) < 0) selects.push(sel);
            } else if (f.node) f.node.nodeValue = f.pt.replace(f.key, function () { return text; });
            else f.el.setAttribute(f.attr, text);
        });
        selects.forEach(rebuildSelect);
    }

    // Recria as <option> de uma lista com os textos atuais e devolve a escolha que estava.
    // As <option> novas entram na lista "fixed" no lugar das antigas.
    // No Premiere (26.5.2), logo ao abrir o painel a lista pode responder value vazio; se isso
    // fosse devolvido, a lista ficava sem escolha (em branco). Então, se o valor não for uma das
    // opções, vale a primeira.
    function rebuildSelect(sel) {
        var old = Array.prototype.slice.call(sel.childNodes).filter(function (n) { return n.tagName === "OPTION"; });
        var values = old.map(function (o) { return o.getAttribute("value") || ""; });
        var value = sel.value;
        if (values.indexOf(value) < 0) value = values[0];
        old.forEach(function (o, i) {
            var n = document.createElement("option");
            n.setAttribute("value", values[i]);
            if (values[i] === value) n.setAttribute("selected", "selected");
            n.textContent = o.textContent;
            sel.replaceChild(n, o);
            fixed.forEach(function (f) { if (f.option === o) f.option = n; });
        });
        sel.value = value;
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
