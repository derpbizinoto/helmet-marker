// premiere/ppro.js — Helmet Marker
// Camada FINA entre o painel e o Premiere: lê a sequência/marcadores e aplica as alterações.
// Toda alteração em massa é UMA transação (project.lockedAccess + project.executeTransaction),
// então um único Ctrl+Z desfaz tudo.
//
// Toda classe/método usado aqui foi conferido na documentação oficial
// (developer.adobe.com/premiere-pro/uxp/ppro-reference/) — versão mínima entre parênteses:
//   Project.getActiveProject (25.6), project.getActiveSequence (25.6),
//   project.lockedAccess (25.6), project.executeTransaction (25.6), CompoundAction.addAction (25.6)
//   sequence.getSettings (25.6), SequenceSettings.getVideoFrameRate (26.2), FrameRate.value (25.6)
//   sequence.getZeroPoint (25.6), sequence.getSequenceVideoTimeDisplayFormat (25.6), TimeDisplay.type
//   sequence.guid / sequence.name (25.6)
//   TickTime.createWithFrameAndFrameRate (25.6), TickTime.ticksNumber (25.6), TickTime.TIME_ZERO
//   Markers.getMarkers(sequence) (25.6, Promise), markers.getMarkers() (25.6)
//   markers.createAddMarkerAction / createMoveMarkerAction (25.6)
//   marker.getName/getComments/getType/getColorIndex/getStart/getDuration (25.6)
//   marker.createSetColorByIndexAction (25.6), marker.guid (26.3)
//   Constants.MarkerColor (25.6; MAGENTA 26.5), Constants.VideoDisplayFormatType (25.6)
//   EventManager.addGlobalEventListener (25.6), Constants.SequenceEvent / ProjectEvent (25.6)
var HMPremiere = (function () {
    "use strict";

    var app = null;
    function ppro() {
        if (!app) app = require("premierepro");
        return app;
    }

    var T = HMTimecode;
    var M = HMMarkers;

    // Valor que pode vir direto ou como Promise (a doc diz que métodos são assíncronos,
    // mas várias páginas não marcam Promise) — "await" funciona nos dois casos.
    async function val(x) { return await x; }

    function guidText(g) {
        if (g === undefined || g === null) return "";
        try { return typeof g.toString === "function" ? String(g.toString()) : String(g); }
        catch (e) { return ""; }
    }

    // ---------- contexto: projeto + sequência ativa + taxa de quadros ----------
    async function getContext() {
        var a = ppro();
        var project = await a.Project.getActiveProject();
        if (!project) throw new Error("Nenhum projeto aberto.");
        var sequence = await project.getActiveSequence();
        if (!sequence) return { project: project, sequence: null };

        var settings = await sequence.getSettings();
        var frameRate = await val(settings.getVideoFrameRate());
        if (!frameRate) throw new Error("O Premiere não informou a taxa de quadros da sequência.");
        var info = T.rateInfo(frameRate.value);

        // Quantos ticks tem 1 frame, perguntado ao próprio Premiere (nada de constante inventada).
        var ticksPerFrame = a.TickTime.createWithFrameAndFrameRate(1, frameRate).ticksNumber;

        var zero = await sequence.getZeroPoint();
        var startFrame = zero ? T.frameFromTicks(zero.ticksNumber, ticksPerFrame).frame : 0;

        var drop = await detectDropFrame(sequence, info);

        return {
            project: project,
            sequence: sequence,
            sequenceName: sequence.name,
            sequenceId: guidText(sequence.guid),
            frameRate: frameRate,
            info: info,
            ticksPerFrame: ticksPerFrame,
            startFrame: startFrame,
            dropFrame: drop.dropFrame,
            dropSource: drop.source,
            displayTypeRaw: drop.raw,
            colors: M.buildColorTable(a.Constants && a.Constants.MarkerColor),
            markersObj: null
        };
    }

    // Drop-frame: a API só expõe o formato de exibição (TimeDisplay.type) e as constantes
    // VideoDisplayFormatType.FPS_29_97 (drop) / FPS_29_97_NON_DROP. Não há constante para
    // 59,94 drop. Quando não dá para saber, assumimos drop-frame em 29,97/59,94 (padrão do
    // Premiere) e o painel mostra que foi suposição.
    async function detectDropFrame(sequence, info) {
        if (!info.dropCapable) return { dropFrame: false, source: "na", raw: null };
        var raw = null;
        try {
            var td = await sequence.getSequenceVideoTimeDisplayFormat();
            raw = td ? td.type : null;
            var V = ppro().Constants.VideoDisplayFormatType || {};
            if (raw !== null && raw !== undefined) {
                if (raw === V.FPS_29_97_NON_DROP) return { dropFrame: false, source: "api", raw: raw };
                if (raw === V.FPS_29_97) return { dropFrame: true, source: "api", raw: raw };
            }
        } catch (e) { /* cai na suposição abaixo */ }
        return { dropFrame: true, source: "guess", raw: raw };
    }

    // ---------- leitura ----------
    async function readMarkers(ctx) {
        var a = ppro();
        var markersObj = await a.Markers.getMarkers(ctx.sequence);
        ctx.markersObj = markersObj;
        var list = (await val(markersObj.getMarkers())) || [];
        var records = [];
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
            var start = await val(m.getStart());
            var dur = await val(m.getDuration());
            var startPos = T.frameFromTicks(start.ticksNumber, ctx.ticksPerFrame);
            var durPos = dur ? T.frameFromTicks(dur.ticksNumber, ctx.ticksPerFrame) : { frame: 0, onFrame: true };
            var guid = "";
            try { guid = guidText(m.guid); } catch (e) { guid = ""; }
            records.push({
                marker: m,
                guid: guid,
                name: String((await val(m.getName())) || ""),
                comments: String((await val(m.getComments())) || ""),
                type: String((await val(m.getType())) || ""),
                colorIndex: await val(m.getColorIndex()),
                startTicks: start.ticksNumber,
                startFrame: startPos.frame,
                onFrame: startPos.onFrame && durPos.onFrame,
                durationFrames: durPos.frame
            });
        }
        records.sort(function (x, y) { return x.startTicks - y.startTicks; });
        return M.assignKeys(records);
    }

    // ---------- escrita: sempre uma transação ----------
    function runTransaction(ctx, undoLabel, build) {
        var ok = false;
        var inner = null;
        ctx.project.lockedAccess(function () {
            ok = ctx.project.executeTransaction(function (compoundAction) {
                try {
                    build(function (action) {
                        if (!action) throw new Error("O Premiere não criou a ação.");
                        if (compoundAction.addAction(action) === false) throw new Error("O Premiere recusou uma das ações.");
                    });
                } catch (e) {
                    inner = e;
                    throw e;
                }
            }, undoLabel);
        });
        if (inner) throw inner;
        if (!ok) throw new Error("O Premiere recusou a operação. Nada foi alterado.");
        return true;
    }

    function tickAtFrame(ctx, frame) {
        return ppro().TickTime.createWithFrameAndFrameRate(frame, ctx.frameRate);
    }

    // plan: saída de HMMarkers.planMove
    function moveMarkers(ctx, plan, undoLabel) {
        if (!ctx.markersObj) throw new Error("Atualize a lista antes de alterar marcadores.");
        var targets = plan.map(function (p) { return { marker: p.record.marker, time: tickAtFrame(ctx, p.toFrame) }; });
        return runTransaction(ctx, undoLabel, function (add) {
            targets.forEach(function (t) { add(ctx.markersObj.createMoveMarkerAction(t.marker, t.time)); });
        });
    }

    function setColor(ctx, records, colorIndex, undoLabel) {
        return runTransaction(ctx, undoLabel, function (add) {
            records.forEach(function (r) { add(r.marker.createSetColorByIndexAction(colorIndex)); });
        });
    }

    // plan: saída de HMMarkers.planTestMarkers. Marcadores pontuais do tipo Comentário.
    // (Cor não é definida aqui: createAddMarkerAction não devolve o marcador criado, e mudar
    // a cor exigiria uma segunda transação — dois Ctrl+Z.)
    function addMarkers(ctx, plan, undoLabel) {
        if (!ctx.markersObj) throw new Error("Atualize a lista antes de alterar marcadores.");
        var a = ppro();
        var type = (a.Marker && a.Marker.MARKER_TYPE_COMMENT) || "Comment";
        var zero = a.TickTime.TIME_ZERO || a.TickTime.createWithFrameAndFrameRate(0, ctx.frameRate);
        var items = plan.map(function (p) { return { name: p.name, time: tickAtFrame(ctx, p.frame) }; });
        return runTransaction(ctx, undoLabel, function (add) {
            items.forEach(function (it) { add(ctx.markersObj.createAddMarkerAction(it.name, type, it.time, zero, "")); });
        });
    }

    // ---------- eventos ----------
    // Registra o que existir e devolve a lista do que funcionou (mostrada no diagnóstico).
    function listen(onChange) {
        var a = ppro();
        var C = a.Constants || {};
        var wanted = [
            ["SequenceEvent.ACTIVATED", C.SequenceEvent && C.SequenceEvent.ACTIVATED],
            ["ProjectEvent.ACTIVATED", C.ProjectEvent && C.ProjectEvent.ACTIVATED],
            ["ProjectEvent.DIRTY", C.ProjectEvent && C.ProjectEvent.DIRTY]
        ];
        var registered = [];
        wanted.forEach(function (w) {
            if (w[1] === undefined || w[1] === null) return;
            try {
                a.EventManager.addGlobalEventListener(w[1], function () { onChange(w[0]); }, false);
                registered.push(w[0]);
            } catch (e) { /* evento indisponível nesta versão */ }
        });
        return registered;
    }

    function available() {
        try { return !!ppro(); } catch (e) { return false; }
    }

    return {
        available: available,
        getContext: getContext,
        readMarkers: readMarkers,
        moveMarkers: moveMarkers,
        setColor: setColor,
        addMarkers: addMarkers,
        listen: listen
    };
})();
