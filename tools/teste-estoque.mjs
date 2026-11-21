// Testes do cálculo de estoque. Uso: node tools/teste-estoque.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const fonte = readFileSync(new URL("../js/estoque.js", import.meta.url), "utf8");
const E = await import("data:text/javascript;base64," + Buffer.from(fonte).toString("base64"));
const DIA = 86400000, now = Date.parse("2026-11-21T12:00:00"), hoje = "2026-11-21";
const ctx = (extra) => Object.assign({ now, hoje, entries: [], log: [] }, extra);
const med = (o) => Object.assign({ id: "m1", name: "Losartana", kind: "comprimido", mode: "fixo", times: ["08:00", "20:00"], active: true, stockOn: true, stockQty: 40, perDose: 1, stockUnit: "comprimidos", alertDays: 7 }, o);
const sit = (m, c) => E.situacao(E.listarItens([m], [])[0], c || ctx());

// 1) remédio de horário fixo: 2 por dia, 40 comprimidos = 20 dias
let s = sit(med({}));
assert.equal(s.perDay, 2); assert.equal(s.dias, 20); assert.equal(s.nivel, "ok");
// 2) 12 comprimidos = 6 dias: comprar em breve; 6 = 3 dias: urgente
assert.equal(sit(med({ stockQty: 12 })).nivel, "atencao");
assert.equal(sit(med({ stockQty: 6 })).nivel, "urgente");
assert.equal(sit(med({ stockQty: 0 })).nivel, "zerado");
// 3) meio comprimido: perDose 0,5 → 1/dia
assert.equal(sit(med({ perDose: 0.5 })).perDay, 1);
// 4) quantidade negativa (esqueceram de lançar a compra): aparece 0, marcado
s = sit(med({ stockQty: -4 })); assert.equal(s.qty, 0); assert.equal(s.negativo, true); assert.equal(s.nivel, "zerado");
// 5) tratamento com data final já coberto: não pede compra
s = sit(med({ stockQty: 10, end: "2026-11-25" })); // 5 dias × 2 = 10
assert.equal(s.cobreAteFim, true); assert.equal(s.nivel, "ok");
s = sit(med({ stockQty: 9, end: "2026-11-25" })); assert.notEqual(s.nivel, "ok");
// 6) suspenso/encerrado não alerta
assert.equal(sit(med({ stockQty: 0, active: false })).nivel, "parado");
assert.equal(sit(med({ stockQty: 0, end: "2026-11-01" })).nivel, "parado");
// 7) insulina fixa: 10 UI × 2 vezes = 20 UI/dia; 300 UI = 15 dias
s = sit(med({ kind: "insulina", units: 10, stockQty: 300, stockUnit: "UI" })); assert.equal(s.perDay, 20); assert.equal(s.dias, 15);
// 8) insulina conforme a glicemia: média dos últimos 14 dias
const doses = [0, 1, 2, 3, 4, 5, 6].map(i => ({ type: "dose", medId: "m1", units: 6, ms: now - i * DIA - 3600000 }));
s = sit(med({ kind: "insulina", mode: "glicemia", times: [], stockQty: 100 }), ctx({ entries: doses }));
assert.ok(s.estimado); assert.ok(Math.abs(s.perDay - 42 / 7) < 0.01, "média " + s.perDay); // 42 UI em 7 dias
s = sit(med({ kind: "insulina", mode: "glicemia", times: [], stockQty: 100 }), ctx());
assert.equal(s.perDay, null); assert.equal(s.nivel, "ok");
// 9) suprimento sem histórico e sem estimativa: só avisa pelo mínimo
const sup = (o) => Object.assign({ id: "s1", name: "Fraldas G", unit: "fraldas", stockQty: 30, alertDays: 7, active: true }, o);
const sits = (o, c) => E.situacao(E.listarItens([], [sup(o)])[0], c || ctx());
s = sits({}); assert.equal(s.perDay, null); assert.equal(s.nivel, "ok");
assert.equal(sits({ stockQty: 8, minQty: 10 }).nivel, "atencao");
// 10) estimativa informada: 5 por dia, 30 fraldas = 6 dias → comprar em breve
s = sits({ perDay: 5 }); assert.equal(s.dias, 6); assert.equal(s.nivel, "atencao"); assert.ok(s.informado);
// 11) consumo real anotado (10 dias, 60 fraldas usadas = 6/dia) vale mais que a estimativa informada
const log = [];
for (let i = 1; i <= 10; i++) log.push({ item: "sup:s1", type: "saida", qty: 6, ms: now - i * DIA });
s = sits({ perDay: 3, stockQty: 60 }, ctx({ log }));
assert.ok(Math.abs(s.perDay - 6) < 0.7, "perDay " + s.perDay); assert.equal(s.estimado, true);
// 12) poucos dias de dados: usa a estimativa informada, ou o provisório
s = sits({ perDay: 4 }, ctx({ log: [{ item: "sup:s1", type: "saida", qty: 5, ms: now - 3600000 }] })); assert.equal(s.perDay, 4);
s = sits({}, ctx({ log: [{ item: "sup:s1", type: "saida", qty: 5, ms: now - 3600000 }] })); assert.ok(s.provisorio);
// 13) lista de compras: zerado antes de urgente antes de atenção
const lista = E.precisaComprar(E.listarItens([med({ id: "a", name: "A", stockQty: 12 }), med({ id: "b", name: "B", stockQty: 0 }), med({ id: "c", name: "C", stockQty: 6 }), med({ id: "d", name: "D", stockQty: 100 })], []), ctx());
assert.deepEqual(lista.map(x => x.it.nome), ["B", "C", "A"]);
// 14) remédio sem controle de estoque não entra
assert.equal(E.listarItens([med({ stockOn: false })], []).length, 0);
// 15) frases
assert.equal(E.fraseDias(0.4), "menos de 1 dia"); assert.equal(E.fraseDias(1.5), "cerca de 1 dia"); assert.equal(E.fraseDias(9.9), "cerca de 9 dias"); assert.equal(E.fraseDias(95), "mais de 3 meses");
console.log("ok: todos os testes de estoque");
