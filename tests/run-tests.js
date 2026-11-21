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
test("planShift em frames inteiros", () => {
    const p = PL.planShift([{ startFrame: 5 }, { startFrame: 100 }], 10);
    assert.deepStrictEqual(p.map((x) => x.toFrame), [15, 110]);
    const back = PL.planShift([{ startFrame: 10 }], -10);
    assert.strictEqual(back[0].toFrame, 0);
    assert.deepStrictEqual(PL.planShift([{ startFrame: 10 }], 0), []);
});
test("planShift recusa ir antes do início e frações", () => {
    assert.throws(() => PL.planShift([{ startFrame: 5 }], -6), /antes do início/);
    assert.throws(() => PL.planShift([{ startFrame: 5 }], 1.5), /inteiro/);
});
test("painel nunca escreve num campo por fieldText (só lê)", () => {
    const src = read("ui/panel.js");
    assert.ok(!/fieldText\([^)]*\)\s*=[^=]/.test(src), "use setField para escrever");
});

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
    assert.strictEqual(PL.secondsToFrames(2.5, T.rateInfo(25)), 63);       // 62,5 arredonda para 63
    assert.strictEqual(PL.secondsToFrames(0.5, T.rateInfo(NTSC["29.97"])), 15);
    assert.deepStrictEqual(PL.afterPlayhead(RECS, 200).map((r) => r.key), ["c", "d"]);
    assert.deepStrictEqual(PL.planRemove([RECS[0]]), [{ record: RECS[0], remove: true }]);
});

// ---------------------------------------------------------------------------
// Fase 2 (parte A): localizar/substituir, numeração, modelos, seleções salvas
// ---------------------------------------------------------------------------

const LIB = require(path.join(ROOT, "core", "library.js"));

test("substituir: todas as ocorrências, sem diferenciar maiúsculas por padrão", () => {
    const r = [rec("a", 0, { name: "Cena cena CENA", comments: "cena boa" })];
    const p = PL.planReplace(r, "cena", "Take", "both", false);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].name, "Take Take Take");
    assert.strictEqual(p[0].comments, "Take boa");
});
test("substituir: diferenciar maiúsculas e só no nome / só no comentário", () => {
    const r = [rec("a", 0, { name: "Cena cena", comments: "cena" })];
    assert.strictEqual(PL.planReplace(r, "cena", "x", "both", true)[0].name, "Cena x");
    const onlyName = PL.planReplace(r, "cena", "x", "name", false)[0];
    assert.strictEqual(onlyName.comments, undefined);
    const onlyComm = PL.planReplace(r, "cena", "x", "comments", false)[0];
    assert.strictEqual(onlyComm.name, undefined);
    assert.strictEqual(onlyComm.comments, "x");
});
test("substituir: texto com símbolos não vira expressão regular", () => {
    const r = [rec("a", 0, { name: "Take (1). v2.0" })];
    assert.strictEqual(PL.planReplace(r, "(1).", "$1", "name", false)[0].name, "Take $1 v2.0");
    assert.strictEqual(PL.planReplace(r, ".", "", "name", false)[0].name, "Take (1) v20");
});
test("substituir: sem ocorrência não entra no plano; procurar vazio é recusado", () => {
    assert.strictEqual(PL.planReplace(RECS, "zzz", "x", "both", false).length, 0);
    assert.throws(() => PL.planReplace(RECS, "", "x", "both", false), /Digite o texto a procurar/);
    assert.throws(() => PL.planReplace(RECS, "a", "x", "outro", false), /Escolha onde procurar/);
});
test("numerar: em ordem de tempo, com zeros, prefixo e sufixo", () => {
    const r = [rec("c", 200), rec("a", 0), rec("b", 100)];
    const p = PL.planNumber(r, { prefix: "Cena ", start: 1, step: 1, digits: 2, suffix: "" });
    assert.deepStrictEqual(p.map((x) => x.record.key + "=" + x.name), ["a=Cena 01", "b=Cena 02", "c=Cena 03"]);
    const q = PL.planNumber(r, { prefix: "", start: 10, step: 10, digits: 3, suffix: "A" });
    assert.deepStrictEqual(q.map((x) => x.name), ["010A", "020A", "030A"]);
});
test("numerar: quem já tem o nome fica de fora; números inválidos são recusados", () => {
    const r = [rec("a", 0, { name: "Cena 01" }), rec("b", 100)];
    assert.strictEqual(PL.planNumber(r, { prefix: "Cena ", start: 1, step: 1, digits: 2 }).length, 1);
    assert.throws(() => PL.planNumber(r, { start: 1.5, step: 1, digits: 2 }), /número inicial/);
    assert.throws(() => PL.planNumber(r, { start: 1, step: 0, digits: 2 }), /passo/);
    assert.throws(() => PL.planNumber(r, { start: 1, step: 1, digits: 9 }), /dígitos/);
    assert.strictEqual(PL.numberedName("T", -3, 2, ""), "T-03");
});
test("modelo: só muda o que o modelo define", () => {
    const tpl = LIB.makeTemplate({ name: "Revisar", markerName: "", color: "1", type: "keep", comments: "REVISAR", commentMode: "prepend" });
    assert.deepStrictEqual([tpl.color, tpl.type, tpl.markerName], [1, "", ""]);
    const p = PL.planTemplate(RECS, tpl);
    const b = p.find((x) => x.record.key === "b");
    assert.strictEqual(b.color, undefined);                // já era cor 1
    assert.strictEqual(b.comments, "REVISAR Revisar áudio");
    assert.strictEqual(b.name, undefined);
    const a = p.find((x) => x.record.key === "a");
    assert.strictEqual(a.color, 1);
});
test("modelo: nome e tipo; modelo vazio ou sem nome é recusado", () => {
    const tpl = LIB.makeTemplate({ name: "Cap", markerName: "Capítulo", color: "keep", type: "Chapter", comments: "" });
    const p = PL.planTemplate([RECS[2], RECS[0]], tpl);
    assert.strictEqual(p.find((x) => x.record.key === "c").type, undefined);   // já era Chapter
    assert.strictEqual(p.find((x) => x.record.key === "a").type, "Chapter");
    assert.throws(() => LIB.makeTemplate({ name: "", markerName: "x" }), /nome ao modelo/);
    assert.throws(() => LIB.makeTemplate({ name: "Nada", color: "keep", type: "keep" }), /pelo menos uma coisa/);
});
test("listas com nome: substitui o mesmo nome, ordena, apaga e lê texto estragado", () => {
    let list = [];
    list = LIB.upsert(list, { name: "beta", keys: ["1"] });
    list = LIB.upsert(list, { name: "Alfa", keys: ["2"] });
    list = LIB.upsert(list, { name: "BETA", keys: ["3"] });
    assert.deepStrictEqual(list.map((x) => x.name), ["Alfa", "BETA"]);
    assert.deepStrictEqual(LIB.find(list, "beta").keys, ["3"]);
    assert.deepStrictEqual(LIB.remove(list, "alfa").map((x) => x.name), ["BETA"]);
    assert.deepStrictEqual(LIB.parseList("{quebrado"), []);
    assert.deepStrictEqual(LIB.parseList("[1,{\"name\":\"\"},{\"name\":\"ok\"}]").map((x) => x.name), ["ok"]);
});
test("seleção salva: acha o que está na lista e conta o que sumiu", () => {
    const saved = LIB.makeSelection(" Minha ", ["a", "c", "sumiu"]);
    assert.strictEqual(saved.name, "Minha");
    const res = LIB.resolveSelection(saved, RECS.filter((r) => r.key !== "c"));
    assert.deepStrictEqual(Object.keys(res.selected), ["a"]);
    assert.deepStrictEqual([res.found, res.missing], [1, 2]);
    assert.throws(() => LIB.makeSelection("", ["a"]), /nome à seleção/);
    assert.throws(() => LIB.makeSelection("x", []), /Selecione marcadores/);
});

// ---------------------------------------------------------------------------
// Fase 2 (parte B): duração, distribuir, cortes, duplicados
// ---------------------------------------------------------------------------

test("duração: mesma para todos, 0 = pontual, recusa fração e negativo", () => {
    const p = PL.planDuration(RECS, 50);
    assert.ok(p.every((x) => x.durationFrames === 50));
    assert.ok(!p.some((x) => x.record.key === "c"));            // já tinha 50
    assert.deepStrictEqual(PL.planDuration(RECS, 0).map((x) => x.record.key), ["c"]);
    assert.throws(() => PL.planDuration(RECS, 1.5), /inteiro de 0 ou mais/);
    assert.throws(() => PL.planDuration(RECS, -1), /inteiro de 0 ou mais/);
});
test("distribuir: primeiro e último ficam, meio igualmente espaçado em frames inteiros", () => {
    const r = [rec("a", 0), rec("d", 100), rec("b", 10), rec("c", 11)];
    const p = PL.planDistribute(r);
    const to = {};
    p.forEach((x) => { to[x.record.key] = x.toFrame; });
    assert.deepStrictEqual(to, { b: 33, c: 67 });
    assert.ok(p.every((x) => Number.isInteger(x.toFrame)));
    assert.throws(() => PL.planDistribute(r.slice(0, 2)), /pelo menos 3/);
});
test("encaixar no corte: corte mais próximo dentro da distância; empate vai para o anterior", () => {
    const r = [rec("a", 12), rec("b", 50), rec("c", 100), rec("d", 15)];
    const p = PL.planSnap(r, [10, 20, 100, 60], 5);
    const to = {};
    p.forEach((x) => { to[x.record.key] = x.toFrame; });
    assert.deepStrictEqual(to, { a: 10, d: 10 });
    assert.throws(() => PL.planSnap(r, [], 5), /Não há clipes/);
    assert.throws(() => PL.planSnap(r, [10], 0), /distância máxima/);
});
test("duplicados: mesmo frame com 0; grupos contados a partir do primeiro", () => {
    const r = [rec("a", 0), rec("b", 0), rec("c", 3), rec("d", 6), rec("e", 100)];
    assert.deepStrictEqual(PL.planDedupe(r, 0).map((x) => x.record.key), ["b"]);
    // tolerância 4: grupo {a,b,c} (até frame 4), d começa grupo novo sozinho
    assert.deepStrictEqual(PL.planDedupe(r, 4).map((x) => x.record.key), ["b", "c"]);
    assert.ok(PL.planDedupe(r, 4).every((x) => x.remove));
    assert.throws(() => PL.planDedupe(r, -1), /distância/);
});
test("mesclar: junta comentários sem repetir, herda nome, exclui os outros", () => {
    const r = [rec("a", 0, { comments: "áudio" }), rec("b", 2, { name: "Cena", comments: "cor" }), rec("c", 3, { comments: "áudio" }), rec("z", 90)];
    const p = PL.planMerge(r, 5);
    const keep = p.find((x) => x.record.key === "a");
    assert.strictEqual(keep.comments, "áudio | cor");
    assert.strictEqual(keep.name, "Cena");
    assert.deepStrictEqual(p.filter((x) => x.remove).map((x) => x.record.key), ["b", "c"]);
    assert.strictEqual(PL.planMerge([rec("x", 0), rec("y", 50)], 5).length, 0);
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

// ---------------------------------------------------------------------------
// Fase 3 parte A: importar, outros formatos e marcador por corte
// ---------------------------------------------------------------------------
const IM = require(path.join(ROOT, "core", "importers.js"));
const COLORS = M.buildColorTable({ GREEN: 0, RED: 1, MAGENTA: 2, ORANGE: 3, YELLOW: 4, WHITE: 5, BLUE: 6, CYAN: 7 });

test("timecodeToFrames é o inverso de framesToTimecode (29,97 e 59,94, DF e NDF)", () => {
    ["29.97", "59.94"].forEach((k) => {
        const info = T.rateInfo(NTSC[k]);
        [false, true].forEach((df) => {
            for (let fr = 0; fr < info.nominal * 60 * 25; fr += 7) {
                const tc = T.framesToTimecode(fr, info, df, 0);
                assert.strictEqual(T.timecodeToFrames(tc, info), fr, k + " " + tc);
            }
        });
    });
});
test("timecodeToFrames: 25 fps, inválidos e drop forçado", () => {
    const i25 = T.rateInfo(25);
    assert.strictEqual(T.timecodeToFrames("01:00:00:00", i25), 90000);
    assert.strictEqual(T.timecodeToFrames("00:00:01:24", i25), 49);
    assert.strictEqual(T.timecodeToFrames("00:00:01:25", i25), null);   // frame 25 não existe a 25 fps
    assert.strictEqual(T.timecodeToFrames("00:61:00:00", i25), null);
    assert.strictEqual(T.timecodeToFrames("1:05", i25), null);
    const i30 = T.rateInfo(NTSC["29.97"]);
    assert.strictEqual(T.timecodeToFrames("00:01:00;00", i30), null);   // número pulado em DF
    assert.strictEqual(T.timecodeToFrames("00:01:00:02", i30, true), 1800);   // EDL com FCM: DROP FRAME
    assert.strictEqual(T.timecodeToFrames("00:01:00:02", i30, false), 1802);
});
test("clockToSeconds", () => {
    assert.strictEqual(T.clockToSeconds("1:05"), 65);
    assert.strictEqual(T.clockToSeconds("01:02:03"), 3723);
    assert.strictEqual(T.clockToSeconds("0:10.5"), 10.5);
    assert.strictEqual(T.clockToSeconds("00:00:02,250"), 2.25);
    assert.strictEqual(T.clockToSeconds("1:75"), null);
    assert.strictEqual(T.clockToSeconds("abc"), null);
});
test("cores e tipos por nome (pt, en, Resolve, Avid)", () => {
    assert.strictEqual(IM.colorIndexByName("Vermelho", COLORS), 1);
    assert.strictEqual(IM.colorIndexByName("blue", COLORS), 6);
    assert.strictEqual(IM.colorIndexByName("ResolveColorPink", COLORS), 2);
    assert.strictEqual(IM.colorIndexByName("Cor 7", COLORS), 7);
    assert.strictEqual(IM.colorIndexByName("", COLORS), null);
    assert.strictEqual(IM.colorIndexByName("xadrez", COLORS), null);
    assert.strictEqual(IM.typeByName("Capítulo"), "Chapter");
    assert.strictEqual(IM.typeByName("Web Link"), "WebLink");
    assert.strictEqual(IM.typeByName("qualquer"), "");
});
test("detectFormat por extensão e por conteúdo", () => {
    assert.strictEqual(IM.detectFormat("", "a.SRT"), "srt");
    assert.strictEqual(IM.detectFormat("{\"markers\":[]}"), "json");
    assert.strictEqual(IM.detectFormat("1\n00:00:01,000 --> 00:00:02,000\nOi"), "srt");
    assert.strictEqual(IM.detectFormat("TITLE: X\nFCM: NON-DROP FRAME\n"), "edl");
    assert.strictEqual(IM.detectFormat("Timecode;Nome\n00:00:01:00;A"), "csv");
    assert.strictEqual(IM.detectFormat("Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type\n"), "csv");
    assert.strictEqual(IM.detectFormat("0:00 Intro\n1:05 Parte 2"), "list");
});
test("importar lista colada: relógio, timecode, comentário e linhas ruins", () => {
    const info = T.rateInfo(25);
    const r = IM.parse("0:00 Intro\n1:05 - Parte 2 | revisar áudio\n01:00:10:05 Final\nsem tempo\n\n# nota", { info, startFrame: 90000, timeBase: "auto", colors: COLORS });
    assert.strictEqual(r.format, "list");
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.name, i.comments]), [[0, "Intro", ""], [255, "Final", ""], [1625, "Parte 2", "revisar áudio"]]);
    assert.strictEqual(r.warnings.length, 1);
    const en = loadI18n("en");
    r.warnings.forEach((w) => assert.notStrictEqual(en.trMsg(w), w, "sem tradução: " + w));
});
test("importar: base de tempo forçada e tempos antes do início", () => {
    const info = T.rateInfo(25);
    const a = IM.parse("00:00:04:00 A", { info, startFrame: 90000, timeBase: "start" });
    assert.strictEqual(a.items[0].frame, 100);
    const b = IM.parse("00:00:04:00 A", { info, startFrame: 90000, timeBase: "timeline" });
    assert.strictEqual(b.items.length, 0);
    assert.ok(/antes do início/.test(b.warnings[0]));
    assert.notStrictEqual(loadI18n("en").trMsg(b.warnings[0]), b.warnings[0]);
    // automático: tudo antes do início -> lê como contado do início, com aviso
    const c = IM.parse("00:00:04:00 A\n00:00:08:00 B", { info, startFrame: 90000, timeBase: "auto" });
    assert.deepStrictEqual(c.items.map((i) => i.frame), [100, 200]);
    assert.strictEqual(c.warnings.length, 1);
    assert.notStrictEqual(loadI18n("en").trMsg(c.warnings[0]), c.warnings[0]);
    // automático com só alguns antes do início: esses ficam de fora
    const d = IM.parse("00:00:04:00 A\n01:00:00:00 B", { info, startFrame: 90000, timeBase: "auto" });
    assert.deepStrictEqual(d.items.map((i) => i.frame), [0]);
    assert.throws(() => IM.parse("   ", { info }), /Nada para importar/);
});
test("importar CSV do Helmet Marker (volta igual ao que saiu)", () => {
    const info = T.rateInfo(NTSC["29.97"]);
    const recs = [rec("a", 0, { name: "A; x", comments: "c\"1\"", colorIndex: 1, type: "Chapter" }), rec("b", 1800, { name: "B", durationFrames: 30, colorIndex: 6 })];
    const out = X.csv(recs, { sep: ";", info, dropFrame: true, startFrame: 107892, colorLabel: (i) => M.colorFor(COLORS, i).label });
    const r = IM.parse(out, { info, startFrame: 107892, timeBase: "auto", colors: COLORS, fileName: "m.csv" });
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.name, i.comments, i.colorIndex, i.type, i.durationFrames]),
        [[0, "A; x", "c\"1\"", 1, "Chapter", 0], [1800, "B", "", 6, "Comment", 30]]);
});
test("importar CSV do Premiere (tabulação, In/Out) e planilha com vírgula", () => {
    const info = T.rateInfo(25);
    const prem = "Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type\nCena 1\tnota\t00:00:02:00\t00:00:03:00\t00:00:01:00\tComment\n";
    const r = IM.parse(prem, { info, startFrame: 0, colors: COLORS });
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.name, i.comments, i.durationFrames, i.type]), [[50, "Cena 1", "nota", 25, "Comment"]]);
    const sheet = "name,seconds,color\n\"Oi, tudo\",1.5,red\n";
    const s2 = IM.parse(sheet, { info, startFrame: 0, colors: COLORS, format: "csv" });
    assert.deepStrictEqual(s2.items.map((i) => [i.frame, i.name, i.colorIndex]), [[38, "Oi, tudo", 1]]);
    assert.throws(() => IM.parse("a;b\n1;2", { info, format: "csv" }), /coluna de tempo/);
});
test("importar SRT (tempo do início, duração, sem tags)", () => {
    const info = T.rateInfo(25);
    const srt = "1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Olá</i> mundo\r\n\r\n2\r\n00:01:00,000 --> 00:01:01,000\r\nSegunda\r\nlinha\r\n";
    const r = IM.parse(srt, { info, startFrame: 90000, fileName: "x.srt" });
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.durationFrames, i.name]), [[25, 63, "Olá mundo"], [1500, 25, "Segunda linha"]]);
});
test("importar EDL: LOC com cor e drop-frame; sem LOC, um por evento", () => {
    const info = T.rateInfo(NTSC["29.97"]);
    const edl = "TITLE: Teste\nFCM: DROP FRAME\n\n001  AX       V     C        00:00:00:00 00:00:05:00 01:00:00:00 01:00:05:00\n* FROM CLIP NAME: entrevista.mov\n* LOC: 01:01:00:02 RED     Corte aqui\n* LOC: 01:00:01:00 ResolveColorBlue Nota |C:ResolveColorBlue |M:Título |D:1\n";
    const r = IM.parse(edl, { info, startFrame: 107892, colors: COLORS, fileName: "a.edl" });
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.name, i.comments, i.colorIndex]), [[30, "Título", "Nota", 6], [1800, "Corte aqui", "", 1]]);
    const ev = edl.split("\n").filter((l) => !/LOC/.test(l)).join("\n");
    const r2 = IM.parse(ev, { info, startFrame: 107892, colors: COLORS, fileName: "a.edl" });
    assert.deepStrictEqual(r2.items.map((i) => [i.frame, i.name]), [[0, "entrevista.mov"]]);
    assert.strictEqual(r2.warnings.length, 1);
    assert.notStrictEqual(loadI18n("en").trMsg(r2.warnings[0]), r2.warnings[0]);
});
test("JSON do Helmet Marker: exporta e importa de volta", () => {
    const info = T.rateInfo(25);
    const recs = [rec("b", 50, { name: "B", comments: "x", colorIndex: 6, type: "Chapter", durationFrames: 10 }), rec("a", 0, { name: "A" })];
    const out = X.json(recs, { info, dropFrame: false, startFrame: 0, meta: { name: "Seq" }, colorLabel: (i) => M.colorFor(COLORS, i).label });
    const data = JSON.parse(out);
    assert.strictEqual(data.markers[0].timecode, "00:00:00:00");
    assert.strictEqual(data.sequence.name, "Seq");
    const r = IM.parse(out, { info, startFrame: 0, colors: COLORS });
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.name, i.comments, i.colorIndex, i.type, i.durationFrames]),
        [[0, "A", "", 0, "Comment", 0], [50, "B", "x", 6, "Chapter", 10]]);
    assert.throws(() => IM.parse("{oi", { info, format: "json" }), /JSON/);
});
test("TXT e lista de revisão", () => {
    const info = T.rateInfo(25);
    const recs = [rec("b", 50, { name: "B", comments: "trocar\nmúsica" }), rec("a", 0, { name: "A" }), rec("c", 75)];
    assert.strictEqual(X.txt(recs, { info, dropFrame: false, startFrame: 0 }), "00:00:00:00\tA\r\n00:00:02:00\tB\ttrocar música\r\n00:00:03:00\t\r\n");
    assert.strictEqual(X.reviewList(recs, { info, dropFrame: false, startFrame: 0 }), "1. 00:00:00:00 — A\r\n2. 00:00:02:00 — trocar música\r\n3. 00:00:03:00\r\n");
    assert.strictEqual(X.txt([], { info }), "");
});
test("pular os que já existem e o limite de 5000", () => {
    const info = T.rateInfo(25);
    const r = IM.parse("0:00 A\n0:01 B", { info });
    const k = IM.skipExisting(r.items, [rec("x", 0, { name: "A" })]);
    assert.deepStrictEqual([k.items.length, k.skipped], [1, 1]);
    const many = Array.from({ length: 5003 }, (_, i) => i + ";m").join("\n");
    const big = IM.parse("frame;nome\n" + many, { info, format: "csv" });
    assert.strictEqual(big.items.length, IM.MAX_ITEMS);
    assert.notStrictEqual(loadI18n("en").trMsg(big.warnings[0]), big.warnings[0]);
});
test("UTF-16 (o Premiere exporta marcadores assim)", () => {
    const text = "Marker Name\tIn\nCanção\t00:00:01:00\n";
    const le = [0xFF, 0xFE];
    for (const ch of text) { const c = ch.charCodeAt(0); le.push(c & 255, c >> 8); }
    assert.strictEqual(IM.decodeUtf16(new Uint8Array(le)), text);
    const be = [0xFE, 0xFF];
    for (const ch of text) { const c = ch.charCodeAt(0); be.push(c >> 8, c & 255); }
    assert.strictEqual(IM.decodeUtf16(new Uint8Array(be)), text);
    assert.strictEqual(IM.decodeUtf16(new Uint8Array([65, 66])), null);
});
test("marcador em cada corte: pula o fim e os que já têm marcador", () => {
    const p = PL.planCutMarkers([0, 500, 500, 1000, 1300, 2000], [rec("a", 500)], { prefix: "Corte ", digits: 2 });
    assert.deepStrictEqual(p.items, [{ frame: 0, name: "Corte 01" }, { frame: 1000, name: "Corte 02" }, { frame: 1300, name: "Corte 03" }]);
    assert.strictEqual(p.skipped, 1);
    assert.throws(() => PL.planCutMarkers([], []), /clipes/);
});

// ---------------------------------------------------------------------------
// Fase 3 parte B: outra sequência, clipe <-> sequência, checklist
// ---------------------------------------------------------------------------
test("cores dos novos: casa frame+nome, uma vez cada, ignora os antigos", () => {
    const recs = [rec("old", 10, { name: "A", colorIndex: 0 }), rec("n1", 10, { name: "A", colorIndex: 0 }), rec("n2", 20, { name: "B", colorIndex: 1 })];
    const plan = PL.planColorsForNew([{ frame: 10, name: "A", colorIndex: 6 }, { frame: 20, name: "B", colorIndex: 1 }, { frame: 30, name: "C", colorIndex: 2 }], recs, { old: true });
    assert.deepStrictEqual(plan.map((p) => [p.record.key, p.color]), [["n1", 6]]);
});
test("copiar para sequência com outra taxa: mesmo tempo, frame mais próximo", () => {
    const tpf25 = 10160640000, tpf2997 = 8475667200;
    const items = PL.planCopy([rec("b", 50, { startTicks: 50 * tpf25, durationFrames: 25, name: "B", colorIndex: 3 }), rec("a", 0, { startTicks: 0, name: "A" })], tpf25, tpf2997);
    assert.deepStrictEqual(items.map((i) => [i.frame, i.durationFrames, i.name, i.colorIndex]), [[0, 0, "A", 0], [60, 30, "B", 3]]);
    assert.throws(() => PL.planCopy([], 1, 0), /Ticks/);
});
test("clipe -> sequência: posição pelo início e ponto de entrada; corta o que está fora", () => {
    const TPF = 1000;
    const clip = { startTicks: 100 * TPF, endTicks: 200 * TPF, inTicks: 50 * TPF, outTicks: 150 * TPF, speed: 1, reversed: false };
    const r = PL.clipToSequence([
        { startTicks: 10 * TPF, name: "antes" },
        { startTicks: 60 * TPF, durationTicks: 200 * TPF, name: "dentro", colorIndex: 2 },
        { startTicks: 150 * TPF, name: "depois" }
    ], clip, TPF);
    assert.deepStrictEqual(r.items.map((i) => [i.frame, i.durationFrames, i.name]), [[110, 90, "dentro"]]);
    assert.strictEqual(r.outside, 2);
    assert.ok(PL.clipUsable(clip));
    assert.ok(!PL.clipUsable({ speed: 2 }));
    assert.ok(!PL.clipUsable({ speed: 1, reversed: true }));
});
test("sequência -> clipe: só os que caem no clipe, no tempo da mídia; pula repetidos", () => {
    const TPF = 1000;
    const clip = { startTicks: 100 * TPF, endTicks: 200 * TPF, inTicks: 50 * TPF, outTicks: 150 * TPF };
    const recs = [rec("a", 90, { startTicks: 90 * TPF, name: "fora" }), rec("b", 120, { startTicks: 120 * TPF, name: "B", durationFrames: 500 }), rec("c", 199, { startTicks: 199 * TPF, name: "C" })];
    const items = PL.sequenceToClip(recs, clip, TPF);
    assert.deepStrictEqual(items.map((i) => [i.ticks / TPF, i.durationTicks / TPF, i.name]), [[70, 80, "B"], [149, 0, "C"]]);
    const k = PL.skipExistingTicks(items, [{ startTicks: 70 * TPF + 100, name: "B" }], TPF);
    assert.deepStrictEqual([k.items.map((i) => i.name), k.skipped], [["C"], 1]);
});
test("checklist: marcar e desmarcar feito, progresso por cor", () => {
    const recs = [rec("a", 0, { name: "Intro", colorIndex: 1 }), rec("b", 10, { name: "✓ Fala", colorIndex: 1 }), rec("c", 20, { name: "", colorIndex: 6 })];
    assert.deepStrictEqual(PL.planDone(recs, true).map((p) => p.name), ["✓ Intro", "✓ "]);
    assert.deepStrictEqual(PL.planDone(recs, false).map((p) => p.name), ["Fala"]);
    const p = PL.progress(recs);
    assert.deepStrictEqual([p.done, p.total], [1, 3]);
    assert.deepStrictEqual(p.byColor, [{ index: 1, done: 1, total: 2 }, { index: 6, done: 0, total: 1 }]);
    assert.ok(PL.isDone({ name: "  ✓pronto" }));
});

const SOURCES = ["ui/panel.js", "premiere/ppro.js", "core/markers.js", "core/timecode.js", "core/selection.js", "core/plans.js", "core/export.js", "core/library.js", "core/importers.js"];

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
    try { PL.planShift([{ startFrame: 5 }], -6); } catch (e) { msg = e.message; }
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
