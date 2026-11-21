// Testes da lógica de horários (sem Firebase). Uso: node teste.mjs
import assert from "node:assert/strict";
import { agoraNoFuso, horariosVencidos, diaAnterior } from "./enviar.mjs";

const meds = [
  { id: "a", name: "Losartana", dose: "50 mg", times: ["08:00", "20:00"], start: "2026-11-01", end: null },
  { id: "b", name: "Insulina NPH", kind: "insulina", units: 10, times: ["14:00"], start: "2026-11-01", end: null },
  { id: "c", name: "Amoxicilina", times: ["23:30"], start: "2026-11-01", end: "2026-11-20" },
  { id: "d", name: "Suspenso", times: ["08:00"], active: false },
  { id: "e", name: "Insulina conforme", kind: "insulina", mode: "glicemia", times: [] }
];

// 21/11/2026 às 08:07 em Cuiabá (UTC-4) = 12:07 UTC
let v = horariosVencidos(meds, "America/Cuiaba", new Date("2026-11-21T12:07:00Z"));
assert.deepEqual(v.map(x => x.med.id + "@" + x.sched + "+" + x.atraso), ["a@2026-11-21T08:00+7"]);
console.log("ok: 08:07 avisa só a Losartana das 08:00 (atraso 7 min)");

// Passagem da meia-noite: 00:10 do dia 21 em São Paulo (UTC-3) = 03:10 UTC. Amoxicilina de 23:30 do dia 20 (último dia) ainda vale.
v = horariosVencidos(meds, "America/Sao_Paulo", new Date("2026-11-21T03:10:00Z"));
assert.equal(v.length, 1);
assert.equal(v[0].sched, "2026-11-20T23:30");
assert.equal(v[0].atraso, 40);
console.log("ok: 00:10 ainda cobra a dose das 23:30 do dia anterior");

// Mais de 4 h depois não avisa mais
v = horariosVencidos(meds, "America/Sao_Paulo", new Date("2026-11-21T15:30:00Z"));
assert.equal(v.length, 0);
console.log("ok: 12:30 já passou da janela de 4 h das 08:00, nada a avisar");

// id da dose combina com o app (dose_<medId>_<sched sem - e :>)
v = horariosVencidos(meds, "America/Cuiaba", new Date("2026-11-21T18:05:00Z"));
const ins = v.find(x => x.med.id === "b");
assert.equal(ins.idDose, "dose_b_20261121T1400");
console.log("ok: id da dose da insulina =", ins.idDose);

assert.equal(diaAnterior("2026-03-01"), "2026-02-28");
assert.equal(agoraNoFuso("America/Cuiaba", new Date("2026-11-21T12:07:00Z")).dia, "2026-11-21");
console.log("todos os testes passaram");
