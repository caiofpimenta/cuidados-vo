// Testes do leitor de tabelas. Uso: node tools/teste-importar.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// js/importar.js é um módulo do navegador (sem package.json "type: module"), então é carregado por data URL.
const fonte = readFileSync(new URL("../js/importar.js", import.meta.url), "utf8");
const { converter } = await import("data:text/javascript;base64," + Buffer.from(fonte).toString("base64"));

const hm = ms => { const d = new Date(ms); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

// 1) Colado do Excel (tabulação), colunas separadas
let r = converter("Data\tHora\tMáxima\tMínima\tPulso\tGlicemia\tMomento\tObservação\n" +
  "05/11/2026\t08:10\t128\t82\t74\t112\tem jejum\t\n" +
  "05/11/2026\t20:30\t135\t85\t\t146\tao deitar\ttonta\n" +
  "06/11/26\t7h30\t\t\t\t98\tJejum\t\n", {});
assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
assert.equal(r.linhas.length, 3);
assert.equal(hm(r.linhas[0].ms), "05/11/2026 08:10");
assert.deepEqual([r.linhas[0].sys, r.linhas[0].dia, r.linhas[0].pulse, r.linhas[0].glic, r.linhas[0].momento], [128, 82, 74, 112, "jejum"]);
assert.equal(r.linhas[1].momento, "deitar");
assert.equal(r.linhas[1].note, "tonta");
assert.equal(r.linhas[1].pulse, undefined);
assert.equal(hm(r.linhas[2].ms), "06/11/2026 07:30");
assert.equal(r.linhas[2].sys, undefined);
assert.equal(r.linhas[2].glic, 98);
console.log("ok: Excel com colunas separadas");

// 2) CSV com ponto e vírgula, PA numa coluna só, data e hora juntas, vírgula decimal
r = converter("Data e hora;PA;FC;Glicose\n" +
  "2026-10-01 07:45;130/80;70;105,0\n" +
  "02/10/2026 19:00;12x8;;\n", {});
assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
assert.equal(r.linhas.length, 2);
assert.deepEqual([r.linhas[0].sys, r.linhas[0].dia, r.linhas[0].pulse, r.linhas[0].glic], [130, 80, 70, 105]);
assert.deepEqual([r.linhas[1].sys, r.linhas[1].dia], [120, 80]);
console.log("ok: CSV com ; , PA em uma coluna, 12x8 vira 120/80");

// 3) Sem hora: usa a hora padrão e conta; período vira hora
r = converter("Data,Período,Sistólica,Diastólica\n" +
  "03/11/2026,manhã,120,80\n" +
  "03/11/2026,,118,76\n", { horaPadrao: "09:00" });
assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
assert.equal(hm(r.linhas[0].ms), "03/11/2026 08:00");
assert.equal(hm(r.linhas[1].ms), "03/11/2026 09:00");
assert.equal(r.semHora, 1);
console.log("ok: período e hora padrão");

// 4) Erros por linha, com o número da linha da tabela
r = converter("Data;Hora;Máxima;Mínima;Glicemia\n" +
  "05/11/2026;08:00;300;80;\n" +
  "05/11;08:00;120;80;\n" +
  "31/02/2026;08:00;120;80;\n" +
  "06/11/2026;25:00;120;80;\n" +
  "07/11/2026;08:00;80;90;\n" +
  "08/11/2026;08:00;120;80;5000\n" +
  "09/11/2026;08:00;120;80;110\n", {});
assert.equal(r.linhas.length, 1);
assert.equal(r.erros.length, 6);
assert.deepEqual(r.erros.map(e => e.n), [2, 3, 4, 5, 6, 7]);
console.log("ok: 6 erros apontados pela linha:", r.erros.map(e => e.n + ": " + e.msg).join(" | "));

// 5) Cabeçalho irreconhecível
r = converter("a;b;c\n1;2;3\n", {});
assert.ok(r.erros.length > 0 && r.linhas.length === 0);
console.log("ok: cabeçalho irreconhecível é recusado:", r.erros[0].msg);

// 6) Linhas vazias ignoradas, dois registros no mesmo minuto ganham ids diferentes
r = converter("Data\tHora\tMáxima\tMínima\n05/11/2026\t08:00\t120\t80\n05/11/2026\t08:00\t122\t80\n\t\t\t\n", {});
assert.equal(r.linhas.length, 2);
assert.notEqual(r.linhas[0].id, r.linhas[1].id);
console.log("ok: ids únicos para o mesmo minuto");

// 7) Aspas e BOM
r = converter('﻿Data;Hora;Máxima;Mínima;Observação\n05/11/2026;08:00;120;80;"depois do café; sentada"\n', {});
assert.equal(r.linhas[0].note, "depois do café; sentada");
console.log("ok: aspas e BOM");
console.log("todos os testes do importador passaram");
