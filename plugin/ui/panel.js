// ui/panel.js — Helmet Marker (fase 0: prova de conceito)
// Monta a tela, chama a camada premiere/ e mostra erros sempre no painel (nunca em silêncio).
(function () {
    "use strict";

    var P = HMPremiere;
    var M = HMMarkers;
    var T = HMTimecode;

    var state = {
        ctx: null,
        records: [],
        selected: {},
        busy: false,
        pendingRefresh: false,
        events: [],
        lastEvent: ""
    };

    function $(id) { return document.getElementById(id); }

    function show(el, visible) { el.style.display = visible ? "" : "none"; }

    // ---------- mensagens ----------
    function setStatus(text, kind) {
        var bar = $("status");
        bar.textContent = text || "";
        bar.className = "status" + (kind ? " " + kind : "");
    }

    function showError(err) {
        var msg = err && err.message ? err.message : String(err);
        setStatus(tr("Erro: {0}", trMsg(msg)), "error");
        try { console.error(err); } catch (e) { /* sem console */ }
    }

    // ---------- leitura ----------
    // doneMessage: mensagem de uma ação que acabou de rodar; fica na barra depois de reler.
    async function refresh(doneMessage) {
        if (state.busy) { state.pendingRefresh = true; return; }
        state.busy = true;
        updateButtons();
        var t0 = Date.now();
        setStatus(tr("Lendo marcadores…"));
        try {
            var ctx = await P.getContext();
            state.ctx = ctx;
            if (!ctx.sequence) {
                state.records = [];
                state.selected = {};
                render();
                setStatus(tr("Abra uma sequência na timeline e clique em Atualizar."), "warn");
                return;
            }
            state.records = await P.readMarkers(ctx);
            state.selected = M.pruneSelection(state.selected, state.records);
            render();
            if (doneMessage) setStatus(doneMessage, "ok");
            else setStatus(tr("{0} marcadores lidos em {1} ms.", state.records.length, Date.now() - t0), "ok");
        } catch (e) {
            showError(e);
        } finally {
            state.busy = false;
            updateButtons();
            if (state.pendingRefresh) {
                state.pendingRefresh = false;
                refresh();
            }
        }
    }

    // ---------- desenho ----------
    function seqLine(ctx) {
        if (!ctx || !ctx.sequence) return tr("Nenhuma sequência ativa");
        var parts = [ctx.sequenceName, tr("{0} fps", ctx.info.label)];
        if (ctx.info.dropCapable) {
            var mode = ctx.dropFrame ? "DF" : "NDF";
            parts.push(ctx.dropSource === "guess" ? tr("{0} (suposto)", mode) : mode);
        }
        return parts.join("  ·  ");
    }

    function tcOf(ctx, frame) {
        return T.framesToTimecode(frame, ctx.info, ctx.dropFrame, ctx.startFrame);
    }

    // Tipos que a API usa (createSetTypeAction aceita "Comment", "Chapter", "Segmentation",
    // "WebLink"). Desconhecidos aparecem como vieram.
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

    function cell(cls, text, title) {
        var s = document.createElement("span");
        s.className = "c " + cls;
        s.textContent = text;
        if (title) s.setAttribute("title", title);
        return s;
    }

    function render() {
        var ctx = state.ctx;
        $("seqInfo").textContent = seqLine(ctx);

        var list = $("list");
        while (list.firstChild) list.removeChild(list.firstChild);

        var count = state.records.length;
        show($("empty"), !count);
        if (!count) {
            $("empty").textContent = ctx && ctx.sequence
                ? tr("Esta sequência não tem marcadores. Crie alguns com M na timeline ou use o gerador de teste abaixo.")
                : tr("Abra uma sequência na timeline e clique em Atualizar.");
        }

        var frag = document.createDocumentFragment();
        state.records.forEach(function (r) {
            var row = document.createElement("div");
            row.className = "row" + (state.selected[r.key] ? " selected" : "");
            row.setAttribute("data-key", r.key);

            var color = M.colorFor(ctx.colors, r.colorIndex);
            var sw = document.createElement("span");
            sw.className = "c swatch";
            sw.style.backgroundColor = color.hex;
            sw.setAttribute("title", tr(color.label));
            row.appendChild(sw);

            var tc = tcOf(ctx, r.startFrame);
            row.appendChild(cell("tc" + (r.onFrame ? "" : " off"), r.onFrame ? tc : "⚠ " + tc,
                r.onFrame ? "" : tr("Este marcador não está no frame exato.")));
            row.appendChild(cell("name", r.name || "—", r.name));
            row.appendChild(cell("comment", r.comments || "", r.comments));
            row.appendChild(cell("type", typeLabel(r.type)));
            row.appendChild(cell("dur", T.durationLabel(r.durationFrames, ctx.info)));
            frag.appendChild(row);
        });
        list.appendChild(frag);

        fillColorSelect();
        renderDiagnostics();
        updateButtons();
    }

    function renderDiagnostics() {
        var ctx = state.ctx;
        var lines = [];
        lines.push(tr("Eventos registrados: {0}", state.events.length ? state.events.join(", ") : tr("nenhum")));
        lines.push(tr("Último evento recebido: {0}", state.lastEvent || tr("nenhum")));
        if (ctx && ctx.sequence) {
            lines.push(tr("Ticks por frame: {0}", ctx.ticksPerFrame));
            lines.push(tr("Início da sequência: {0}", tcOf(ctx, 0)));
            lines.push(tr("Formato de tempo informado pela API: {0}", ctx.displayTypeRaw === null || ctx.displayTypeRaw === undefined ? tr("nenhum") : ctx.displayTypeRaw));
            var withGuid = state.records.filter(function (r) { return r.guid; }).length;
            lines.push(tr("Marcadores com guid: {0} de {1}", withGuid, state.records.length));
            var off = state.records.filter(function (r) { return !r.onFrame; }).length;
            lines.push(tr("Marcadores fora do frame exato: {0}", off));
        }
        var box = $("diag");
        while (box.firstChild) box.removeChild(box.firstChild);
        lines.forEach(function (l) {
            var d = document.createElement("div");
            d.textContent = l;
            box.appendChild(d);
        });
    }

    function selectionCount() { return M.selectedRecords(state.selected, state.records).length; }

    function updateButtons() {
        var n = selectionCount();
        var ready = !state.busy && state.ctx && state.ctx.sequence;
        $("btnRefresh").disabled = state.busy;
        $("btnMove").disabled = !(ready && n === 1);
        $("btnColor").disabled = !(ready && n === 2);
        $("btnTest").disabled = !ready;
        $("selInfo").textContent = tr("{0} selecionado(s)", n);
    }

    function fillColorSelect() {
        var sel = $("colorSelect");
        var keep = sel.value;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        var colors = state.ctx && state.ctx.colors && state.ctx.colors.length ? state.ctx.colors : [];
        colors.forEach(function (c) {
            var o = document.createElement("option");
            o.value = String(c.index);
            o.textContent = tr(c.label);
            sel.appendChild(o);
        });
        if (keep) sel.value = keep;
    }

    // ---------- ações ----------
    async function guarded(fn) {
        if (state.busy) return;
        state.busy = true;
        updateButtons();
        var message;
        try {
            message = await fn();
        } catch (e) {
            showError(e);
            state.busy = false;
            updateButtons();
            return;
        }
        state.busy = false;
        await refresh(message);
    }

    function onMove() {
        guarded(async function () {
            var sel = M.selectedRecords(state.selected, state.records);
            if (sel.length !== 1) throw new Error("Selecione exatamente 1 marcador.");
            var plan = M.planMove(sel, 10);
            P.moveMarkers(state.ctx, plan, tr("Helmet Marker: mover marcador"));
            return tr("Marcador movido 10 frames. Ctrl+Z desfaz.");
        });
    }

    function onColor() {
        guarded(async function () {
            var sel = M.selectedRecords(state.selected, state.records);
            if (sel.length !== 2) throw new Error("Selecione exatamente 2 marcadores.");
            var idx = Number($("colorSelect").value);
            if (!isFinite(idx)) throw new Error("Escolha uma cor.");
            P.setColor(state.ctx, sel, idx, tr("Helmet Marker: mudar cor"));
            return tr("Cor alterada em 2 marcadores numa única operação. Um Ctrl+Z desfaz as duas.");
        });
    }

    function onTest() {
        guarded(async function () {
            var count = Number($("testCount").value);
            var step = Number($("testStep").value);
            var plan = M.planTestMarkers(count, step, 0, null, tr("Teste") + " ");
            var t0 = Date.now();
            P.addMarkers(state.ctx, plan, tr("Helmet Marker: criar marcadores de teste"));
            return tr("{0} marcadores criados em {1} ms. Um Ctrl+Z desfaz todos.", plan.length, Date.now() - t0);
        });
    }

    function onListClick(ev) {
        var el = ev.target;
        while (el && el !== this && !(el.getAttribute && el.getAttribute("data-key"))) el = el.parentNode;
        if (!el || el === this) return;
        var key = el.getAttribute("data-key");
        state.selected = M.clickSelect(state.selected, key, ev.ctrlKey || ev.metaKey);
        // redesenha só as classes (rápido com 500+ linhas)
        Array.prototype.forEach.call($("list").childNodes, function (row) {
            var k = row.getAttribute && row.getAttribute("data-key");
            row.className = "row" + (state.selected[k] ? " selected" : "");
        });
        updateButtons();
    }

    // ---------- eventos do Premiere ----------
    var eventTimer = null;
    function onPremiereEvent(name) {
        state.lastEvent = name + " (" + new Date().toLocaleTimeString() + ")";
        if (eventTimer) clearTimeout(eventTimer);
        eventTimer = setTimeout(function () {
            eventTimer = null;
            refresh();
        }, 400);
    }

    // ---------- início ----------
    function init() {
        $("version").textContent = "v" + HM_VERSION;
        var lang = $("langSelect");
        lang.value = HMI18n.lang();
        lang.addEventListener("change", function () {
            HMI18n.setLang(lang.value);
        });
        HMI18n.onChange(function () {
            fillColorSelect();
            if (state.ctx) render(); else renderDiagnostics();
            updateButtons();
        });

        $("btnRefresh").addEventListener("click", function () { refresh(); });
        $("btnMove").addEventListener("click", onMove);
        $("btnColor").addEventListener("click", onColor);
        $("btnTest").addEventListener("click", onTest);
        $("list").addEventListener("click", onListClick);

        window.addEventListener("error", function (e) { showError(e.error || e.message); });
        window.addEventListener("unhandledrejection", function (e) { showError(e.reason); });

        if (!P.available()) {
            setStatus(tr("Fora do Premiere: a API premierepro não está disponível."), "error");
            return;
        }
        try {
            state.events = P.listen(onPremiereEvent);
        } catch (e) {
            showError(e);
        }
        renderDiagnostics();
        refresh();
    }

    init();
})();
