// tests/run-tests.js — testes automáticos do Helmet Marker (fora do Premiere)
// Uso (na pasta helmet-marker):  node tests/run-tests.js
//
// Cobre a camada core/ (contas de frame e timecode em 23,976 / 25 / 29,97 DF e NDF / 59,94 / 60,
// identidade, cores, seleção, mover, gerador de teste), as traduções e a versão.
// Não substitui o teste dentro do Premiere.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "plugin");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const T = require(path.join(ROOT, "core", "timecode.js"));
const M = require(path.join(ROOT, "core", "markers.js"));
const VERSION = require(path.join(ROOT, "core", "version.js"));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; }
    catch (e) { failed++; console.log("FALHOU: " + name + "\n   " + (e && e.message)); }
}

// (mensagens montadas com + são conferidas pelo teste do trMsg, mais abaixo)
// i18n carregado num contexto isolado (sem document/localStorage)
function loadI18n(lang) {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(read("strings/i18n.js"), ctx);
    ctx.HMI18n._setLangForTests(lang);
    return ctx;
}

// Ticks por frame reais do Premiere (254016000000 ticks/s). Só usado aqui nos testes para
// simular o que a API devolve; o plugin pergunta o valor ao próprio Premiere.
const TPS = 254016000000;
const tpf = (num, den) => TPS * den / num;

const NTSC = {
    "23.976": 24000 / 1001,
    "29.97": 30000 / 1001,
    "59.94": 60000 / 1001
};

// ---------------------------------------------------------------------------
// Taxa de quadros
// ---------------------------------------------------------------------------

test("rateInfo 23,976", () => {
    const r = T.rateInfo(NTSC["23.976"]);
    assert.strictEqual(r.nominal, 24); assert.strictEqual(r.ntsc, true); assert.strictEqual(r.dropCapable, false);
    assert.strictEqual(r.label, "23,976");
});
test("rateInfo 25", () => {
    const r = T.rateInfo(25);
    assert.strictEqual(r.nominal, 25); assert.strictEqual(r.ntsc, false); assert.strictEqual(r.dropCapable, false);
    assert.strictEqual(r.label, "25");
});
test("rateInfo 29,97", () => {
    const r = T.rateInfo(NTSC["29.97"]);
    assert.strictEqual(r.nominal, 30); assert.strictEqual(r.dropCapable, true); assert.strictEqual(r.label, "29,97");
});
test("rateInfo 59,94 e 60", () => {
    assert.strictEqual(T.rateInfo(NTSC["59.94"]).dropCapable, true);
    assert.strictEqual(T.rateInfo(60).dropCapable, false);
    assert.strictEqual(T.rateInfo(60).nominal, 60);
});
test("rateInfo recusa valor inválido", () => {
    assert.throws(() => T.rateInfo(0));
    assert.throws(() => T.rateInfo("abc"));
});

// ---------------------------------------------------------------------------
// Ticks -> frame
// ---------------------------------------------------------------------------

test("frameFromTicks exato em todas as taxas", () => {
    [[24000, 1001], [25, 1], [30000, 1001], [60000, 1001], [60, 1]].forEach(([n, d]) => {
        const t = tpf(n, d);
        [0, 1, 10, 1799, 107892, 500 * 12].forEach((f) => {
            const r = T.frameFromTicks(f * t, t);
            assert.strictEqual(r.frame, f, `taxa ${n}/${d} frame ${f}`);
            assert.strictEqual(r.onFrame, true);
        });
    });
});
test("frameFromTicks detecta marcador fora do frame", () => {
    const t = tpf(30000, 1001);
    const r = T.frameFromTicks(10 * t + t / 3, t);
    assert.strictEqual(r.frame, 10);
    assert.strictEqual(r.onFrame, false);
});
test("frameFromTicks com 10 horas a 59,94 continua exato", () => {
    const t = tpf(60000, 1001);
    const f = 10 * 215784;
    assert.strictEqual(T.frameFromTicks(f * t, t).frame, f);
});

// ---------------------------------------------------------------------------
// Timecode
// ---------------------------------------------------------------------------

const tc = (frame, fps, drop, start) => T.framesToTimecode(frame, T.rateInfo(fps), drop, start);

test("timecode 25 fps", () => {
    assert.strictEqual(tc(0, 25, false), "00:00:00:00");
    assert.strictEqual(tc(24, 25, false), "00:00:00:24");
    assert.strictEqual(tc(25, 25, false), "00:00:01:00");
    assert.strictEqual(tc(90000, 25, false), "01:00:00:00");
});
test("timecode 25 fps ignora pedido de drop-frame", () => {
    assert.strictEqual(tc(25, 25, true), "00:00:01:00");
});
test("timecode 23,976 (conta em 24)", () => {
    assert.strictEqual(tc(24, NTSC["23.976"], false), "00:00:01:00");
    assert.strictEqual(tc(86400, NTSC["23.976"], true), "01:00:00:00");
});
test("timecode 29,97 non-drop", () => {
    assert.strictEqual(tc(1800, NTSC["29.97"], false), "00:01:00:00");
    assert.strictEqual(tc(107892, NTSC["29.97"], false), "00:59:56:12");
});
test("timecode 29,97 drop-frame", () => {
    const f = NTSC["29.97"];
    assert.strictEqual(tc(1799, f, true), "00:00:59;29");
    assert.strictEqual(tc(1800, f, true), "00:01:00;02");
    assert.strictEqual(tc(1801, f, true), "00:01:00;03");
    assert.strictEqual(tc(3597, f, true), "00:01:59;29");   // o minuto 1 tem 1798 frames (1800 - 2)
    assert.strictEqual(tc(3598, f, true), "00:02:00;02");
    assert.strictEqual(tc(17982, f, true), "00:10:00;00");
    assert.strictEqual(tc(17981, f, true), "00:09:59;29");
    assert.strictEqual(tc(107892, f, true), "01:00:00;00");
});
test("timecode 59,94 drop-frame", () => {
    const f = NTSC["59.94"];
    assert.strictEqual(tc(3599, f, true), "00:00:59;59");
    assert.strictEqual(tc(3600, f, true), "00:01:00;04");
    assert.strictEqual(tc(35964, f, true), "00:10:00;00");
    assert.strictEqual(tc(215784, f, true), "01:00:00;00");
});
test("timecode 60 fps", () => {
    assert.strictEqual(tc(3600, 60, false), "00:01:00:00");
    assert.strictEqual(tc(59, 60, false), "00:00:00:59");
});
test("timecode soma o início da sequência", () => {
    assert.strictEqual(tc(0, 25, false, 90000), "01:00:00:00");
    assert.strictEqual(tc(25, 25, false, 90000), "01:00:01:00");
    assert.strictEqual(tc(0, NTSC["29.97"], true, 107892), "01:00:00;00");
});
test("timecode: drop-frame é sempre crescente e sem números pulados errados", () => {
    // percorre 2 horas a 29,97 DF: nenhum timecode repetido, e só pulam os números 00/01 dos minutos não múltiplos de 10
    const f = NTSC["29.97"];
    let prev = null;
    const seen = new Set();
    for (let i = 0; i < 2 * 107892; i += 1) {
        const s = tc(i, f, true);
        assert.ok(!seen.has(s), "repetido " + s);
        seen.add(s);
        const [hh, mm, rest] = s.split(":");
        const [ss, ff] = rest.split(";");
        if (ss === "00" && Number(mm) % 10 !== 0) assert.ok(Number(ff) >= 2, "número proibido " + s);
        prev = s;
    }
    assert.ok(prev);
});
test("durationLabel", () => {
    assert.strictEqual(T.durationLabel(0, T.rateInfo(25)), "—");
    assert.strictEqual(T.durationLabel(50, T.rateInfo(25)), "00:00:02:00");
});

// ---------------------------------------------------------------------------
// Marcadores
// ---------------------------------------------------------------------------

test("assignKeys usa guid quando existe", () => {
    const r = M.assignKeys([{ guid: "abc", startTicks: 0, type: "Comment", name: "A" }]);
    assert.strictEqual(r[0].key, "g:abc");
});
test("assignKeys sem guid usa tempo+tipo+nome e desempata iguais", () => {
    const r = M.assignKeys([
        { guid: "", startTicks: 10, type: "Comment", name: "A" },
        { guid: "", startTicks: 10, type: "Comment", name: "A" },
        { guid: "", startTicks: 10, type: "Chapter", name: "A" }
    ]);
    assert.strictEqual(r[0].key, "t:10|Comment|A");
    assert.strictEqual(r[1].key, "t:10|Comment|A#2");
    assert.strictEqual(r[2].key, "t:10|Chapter|A");
});
test("buildColorTable ordena pelo índice e junta MAGNETA/MAGENTA", () => {
    const t = M.buildColorTable({ GREEN: 0, RED: 1, MAGNETA: 2, MAGENTA: 2, ORANGE: 3, YELLOW: 4, BLUE: 6, CYAN: 7 });
    assert.deepStrictEqual(t.map((c) => c.index), [0, 1, 2, 3, 4, 6, 7]);
    assert.strictEqual(t[2].name, "MAGENTA");
    assert.strictEqual(t[0].label, "Verde");
});
test("buildColorTable sem MAGENTA (versão antiga) usa MAGNETA", () => {
    const t = M.buildColorTable({ GREEN: 0, MAGNETA: 2 });
    assert.strictEqual(t[1].name, "MAGENTA");
});
test("buildColorTable aceita vazio e ignora não-números", () => {
    assert.deepStrictEqual(M.buildColorTable(undefined), []);
    assert.deepStrictEqual(M.buildColorTable({ X: "a" }), []);
});
test("colorFor com índice desconhecido", () => {
    assert.strictEqual(M.colorFor([], 9).label, "Cor 9");
});
test("seleção: clique, Ctrl+clique e limpeza após reler", () => {
    let s = M.clickSelect({}, "a", false);
    s = M.clickSelect(s, "b", true);
    assert.deepStrictEqual(Object.keys(s).sort(), ["a", "b"]);
    s = M.clickSelect(s, "a", true);
    assert.deepStrictEqual(Object.keys(s), ["b"]);
    s = M.clickSelect(s, "c", false);
    assert.deepStrictEqual(Object.keys(s), ["c"]);
    const recs = [{ key: "a" }, { key: "b" }];
    assert.deepStrictEqual(M.pruneSelection({ a: true, z: true }, recs), { a: true });
    assert.strictEqual(M.selectedRecords({ b: true }, recs)[0].key, "b");
});
test("planMove em frames inteiros", () => {
    const p = M.planMove([{ startFrame: 5 }, { startFrame: 100 }], 10);
    assert.deepStrictEqual(p.map((x) => x.toFrame), [15, 110]);
    const back = M.planMove([{ startFrame: 10 }], -10);
    assert.strictEqual(back[0].toFrame, 0);
});
test("planMove recusa ir antes do início e frações", () => {
    assert.throws(() => M.planMove([{ startFrame: 5 }], -6), /antes do início/);
    assert.throws(() => M.planMove([{ startFrame: 5 }], 1.5), /inteiro/);
});
test("planTestMarkers", () => {
    const p = M.planTestMarkers(500, 12, 0, null, "Teste ");
    assert.strictEqual(p.length, 500);
    assert.strictEqual(p[0].name, "Teste 001");
    assert.strictEqual(p[499].name, "Teste 500");
    assert.strictEqual(p[499].frame, 499 * 12);
    assert.throws(() => M.planTestMarkers(0, 12));
    assert.throws(() => M.planTestMarkers(10, 0));
    assert.throws(() => M.planTestMarkers(1.5, 1));
});

// ---------------------------------------------------------------------------
// Traduções
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Filtros e seleção (fase 1)
// ---------------------------------------------------------------------------

const S = require(path.join(ROOT, "core", "selection.js"));
const PL = require(path.join(ROOT, "core", "plans.js"));
const X = require(path.join(ROOT, "core", "export.js"));

function rec(key, frame, extra) {
    return Object.assign({ key, startFrame: frame, startTicks: frame * 1000, name: "", comments: "", type: "Comment", colorIndex: 0, durationFrames: 0 }, extra || {});
}
const RECS = [
    rec("a", 0, { name: "Abertura", colorIndex: 0 }),
    rec("b", 100, { name: "Cena da cozinha", comments: "Revisar áudio", colorIndex: 1 }),
    rec("c", 200, { name: "Entrevista", type: "Chapter", colorIndex: 1, durationFrames: 50 }),
    rec("d", 300, { name: "Créditos", comments: "fim", colorIndex: 2 })
];
const keysOf = (sel) => Object.keys(sel).sort();

test("filtro de texto ignora maiúsculas e acentos, em nome e comentário", () => {
    const f = S.emptyFilters();
    f.text = "AUDIO";
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["b"]);
    f.text = "creditos fim";
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["d"]);
});
test("filtro por cor, tipo, duração e In/Out", () => {
    const f = S.emptyFilters();
    f.colors = [1];
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["b", "c"]);
    f.colors = []; f.type = "chapter";
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["c"]);
    f.type = ""; f.duration = "point";
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["a", "b", "d"]);
    f.duration = "ranged";
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["c"]);
    f.duration = "all"; f.inOut = { inFrame: 100, outFrame: 200 };
    assert.deepStrictEqual(S.applyFilters(RECS, f).map((r) => r.key), ["b", "c"]);
    assert.strictEqual(S.isFiltering(S.emptyFilters()), false);
});
test("seleção: clique, Ctrl, Shift e Ctrl+Shift", () => {
    const keys = ["a", "b", "c", "d"];
    let st = S.click({ selected: {}, anchor: null }, "b", {}, keys);
    assert.deepStrictEqual(keysOf(st.selected), ["b"]);
    st = S.click(st, "d", { shift: true }, keys);
    assert.deepStrictEqual(keysOf(st.selected), ["b", "c", "d"]);
    assert.strictEqual(st.anchor, "b");
    st = S.click(st, "c", { ctrl: true }, keys);
    assert.deepStrictEqual(keysOf(st.selected), ["b", "d"]);
    assert.strictEqual(st.anchor, "c");
    st = S.click(st, "a", { ctrl: true, shift: true }, keys);
    assert.deepStrictEqual(keysOf(st.selected), ["a", "b", "c", "d"]);
    st = S.click(st, "d", { shift: true }, keys);   // Shift sem Ctrl substitui
    assert.deepStrictEqual(keysOf(st.selected), ["c", "d"]);
});
test("selecionar tudo, inverter e manter só os visíveis", () => {
    assert.deepStrictEqual(keysOf(S.selectAll(["a", "b"])), ["a", "b"]);
    assert.deepStrictEqual(keysOf(S.invert({ a: true, z: true }, ["a", "b", "c"])), ["b", "c"]);
    assert.deepStrictEqual(keysOf(S.keepOnly({ a: true, z: true }, ["a", "b"])), ["a"]);
    assert.strictEqual(S.count({ a: true, b: false }), 1);
});
test("antes/depois do playhead e do marcador", () => {
    assert.deepStrictEqual(keysOf(S.selectRelative(RECS, { frame: 200 }, "before")), ["a", "b"]);
    assert.deepStrictEqual(keysOf(S.selectRelative(RECS, { frame: 200 }, "after")), ["c", "d"]);
    assert.deepStrictEqual(keysOf(S.selectRelative(RECS, { key: "b" }, "before")), ["a"]);
    assert.deepStrictEqual(keysOf(S.selectRelative(RECS, { key: "b" }, "after")), ["c", "d"]);
    assert.throws(() => S.selectRelative(RECS, { key: "zz" }, "after"), /não está na lista/);
});

// ---------------------------------------------------------------------------
// Planos de alteração (fase 1)
// ---------------------------------------------------------------------------

test("planos só incluem o que realmente muda", () => {
    assert.deepStrictEqual(PL.planColor(RECS, 1).map((p) => p.record.key), ["a", "d"]);
    assert.deepStrictEqual(PL.planName(RECS, "Entrevista").map((p) => p.record.key), ["a", "b", "d"]);
    assert.deepStrictEqual(PL.planType(RECS, "chapter").map((p) => p.record.key), ["a", "b", "d"]);
    assert.strictEqual(PL.planType(RECS, "WEBLINK")[0].type, "WebLink");
    assert.throws(() => PL.planType(RECS, "Cue"), /inválido/);
    assert.throws(() => PL.planColor(RECS, "x"), /cor/);
    assert.throws(() => PL.planName(RECS, "  "), /nome/);
});
test("comentário: substituir e acrescentar", () => {
    assert.strictEqual(PL.newComment("velho", "novo", "replace"), "novo");
    assert.strictEqual(PL.newComment("velho", "novo", "append"), "velho novo");
    assert.strictEqual(PL.newComment("velho", "novo", "prepend"), "novo velho");
    assert.strictEqual(PL.newComment("", "novo", "append"), "novo");
    assert.strictEqual(PL.newComment("velho", "", "append"), "velho");
    const p = PL.planComments(RECS, "OK", "append");
    assert.deepStrictEqual(p.map((x) => x.comments), ["OK", "Revisar áudio OK", "OK", "fim OK"]);
    assert.strictEqual(PL.planComments(RECS, "fim", "replace").length, 3);
    assert.throws(() => PL.planComments(RECS, "x", "outro"));
});
test("mover: frames inteiros, ±1 s pelo fps nominal e após o playhead", () => {
    assert.deepStrictEqual(PL.planShift(RECS, 5).map((p) => p.toFrame), [5, 105, 205, 305]);
    assert.deepStrictEqual(PL.planShift(RECS, 0), []);
    assert.throws(() => PL.planShift(RECS, -1), /antes do início/);
    assert.throws(() => PL.planShift(RECS, 0.5), /inteiro/);
    assert.strictEqual(PL.secondsToFrames(1, T.rateInfo(NTSC["29.97"])), 30);
    assert.strictEqual(PL.secondsToFrames(1, T.rateInfo(NTSC["23.976"])), 24);
    assert.strictEqual(PL.secondsToFrames(1, T.rateInfo(25)), 25);
    assert.deepStrictEqual(PL.afterPlayhead(RECS, 200).map((r) => r.key), ["c", "d"]);
    assert.deepStrictEqual(PL.planRemove([RECS[0]]), [{ record: RECS[0], remove: true }]);
});

// ---------------------------------------------------------------------------
// Exportação (fase 1)
// ---------------------------------------------------------------------------

test("capítulos do YouTube: começa em 00:00, ordenado, segundos reais", () => {
    const info = T.rateInfo(25);
    const r = X.youtubeChapters([rec("x", 25 * 75, { name: "Meio" }), rec("y", 0, { name: "Intro" }), rec("z", 25 * 200, { name: "Fim" })], info);
    assert.strictEqual(r.text, "00:00 Intro\n01:15 Meio\n03:20 Fim");
    assert.deepStrictEqual(r.warnings, []);
});
test("capítulos: em 29,97 usa tempo de relógio (frame 1800 = 01:00)", () => {
    const info = T.rateInfo(NTSC["29.97"]);
    const r = X.youtubeChapters([rec("a", 0, { name: "A" }), rec("b", 1800, { name: "B" }), rec("c", 17982, { name: "C" })], info);
    assert.strictEqual(r.text, "00:00 A\n01:00 B\n09:59 C");   // 17982 frames = 599,99 s
});
test("capítulos: horas e título pelo comentário", () => {
    const info = T.rateInfo(25);
    const r = X.youtubeChapters([rec("a", 0, { name: "A" }), rec("b", 25 * 3725, { comments: "Só comentário" })], info);
    assert.strictEqual(r.text, "0:00:00 A\n1:02:05 Só comentário");
});
test("capítulos: avisos (sem 00:00, poucos, curtos, sem título)", () => {
    const info = T.rateInfo(25);
    const r = X.youtubeChapters([rec("a", 50, { name: "A" }), rec("b", 100)], info);
    assert.strictEqual(r.warnings.length, 4);
    assert.ok(/00:00/.test(r.warnings[0]));
    const ctx = loadI18n("en");
    r.warnings.forEach((w) => assert.notStrictEqual(ctx.trMsg(w), w, "sem tradução: " + w));
    assert.deepStrictEqual(X.youtubeChapters([], info).warnings, ["Nenhum marcador para exportar."]);
});
test("CSV: BOM, separador, aspas e vírgula decimal", () => {
    const info = T.rateInfo(25);
    const out = X.csv([rec("b", 50, { name: "Nome; com \"aspas\"", comments: "linha1\nlinha2", durationFrames: 25 }), rec("a", 0, { name: "A" })],
        { sep: ";", info, dropFrame: false, startFrame: 0 });
    assert.ok(out.startsWith("﻿"));
    const lines = out.slice(1).split("\r\n");
    assert.strictEqual(lines[0], "Timecode;Frame;Segundos;Nome;Comentário;Cor;Tipo;Duração;Duração (frames)");
    assert.strictEqual(lines[1], "00:00:00:00;0;0,000;A;;0;Comment;;0");
    assert.strictEqual(lines[2], "00:00:02:00;50;2,000;\"Nome; com \"\"aspas\"\"\";\"linha1\nlinha2\";0;Comment;00:00:01:00;25");
    const comma = X.csv([rec("a", 25, { name: "x,y" })], { sep: ",", info, dropFrame: false, startFrame: 0 });
    assert.ok(comma.indexOf("00:00:01:00,25,1.000,\"x,y\"") > 0);
});
test("CSV usa timecode drop-frame e início da sequência", () => {
    const info = T.rateInfo(NTSC["29.97"]);
    const out = X.csv([rec("a", 1800)], { sep: ";", info, dropFrame: true, startFrame: 107892 });
    assert.ok(out.indexOf("\"01:01:00;02\";1800;60,060") > 0);   // timecode DF tem ";" e vai entre aspas
});
test("signature muda quando qualquer campo muda", () => {
    const base = M.signature(RECS);
    assert.strictEqual(M.signature(RECS.map((r) => Object.assign({}, r))), base);
    assert.notStrictEqual(M.signature(RECS.map((r, i) => i === 2 ? Object.assign({}, r, { comments: "x" }) : r)), base);
    assert.notStrictEqual(M.signature(RECS.slice(1)), base);
});

const SOURCES = ["ui/panel.js", "premiere/ppro.js", "core/markers.js", "core/timecode.js", "core/selection.js", "core/plans.js", "core/export.js"];

function literalCalls(src, fnNames) {
    const out = [];
    const re = new RegExp("\\b(?:" + fnNames.join("|") + ")\\(\\s*\"((?:[^\"\\\\]|\\\\.)*)\"(?=\\s*[,)])", "g");
    let m;
    while ((m = re.exec(src))) out.push(JSON.parse("\"" + m[1] + "\""));
    return out;
}

test("todo tr()/N()/Error() literal tem tradução", () => {
    const ctx = loadI18n("en");
    const EN = ctx.HMI18n.EN;
    const missing = [];
    SOURCES.forEach((f) => {
        literalCalls(read(f), ["tr", "N", "Error"]).forEach((k) => {
            if (!Object.prototype.hasOwnProperty.call(EN, k)) missing.push(f + ": " + k);
        });
    });
    assert.deepStrictEqual(missing, []);
});
test("todo texto fixo do index.html tem tradução", () => {
    const ctx = loadI18n("en");
    const EN = ctx.HMI18n.EN, SAME = ctx.HMI18n.SAME_IN_BOTH;
    const html = read("index.html").replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
    const texts = (html.match(/>([^<>]+)</g) || []).map((s) => s.slice(1, -1).trim()).filter((s) => s && s !== "·");
    const missing = texts.filter((s) => !(s in EN) && SAME.indexOf(s) < 0);
    assert.deepStrictEqual(missing, []);
});
test("placeholders iguais nas duas línguas", () => {
    const EN = loadI18n("en").HMI18n.EN;
    Object.keys(EN).forEach((k) => {
        const a = (k.match(/\{\d\}/g) || []).sort().join();
        const b = (EN[k].match(/\{\d\}/g) || []).sort().join();
        assert.strictEqual(a, b, k);
    });
});
test("nenhuma tradução sobrando", () => {
    const EN = loadI18n("en").HMI18n.EN;
    const all = SOURCES.map(read).join("\n") + read("index.html");
    const unused = Object.keys(EN).filter((k) => {
        if (all.indexOf(k) >= 0) return false;
        const prefix = k.split("{")[0];                       // "Cor {0}" vem de "Cor " + índice
        return !(prefix.length > 3 && all.indexOf("\"" + prefix) >= 0);
    });
    assert.deepStrictEqual(unused, []);
});
test("trMsg traduz erros com partes variáveis do core", () => {
    const ctx = loadI18n("en");
    let msg = "";
    try { M.planMove([{ startFrame: 5 }], -6); } catch (e) { msg = e.message; }
    assert.strictEqual(ctx.trMsg(msg), "Moving -6 frames would put 1 marker(s) before the start of the sequence. Nothing was changed.");
    try { T.rateInfo(0); } catch (e) { msg = e.message; }
    assert.strictEqual(ctx.trMsg(msg), "Invalid frame rate: 0");
    assert.strictEqual(ctx.trMsg("algo do Windows"), "algo do Windows");
});
test("rótulos de cor do core têm tradução", () => {
    const EN = loadI18n("en").HMI18n.EN;
    Object.keys(M.COLOR_INFO).forEach((k) => assert.ok(M.COLOR_INFO[k].label in EN, k));
});
test("em português tr() devolve a própria chave", () => {
    const ctx = loadI18n("pt");
    assert.strictEqual(ctx.tr("{0} selecionado(s)", 2), "2 selecionado(s)");
    assert.strictEqual(ctx.trMsg("Nenhum projeto aberto."), "Nenhum projeto aberto.");
});

// ---------------------------------------------------------------------------
// Manifest e versão
// ---------------------------------------------------------------------------

test("versão igual no manifest e no core/version.js", () => {
    const man = JSON.parse(read("manifest.json"));
    assert.strictEqual(man.version, VERSION);
});
test("manifest: v5, Premiere, host único (exigido para distribuir) e arquivos existentes", () => {
    const man = JSON.parse(read("manifest.json"));
    assert.strictEqual(man.manifestVersion, 5);
    assert.ok(!Array.isArray(man.host));
    assert.strictEqual(man.host.app, "premierepro");
    const files = [man.main].concat(man.icons.map((i) => i.path), ...man.entrypoints.map((e) => (e.icons || []).map((i) => i.path)));
    files.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), "falta " + f));
});
test("index.html carrega os scripts que existem", () => {
    const html = read("index.html");
    const srcs = (html.match(/src="([^"]+\.js)"/g) || []).map((s) => s.slice(5, -1));
    assert.ok(srcs.length >= 5);
    srcs.forEach((s) => assert.ok(fs.existsSync(path.join(ROOT, s)), "falta " + s));
});

console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
