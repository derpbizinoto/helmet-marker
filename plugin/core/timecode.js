// core/timecode.js — Helmet Marker
// Contas de tempo SEM nenhuma chamada ao Premiere (testáveis no Node).
//
// Regra do projeto: toda conta é feita em FRAMES INTEIROS. O Premiere guarda o tempo em
// "ticks"; a camada premiere/ descobre quantos ticks tem um frame da sequência (pela própria
// API, TickTime.createWithFrameAndFrameRate(1, frameRate)) e daqui pra frente tudo é inteiro:
//   ticks -> frame:  frameFromTicks(ticks, ticksPerFrame)
//   frame -> tempo:  a camada premiere/ cria o TickTime com createWithFrameAndFrameRate(frame, fr)
// Nunca somamos segundos com casas decimais.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.HMTimecode = factory();
})(typeof window !== "undefined" ? window : this, function () {
    "use strict";

    // Informações da taxa de quadros a partir do valor em fps que o Premiere devolve
    // (FrameRate.value, ex.: 23.976023976…, 25, 29.97002997…, 60).
    //   nominal:  fps "redondo" usado para escrever o timecode (24, 25, 30, 60…)
    //   ntsc:     true para 23,976 / 29,97 / 59,94 (taxas x1000/1001)
    //   dropCapable: só 29,97 e 59,94 podem usar drop-frame
    function rateInfo(fps) {
        fps = Number(fps);
        if (!isFinite(fps) || fps <= 0) throw new Error("Taxa de quadros inválida: " + fps);
        var nominal = Math.round(fps);
        var ntsc = Math.abs(fps - nominal) > 0.001;
        var dropCapable = ntsc && (nominal === 30 || nominal === 60);
        return {
            fps: fps,
            nominal: nominal,
            ntsc: ntsc,
            dropCapable: dropCapable,
            label: formatFps(fps)
        };
    }

    // 23.976023976 -> "23,976"; 25 -> "25"; 29.97002997 -> "29,97"
    function formatFps(fps) {
        var r = Math.round(fps * 1000) / 1000;
        var s = String(r);
        if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
        return s.replace(".", ",");
    }

    // Converte ticks em frame inteiro. Devolve também se o tempo cai exatamente num frame
    // (marcador "fora do frame" aparece com aviso na lista).
    function frameFromTicks(ticks, ticksPerFrame) {
        ticks = Number(ticks);
        ticksPerFrame = Number(ticksPerFrame);
        if (!isFinite(ticks)) throw new Error("Tempo inválido: " + ticks);
        if (!isFinite(ticksPerFrame) || ticksPerFrame <= 0) throw new Error("Ticks por frame inválido: " + ticksPerFrame);
        var exact = ticks / ticksPerFrame;
        var frame = Math.round(exact);
        // tolerância de 1 tick para arredondamento de número de ponto flutuante
        var onFrame = Math.abs(ticks - frame * ticksPerFrame) <= 1;
        return { frame: frame, onFrame: onFrame };
    }

    function pad(n, size) {
        var s = String(n);
        while (s.length < size) s = "0" + s;
        return s;
    }

    // Frame -> "HH:MM:SS:FF" (non-drop) ou "HH:MM:SS;FF" (drop-frame).
    // frame é relativo ao início da sequência; startFrame é o timecode inicial da sequência
    // em frames (ex.: 01:00:00:00), somado antes de formatar.
    function framesToTimecode(frame, info, dropFrame, startFrame) {
        if (!info) throw new Error("Sem informações da taxa de quadros.");
        var f = Math.round(Number(frame) || 0) + Math.round(Number(startFrame) || 0);
        var negative = f < 0;
        if (negative) f = -f;

        var nominal = info.nominal;
        var useDrop = !!dropFrame && info.dropCapable;

        if (useDrop) {
            // Drop-frame: pula os números de frame 0 e 1 (ou 0–3 em 59,94) no começo de cada
            // minuto, exceto nos minutos múltiplos de 10. Os frames não somem — só os números.
            var drop = nominal === 60 ? 4 : 2;
            var perMinute = nominal * 60 - drop;
            var perTenMinutes = nominal * 600 - drop * 9;
            var tens = Math.floor(f / perTenMinutes);
            var rest = f % perTenMinutes;
            if (rest > drop) {
                f += drop * 9 * tens + drop * Math.floor((rest - drop) / perMinute);
            } else {
                f += drop * 9 * tens;
            }
        }

        var ff = f % nominal;
        var totalSeconds = Math.floor(f / nominal);
        var ss = totalSeconds % 60;
        var mm = Math.floor(totalSeconds / 60) % 60;
        var hh = Math.floor(totalSeconds / 3600);

        var sep = useDrop ? ";" : ":";
        var frameDigits = nominal > 99 ? 3 : 2;
        return (negative ? "-" : "") + pad(hh, 2) + ":" + pad(mm, 2) + ":" + pad(ss, 2) + sep + pad(ff, frameDigits);
    }

    // Duração em frames -> texto ("—" para marcador pontual). Duração é uma contagem de
    // frames, então é sempre escrita sem drop-frame (como no campo Duração do Premiere em NDF).
    function durationLabel(frames, info) {
        if (!frames) return "—";
        return framesToTimecode(frames, info, false, 0);
    }

    // ---------- fase 3: texto -> frame (para importar) ----------
    // "HH:MM:SS:FF" (non-drop) ou com ";" (drop-frame) -> número de frames contado a partir de
    // 00:00:00:00 (o painel desconta o início da sequência). dropFrame força drop-frame mesmo
    // com ":" (as EDLs avisam drop-frame numa linha "FCM:" e usam ":"). Inverso exato de
    // framesToTimecode. Devolve null se o texto não for um timecode válido.
    var TC_RE = /^(-)?(\d{1,2})[:;](\d{2})[:;](\d{2})([:;.])(\d{2,3})$/;

    function timecodeToFrames(text, info, dropFrame) {
        if (!info) throw new Error("Sem informações da taxa de quadros.");
        var m = TC_RE.exec(String(text || "").trim());
        if (!m) return null;
        var hh = +m[2], mm = +m[3], ss = +m[4], ff = +m[6];
        var nominal = info.nominal;
        if (mm > 59 || ss > 59 || ff >= nominal) return null;
        var useDrop = info.dropCapable && (dropFrame || String(text).indexOf(";") >= 0);
        var frames = (hh * 3600 + mm * 60 + ss) * nominal + ff;
        if (useDrop) {
            var drop = nominal === 60 ? 4 : 2;
            if (ss === 0 && ff < drop && mm % 10 !== 0) return null;   // número que não existe em DF
            var totalMinutes = hh * 60 + mm;
            frames -= drop * (totalMinutes - Math.floor(totalMinutes / 10));
        }
        return m[1] ? -frames : frames;
    }

    // Relógio "M:SS", "MM:SS", "H:MM:SS", com fração opcional ("1:02.5", "00:01:02,500")
    // -> segundos (número). Devolve null se não for um relógio.
    var CLOCK_RE = /^(\d{1,3}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?$/;

    function clockToSeconds(text) {
        var m = CLOCK_RE.exec(String(text || "").trim());
        if (!m) return null;
        var a = +m[1], b = +m[2], c = m[3] === undefined ? null : +m[3];
        var frac = m[4] ? Number("0." + m[4]) : 0;
        if (c === null) {               // M:SS
            if (b > 59) return null;
            return a * 60 + b + frac;
        }
        if (b > 59 || c > 59) return null;   // H:MM:SS
        return a * 3600 + b * 60 + c + frac;
    }

    return {
        timecodeToFrames: timecodeToFrames,
        clockToSeconds: clockToSeconds,
        rateInfo: rateInfo,
        formatFps: formatFps,
        frameFromTicks: frameFromTicks,
        framesToTimecode: framesToTimecode,
        durationLabel: durationLabel
    };
});
