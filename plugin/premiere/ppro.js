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
//   sequence.getPlayerPosition / setPlayerPosition (25.6), sequence.getInPoint / getOutPoint (25.6)
//   markers.createRemoveMarkerAction (25.6), marker.createSetNameAction / createSetCommentsAction /
//   createSetTypeAction (25.6; tipos "Comment", "Chapter", "Segmentation", "WebLink")
//   marker.createSetDurationAction(TickTime) (25.6), TickTime.createWithTicks(string) (25.6)
//   sequence.getVideoTrackCount / getVideoTrack / getAudioTrackCount / getAudioTrack (25.6, Promise)
//   VideoTrack/AudioTrack.getTrackItems(Constants.TrackItemType, includeEmpty) (25.6, sem Promise)
//   VideoClipTrackItem/AudioClipTrackItem.getStartTime / getEndTime (25.6, Promise<TickTime>)
// Fora do Premiere (API UXP, conferida em developer.adobe.com/premiere-pro/uxp/uxp-api/):
//   require("uxp").storage.localFileSystem.getFileForSaving(nome, { types }) -> File ou null;
//   File.write(texto) (UTF-8); navigator.clipboard.writeText (UXP 6.0) / setContent.
//   Permissões no manifest: localFileSystem "request" e clipboard "readAndWrite".
// Vêm do exemplo oficial (uxp-premiere-pro-samples), não da referência, por isso têm reserva:
//   Marker.MARKER_TYPE_COMMENT e TickTime.TIME_ZERO.
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

    // Valor que createSetTypeAction espera para cada tipo (constante do exemplo oficial, se
    // existir; senão o texto que a referência documenta).
    function typeValue(type) {
        var mk = ppro().Marker || {};
        var map = {
            Comment: mk.MARKER_TYPE_COMMENT,
            Chapter: mk.MARKER_TYPE_CHAPTER,
            Segmentation: mk.MARKER_TYPE_SEGMENTATION,
            WebLink: mk.MARKER_TYPE_WEBLINK
        };
        return map[type] || type;
    }

    // Aplica um plano do core/plans.js inteiro numa única transação (um Ctrl+Z).
    // Cada item: { record, color?, name?, comments?, type?, toFrame?, durationFrames?, remove? }
    function applyPlan(ctx, plan, undoLabel) {
        if (!ctx.markersObj) throw new Error("Atualize a lista antes de alterar marcadores.");
        if (!plan.length) return false;
        var times = plan.map(function (p) { return typeof p.toFrame === "number" ? tickAtFrame(ctx, p.toFrame) : null; });
        var durs = plan.map(function (p) { return typeof p.durationFrames === "number" ? tickAtFrame(ctx, p.durationFrames) : null; });
        runTransaction(ctx, undoLabel, function (add) {
            plan.forEach(function (p, i) {
                var m = p.record.marker;
                if (p.remove) { add(ctx.markersObj.createRemoveMarkerAction(m)); return; }
                if (times[i]) add(ctx.markersObj.createMoveMarkerAction(m, times[i]));
                if (typeof p.color === "number") add(m.createSetColorByIndexAction(p.color));
                if (typeof p.name === "string") add(m.createSetNameAction(p.name));
                if (typeof p.comments === "string") add(m.createSetCommentsAction(p.comments));
                if (typeof p.type === "string") add(m.createSetTypeAction(typeValue(p.type)));
                if (durs[i]) {
                    add(m.createSetDurationAction(durs[i]));
                    // A timeline não redesenha só com a duração (testado no 26.5.2): "mover" o
                    // marcador para o próprio início, na mesma transação, para forçar o redesenho.
                    // Usa os ticks exatos (TickTime.createWithTicks, 25.6), então nada sai do lugar.
                    if (!times[i]) add(ctx.markersObj.createMoveMarkerAction(m, ppro().TickTime.createWithTicks(String(p.record.startTicks))));
                }
            });
        });
        return true;
    }

    // ---------- playhead e In/Out ----------
    async function getPlayheadFrame(ctx) {
        var t = await ctx.sequence.getPlayerPosition();
        return T.frameFromTicks(t.ticksNumber, ctx.ticksPerFrame).frame;
    }

    async function setPlayheadFrame(ctx, frame) {
        var ok = await ctx.sequence.setPlayerPosition(tickAtFrame(ctx, frame));
        if (ok === false) throw new Error("O Premiere não moveu o playhead.");
        return true;
    }

    async function getInOut(ctx) {
        var tin = await ctx.sequence.getInPoint();
        var tout = await ctx.sequence.getOutPoint();
        if (!tin || !tout) throw new Error("O Premiere não informou o In/Out da sequência.");
        return {
            inFrame: T.frameFromTicks(tin.ticksNumber, ctx.ticksPerFrame).frame,
            outFrame: T.frameFromTicks(tout.ticksNumber, ctx.ticksPerFrame).frame
        };
    }

    // ---------- cortes da timeline ----------
    // Frames de início e fim de todos os clipes das trilhas pedidas ("both", "video", "audio").
    // Só lê (nada é alterado). TrackItemType.CLIP = 1 segundo a referência (VideoTrack).
    async function getCutFrames(ctx, which) {
        var a = ppro();
        var C = a.Constants || {};
        var clipType = C.TrackItemType && C.TrackItemType.CLIP !== undefined ? C.TrackItemType.CLIP : 1;
        var tracks = [];
        if (which !== "audio") {
            var nv = await ctx.sequence.getVideoTrackCount();
            for (var v = 0; v < nv; v++) tracks.push(await ctx.sequence.getVideoTrack(v));
        }
        if (which !== "video") {
            var na = await ctx.sequence.getAudioTrackCount();
            for (var k = 0; k < na; k++) tracks.push(await ctx.sequence.getAudioTrack(k));
        }
        var seen = {}, cuts = [];
        function addTime(t) {
            if (!t) return;
            var f = T.frameFromTicks(t.ticksNumber, ctx.ticksPerFrame).frame;
            if (!seen[f]) { seen[f] = true; cuts.push(f); }
        }
        for (var i = 0; i < tracks.length; i++) {
            if (!tracks[i]) continue;
            var items = (await val(tracks[i].getTrackItems(clipType, false))) || [];
            for (var j = 0; j < items.length; j++) {
                addTime(await items[j].getStartTime());
                addTime(await items[j].getEndTime());
            }
        }
        cuts.sort(function (x, y) { return x - y; });
        return cuts;
    }

    // ---------- arquivo e área de transferência (API UXP) ----------
    // Abre a janela "Salvar como". Devolve o nome do arquivo salvo, ou "" se o usuário cancelar.
    async function saveTextFile(suggestedName, ext, text) {
        var fs = require("uxp").storage.localFileSystem;
        var file = await fs.getFileForSaving(suggestedName, { types: [ext] });
        if (!file) return "";
        await file.write(text);
        return file.name || suggestedName;
    }

    async function copyText(text) {
        var cb = navigator.clipboard;
        if (!cb) throw new Error("A área de transferência não está disponível.");
        if (typeof cb.writeText === "function") await cb.writeText(text);
        else await cb.setContent({ "text/plain": text });
        return true;
    }

    // plan: [{ frame, name, type?, comments? }] (ex.: HMMarkers.planTestMarkers). Marcadores
    // pontuais; sem tipo = Comentário.
    // (Cor não é definida aqui: createAddMarkerAction não devolve o marcador criado, e mudar
    // a cor exige uma segunda transação — dois Ctrl+Z.)
    function addMarkers(ctx, plan, undoLabel) {
        if (!ctx.markersObj) throw new Error("Atualize a lista antes de alterar marcadores.");
        var a = ppro();
        var zero = a.TickTime.TIME_ZERO || a.TickTime.createWithFrameAndFrameRate(0, ctx.frameRate);
        var items = plan.map(function (p) {
            return {
                name: String(p.name || ""),
                type: typeValue(p.type || "Comment"),
                comments: String(p.comments || ""),
                time: tickAtFrame(ctx, p.frame)
            };
        });
        return runTransaction(ctx, undoLabel, function (add) {
            items.forEach(function (it) { add(ctx.markersObj.createAddMarkerAction(it.name, it.type, it.time, zero, it.comments)); });
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
        applyPlan: applyPlan,
        addMarkers: addMarkers,
        getPlayheadFrame: getPlayheadFrame,
        setPlayheadFrame: setPlayheadFrame,
        getInOut: getInOut,
        getCutFrames: getCutFrames,
        saveTextFile: saveTextFile,
        copyText: copyText,
        listen: listen
    };
})();
