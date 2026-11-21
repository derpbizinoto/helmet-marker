// ui/panel.js — Helmet Marker (fases 1 a 3)
// Monta a tela, guarda o estado (filtros, seleção) e chama a camada premiere/.
// Regras: toda alteração em massa é um plano do core/ aplicado numa única transação;
// erros aparecem sempre na barra de status (nunca em silêncio).
(function () {
    "use strict";

    var P = HMPremiere;
    var M = HMMarkers;
    var S = HMSelection;
    var PL = HMPlans;
    var X = HMExport;
    var T = HMTimecode;
    var LIB = HMLibrary;
    var IM = HMImport;

    var POLL_MIN = 2000, POLL_MAX = 15000;
    var TPL_KEY = "helmetmarker.templates";
    var SEL_KEY = "helmetmarker.selections.";   // + id da sequência
    var DOUBLE_CLICK_MS = 450;

    var state = {
        ctx: null,
        records: [],          // todos os marcadores da sequência, em ordem de tempo
        visible: [],          // os que passam nos filtros
        selected: {},
        anchor: null,         // último marcador clicado
        filters: S.emptyFilters(),
        inOutOn: false,
        afterPlayheadOn: false,
        busy: false,          // operação do painel em andamento
        reading: null,        // Promise da leitura em andamento
        rereadReason: null,   // pedido de leitura que chegou durante outra
        confirm: null,        // ação esperando "Confirmar"
        lastSig: "",
        lastReadMs: 0,
        pollMs: POLL_MIN,
        pollTimer: null,
        lastPollError: "",
        events: [],
        lastEvent: "",
        lastRead: null,
        colorsSig: "",
        // fase 2
        matchCase: false,
        editing: null,        // edição na célula da lista em andamento { key, field }
        lastClick: null,      // para reconhecer o duplo clique
        templates: [],
        savedSels: [],
        savedSeqId: null,
        scrollSpeed: 3,
        wheelSeen: false,
        lightNext: false,
        pollCount: 0,
        lastRenderMs: 0,
        scrollSeen: false,
        // fase 3
        impFileName: "",      // nome do arquivo aberto (ajuda a reconhecer o formato)
        impSkip: true,        // pular os que já existem (mesmo frame e nome)
        sequences: null,      // outras sequências do projeto (null = ainda não lidas)
        sequencesFor: "",     // id da sequência ativa quando a lista foi lida
        legend: {}            // { índice da cor: significado }
    };

    // ---------- coisas guardadas no painel (localStorage do UXP) ----------
    function loadStore(key) {
        try { return LIB.parseList(window.localStorage.getItem(key)); } catch (e) { return []; }
    }
    function saveStore(key, list) {
        try { window.localStorage.setItem(key, JSON.stringify(list)); }
        catch (e) { throw new Error("Não consegui guardar no painel."); }
    }

    function $(id) { return document.getElementById(id); }
    function show(el, visible) { el.style.display = visible ? "" : "none"; }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    // Escrever na tela custa caro no UXP (refaz o layout): só escreve quando muda.
    function setText(el, text) { text = String(text); if (el.textContent !== text) el.textContent = text; }
    function setClass(el, cls) { if (el.className !== cls) el.className = cls; }
    // No Premiere 26.5.2 o <textarea> vazio devolve value = null (não ""): sempre ler por aqui.
    function fieldText(id) { var v = $(id).value; return v === null || v === undefined ? "" : String(v); }
    // Número digitado; campo vazio vira NaN (as checagens do core recusam com mensagem), nunca 0.
    function numField(id) { var t = fieldText(id).trim().replace(",", "."); return t === "" ? NaN : Number(t); }
    function setField(id, text) { $(id).value = text === null || text === undefined ? "" : String(text); }
    function now() { return new Date().toLocaleTimeString(); }

    // ---------- mensagens ----------
    function setStatus(text, kind) {
        var bar = $("status");
        var changed = bar.textContent !== String(text || "");
        setText(bar, text || "");
        setClass(bar, "status" + (kind ? " " + kind : ""));
        if (changed) fitContent();
    }

    function errText(err) {
        return trMsg(err && err.message ? err.message : String(err));
    }

    function showError(err) {
        setStatus(tr("Erro: {0}", errText(err)), "error");
        try { console.error(err); } catch (e) { /* sem console */ }
    }

    // ---------- leitura ----------
    // Uma leitura por vez; pedidos que chegam durante uma leitura viram UMA leitura extra.
    // silent: não mexe na barra de status e só redesenha se algo mudou.
    function read(reason, silent, doneMessage) {
        if (state.reading) {
            if (!state.rereadReason) state.rereadReason = reason;
            return state.reading;
        }
        state.reading = doRead(reason, silent, doneMessage).then(function () {
            state.reading = null;
            if (state.rereadReason) {
                var again = state.rereadReason;
                state.rereadReason = null;
                return read(again, true);
            }
        }, function (e) {
            state.reading = null;
            state.rereadReason = null;
            throw e;
        });
        return state.reading;
    }

    async function doRead(reason, silent, doneMessage) {
        var t0 = Date.now();
        if (!silent) setStatus(tr("Lendo marcadores…"));
        // Na verificação automática, reaproveita taxa de quadros, início e drop-frame da leitura
        // anterior (só confere se a sequência é a mesma); a cada 10 verificações, lê tudo.
        var light = state.lightNext && (state.pollCount++ % 10 !== 0);
        state.lightNext = false;
        var ctx = await P.getContext(light ? state.ctx : null);
        if (!ctx.sequence) {
            state.ctx = ctx;
            state.records = [];
            state.lastSig = "";
            recompute();
            render();
            setStatus(tr("Abra uma sequência na timeline e clique em Atualizar."), "warn");
            return;
        }
        var records = await P.readMarkers(ctx);
        state.lastReadMs = Date.now() - t0;
        state.pollMs = Math.max(POLL_MIN, Math.min(POLL_MAX, state.lastReadMs * 5));
        var sig = [ctx.sequenceId, ctx.info.label, ctx.dropFrame, ctx.startFrame, M.signature(records)].join("|");
        var changed = sig !== state.lastSig;
        state.ctx = ctx;
        state.records = records;   // marcadores "vivos" mais recentes, mesmo sem mudança
        state.lastRead = { time: now(), reason: reason };
        if (state.inOutOn) state.filters.inOut = await P.getInOut(ctx);
        if (changed || !silent) {
            state.lastSig = sig;
            recompute();
            render();
        } else {
            recompute();
            renderDiagnostics();
        }
        if (doneMessage) setStatus(doneMessage, "ok");
        else if (!silent) setStatus(tr("{0} marcadores lidos em {1} ms.", records.length, state.lastReadMs), "ok");
        else if (changed) setStatus(tr("Lista atualizada ({0}).", now()));
    }

    function readAndReport(reason) {
        return read(reason, false).catch(showError);
    }

    // ---------- verificação periódica ----------
    // O Premiere não avisa quando um marcador é criado/editado na timeline (testado na fase 0),
    // então o painel relê sozinho de tempos em tempos. O intervalo cresce com o tempo de leitura
    // (5x, entre 2 e 15 s) para não pesar em sequências com muitos marcadores, e a verificação
    // pula a vez durante operações do painel e com a confirmação aberta.
    function schedulePoll() {
        if (state.pollTimer) clearTimeout(state.pollTimer);
        state.pollTimer = setTimeout(poll, state.pollMs);
    }

    function poll() {
        state.pollTimer = null;
        if (state.busy || state.confirm || state.reading || state.editing) { schedulePoll(); return; }
        state.lightNext = true;
        read(N("verificação automática"), true).then(function () {
            state.lastPollError = "";
        }, function (e) {
            var msg = errText(e);
            if (msg !== state.lastPollError) {     // mostra cada erro uma vez, sem repetir a cada 2 s
                state.lastPollError = msg;
                showError(e);
            }
        }).then(schedulePoll);
    }

    // ---------- estado derivado ----------
    function recompute() {
        state.visible = S.applyFilters(state.records, state.filters);
        var keys = state.visible.map(function (r) { return r.key; });
        state.selected = S.keepOnly(state.selected, keys);
        if (state.anchor && keys.indexOf(state.anchor) < 0) state.anchor = null;
    }

    function selected() { return S.selectedRecords(state.selected, state.visible); }

    function exportTargets() {
        var sel = selected();
        return sel.length ? sel : state.visible;
    }

    function hasSeq() { return !!(state.ctx && state.ctx.sequence); }

    // ---------- textos ----------
    var TYPE_LABELS = {
        comment: N("Comentário"),
        chapter: N("Capítulo"),
        segmentation: N("Segmentação"),
        weblink: N("Link da Web"),
        flashcuepoint: N("Ponto de sinalização Flash")
    };
    function typeLabel(type) {
        var k = String(type || "").toLowerCase().replace(/[^a-z]/g, "");
        return TYPE_LABELS[k] ? tr(TYPE_LABELS[k]) : String(type || "");
    }
    function colorLabel(index) {
        return tr(M.colorFor(state.ctx ? state.ctx.colors : [], index).label);
    }
    function tcOf(frame) {
        var c = state.ctx;
        return T.framesToTimecode(frame, c.info, c.dropFrame, c.startFrame);
    }

    function seqLine() {
        var c = state.ctx;
        if (!c || !c.sequence) return tr("Nenhuma sequência ativa");
        var parts = [c.sequenceName, tr("{0} fps", c.info.label)];
        if (c.info.dropCapable) {
            var mode = c.dropFrame ? "DF" : "NDF";
            parts.push(c.dropSource === "guess" ? tr("{0} (suposto)", mode) : mode);
        }
        return parts.join("  ·  ");
    }

    // ---------- desenho ----------
    function cell(cls, text, title) {
        var s = document.createElement("span");
        s.className = "c " + cls;
        s.textContent = text;
        if (title) s.setAttribute("title", title);
        return s;
    }

    function rowClass(key) {
        return "row" + (state.selected[key] ? " selected" : "") + (state.anchor === key ? " anchor" : "");
    }

    function render() {
        // Durante a edição numa célula, redesenhar apagaria o campo: espera terminar.
        if (state.editing) return;
        var t0 = Date.now();
        setText($("seqInfo"), seqLine());
        buildColorControls();
        renderSavedList(false);

        var list = $("list");
        var scroll = list.scrollTop;
        clear(list);

        var empty = $("empty");
        if (!hasSeq()) {
            setText(empty, tr("Abra uma sequência na timeline e clique em Atualizar."));
        } else if (!state.records.length) {
            setText(empty, tr("Esta sequência não tem marcadores. Crie alguns com M na timeline ou use as ferramentas de teste no fim do painel."));
        } else {
            setText(empty, tr("Nenhum marcador passa pelos filtros."));
        }
        show(empty, !state.visible.length);

        var frag = document.createDocumentFragment();
        state.visible.forEach(function (r) {
            var row = document.createElement("div");
            row.className = rowClass(r.key);
            row.setAttribute("data-key", r.key);

            var color = M.colorFor(state.ctx.colors, r.colorIndex);
            var sw = document.createElement("span");
            sw.className = "c swatch";
            sw.style.backgroundColor = color.hex;
            sw.setAttribute("title", tr(color.label));
            row.appendChild(sw);

            var tc = tcOf(r.startFrame);
            row.appendChild(cell("tc" + (r.onFrame ? "" : " off"), r.onFrame ? tc : "⚠ " + tc,
                r.onFrame ? "" : tr("Este marcador não está no frame exato.")));
            row.appendChild(cell("name", r.name || "—", r.name));
            row.appendChild(cell("comment", r.comments || "", r.comments));
            row.appendChild(cell("type", typeLabel(r.type)));
            row.appendChild(cell("dur", T.durationLabel(r.durationFrames, state.ctx.info)));
            frag.appendChild(row);
        });
        list.appendChild(frag);
        amp.quietUntil.list = Date.now() + 150;   // recriar a lista não é rolagem do usuário
        list.scrollTop = scroll;
        amp.last.list = list.scrollTop;

        renderSelectionInfo();
        if (fieldText("impText")) scheduleImportPreview();
        renderChecklist();
        // trocou de sequência: a lista de destinos (que exclui a ativa) precisa ser relida
        if (state.sequencesFor && hasSeq() && state.sequencesFor !== state.ctx.sequenceId) {
            state.sequences = null;
            state.sequencesFor = "";
            renderSequenceList();
            if (!isCollapsed("seqclip")) loadSequences();
        }
        state.lastRenderMs = Date.now() - t0;
        renderDiagnostics();
    }

    // Só o que depende da seleção (rápido: não recria as linhas).
    function renderSelectionInfo() {
        Array.prototype.forEach.call($("list").childNodes, function (row) {
            var k = row.getAttribute && row.getAttribute("data-key");
            if (k) setClass(row, rowClass(k));
        });
        var n = S.count(state.selected);
        var parts = [tr("{0} marcadores", state.records.length)];
        if (S.isFiltering(state.filters)) parts.push(tr("{0} na lista", state.visible.length));
        parts.push(tr("{0} selecionado(s)", n));
        if (state.inOutOn && state.filters.inOut && hasSeq()) {
            parts.push(tr("In/Out: {0} – {1}", tcOf(state.filters.inOut.inFrame), tcOf(state.filters.inOut.outFrame)));
        }
        setText($("counts"), parts.join("  ·  "));
        updateButtons();
        schedulePreviews();
    }

    function buildColorControls() {
        var colors = state.ctx && state.ctx.colors ? state.ctx.colors : [];
        var sig = colors.map(function (c) { return c.index + c.name; }).join(",") + "|" + HMI18n.lang();
        if (sig === state.colorsSig) return;
        state.colorsSig = sig;

        var chips = $("colorChips");
        clear(chips);
        colors.forEach(function (c) {
            var b = document.createElement("div");
            b.setAttribute("role", "button");
            b.className = "chip color-chip" + (state.filters.colors.indexOf(c.index) >= 0 ? " on" : "");
            b.setAttribute("data-color", String(c.index));
            b.setAttribute("title", tr(c.label) + (state.legend[c.index] ? " — " + state.legend[c.index] : ""));
            var dot = document.createElement("span");
            dot.className = "dot";
            dot.style.backgroundColor = c.hex;
            b.appendChild(dot);
            chips.appendChild(b);
        });

        var sel = $("editColor");
        var keep = sel.value;
        clear(sel);
        colors.forEach(function (c) {
            var o = document.createElement("option");
            o.value = String(c.index);
            o.textContent = tr(c.label);
            sel.appendChild(o);
        });
        if (keep) sel.value = keep;

        // cor do modelo: "Não mudar" + as cores
        var tc = $("tplColor");
        var keepTpl = tc.value;
        clear(tc);
        var k = document.createElement("option");
        k.value = "keep";
        k.textContent = tr("Não mudar");
        tc.appendChild(k);
        colors.forEach(function (c) {
            var o = document.createElement("option");
            o.value = String(c.index);
            o.textContent = tr(c.label);
            tc.appendChild(o);
        });
        tc.value = keepTpl || "keep";
    }

    // ---------- listas com nome (seleções salvas e modelos) ----------
    function fillSelect(sel, items, prefix, emptyText) {
        var keep = sel.value;
        clear(sel);
        if (!items.length) {
            var e = document.createElement("option");
            e.value = "none";
            e.textContent = emptyText;
            sel.appendChild(e);
            sel.value = "none";
            return;
        }
        items.forEach(function (it) {
            var o = document.createElement("option");
            o.value = prefix + it.name;
            o.textContent = it.name;
            sel.appendChild(o);
        });
        sel.value = keep;
        if (sel.value !== keep) sel.value = prefix + items[0].name;
    }

    function pickedName(id, prefix) {
        var v = $(id).value || "";
        return v.indexOf(prefix) === 0 ? v.slice(prefix.length) : "";
    }

    // Seleções salvas são por sequência (as chaves dos marcadores só valem nela).
    function renderSavedList(force) {
        var seqId = hasSeq() ? state.ctx.sequenceId : "";
        if (!force && seqId === state.savedSeqId) return;
        state.savedSeqId = seqId;
        state.savedSels = seqId ? loadStore(SEL_KEY + seqId) : [];
        fillSelect($("savedSel"), state.savedSels, "s:", tr("Nenhuma seleção salva"));
    }
    function currentSaved() { return LIB.find(state.savedSels, pickedName("savedSel", "s:")); }

    function renderTemplateList() {
        fillSelect($("tplSelect"), state.templates, "t:", tr("Nenhum modelo salvo"));
    }
    function currentTemplate() { return LIB.find(state.templates, pickedName("tplSelect", "t:")); }

    function previewText(fn, verbKey) {
        try {
            var n = fn();
            if (!n) return tr("✓ Os selecionados já estão assim.");
            return tr(verbKey, n);
        } catch (e) {
            return errText(e);
        }
    }

    // As prévias são recalculadas um instante depois (e uma vez só, mesmo com vários cliques ou
    // teclas seguidos), para o clique aparecer na hora.
    var previewTimer = null;
    function schedulePreviews() {
        if (previewTimer) return;
        previewTimer = setTimeout(function () {
            previewTimer = null;
            try { renderPreviews(); } catch (e) { showError(e); }
        }, 80);
    }

    function renderPreviews() {
        var sel = selected();
        var none = tr("Selecione marcadores na lista.");
        var change = N("Vai alterar {0} marcador(es).");
        setText($("pvColor"), sel.length ? previewText(function () { return PL.planColor(sel, $("editColor").value).length; }, change) : none);
        setText($("pvName"), sel.length ? previewText(function () { return PL.planName(sel, fieldText("editName")).length; }, change) : none);
        setText($("pvComment"), sel.length ? previewText(function () { return PL.planComments(sel, fieldText("editComment"), $("editCommentMode").value).length; }, change) : none);
        setText($("pvType"), sel.length ? previewText(function () { return PL.planType(sel, $("editType").value).length; }, change) : none);
        setText($("pvDelete"), sel.length ? tr("Vai excluir {0} marcador(es).", sel.length) : none);

        setText($("pvReplace"), sel.length ? previewText(function () {
            return PL.planReplace(sel, fieldText("findText"), fieldText("replaceText"), $("findFields").value, state.matchCase).length;
        }, change) : none);
        setText($("pvNumber"), sel.length ? numberPreview(sel) : none);
        var tpl = currentTemplate();
        if (!state.templates.length) setText($("pvTpl"), tr("Crie um modelo abaixo."));
        else if (!tpl) setText($("pvTpl"), tr("Escolha um modelo."));
        else setText($("pvTpl"), sel.length ? previewText(function () { return PL.planTemplate(sel, tpl).length; }, change) : none);

        if (hasSeq()) partBPreviews(sel, none, change);

        if (state.afterPlayheadOn) setText($("pvMove"), tr("Vai mover todos os marcadores a partir do playhead."));
        else setText($("pvMove"), sel.length ? tr("Vai mover {0} marcador(es).", sel.length) : none);

        renderExportPreview();
    }

    function numberOptions() {
        return {
            prefix: fieldText("numPrefix"),
            start: numField("numStart"),
            step: numField("numStep"),
            digits: numField("numDigits"),
            suffix: fieldText("numSuffix")
        };
    }

    function numberPreview(sel) {
        try {
            var o = numberOptions();
            var n = PL.planNumber(sel, o).length;
            var first = PL.numberedName(o.prefix, o.start, o.digits, o.suffix);
            return (n ? tr("Vai alterar {0} marcador(es).", n) : tr("✓ Os selecionados já estão assim.")) + "  " + tr("Primeiro nome: {0}", first);
        } catch (e) {
            return errText(e);
        }
    }

    function renderExportPreview() {
        var box = $("ytPreview"), warn = $("ytWarnings");
        var yt = { text: "", warnings: [] }, targets = [];
        if (hasSeq()) {
            targets = exportTargets();
            yt = X.youtubeChapters(targets, state.ctx.info);
        }
        setText(box, yt.text);
        show(box, !!yt.text);
        setText($("pvYt"), targets.length ? tr("{0} capítulo(s).", targets.length) : "");
        var warnText = yt.warnings.map(function (w) { return "⚠ " + trMsg(w); });
        if (warnText.join("\n") === state.lastWarnText) return;
        state.lastWarnText = warnText.join("\n");
        clear(warn);
        warnText.forEach(function (t) {
            var d = document.createElement("div");
            d.textContent = t;
            warn.appendChild(d);
        });
    }

    function renderDiagnostics() {
        // Escrever na tela refaz o layout do painel inteiro no UXP; com o cartão fechado, nada muda.
        if (isCollapsed("tools")) return;
        var c = state.ctx;
        var lines = [];
        lines.push(tr("Eventos registrados: {0}", state.events.length ? state.events.join(", ") : tr("nenhum")));
        lines.push(tr("Último evento recebido: {0}", state.lastEvent || tr("nenhum")));
        lines.push(tr("Última leitura: {0}", state.lastRead ? state.lastRead.time + " (" + tr(state.lastRead.reason) + ")" : tr("nenhuma")));
        lines.push(tr("Verificação automática: a cada {0} s (leitura levou {1} ms)", (state.pollMs / 1000).toFixed(1), state.lastReadMs));
        if (c && c.sequence) {
            lines.push(tr("Ticks por frame: {0}", c.ticksPerFrame));
            lines.push(tr("Início da sequência: {0}", tcOf(0)));
            lines.push(tr("Formato de tempo informado pela API: {0}", c.displayTypeRaw === null || c.displayTypeRaw === undefined ? tr("nenhum") : c.displayTypeRaw));
            var withGuid = state.records.filter(function (r) { return r.guid; }).length;
            lines.push(tr("Marcadores com guid: {0} de {1}", withGuid, state.records.length));
            lines.push(tr("Marcadores fora do frame exato: {0}", state.records.filter(function (r) { return !r.onFrame; }).length));
        }
        lines.push(tr("Roda do mouse no painel: {0}", state.wheelSeen ? tr("recebida") : tr("ainda não recebida")));
        lines.push(tr("Aviso de rolagem no painel: {0}", state.scrollSeen ? tr("recebido") : tr("ainda não recebido")));
        lines.push(tr("Última atualização da lista: {0} ms", state.lastRenderMs));
        lines.push(tr("Maior travada do painel (últimos 30 s): {0} ms", lagProbe.max));
        if (scrollLog.length) {
            var t0 = scrollLog[0].t;
            lines.push(tr("Últimos avisos de rolagem (área, ms, posição, passo, o que o painel fez):"));
            scrollLog.forEach(function (e) {
                lines.push("  " + e.id + "  +" + (e.t - t0) + "  " + e.cur + "  " + (e.d > 0 ? "+" : "") + e.d + "  " + tr(e.what));
            });
        }
        var box = $("diag");
        while (box.childNodes.length > lines.length) box.removeChild(box.lastChild);
        lines.forEach(function (l, i) {
            var d = box.childNodes[i];
            if (!d) { d = document.createElement("div"); box.appendChild(d); }
            setText(d, l);
        });
    }

    function setEnabled(id, ok) {
        var el = $(id);
        var base = el.className.replace(/(^|\s)is-disabled(?=\s|$)/g, "").trim();
        setClass(el, ok ? base : base + " is-disabled");
    }

    function updateButtons() {
        var ready = !state.busy && hasSeq();
        var n = selected().length;
        setEnabled("btnRefresh", !state.busy);
        ["btnSelAll", "btnSelNone", "btnSelInvert", "btnSelBefore", "btnSelAfter"].forEach(function (id) { setEnabled(id, ready); });
        ["btnColor", "btnName", "btnComment", "btnType", "btnDelete"].forEach(function (id) { setEnabled(id, ready && n); });
        var canMove = ready && (n || state.afterPlayheadOn);
        ["btnMinusSec", "btnMinusFrame", "btnPlusFrame", "btnPlusSec", "btnMove"].forEach(function (id) { setEnabled(id, canMove); });
        var canExport = ready && exportTargets().length > 0;
        ["btnYtCopy", "btnYtSave", "btnCsvSave", "btnCsvCopy", "btnOtherSave", "btnOtherCopy"].forEach(function (id) { setEnabled(id, canExport); });
        setEnabled("btnImpOpen", !state.busy);
        setEnabled("btnImport", ready && !!fieldText("impText").trim());
        setEnabled("btnCutMarkers", ready);
        setEnabled("btnSeqRefresh", ready);
        setEnabled("btnCopy", canExport && $("copyTarget").value && $("copyTarget").value !== "none");
        ["btnClipToSeq", "btnSeqToClip", "btnSelPending", "btnSelDone"].forEach(function (id) { setEnabled(id, ready); });
        ["btnDone", "btnUndone"].forEach(function (id) { setEnabled(id, ready && n); });
        setClass($("chipImpSkip"), "chip" + (state.impSkip ? " on" : ""));
        setEnabled("btnTest", ready);
        ["btnReplace", "btnNumber"].forEach(function (id) { setEnabled(id, ready && n); });
        var tpl = currentTemplate();
        setEnabled("btnTplApply", ready && n && tpl);
        setEnabled("btnTplCreate", ready && tpl);
        setEnabled("btnTplDelete", !!tpl);
        var saved = currentSaved();
        setEnabled("btnSavedLoad", ready && saved);
        setEnabled("btnSavedDelete", !!saved);
        setEnabled("btnSavedSave", ready && n);
        setClass($("chipMatchCase"), "chip" + (state.matchCase ? " on" : ""));
        ["btnDuration", "btnPoint", "btnSnap", "btnDedupe", "btnMerge"].forEach(function (id) { setEnabled(id, ready && n); });
        setEnabled("btnDistribute", ready && n >= 3);
        setClass($("chipInOut"), "chip" + (state.inOutOn ? " on" : "") + (hasSeq() ? "" : " is-disabled"));
        setClass($("chipAfterPlayhead"), "chip" + (state.afterPlayheadOn ? " on" : ""));
    }

    // ---------- operações ----------
    // Relê antes (marcadores "vivos" e atualizados), monta o plano, aplica numa transação e relê.
    async function runEdit(buildPlan, undoLabel, doneKey) {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message;
        try {
            await read(N("antes de uma operação do painel"), true);
            var plan = await buildPlan();
            if (!plan.length) {
                setStatus(tr("Nada a alterar: os marcadores já estão assim."), "warn");
                return;
            }
            P.applyPlan(state.ctx, plan, undoLabel);
            message = tr(doneKey, plan.length);
        } catch (e) {
            showError(e);
            return;
        } finally {
            state.busy = false;
            updateButtons();
        }
        await read(N("depois de uma operação do painel"), true, message).catch(showError);
    }

    function needSelection() {
        var sel = selected();
        if (!sel.length) throw new Error("Selecione marcadores na lista.");
        return sel;
    }

    function onColor() {
        runEdit(function () { return PL.planColor(needSelection(), $("editColor").value); },
            tr("Helmet Marker: mudar cor"), N("Cor alterada em {0} marcador(es). Um Ctrl+Z desfaz."));
    }
    function onName() {
        runEdit(function () { return PL.planName(needSelection(), fieldText("editName")); },
            tr("Helmet Marker: mudar nome"), N("Nome alterado em {0} marcador(es). Um Ctrl+Z desfaz."));
    }
    function onComment() {
        runEdit(function () { return PL.planComments(needSelection(), fieldText("editComment"), $("editCommentMode").value); },
            tr("Helmet Marker: mudar comentário"), N("Comentário alterado em {0} marcador(es). Um Ctrl+Z desfaz."));
    }
    function onType() {
        runEdit(function () { return PL.planType(needSelection(), $("editType").value); },
            tr("Helmet Marker: mudar tipo"), N("Tipo alterado em {0} marcador(es). Um Ctrl+Z desfaz."));
    }

    function onShift(deltaFrames) {
        runEdit(async function () {
            var targets;
            if (state.afterPlayheadOn) {
                var ph = await P.getPlayheadFrame(state.ctx);
                targets = PL.afterPlayhead(state.records, ph);
                if (!targets.length) throw new Error("Não há marcadores a partir do playhead.");
            } else {
                targets = needSelection();
            }
            return PL.planShift(targets, deltaFrames);
        }, tr("Helmet Marker: mover marcadores"), N("Marcadores movidos: {0}. Um Ctrl+Z desfaz."));
    }

    function secondFrames() { return state.ctx ? PL.secondsToFrames(1, state.ctx.info) : 0; }

    function onMoveField() {
        if (!fieldText("moveFrames").trim()) { setStatus(tr("Digite quantos frames deslocar (negativo volta)."), "warn"); return; }
        var v = numField("moveFrames");
        if (!isFinite(v) || Math.round(v) !== v) { showError(new Error("O deslocamento precisa ser um número inteiro de frames.")); return; }
        if (!v) { setStatus(tr("Digite quantos frames deslocar (negativo volta)."), "warn"); return; }
        onShift(v);
    }

    // Excluir pede confirmação no próprio painel.
    function onDelete() {
        var n = selected().length;
        if (!n) { showError(new Error("Selecione marcadores na lista.")); return; }
        state.confirm = function () {
            runEdit(function () { return PL.planRemove(needSelection()); },
                tr("Helmet Marker: excluir marcadores"), N("Marcadores excluídos: {0}. Um Ctrl+Z desfaz."));
        };
        $("confirmText").textContent = tr("Excluir {0} marcador(es)? Dá para desfazer com Ctrl+Z.", n);
        show($("confirmClean"), false);
        show($("confirmBar"), true);
    }
    function closeConfirm(run) {
        var fn = state.confirm;
        state.confirm = null;
        show($("confirmBar"), false);
        show($("confirmClean"), false);
        if (run && fn) fn();
    }

    // ---------- fase 2 (parte B): duração, distribuir, cortes, limpeza ----------
    function durationFrames() {
        var v = numField("durValue");
        if ($("durUnit").value !== "frames") {
            if (!isFinite(v) || v < 0) throw new Error("A duração precisa ser um número de 0 ou mais.");
            return PL.secondsToFrames(v, state.ctx.info);
        }
        if (!isFinite(v) || Math.round(v) !== v || v < 0) throw new Error("A duração precisa ser um número inteiro de 0 ou mais.");
        return v;
    }

    function onDuration() {
        runEdit(function () { return PL.planDuration(needSelection(), durationFrames()); },
            tr("Helmet Marker: mudar duração"), N("Duração alterada em {0} marcador(es). Um Ctrl+Z desfaz."));
    }
    function onPoint() {
        runEdit(function () { return PL.planDuration(needSelection(), 0); },
            tr("Helmet Marker: tornar pontuais"), N("Marcadores que viraram pontuais: {0}. Um Ctrl+Z desfaz."));
    }

    function onDistribute() {
        runEdit(function () { return PL.planDistribute(needSelection()); },
            tr("Helmet Marker: distribuir marcadores"), N("Marcadores distribuídos: {0} movidos. Um Ctrl+Z desfaz."));
    }

    function onSnap() {
        runEdit(async function () {
            var sel = needSelection();
            var cuts = await P.getCutFrames(state.ctx, $("snapTracks").value);
            return PL.planSnap(sel, cuts, numField("snapMax"));
        }, tr("Helmet Marker: encaixar no corte"), N("Marcadores encaixados no corte: {0}. Um Ctrl+Z desfaz."));
    }

    function cleanCounts(plan) {
        var removed = plan.filter(function (p) { return p.remove; }).length;
        return { removed: removed, kept: plan.length - removed };
    }

    // Remover e mesclar excluem marcadores, então pedem confirmação (como o Excluir).
    function onClean(kind) {
        try {
            var plan = kind === "merge" ? PL.planMerge(needSelection(), numField("cleanTol"))
                : PL.planDedupe(needSelection(), numField("cleanTol"));
            var n = cleanCounts(plan).removed;
            if (!n) { setStatus(tr("Nenhum duplicado ou marcador próximo nessa distância."), "warn"); return; }
            state.confirm = function () {
                runEdit(function () {
                    var tol = numField("cleanTol");
                    return kind === "merge" ? PL.planMerge(needSelection(), tol) : PL.planDedupe(needSelection(), tol);
                }, kind === "merge" ? tr("Helmet Marker: mesclar marcadores") : tr("Helmet Marker: remover duplicados"),
                kind === "merge" ? N("Mesclagem feita: {0} alteração(ões). Um Ctrl+Z desfaz.") : N("Duplicados removidos: {0}. Um Ctrl+Z desfaz."));
            };
            $("confirmCleanText").textContent = kind === "merge"
                ? tr("Mesclar e excluir {0} marcador(es)? Dá para desfazer com Ctrl+Z.", n)
                : tr("Excluir {0} marcador(es) duplicado(s)? Dá para desfazer com Ctrl+Z.", n);
            show($("confirmBar"), false);
            show($("confirmClean"), true);
        } catch (e) {
            showError(e);
        }
    }

    function partBPreviews(sel, none, change) {
        setText($("pvDuration"), sel.length ? previewText(function () { return PL.planDuration(sel, durationFrames()).length; }, change) : none);
        setText($("pvDistribute"), sel.length ? previewText(function () { return PL.planDistribute(sel).length; }, change) : none);
        setText($("pvSnap"), sel.length ? tr("Os cortes são lidos ao clicar.") : none);
        setText($("pvClean"), !sel.length ? none : (function () {
            try {
                var tol = numField("cleanTol");
                var d = cleanCounts(PL.planDedupe(sel, tol)).removed;
                if (!d) return tr("Nenhum duplicado ou marcador próximo nessa distância.");
                return tr("Grupos encontrados: vai excluir {0} marcador(es).", d);
            } catch (e) { return errText(e); }
        })());
    }

    function onTest() {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message;
        try {
            var plan = M.planTestMarkers(numField("testCount"), numField("testStep"), 0, null, tr("Teste") + " ");
            var t0 = Date.now();
            P.addMarkers(state.ctx, plan, tr("Helmet Marker: criar marcadores de teste"));
            message = tr("{0} marcadores criados em {1} ms. Um Ctrl+Z desfaz todos.", plan.length, Date.now() - t0);
        } catch (e) {
            showError(e);
        } finally {
            state.busy = false;
            updateButtons();
        }
        if (message) read(N("depois de uma operação do painel"), true, message).catch(showError);
    }

    // ---------- fase 2: localizar, numerar, modelos ----------
    function onReplace() {
        runEdit(function () {
            return PL.planReplace(needSelection(), fieldText("findText"), fieldText("replaceText"), $("findFields").value, state.matchCase);
        }, tr("Helmet Marker: localizar e substituir"), N("Texto substituído em {0} marcador(es). Um Ctrl+Z desfaz."));
    }

    function onNumber() {
        runEdit(function () { return PL.planNumber(needSelection(), numberOptions()); },
            tr("Helmet Marker: numerar nomes"), N("Nomes numerados: {0}. Um Ctrl+Z desfaz."));
    }

    function needTemplate() {
        var tpl = currentTemplate();
        if (!tpl) throw new Error("Escolha um modelo.");
        return tpl;
    }

    function onTplApply() {
        runEdit(function () { return PL.planTemplate(needSelection(), needTemplate()); },
            tr("Helmet Marker: aplicar modelo"), N("Modelo aplicado em {0} marcador(es). Um Ctrl+Z desfaz."));
    }

    // Cria um marcador no playhead com o modelo. A cor precisa de uma segunda transação
    // (createAddMarkerAction não devolve o marcador criado): o painel relê, acha o marcador
    // novo e muda a cor dele.
    async function onTplCreate() {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message = null, kind = "ok";
        try {
            var tpl = needTemplate();
            await read(N("antes de uma operação do painel"), true);
            var frame = await P.getPlayheadFrame(state.ctx);
            var before = {};
            state.records.forEach(function (r) { before[r.key] = true; });
            P.addMarkers(state.ctx, [{ frame: frame, name: tpl.markerName, type: tpl.type || "Comment", comments: tpl.comments }],
                tr("Helmet Marker: criar marcador do modelo"));
            message = tr("Marcador criado no playhead. Um Ctrl+Z desfaz.");
            if (typeof tpl.color === "number") {
                await read(N("depois de uma operação do painel"), true);
                var fresh = state.records.filter(function (r) { return !before[r.key] && r.startFrame === frame; });
                if (fresh.length === 1) {
                    if (fresh[0].colorIndex !== tpl.color) {
                        P.applyPlan(state.ctx, [{ record: fresh[0], color: tpl.color }], tr("Helmet Marker: cor do marcador do modelo"));
                        message = tr("Marcador criado no playhead. Para desfazer, use Ctrl+Z duas vezes (criação e cor).");
                    }
                } else {
                    message = tr("Marcador criado no playhead, mas não consegui achá-lo para mudar a cor.");
                    kind = "warn";
                }
            }
        } catch (e) {
            showError(e);
            message = null;
        } finally {
            state.busy = false;
            updateButtons();
        }
        if (message) {
            await read(N("depois de uma operação do painel"), true).catch(showError);
            setStatus(message, kind);
        }
    }

    function onTplPick() {
        var tpl = currentTemplate();
        if (tpl) {
            setField("tplName", tpl.name);
            setField("tplMarkerName", tpl.markerName);
            $("tplColor").value = typeof tpl.color === "number" ? String(tpl.color) : "keep";
            $("tplType").value = tpl.type || "keep";
            setField("tplComment", tpl.comments);
            $("tplCommentMode").value = tpl.commentMode || "replace";
        }
        renderPreviews();
        updateButtons();
    }

    function onTplSave() {
        try {
            var tpl = LIB.makeTemplate({
                name: fieldText("tplName"),
                markerName: fieldText("tplMarkerName"),
                color: $("tplColor").value,
                type: $("tplType").value,
                comments: fieldText("tplComment"),
                commentMode: $("tplCommentMode").value
            });
            var list = LIB.upsert(state.templates, tpl);
            saveStore(TPL_KEY, list);
            state.templates = list;
            renderTemplateList();
            $("tplSelect").value = "t:" + tpl.name;
            renderPreviews();
            updateButtons();
            setStatus(tr("Modelo salvo: {0}", tpl.name), "ok");
        } catch (e) {
            showError(e);
        }
    }

    function onTplDelete() {
        try {
            var tpl = needTemplate();
            var list = LIB.remove(state.templates, tpl.name);
            saveStore(TPL_KEY, list);
            state.templates = list;
            renderTemplateList();
            renderPreviews();
            updateButtons();
            setStatus(tr("Modelo apagado: {0}", tpl.name), "ok");
        } catch (e) {
            showError(e);
        }
    }

    // ---------- fase 2: seleções salvas ----------
    function onSavedSave() {
        try {
            var sel = LIB.makeSelection(fieldText("savedName"), selected().map(function (r) { return r.key; }));
            var list = LIB.upsert(state.savedSels, sel);
            saveStore(SEL_KEY + state.ctx.sequenceId, list);
            state.savedSels = list;
            fillSelect($("savedSel"), list, "s:", tr("Nenhuma seleção salva"));
            $("savedSel").value = "s:" + sel.name;
            setField("savedName", "");
            updateButtons();
            setStatus(tr("Seleção salva: {0} ({1} marcador(es)).", sel.name, sel.keys.length), "ok");
        } catch (e) {
            showError(e);
        }
    }

    function onSavedLoad() {
        var saved = currentSaved();
        if (!saved) return;
        var res = LIB.resolveSelection(saved, state.visible);
        state.selected = res.selected;
        state.anchor = null;
        renderSelectionInfo();
        if (res.missing) {
            setStatus(tr("Selecionados: {0}. Outros {1} da seleção salva não estão na lista (excluídos ou escondidos pelos filtros).", res.found, res.missing), "warn");
        } else {
            setStatus(tr("Selecionados: {0}.", res.found), "ok");
        }
    }

    function onSavedDelete() {
        try {
            var saved = currentSaved();
            if (!saved) return;
            var list = LIB.remove(state.savedSels, saved.name);
            saveStore(SEL_KEY + state.savedSeqId, list);
            state.savedSels = list;
            fillSelect($("savedSel"), list, "s:", tr("Nenhuma seleção salva"));
            updateButtons();
            setStatus(tr("Seleção apagada: {0}", saved.name), "ok");
        } catch (e) {
            showError(e);
        }
    }

    // ---------- fase 2: editar direto na lista ----------
    // Duplo clique no nome ou no comentário abre um campo na própria linha.
    // Enter (ou clicar fora) salva numa transação; Esc cancela.
    function startInlineEdit(row, key, field) {
        if (state.busy || state.editing || !hasSeq()) return;
        var rec = null;
        state.records.forEach(function (r) { if (r.key === key) rec = r; });
        if (!rec) return;
        var cls = field === "name" ? "name" : "comment";
        var cellEl = null;
        Array.prototype.forEach.call(row.childNodes, function (n) {
            if (n.className && (" " + n.className + " ").indexOf(" " + cls + " ") >= 0) cellEl = n;
        });
        if (!cellEl) return;

        var original = String(rec[field] || "");
        state.editing = { key: key, field: field };
        cellEl.className += " editing";
        clear(cellEl);
        var input = document.createElement("input");
        input.className = "input cell-input";
        input.setAttribute("type", "text");
        input.value = original;
        cellEl.appendChild(input);

        var done = false;
        function finish(save) {
            if (done) return;
            done = true;
            // (campo apagado chega como null no Premiere: vira texto vazio)
            var value = input.value === null || input.value === undefined ? "" : String(input.value);
            state.editing = null;
            if (!save || value === original) { render(); return; }
            runEdit(function () {
                var cur = null;
                state.records.forEach(function (r) { if (r.key === key) cur = r; });
                if (!cur) throw new Error("O marcador não está mais na lista. Nada foi alterado.");
                if (String(cur[field] || "") === value) return [];
                var item = { record: cur };
                item[field] = value;
                return [item];
            }, tr("Helmet Marker: editar marcador"), N("Marcador alterado. Um Ctrl+Z desfaz."));
        }
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { finish(true); }
            else if (e.key === "Escape") { finish(false); }
        });
        input.addEventListener("blur", function () { finish(true); });
        setTimeout(function () {
            try { input.focus(); if (input.select) input.select(); } catch (e) { /* sem foco automático */ }
        }, 0);
    }

    function columnOf(target, row) {
        for (var n = target; n && n !== row; n = n.parentNode) {
            var c = " " + (n.className || "") + " ";
            if (c.indexOf(" name ") >= 0) return "name";
            if (c.indexOf(" comment ") >= 0) return "comments";
        }
        return null;
    }

    // No Premiere, o segundo clique rápido pode chegar só como "dblclick" (e não como "click"),
    // então o duplo clique é reconhecido pelos dois caminhos. Se um já abriu o campo, o outro
    // não faz nada.
    function onListDoubleClick(ev) {
        if (state.editing || (ev.target && ev.target.tagName === "INPUT")) return;
        var el = ev.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-key"))) el = el.parentNode;
        if (!el || el === this) return;
        var col = columnOf(ev.target, el);
        if (!col || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        state.lastClick = null;
        startInlineEdit(el, el.getAttribute("data-key"), col);
    }

    // ---------- lista: clique ----------
    function onListClick(ev) {
        if (ev.target && ev.target.tagName === "INPUT") return;   // clique dentro do campo de edição
        var el = ev.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-key"))) el = el.parentNode;
        if (!el || el === this) return;
        var key = el.getAttribute("data-key");
        var mods = { ctrl: !!(ev.ctrlKey || ev.metaKey), shift: !!ev.shiftKey };

        var col = columnOf(ev.target, el);
        var t = Date.now();
        var last = state.lastClick;
        var isDouble = !mods.ctrl && !mods.shift && col &&
            ((last && last.key === key && last.col === col && t - last.t < DOUBLE_CLICK_MS) || ev.detail >= 2);
        state.lastClick = isDouble ? null : { key: key, col: col, t: t };
        if (isDouble) { startInlineEdit(el, key, col); return; }

        var res = S.click(state, key, mods, state.visible.map(function (r) { return r.key; }));
        state.selected = res.selected;
        state.anchor = res.anchor;
        renderSelectionInfo();
        if (!mods.ctrl && !mods.shift) {
            var rec = null;
            state.records.forEach(function (r) { if (r.key === key) rec = r; });
            if (rec && hasSeq()) P.setPlayheadFrame(state.ctx, rec.startFrame).catch(showError);
        }
    }

    // ---------- seleção ----------
    function visibleKeys() { return state.visible.map(function (r) { return r.key; }); }

    async function onRelative(side) {
        try {
            var ref;
            if ($("relRef").value === "playhead") {
                ref = { frame: await P.getPlayheadFrame(state.ctx) };
            } else {
                if (!state.anchor) throw new Error("Clique num marcador da lista primeiro.");
                ref = { key: state.anchor };
            }
            state.selected = S.selectRelative(state.visible, ref, side);
            renderSelectionInfo();
            var n = S.count(state.selected);
            setStatus(n ? tr("{0} selecionado(s)", n) : tr("Nenhum marcador nessa posição."), n ? "ok" : "warn");
        } catch (e) {
            showError(e);
        }
    }

    // ---------- filtros ----------
    function filtersChanged() {
        recompute();
        render();
    }

    async function toggleInOut() {
        try {
            if (!state.inOutOn) {
                if (!hasSeq()) return;
                state.filters.inOut = await P.getInOut(state.ctx);
                state.inOutOn = true;
            } else {
                state.inOutOn = false;
                state.filters.inOut = null;
            }
            filtersChanged();
        } catch (e) {
            showError(e);
        }
    }

    function onColorChip(ev) {
        var el = ev.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-color"))) el = el.parentNode;
        if (!el || el === this) return;
        var idx = Number(el.getAttribute("data-color"));
        var list = state.filters.colors.slice();
        var at = list.indexOf(idx);
        if (at >= 0) list.splice(at, 1); else list.push(idx);
        state.filters.colors = list;
        el.className = "chip color-chip" + (at >= 0 ? "" : " on");
        filtersChanged();
    }

    function clearFilters() {
        state.filters = S.emptyFilters();
        state.inOutOn = false;
        setField("filterText", "");
        $("filterType").value = "any";   // (o UXP exige <option> com value não vazio)
        $("filterDuration").value = "all";
        state.colorsSig = "";   // redesenha os chips sem "on"
        filtersChanged();
    }

    // ---------- exportar ----------
    function safeName(s) {
        return String(s || "sequencia").replace(/[\\/:*?"<>|]+/g, "-").trim() || "sequencia";
    }

    function chaptersText() {
        var yt = X.youtubeChapters(exportTargets(), state.ctx.info);
        if (!yt.text) throw new Error("Nenhum marcador para exportar.");
        return yt.text;
    }

    function csvText() {
        return X.csv(exportTargets(), {
            sep: $("csvSep").value,
            info: state.ctx.info,
            dropFrame: state.ctx.dropFrame,
            startFrame: state.ctx.startFrame,
            colorLabel: colorLabel,
            typeLabel: typeLabel,
            headers: [tr("Timecode"), tr("Frame"), tr("Segundos"), tr("Nome"), tr("Comentário"), tr("Cor"), tr("Tipo"), tr("Duração"), tr("Duração (frames)")]
        });
    }

    // fase 3: lista de revisão, TXT e JSON
    function exportOpts() {
        return { info: state.ctx.info, dropFrame: state.ctx.dropFrame, startFrame: state.ctx.startFrame, colorLabel: colorLabel };
    }
    function otherText() {
        var targets = exportTargets();
        if (!targets.length) throw new Error("Nenhum marcador para exportar.");
        var fmt = $("otherFormat").value, o = exportOpts();
        if (fmt === "json") {
            o.meta = { name: state.ctx.sequenceName, fps: state.ctx.info.label, dropFrame: !!state.ctx.dropFrame, startTimecode: tcOf(0) };
            return X.json(targets, o);
        }
        return fmt === "txt" ? X.txt(targets, o) : X.reviewList(targets, o);
    }
    function onOtherSave() {
        var fmt = $("otherFormat").value;
        doSave(otherText, fmt === "review" ? N("revisão") : N("marcadores"), fmt === "json" ? "json" : "txt");
    }

    async function doCopy(getText, doneKey) {
        try {
            await P.copyText(getText());
            setStatus(tr(doneKey), "ok");
        } catch (e) {
            showError(e);
        }
    }

    async function doSave(getText, suffix, ext) {
        try {
            var name = await P.saveTextFile(safeName(state.ctx.sequenceName) + " - " + tr(suffix) + "." + ext, ext, getText());
            if (name) setStatus(tr("Arquivo salvo: {0}", name), "ok");
            else setStatus(tr("Salvamento cancelado."), "warn");
        } catch (e) {
            showError(e);
        }
    }

    // ---------- fase 3: importar e gerar ----------
    var IMPORT_PREVIEW_LINES = 12;

    // Lê o texto do campo com as opções escolhidas. Devolve { items, warnings, skipped }.
    function importResult() {
        var c = state.ctx;
        var r = IM.parse(fieldText("impText"), {
            format: $("impFormat").value,
            fileName: state.impFileName,
            info: c.info,
            startFrame: c.startFrame,
            timeBase: $("impBase").value,
            colors: c.colors
        });
        var skipped = 0;
        if (state.impSkip) {
            var k = IM.skipExisting(r.items, state.records);
            r.items = k.items;
            skipped = k.skipped;
        }
        return { items: r.items, warnings: r.warnings, skipped: skipped, format: r.format };
    }

    var importTimer = null;
    function scheduleImportPreview() {
        if (importTimer) clearTimeout(importTimer);
        importTimer = setTimeout(function () {
            importTimer = null;
            try { renderImportPreview(); } catch (e) { showError(e); }
        }, 150);
    }

    function importLine(it) {
        var parts = [tcOf(it.frame), it.name || "—"];
        if (it.comments) parts.push("· " + it.comments);
        if (it.durationFrames) parts.push("[" + T.durationLabel(it.durationFrames, state.ctx.info) + "]");
        if (it.colorIndex !== null) parts.push("(" + colorLabel(it.colorIndex) + ")");
        return parts.join("  ");
    }

    function renderImportPreview() {
        var box = $("impPreview"), warn = $("impWarnings");
        var text = fieldText("impText");
        clear(warn);
        updateButtons();
        if (!text.trim() || !hasSeq()) {
            setText(box, ""); show(box, false);
            setText($("pvImport"), text.trim() ? tr("Abra uma sequência na timeline e clique em Atualizar.") : "");
            return;
        }
        var r;
        try { r = importResult(); } catch (e) {
            setText(box, ""); show(box, false);
            setText($("pvImport"), "⚠ " + errText(e));
            return;
        }
        var lines = r.items.slice(0, IMPORT_PREVIEW_LINES).map(importLine);
        if (r.items.length > IMPORT_PREVIEW_LINES) lines.push(tr("… e mais {0}.", r.items.length - IMPORT_PREVIEW_LINES));
        setText(box, lines.join("\n"));
        show(box, lines.length > 0);
        var msg = tr("Vai criar {0} marcador(es).", r.items.length);
        if (r.skipped) msg += " " + tr("{0} já existe(m) e fica(m) de fora.", r.skipped);
        setText($("pvImport"), msg);
        r.warnings.forEach(function (w) {
            var d = document.createElement("div");
            d.textContent = "⚠ " + trMsg(w);
            warn.appendChild(d);
        });
    }

    async function onImpOpen() {
        if (state.busy) return;
        try {
            var file = await P.openTextFile(["csv", "tsv", "txt", "srt", "edl", "json"]);
            if (!file) { setStatus(tr("Abertura cancelada."), "warn"); return; }
            state.impFileName = file.name;
            setField("impText", file.text);
            setText($("impFile"), file.name);
            setStatus(tr("Arquivo aberto: {0}. Confira a prévia e clique em Importar.", file.name), "ok");
            renderImportPreview();
            fitContent();
        } catch (e) {
            showError(e);
        }
    }

    function onImpClear() {
        setField("impText", "");
        state.impFileName = "";
        setText($("impFile"), "");
        renderImportPreview();
        fitContent();
    }

    // Cria marcadores (uma transação) e relê. buildItems devolve { items, emptyMessage }.
    // Depois de reler, after(antigos) pode fazer uma segunda etapa (as cores da importação).
    async function runAdd(buildItems, undoLabel, doneKey, after) {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message, before = {}, built;
        try {
            await read(N("antes de uma operação do painel"), true);
            state.records.forEach(function (r) { before[r.key] = true; });
            built = await buildItems();
            if (!built.items.length) { setStatus(tr(built.emptyMessage) + (built.note ? " " + built.note : ""), "warn"); return; }
            P.addMarkers(state.ctx, built.items, undoLabel);
            message = tr(doneKey, built.items.length) + (built.note ? " " + built.note : "");
        } catch (e) {
            showError(e);
            return;
        } finally {
            state.busy = false;
            updateButtons();
        }
        await read(N("depois de uma operação do painel"), true, message).catch(showError);
        if (after) await after(built.items, before, built.note || "");
    }

    function onImport() {
        runAdd(function () {
            var r = importResult();
            return { items: r.items, emptyMessage: N("Nada para importar: nenhum marcador novo reconhecido.") };
        }, tr("Helmet Marker: importar marcadores"), N("Marcadores importados: {0}. Um Ctrl+Z desfaz."), function (items, before) {
            return applyNewColors(items, before, tr("Helmet Marker: cores dos importados"),
                tr("Marcadores importados: {0}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.", items.length));
        });
    }

    // A cor não entra na criação (a API não devolve o marcador criado): os novos são achados
    // pelo frame e pelo nome depois de reler, e recebem a cor numa segunda transação.
    async function applyNewColors(items, before, undoLabel, doneMessage) {
        var plan = PL.planColorsForNew(items, state.records, before);
        if (!plan.length) return;
        state.busy = true;
        updateButtons();
        var message;
        try {
            P.applyPlan(state.ctx, plan, undoLabel);
            message = doneMessage;
        } catch (e) {
            showError(e);
            return;
        } finally {
            state.busy = false;
            updateButtons();
        }
        await read(N("depois de uma operação do painel"), true, message).catch(showError);
    }

    // ---------- fase 3 (parte B): outra sequência ----------
    async function loadSequences() {
        if (!hasSeq()) return;
        try {
            state.sequences = await P.listSequences(state.ctx);
            state.sequencesFor = state.ctx.sequenceId;
        } catch (e) {
            state.sequences = [];
            showError(e);
        }
        renderSequenceList();
    }

    function renderSequenceList() {
        var sel = $("copyTarget"), keep = sel.value;
        clear(sel);
        var list = state.sequences || [];
        if (!list.length) {
            var e = document.createElement("option");
            e.value = "none";
            e.textContent = state.sequences ? tr("Nenhuma outra sequência no projeto") : tr("Clique em Atualizar lista");
            sel.appendChild(e);
            sel.value = "none";
        } else {
            list.forEach(function (sq) {
                var o = document.createElement("option");
                o.value = sq.id;
                o.textContent = sq.name;
                sel.appendChild(o);
            });
            if (keep && list.some(function (sq) { return sq.id === keep; })) sel.value = keep;
        }
        updateButtons();
    }

    async function onCopy() {
        if (state.busy) return;
        var id = $("copyTarget").value;
        if (!id || id === "none") { showError(new Error("Escolha a sequência de destino.")); return; }
        state.busy = true;
        updateButtons();
        var message;
        try {
            await read(N("antes de uma operação do painel"), true);
            var src = exportTargets();
            if (!src.length) throw new Error("Nenhum marcador para copiar.");
            var tctx = await P.getSequenceContext(state.ctx, id);
            var trecs = await P.readMarkers(tctx);
            var before = {};
            trecs.forEach(function (r) { before[r.key] = true; });
            var k = IM.skipExisting(PL.planCopy(src, state.ctx.ticksPerFrame, tctx.ticksPerFrame), trecs);
            if (!k.items.length) { setStatus(tr("Todos já existem na sequência de destino."), "warn"); return; }
            P.addMarkers(tctx, k.items, tr("Helmet Marker: copiar marcadores"));
            var colors = PL.planColorsForNew(k.items, await P.readMarkers(tctx), before);
            if (colors.length) P.applyPlan(tctx, colors, tr("Helmet Marker: cores dos copiados"));
            message = colors.length
                ? tr("Copiados para {0}: {1}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.", tctx.sequenceName, k.items.length)
                : tr("Copiados para {0}: {1}. Um Ctrl+Z desfaz.", tctx.sequenceName, k.items.length);
            if (k.skipped) message += " " + tr("{0} já existe(m) e fica(m) de fora.", k.skipped);
        } catch (e) {
            showError(e);
            return;
        } finally {
            state.busy = false;
            updateButtons();
        }
        setStatus(message, "ok");
    }

    // ---------- fase 3 (parte B): clipe e sequência ----------
    async function selectedClips() {
        var clips = await P.getSelectedClips(state.ctx);
        if (!clips.length) throw new Error("Selecione um ou mais clipes na timeline.");
        var usable = clips.filter(PL.clipUsable);
        return { usable: usable, speedSkipped: clips.length - usable.length };
    }

    function clipNote(speedSkipped, outside) {
        var parts = [];
        if (speedSkipped) parts.push(tr("Clipes com velocidade alterada ficaram de fora: {0}.", speedSkipped));
        if (outside) parts.push(tr("Marcadores na parte cortada do clipe (ignorados): {0}.", outside));
        return parts.join(" ");
    }

    function onClipToSeq() {
        runAdd(async function () {
            var c = await selectedClips();
            var items = [], outside = 0;
            for (var i = 0; i < c.usable.length; i++) {
                var cm = await P.readClipMarkers(c.usable[i]);
                var r = PL.clipToSequence(cm.list, c.usable[i], state.ctx.ticksPerFrame);
                items = items.concat(r.items);
                outside += r.outside;
            }
            var k = IM.skipExisting(items, state.records);
            var note = clipNote(c.speedSkipped, outside);
            if (k.skipped) note = (note ? note + " " : "") + tr("{0} já existe(m) e fica(m) de fora.", k.skipped);
            return { items: k.items, note: note, emptyMessage: N("Nenhum marcador novo para trazer do clipe.") };
        }, tr("Helmet Marker: trazer marcadores do clipe"), N("Marcadores trazidos do clipe: {0}. Um Ctrl+Z desfaz."), function (items, before, note) {
            return applyNewColors(items, before, tr("Helmet Marker: cores dos trazidos"),
                tr("Marcadores trazidos do clipe: {0}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.", items.length) + (note ? " " + note : ""));
        });
    }

    async function onSeqToClip() {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message, kind = "ok";
        try {
            await read(N("antes de uma operação do painel"), true);
            var c = await selectedClips();
            var src = exportTargets();
            var tpf = state.ctx.ticksPerFrame;
            var groups = [], skipped = 0, total = 0;
            for (var i = 0; i < c.usable.length; i++) {
                var cm = await P.readClipMarkers(c.usable[i]);
                var k = PL.skipExistingTicks(PL.sequenceToClip(src, c.usable[i], tpf), cm.list, tpf);
                skipped += k.skipped;
                if (!k.items.length) continue;
                var before = {};
                cm.list.forEach(function (m) { before[m.key] = true; });
                groups.push({ clip: c.usable[i], markersObj: cm.markersObj, items: k.items, before: before });
                total += k.items.length;
            }
            var note = clipNote(c.speedSkipped, 0);
            if (skipped) note = (note ? note + " " : "") + tr("{0} já existe(m) e fica(m) de fora.", skipped);
            if (!total) {
                setStatus(tr("Nenhum marcador da sequência está em cima dos clipes selecionados.") + (note ? " " + note : ""), "warn");
                return;
            }
            P.addClipMarkers(state.ctx, groups, tr("Helmet Marker: enviar marcadores para o clipe"));
            // cor: segunda transação, achando os novos pelo tempo + nome
            var colorPlan = [];
            for (var g = 0; g < groups.length; g++) {
                var again = await P.readClipMarkers(groups[g].clip);
                colorPlan = colorPlan.concat(PL.planColorsForNew(groups[g].items, again.list, groups[g].before,
                    function (m) { return m.startTicks + "|" + String(m.name || ""); }));
            }
            if (colorPlan.length) P.applyPlan(state.ctx, colorPlan, tr("Helmet Marker: cores dos enviados"));
            message = (colorPlan.length
                ? tr("Marcadores enviados para {0} clipe(s): {1}. As cores entraram numa segunda etapa: são dois Ctrl+Z para desfazer tudo.", groups.length, total)
                : tr("Marcadores enviados para {0} clipe(s): {1}. Um Ctrl+Z desfaz.", groups.length, total)) + (note ? " " + note : "");
        } catch (e) {
            showError(e);
            return;
        } finally {
            state.busy = false;
            updateButtons();
        }
        setStatus(message, kind);
    }

    // ---------- fase 3 (parte B): checklist e legenda ----------
    var LEGEND_KEY = "helmetmarker.legend";

    function loadLegend() {
        try { state.legend = JSON.parse(window.localStorage.getItem(LEGEND_KEY) || "{}") || {}; } catch (e) { state.legend = {}; }
    }
    function saveLegend() {
        try { window.localStorage.setItem(LEGEND_KEY, JSON.stringify(state.legend)); } catch (e) { /* só nesta sessão */ }
    }

    var legendSig = "";
    function renderLegendRows() {
        if (isCollapsed("checklist")) return;
        var colors = state.ctx && state.ctx.colors ? state.ctx.colors : [];
        var sig = colors.map(function (c) { return c.index; }).join(",") + "|" + HMI18n.lang();
        if (sig === legendSig) return;
        legendSig = sig;
        var box = $("legendRows");
        clear(box);
        colors.forEach(function (c) {
            var row = document.createElement("div");
            row.className = "legend-row";
            var dot = document.createElement("span");
            dot.className = "dot";
            dot.style.backgroundColor = c.hex;
            var label = document.createElement("span");
            label.className = "field-label";
            label.textContent = tr(c.label);
            var input = document.createElement("input");
            input.className = "input grow";
            input.setAttribute("type", "text");
            input.setAttribute("placeholder", tr("Significado"));
            input.value = state.legend[c.index] || "";
            input.addEventListener("change", function () {
                var v = (input.value === null || input.value === undefined ? "" : String(input.value)).trim();
                if (v) state.legend[c.index] = v; else delete state.legend[c.index];
                saveLegend();
                state.colorsSig = "";       // refaz os títulos das cores do filtro
                buildColorControls();
                renderChecklist();
            });
            row.appendChild(dot);
            row.appendChild(label);
            row.appendChild(input);
            box.appendChild(row);
        });
    }

    function renderChecklist() {
        if (isCollapsed("checklist")) return;
        renderLegendRows();
        var box = $("checkProgress");
        var lines = [];
        if (hasSeq() && state.records.length) {
            var p = PL.progress(state.records);
            lines.push(tr("Feitos: {0} de {1}", p.done, p.total));
            p.byColor.forEach(function (b) {
                var c = M.colorFor(state.ctx.colors, b.index);
                var meaning = state.legend[b.index] ? " (" + state.legend[b.index] + ")" : "";
                lines.push("● " + tr(c.label) + meaning + ": " + b.done + "/" + b.total);
            });
        }
        while (box.childNodes.length > lines.length) box.removeChild(box.lastChild);
        lines.forEach(function (l, i) {
            var d = box.childNodes[i];
            if (!d) { d = document.createElement("div"); box.appendChild(d); }
            setText(d, l);
        });
    }

    function onDone(done) {
        runEdit(function () { return PL.planDone(needSelection(), done); },
            done ? tr("Helmet Marker: marcar como feito") : tr("Helmet Marker: desmarcar feito"),
            done ? N("Marcados como feitos: {0}. Um Ctrl+Z desfaz.") : N("Desmarcados: {0}. Um Ctrl+Z desfaz."));
    }

    function selectByDone(done) {
        var sel = {};
        state.visible.forEach(function (r) { if (PL.isDone(r) === done) sel[r.key] = true; });
        state.selected = sel;
        renderSelectionInfo();
        var n = Object.keys(sel).length;
        setStatus(done ? tr("Feitos selecionados: {0}.", n) : tr("Pendentes selecionados: {0}.", n), n ? "ok" : "warn");
    }

    function onCutMarkers() {
        runAdd(async function () {
            var cuts = await P.getCutFrames(state.ctx, $("cutTracks").value);
            var prefix = fieldText("cutPrefix").trim() || tr("Corte");
            var p = PL.planCutMarkers(cuts, state.records, { prefix: prefix + " ", digits: 2 });
            return { items: p.items, emptyMessage: N("Todos os cortes já têm marcador.") };
        }, tr("Helmet Marker: marcadores nos cortes"), N("Marcadores criados nos cortes: {0}. Um Ctrl+Z desfaz."));
    }

    // ---------- eventos do Premiere ----------
    function onPremiereEvent(name) {
        state.lastEvent = name + " (" + now() + ")";
        read(name, true).catch(showError);
    }

    // ---------- cartões recolhíveis ----------
    // O UXP recalcula o layout do painel inteiro a cada mudança na tela; cartão fechado
    // (display: none) sai dessa conta. Clicar no título abre/fecha; o painel lembra.
    var CARDS_KEY = "helmetmarker.cards";
    var DEFAULT_OPEN = { edit: true };
    var cardState = {};

    function isCollapsed(key) { return cardState[key] === undefined ? !DEFAULT_OPEN[key] : !!cardState[key]; }

    function setupCards() {
        try { cardState = JSON.parse(window.localStorage.getItem(CARDS_KEY) || "{}") || {}; } catch (e) { cardState = {}; }
        var cards = document.querySelectorAll("section[data-card]");
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i], key = card.getAttribute("data-card");
            var title = card.querySelector(".card-title");
            var body = document.createElement("div");
            body.className = "card-body";
            while (title.nextSibling) body.appendChild(title.nextSibling);
            card.appendChild(body);
            var arrow = document.createElement("span");
            arrow.className = "card-arrow";
            title.insertBefore(arrow, title.firstChild);
            title.setAttribute("role", "button");
            title.addEventListener("click", (function (k) { return function () { toggleCard(k); }; })(key));
            paintCard(key);
        }
    }

    function paintCard(key) {
        var card = document.querySelector('section[data-card="' + key + '"]');
        if (!card) return;
        var closed = isCollapsed(key);
        setClass(card, "card" + (closed ? " collapsed" : ""));
        setText(card.querySelector(".card-arrow"), closed ? "▸ " : "▾ ");
        card.querySelector(".card-body").style.display = closed ? "none" : "block";
    }

    // Lista sem escolha (em branco): no Premiere 26.5.2 isso aconteceu com "segundos/frames" e
    // "Clipes de vídeo e áudio". Se o valor não for uma das opções, escolhe a primeira.
    function fixSelects(root) {
        var sels = (root || document).querySelectorAll("select");
        for (var i = 0; i < sels.length; i++) {
            var sel = sels[i], values = [];
            for (var j = 0; j < sel.childNodes.length; j++) {
                var o = sel.childNodes[j];
                if (o.tagName === "OPTION") values.push(o.getAttribute("value") || "");
            }
            if (values.length && values.indexOf(sel.value) < 0) sel.value = values[0];
        }
    }

    function toggleCard(key) {
        cardState[key] = !isCollapsed(key);
        try { window.localStorage.setItem(CARDS_KEY, JSON.stringify(cardState)); } catch (e) { /* só nesta sessão */ }
        paintCard(key);
        if (!isCollapsed(key)) fixSelects(document.querySelector('section[data-card="' + key + '"]'));
        if (key === "tools") renderDiagnostics();
        if (key === "import") renderImportPreview();
        if (key === "checklist") { legendSig = ""; renderChecklist(); }
        if (key === "seqclip" && !isCollapsed("seqclip") && hasSeq() && state.sequencesFor !== state.ctx.sequenceId) loadSequences();
    }

    // ---------- medidor de travadas ----------
    // Um relógio a cada 100 ms: se ele atrasa, o painel ficou travado esse tempo (o JavaScript do
    // painel e o desenho da tela usam a mesma fila). Guarda o maior atraso dos últimos 30 s.
    var lagProbe = { last: Date.now(), max: 0, maxAt: 0 };
    function startLagProbe() {
        setInterval(function () {
            var t = Date.now();
            var late = Math.max(0, t - lagProbe.last - 100);
            lagProbe.last = t;
            if (late >= lagProbe.max || t - lagProbe.maxAt > 30000) { lagProbe.max = late; lagProbe.maxAt = t; }
        }, 100);
    }

    // ---------- altura da área que rola ----------
    function fitContent() {
        var h = window.innerHeight;
        if (!h) return;
        var used = $("appHeader").offsetHeight + $("status").offsetHeight;
        $("content").style.height = Math.max(80, h - used) + "px";
    }

    // ---------- rolagem com a roda do mouse ----------
    // A rolagem nativa do painel no Premiere é lenta. Se o UXP entregar o evento "wheel" (a doc
    // não diz; no 26.5.2 não entrega), o painel rola sozinho N vezes mais. Senão vale o plano B
    // abaixo. O Diagnóstico mostra se o evento chegou.
    var SCROLL_KEY = "helmetmarker.scrollSpeed";
    var SCROLLERS = ["list", "ytPreview", "content"];   // de dentro para fora

    function loadScrollSpeed() {
        var v = 3;
        try { v = Number(window.localStorage.getItem(SCROLL_KEY)) || 3; } catch (e) { /* padrão */ }
        return [1, 2, 3, 4, 6].indexOf(v) >= 0 ? v : 3;
    }

    function canScroll(el, dy) {
        if (!el || el.scrollHeight <= el.clientHeight + 1) return false;
        if (dy < 0) return el.scrollTop > 0;
        return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    }

    function onWheel(e) {
        if (e.__hmDone) return;                       // o mesmo evento passa por mais de uma área
        e.__hmDone = true;
        if (!state.wheelSeen) { state.wheelSeen = true; renderDiagnostics(); }
        if (state.scrollSpeed <= 1) return;           // "Normal": deixa o Premiere rolar
        var dy = Number(e.deltaY) || 0;
        if (!dy) return;
        if (e.deltaMode === 1) dy *= 16;              // em linhas
        else if (e.deltaMode === 2) dy *= 300;        // em páginas
        var box = null;
        for (var n = e.target; n && !box; n = n.parentNode) {
            if (n.id && SCROLLERS.indexOf(n.id) >= 0 && canScroll(n, dy)) box = n;
        }
        if (!box) return;
        if (e.preventDefault) e.preventDefault();
        box.scrollTop = box.scrollTop + dy * state.scrollSpeed;
    }

    // Plano B (Premiere 26.5.2 não entrega "wheel"): quando a área rola sozinha um passo
    // pequeno, o painel soma (N − 1) passos iguais na mesma direção. Com o botão do mouse
    // apertado (arrastando a barra de rolagem) não mexe, para a barra não pular.
    var amp = { last: {}, own: {}, quietUntil: {}, mouseDown: false, touch: {}, x: -1, y: -1 };
    // Balanço na ponta: ao chegar no começo ou no fim, o Premiere faz sozinho um "elástico" de
    // poucos pixels (−10, −19, +10, +29…), até ~1 s depois (registro do Diagnóstico, 26.5.2).
    // Na velocidade Normal ele quase não aparece; multiplicado virava a engasgada. Então, logo
    // depois de a área encostar numa ponta, movimentos pequenos não são multiplicados.
    var EDGE_QUIET_MS = 1500;
    var EDGE_SMALL_PX = 60;
    var scrollLog = [];       // últimos avisos de rolagem (Diagnóstico), para achar engasgadas
    function logScroll(id, cur, d, what) {
        scrollLog.push({ t: Date.now(), id: id, cur: Math.round(cur), d: Math.round(d), what: what });
        if (scrollLog.length > 8) scrollLog.shift();
    }
    // Fim da área. (A conta pode sair um pouco antes do fim real no UXP; por isso só serve
    // para saber se encostou, nunca para limitar a rolagem.)
    function maxScroll(el) { return Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0)); }
    var SCROLLBAR_ZONE = 24;   // px junto à borda direita: área da barra de rolagem

    // Arrastar a barra de rolagem também gera passos pequenos, e o Premiere não entrega o clique
    // na barra (testado no 26.5.2: "várias engasgadas"). Então, com o cursor perto da borda
    // direita da área, o painel não multiplica nada.
    function nearScrollbar(el) {
        if (amp.x < 0 || !el.getBoundingClientRect) return false;
        var r = el.getBoundingClientRect();
        return amp.x >= r.right - SCROLLBAR_ZONE && amp.x <= r.right + 4 && amp.y >= r.top && amp.y <= r.bottom;
    }

    // Cada aviso de rolagem pequeno é multiplicado, menos: os causados pelo próprio painel, os
    // de redesenho da lista, os da barra de rolagem, os saltos grandes e o balanço logo depois
    // de encostar numa ponta (ver EDGE_QUIET_MS). Cada decisão vai para o registro do Diagnóstico.
    function onScrollAmplify(e) {
        var el = e.currentTarget || e.target;
        if (!el || !el.id) return;
        var id = el.id;
        if (!state.scrollSeen) { state.scrollSeen = true; renderDiagnostics(); }
        var cur = el.scrollTop, last = amp.last[id];
        amp.last[id] = cur;
        // encostou numa ponta (em qualquer aviso, inclusive os nossos): marca a hora
        if (cur <= 0 || cur >= maxScroll(el) - 2) amp.touch[id] = Date.now();
        if (amp.own[id]) { amp.own[id] = false; return; }          // rolagem feita por nós
        if (amp.quietUntil && amp.quietUntil[id] > Date.now()) return;   // lista sendo redesenhada
        if (state.wheelSeen || state.scrollSpeed <= 1 || amp.mouseDown || last === undefined) return;
        var d = cur - last;
        if (nearScrollbar(el)) { logScroll(id, cur, d, "barra"); return; }   // arrastando a barra
        if (!d || Math.abs(d) > 200) { logScroll(id, cur, d, "ignorou"); return; }               // salto grande: não é a roda

        var now = Date.now();
        if (amp.touch[id] && now - amp.touch[id] < EDGE_QUIET_MS && Math.abs(d) < EDGE_SMALL_PX) {
            logScroll(id, cur, d, "ponta");                           // balanço do Premiere: deixa como está
            return;
        }
        setScroll(el, id, Math.max(0, cur + d * (state.scrollSpeed - 1)));
        logScroll(id, cur, d, "multiplicou");
    }

    function setScroll(el, id, pos) {
        amp.own[id] = true;
        var before = el.scrollTop;
        el.scrollTop = pos;
        if (el.scrollTop === before) amp.own[id] = false;             // não mexeu: não vem aviso
        amp.last[id] = el.scrollTop;
        return el.scrollTop;
    }

    function setupScrolling() {
        SCROLLERS.forEach(function (id) {
            var el = $(id);
            el.addEventListener("wheel", onWheel, { passive: false });
            el.addEventListener("scroll", onScrollAmplify);
            amp.last[id] = el.scrollTop;
        });
        ["mousemove", "pointermove"].forEach(function (ev) {
            document.addEventListener(ev, function (e) { amp.x = e.clientX; amp.y = e.clientY; });
        });
        ["mousedown", "pointerdown"].forEach(function (ev) {
            document.addEventListener(ev, function () { amp.mouseDown = true; });
        });
        ["mouseup", "pointerup"].forEach(function (ev) {
            document.addEventListener(ev, function () { amp.mouseDown = false; });
        });
    }

    // ---------- início ----------
    // Botões são <div role="button"> (o UXP não deixa estilizar <button>). Desligado = classe
    // "is-disabled", e o clique num botão desligado é ignorado aqui.
    function isDisabled(el) { return /(^|\s)is-disabled(\s|$)/.test(el.className); }
    function on(id, ev, fn) {
        var el = $(id);
        el.addEventListener(ev, function (e) {
            if (ev === "click" && isDisabled(el)) return;
            return fn.call(this, e);
        });
    }

    function init() {
        setupCards();
        startLagProbe();
        fitContent();
        window.addEventListener("resize", fitContent);
        setTimeout(fitContent, 300);
        show($("confirmBar"), false);
        $("version").textContent = "v" + HM_VERSION;

        state.scrollSpeed = loadScrollSpeed();
        $("scrollSpeed").value = String(state.scrollSpeed);
        on("scrollSpeed", "change", function () {
            state.scrollSpeed = Number($("scrollSpeed").value) || 1;
            try { window.localStorage.setItem(SCROLL_KEY, String(state.scrollSpeed)); } catch (e) { /* só nesta sessão */ }
        });
        setupScrolling();

        var lang = $("langSelect");
        lang.value = HMI18n.lang();
        on("langSelect", "change", function () { HMI18n.setLang(lang.value); });
        HMI18n.onChange(function () {
            state.colorsSig = "";
            renderTemplateList();
            renderSavedList(true);
            if (hasSeq()) render(); else renderDiagnostics();
            setText($("seqInfo"), seqLine());
            fixSelects();
        });

        on("btnRefresh", "click", function () { readAndReport(N("botão Atualizar")); });
        on("list", "click", onListClick);
        on("list", "dblclick", onListDoubleClick);

        // filtros
        on("filterText", "input", function () { state.filters.text = fieldText("filterText"); filtersChanged(); });
        on("filterType", "change", function () { var v = $("filterType").value; state.filters.type = v === "any" ? "" : v; filtersChanged(); });
        on("filterDuration", "change", function () { state.filters.duration = $("filterDuration").value; filtersChanged(); });
        on("colorChips", "click", onColorChip);
        on("chipInOut", "click", toggleInOut);
        on("btnClearFilters", "click", clearFilters);

        // seleção
        on("btnSelAll", "click", function () { state.selected = S.selectAll(visibleKeys()); renderSelectionInfo(); });
        on("btnSelNone", "click", function () { state.selected = {}; renderSelectionInfo(); });
        on("btnSelInvert", "click", function () { state.selected = S.invert(state.selected, visibleKeys()); renderSelectionInfo(); });
        on("btnSelBefore", "click", function () { onRelative("before"); });
        on("btnSelAfter", "click", function () { onRelative("after"); });

        // editar
        on("btnColor", "click", onColor);
        on("btnName", "click", onName);
        on("btnComment", "click", onComment);
        on("btnType", "click", onType);
        on("btnDelete", "click", onDelete);
        on("btnConfirmYes", "click", function () { closeConfirm(true); });
        on("btnConfirmNo", "click", function () { closeConfirm(false); });
        ["editColor", "editCommentMode", "editType"].forEach(function (id) { on(id, "change", schedulePreviews); });
        ["editName", "editComment"].forEach(function (id) { on(id, "input", schedulePreviews); });

        // mover
        on("btnMinusSec", "click", function () { onShift(-secondFrames()); });
        on("btnMinusFrame", "click", function () { onShift(-1); });
        on("btnPlusFrame", "click", function () { onShift(1); });
        on("btnPlusSec", "click", function () { onShift(secondFrames()); });
        on("btnMove", "click", onMoveField);
        on("chipAfterPlayhead", "click", function () { state.afterPlayheadOn = !state.afterPlayheadOn; renderSelectionInfo(); });

        // exportar
        on("btnYtCopy", "click", function () { doCopy(chaptersText, N("Capítulos copiados. Cole na descrição do vídeo.")); });
        on("btnYtSave", "click", function () { doSave(chaptersText, N("capítulos"), "txt"); });
        on("btnCsvSave", "click", function () { doSave(csvText, N("marcadores"), "csv"); });
        on("btnCsvCopy", "click", function () { doCopy(csvText, N("CSV copiado.")); });
        on("btnOtherSave", "click", onOtherSave);
        on("btnOtherCopy", "click", function () { doCopy(otherText, N("Texto copiado.")); });

        // fase 3: importar e gerar
        on("btnImpOpen", "click", onImpOpen);
        on("btnImpClear", "click", onImpClear);
        on("impText", "input", scheduleImportPreview);
        ["impFormat", "impBase"].forEach(function (id) { on(id, "change", scheduleImportPreview); });
        on("chipImpSkip", "click", function () { state.impSkip = !state.impSkip; renderImportPreview(); });
        on("btnImport", "click", onImport);
        show($("impPreview"), false);
        on("btnCutMarkers", "click", onCutMarkers);

        // fase 3 (parte B)
        loadLegend();
        renderSequenceList();
        on("btnSeqRefresh", "click", loadSequences);
        on("copyTarget", "change", updateButtons);
        on("btnCopy", "click", onCopy);
        on("btnClipToSeq", "click", onClipToSeq);
        on("btnSeqToClip", "click", onSeqToClip);
        on("btnDone", "click", function () { onDone(true); });
        on("btnUndone", "click", function () { onDone(false); });
        on("btnSelPending", "click", function () { selectByDone(false); });
        on("btnSelDone", "click", function () { selectByDone(true); });

        on("btnTest", "click", onTest);

        // fase 2: localizar e numerar
        on("btnReplace", "click", onReplace);
        on("chipMatchCase", "click", function () { state.matchCase = !state.matchCase; renderSelectionInfo(); });
        ["findText", "replaceText", "numPrefix", "numStart", "numStep", "numDigits", "numSuffix"].forEach(function (id) { on(id, "input", schedulePreviews); });
        on("findFields", "change", schedulePreviews);
        on("btnNumber", "click", onNumber);

        // fase 2: modelos
        state.templates = loadStore(TPL_KEY);
        renderTemplateList();
        on("tplSelect", "change", onTplPick);
        on("btnTplApply", "click", onTplApply);
        on("btnTplCreate", "click", onTplCreate);
        on("btnTplDelete", "click", onTplDelete);
        on("btnTplSave", "click", onTplSave);

        // fase 2: seleções salvas
        renderSavedList(true);
        on("savedSel", "change", updateButtons);
        on("btnSavedLoad", "click", onSavedLoad);
        on("btnSavedDelete", "click", onSavedDelete);
        on("btnSavedSave", "click", onSavedSave);

        // fase 2 (parte B)
        show($("confirmClean"), false);
        on("btnDuration", "click", onDuration);
        on("btnPoint", "click", onPoint);
        on("btnDistribute", "click", onDistribute);
        on("btnSnap", "click", onSnap);
        on("btnDedupe", "click", function () { onClean("dedupe"); });
        on("btnMerge", "click", function () { onClean("merge"); });
        on("btnCleanYes", "click", function () { closeConfirm(true); });
        on("btnCleanNo", "click", function () { closeConfirm(false); });
        ["durValue", "snapMax", "cleanTol"].forEach(function (id) { on(id, "input", schedulePreviews); });
        ["durUnit", "snapTracks"].forEach(function (id) { on(id, "change", schedulePreviews); });

        window.addEventListener("error", function (e) { showError(e.error || e.message); });
        window.addEventListener("unhandledrejection", function (e) { showError(e.reason); });

        if (!P.available()) {
            setStatus(tr("Fora do Premiere: a API premierepro não está disponível."), "error");
            renderDiagnostics();
            updateButtons();
            return;
        }
        try {
            state.events = P.listen(onPremiereEvent);
        } catch (e) {
            showError(e);
        }
        renderDiagnostics();
        updateButtons();
        fixSelects();
        setTimeout(fixSelects, 300);
        readAndReport(N("abertura do painel")).then(schedulePoll);
    }

    init();
})();
