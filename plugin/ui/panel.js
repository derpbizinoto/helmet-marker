// ui/panel.js — Helmet Marker (fase 1: MVP)
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

    var POLL_MIN = 2000, POLL_MAX = 15000;

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
        colorsSig: ""
    };

    function $(id) { return document.getElementById(id); }
    function show(el, visible) { el.style.display = visible ? "" : "none"; }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function now() { return new Date().toLocaleTimeString(); }

    // ---------- mensagens ----------
    function setStatus(text, kind) {
        var bar = $("status");
        bar.textContent = text || "";
        bar.className = "status" + (kind ? " " + kind : "");
        fitContent();
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
        var ctx = await P.getContext();
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
        if (state.busy || state.confirm || state.reading) { schedulePoll(); return; }
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
        $("seqInfo").textContent = seqLine();
        buildColorControls();

        var list = $("list");
        var scroll = list.scrollTop;
        clear(list);

        var empty = $("empty");
        if (!hasSeq()) {
            empty.textContent = tr("Abra uma sequência na timeline e clique em Atualizar.");
        } else if (!state.records.length) {
            empty.textContent = tr("Esta sequência não tem marcadores. Crie alguns com M na timeline ou use as ferramentas de teste no fim do painel.");
        } else {
            empty.textContent = tr("Nenhum marcador passa pelos filtros.");
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
        list.scrollTop = scroll;

        renderSelectionInfo();
        renderDiagnostics();
    }

    // Só o que depende da seleção (rápido: não recria as linhas).
    function renderSelectionInfo() {
        Array.prototype.forEach.call($("list").childNodes, function (row) {
            var k = row.getAttribute && row.getAttribute("data-key");
            if (k) row.className = rowClass(k);
        });
        var n = S.count(state.selected);
        var parts = [tr("{0} marcadores", state.records.length)];
        if (S.isFiltering(state.filters)) parts.push(tr("{0} na lista", state.visible.length));
        parts.push(tr("{0} selecionado(s)", n));
        if (state.inOutOn && state.filters.inOut && hasSeq()) {
            parts.push(tr("In/Out: {0} – {1}", tcOf(state.filters.inOut.inFrame), tcOf(state.filters.inOut.outFrame)));
        }
        $("counts").textContent = parts.join("  ·  ");
        renderPreviews();
        updateButtons();
    }

    function buildColorControls() {
        var colors = state.ctx && state.ctx.colors ? state.ctx.colors : [];
        var sig = colors.map(function (c) { return c.index + c.name; }).join(",") + "|" + HMI18n.lang();
        if (sig === state.colorsSig) return;
        state.colorsSig = sig;

        var chips = $("colorChips");
        clear(chips);
        colors.forEach(function (c) {
            var b = document.createElement("button");
            b.className = "chip color-chip" + (state.filters.colors.indexOf(c.index) >= 0 ? " on" : "");
            b.setAttribute("data-color", String(c.index));
            b.setAttribute("title", tr(c.label));
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
    }

    function previewText(fn, verbKey) {
        try {
            var n = fn();
            if (!n) return tr("Nada a alterar.");
            return tr(verbKey, n);
        } catch (e) {
            return errText(e);
        }
    }

    function renderPreviews() {
        var sel = selected();
        var none = tr("Selecione marcadores na lista.");
        var change = N("Vai alterar {0} marcador(es).");
        $("pvColor").textContent = sel.length ? previewText(function () { return PL.planColor(sel, $("editColor").value).length; }, change) : none;
        $("pvName").textContent = sel.length ? previewText(function () { return PL.planName(sel, $("editName").value).length; }, change) : none;
        $("pvComment").textContent = sel.length ? previewText(function () { return PL.planComments(sel, $("editComment").value, $("editCommentMode").value).length; }, change) : none;
        $("pvType").textContent = sel.length ? previewText(function () { return PL.planType(sel, $("editType").value).length; }, change) : none;
        $("pvDelete").textContent = sel.length ? tr("Vai excluir {0} marcador(es).", sel.length) : none;

        if (state.afterPlayheadOn) $("pvMove").textContent = tr("Vai mover todos os marcadores a partir do playhead.");
        else $("pvMove").textContent = sel.length ? tr("Vai mover {0} marcador(es).", sel.length) : none;

        renderExportPreview();
    }

    function renderExportPreview() {
        var box = $("ytPreview"), warn = $("ytWarnings");
        clear(warn);
        if (!hasSeq()) { box.textContent = ""; show(box, false); $("pvYt").textContent = ""; return; }
        var targets = exportTargets();
        var yt = X.youtubeChapters(targets, state.ctx.info);
        box.textContent = yt.text;
        show(box, !!yt.text);
        $("pvYt").textContent = targets.length ? tr("{0} capítulo(s).", targets.length) : "";
        yt.warnings.forEach(function (w) {
            var d = document.createElement("div");
            d.textContent = "⚠ " + trMsg(w);
            warn.appendChild(d);
        });
    }

    function renderDiagnostics() {
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
        var box = $("diag");
        clear(box);
        lines.forEach(function (l) {
            var d = document.createElement("div");
            d.textContent = l;
            box.appendChild(d);
        });
    }

    function updateButtons() {
        var ready = !state.busy && hasSeq();
        var n = selected().length;
        $("btnRefresh").disabled = state.busy;
        ["btnSelAll", "btnSelNone", "btnSelInvert", "btnSelBefore", "btnSelAfter"].forEach(function (id) { $(id).disabled = !ready; });
        ["btnColor", "btnName", "btnComment", "btnType", "btnDelete"].forEach(function (id) { $(id).disabled = !(ready && n); });
        var canMove = ready && (n || state.afterPlayheadOn);
        ["btnMinusSec", "btnMinusFrame", "btnPlusFrame", "btnPlusSec", "btnMove"].forEach(function (id) { $(id).disabled = !canMove; });
        var canExport = ready && exportTargets().length > 0;
        ["btnYtCopy", "btnYtSave", "btnCsvSave", "btnCsvCopy"].forEach(function (id) { $(id).disabled = !canExport; });
        $("btnTest").disabled = !ready;
        $("chipInOut").className = "chip" + (state.inOutOn ? " on" : "");
        $("chipAfterPlayhead").className = "chip" + (state.afterPlayheadOn ? " on" : "");
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
        runEdit(function () { return PL.planName(needSelection(), $("editName").value); },
            tr("Helmet Marker: mudar nome"), N("Nome alterado em {0} marcador(es). Um Ctrl+Z desfaz."));
    }
    function onComment() {
        runEdit(function () { return PL.planComments(needSelection(), $("editComment").value, $("editCommentMode").value); },
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
        var v = Number($("moveFrames").value);
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
        show($("confirmBar"), true);
    }
    function closeConfirm(run) {
        var fn = state.confirm;
        state.confirm = null;
        show($("confirmBar"), false);
        if (run && fn) fn();
    }

    function onTest() {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message;
        try {
            var plan = M.planTestMarkers(Number($("testCount").value), Number($("testStep").value), 0, null, tr("Teste") + " ");
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

    // ---------- lista: clique ----------
    function onListClick(ev) {
        var el = ev.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-key"))) el = el.parentNode;
        if (!el || el === this) return;
        var key = el.getAttribute("data-key");
        var mods = { ctrl: !!(ev.ctrlKey || ev.metaKey), shift: !!ev.shiftKey };
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
        $("filterText").value = "";
        $("filterType").value = "";
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

    // ---------- eventos do Premiere ----------
    function onPremiereEvent(name) {
        state.lastEvent = name + " (" + now() + ")";
        read(name, true).catch(showError);
    }

    // ---------- altura da área que rola ----------
    function fitContent() {
        var h = window.innerHeight;
        if (!h) return;
        var used = $("appHeader").offsetHeight + $("status").offsetHeight;
        $("content").style.height = Math.max(80, h - used) + "px";
    }

    // ---------- início ----------
    function on(id, ev, fn) { $(id).addEventListener(ev, fn); }

    function init() {
        fitContent();
        window.addEventListener("resize", fitContent);
        setTimeout(fitContent, 300);
        show($("confirmBar"), false);
        $("version").textContent = "v" + HM_VERSION;

        var lang = $("langSelect");
        lang.value = HMI18n.lang();
        on("langSelect", "change", function () { HMI18n.setLang(lang.value); });
        HMI18n.onChange(function () {
            state.colorsSig = "";
            if (hasSeq()) render(); else renderDiagnostics();
            $("seqInfo").textContent = seqLine();
        });

        on("btnRefresh", "click", function () { readAndReport(N("botão Atualizar")); });
        on("list", "click", onListClick);

        // filtros
        on("filterText", "input", function () { state.filters.text = $("filterText").value; filtersChanged(); });
        on("filterType", "change", function () { state.filters.type = $("filterType").value; filtersChanged(); });
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
        ["editColor", "editCommentMode", "editType"].forEach(function (id) { on(id, "change", renderPreviews); });
        ["editName", "editComment"].forEach(function (id) { on(id, "input", renderPreviews); });

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

        on("btnTest", "click", onTest);

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
        readAndReport(N("abertura do painel")).then(schedulePoll);
    }

    init();
})();
