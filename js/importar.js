// Leitor de tabelas de aferições (colar do Excel ou arquivo CSV).
// Aceita colunas em qualquer ordem, achadas pelo nome do cabeçalho.

const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const SINONIMOS = {
  datahora: ["data e hora", "data/hora", "datahora", "data hora", "data - hora"],
  data: ["data", "date", "dia da medicao", "data da medicao", "data da afericao"],
  hora: ["hora", "horario", "hr", "hora da medicao", "hora da afericao"],
  periodo: ["periodo", "turno", "periodo do dia"],
  pa: ["pa", "p.a.", "pressao", "pressao arterial", "pressao (mmhg)", "pa (mmhg)", "pressao arterial (mmhg)"],
  sys: ["sistolica", "maxima", "pas", "sys", "pa sistolica", "pressao maxima", "pa maxima", "max", "pa max", "sist"],
  dia: ["diastolica", "minima", "pad", "pa diastolica", "pressao minima", "pa minima", "min", "pa min", "diast"],
  pulso: ["pulso", "fc", "bpm", "batimentos", "frequencia cardiaca", "pulso (bpm)"],
  glic: ["glicemia", "glicose", "hgt", "dextro", "glicemia (mg/dl)", "glicemia mg/dl", "glicose (mg/dl)", "glicemia capilar"],
  momento: ["momento", "momento da glicemia", "referencia", "situacao", "momento da medicao"],
  obs: ["obs", "observacao", "observacoes", "anotacao", "anotacoes", "nota", "notas", "comentario", "comentarios"]
};

const HORA_PERIODO = { madrugada: "04:00", manha: "08:00", meiodia: "12:00", almoco: "12:00", tarde: "15:00", noite: "20:00" };

function contarFora(linha, sep) {
  let n = 0, aspas = false;
  for (const c of linha) { if (c === '"') aspas = !aspas; else if (c === sep && !aspas) n++; }
  return n;
}

export function detectarSeparador(texto) {
  const primeira = texto.split(/\r?\n/).find(l => l.trim()) || "";
  const cand = ["\t", ";", ","].map(s => [s, contarFora(primeira, s)]);
  cand.sort((a, b) => b[1] - a[1]);
  return cand[0][1] > 0 ? cand[0][0] : "\t";
}

export function lerCSV(texto, sep) {
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some(x => x.trim() !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x.trim() !== "")) linhas.push(linha);
  return linhas;
}

function achar(cab) {
  const mapa = {};
  cab.forEach((h, i) => {
    const n = norm(h);
    for (const k of Object.keys(SINONIMOS)) {
      if (mapa[k] == null && SINONIMOS[k].includes(n)) { mapa[k] = i; break; }
    }
  });
  return mapa;
}

function numero(s) {
  const t = String(s == null ? "" : s).trim().replace(",", ".").replace(/[^\d.\-]/g, "");
  if (t === "" || t === "-" || t === ".") return NaN;
  return Number(t);
}

function lerData(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return { a: +m[1], m: +m[2], d: +m[3] };
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) return { a: m[3].length === 2 ? 2000 + +m[3] : +m[3], m: +m[2], d: +m[1] };
  return null;
}

function lerHora(s) {
  const t = norm(s).replace(/\s/g, "");
  let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) m = t.match(/^(\d{1,2})h(\d{2})?(?:min)?$/);
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

function lerPA(s) {
  const m = String(s || "").trim().match(/^(\d{1,3})\s*[\/xX]\s*(\d{1,3})/);
  if (!m) return null;
  let a = +m[1], b = +m[2];
  if (a <= 30 && b <= 30) { a *= 10; b *= 10; }
  return { sys: a, dia: b };
}

function mapearMomento(s) {
  const n = norm(s);
  if (!n) return "";
  if (/jejum/.test(n)) return "jejum";
  if (/(apos|depois|pos)/.test(n)) return "apos";
  if (/(antes|pre)/.test(n)) return "antes";
  if (/(deitar|dormir|noite)/.test(n)) return "deitar";
  return "outro";
}

/**
 * Converte o texto colado em medições.
 * opcoes.horaPadrao: "HH:MM" usada quando a linha não tem hora nem período.
 */
export function converter(texto, opcoes) {
  const horaPadrao = (opcoes && opcoes.horaPadrao) || "08:00";
  const hp = lerHora(horaPadrao) || { h: 8, mi: 0 };
  const res = { linhas: [], erros: [], semHora: 0, ignoradas: 0, colunas: {}, cabecalho: [] };
  if (!texto || !texto.trim()) { res.erros.push({ n: 0, msg: "Cole a tabela no campo ou escolha um arquivo." }); return res; }

  const sep = detectarSeparador(texto);
  const tab = lerCSV(texto, sep);
  if (tab.length < 2) { res.erros.push({ n: 0, msg: "A tabela precisa ter uma linha de cabeçalho e pelo menos uma linha de dados." }); return res; }

  const cab = tab[0];
  res.cabecalho = cab.map(c => c.trim());
  const col = achar(cab);
  res.colunas = col;
  const temData = col.data != null || col.datahora != null;
  const temPA = col.pa != null || (col.sys != null && col.dia != null);
  if (!temData) res.erros.push({ n: 1, msg: "Não achei a coluna de data. Use o cabeçalho \"Data\" (ou \"Data e hora\")." });
  if (!temPA && col.glic == null) res.erros.push({ n: 1, msg: "Não achei colunas de pressão nem de glicemia. Use \"Máxima\" e \"Mínima\" (ou \"PA\") e \"Glicemia\"." });
  if (res.erros.length) return res;

  const usados = new Map();
  for (let i = 1; i < tab.length; i++) {
    const r = tab[i], n = i + 1;
    const cel = k => (col[k] != null && r[col[k]] != null ? String(r[col[k]]).trim() : "");

    let sys = NaN, dia = NaN;
    if (col.pa != null && cel("pa")) {
      const pa = lerPA(cel("pa"));
      if (!pa) { res.erros.push({ n, msg: "Pressão em formato desconhecido: \"" + cel("pa") + "\" (use 120/80)." }); continue; }
      sys = pa.sys; dia = pa.dia;
    }
    if (col.sys != null && col.dia != null && (cel("sys") || cel("dia"))) { sys = numero(cel("sys")); dia = numero(cel("dia")); }
    let pulse = col.pulso != null ? numero(cel("pulso")) : NaN;
    let glic = col.glic != null ? numero(cel("glic")) : NaN;

    const temPressao = !isNaN(sys) || !isNaN(dia);
    if (!temPressao && isNaN(glic) && isNaN(pulse)) { res.ignoradas++; continue; }
    if (!temPressao && isNaN(glic)) { res.erros.push({ n, msg: "Linha só com pulso, sem pressão nem glicemia." }); continue; }

    let dt = null, hr = null;
    if (col.datahora != null && cel("datahora")) {
      const partes = cel("datahora").split(/[\sT]+/);
      dt = lerData(partes[0]);
      hr = partes[1] ? lerHora(partes[1]) : null;
    }
    if (!dt && col.data != null) dt = lerData(cel("data"));
    if (!dt) {
      const bruto = cel("data") || cel("datahora");
      res.erros.push({ n, msg: /^\d{1,2}[\/.-]\d{1,2}$/.test(bruto) ? "Data sem o ano: \"" + bruto + "\"." : "Data inválida: \"" + bruto + "\"." });
      continue;
    }
    if (dt.m < 1 || dt.m > 12 || dt.d < 1 || dt.d > 31) { res.erros.push({ n, msg: "Data inválida: " + dt.d + "/" + dt.m + "/" + dt.a + "." }); continue; }
    if (!hr && col.hora != null && cel("hora")) {
      hr = lerHora(cel("hora"));
      if (!hr) { res.erros.push({ n, msg: "Hora inválida: \"" + cel("hora") + "\"." }); continue; }
    }
    if (!hr && col.periodo != null && cel("periodo")) {
      const p = HORA_PERIODO[norm(cel("periodo")).replace(/\s/g, "")];
      if (p) hr = lerHora(p);
    }
    if (!hr) { hr = hp; res.semHora++; }

    const quando = new Date(dt.a, dt.m - 1, dt.d, hr.h, hr.mi, 0, 0);
    if (quando.getMonth() !== dt.m - 1) { res.erros.push({ n, msg: "Data inexistente: " + dt.d + "/" + dt.m + "/" + dt.a + "." }); continue; }
    if (quando.getTime() > Date.now() + 86400000) { res.erros.push({ n, msg: "Data no futuro: " + dt.d + "/" + dt.m + "/" + dt.a + "." }); continue; }

    const item = { n, ms: quando.getTime() };
    if (temPressao) {
      if (!(sys >= 50 && sys <= 260)) { res.erros.push({ n, msg: "Pressão máxima fora do esperado (50 a 260): " + cel("sys") + (cel("pa") || "") }); continue; }
      if (!(dia >= 30 && dia <= 160)) { res.erros.push({ n, msg: "Pressão mínima fora do esperado (30 a 160): " + (cel("dia") || cel("pa")) }); continue; }
      if (sys <= dia) { res.erros.push({ n, msg: "A máxima precisa ser maior que a mínima (" + sys + "/" + dia + ")." }); continue; }
      item.sys = Math.round(sys); item.dia = Math.round(dia);
    }
    if (!isNaN(pulse)) {
      if (!(pulse >= 30 && pulse <= 220)) { res.erros.push({ n, msg: "Pulso fora do esperado (30 a 220): " + cel("pulso") }); continue; }
      if (temPressao) item.pulse = Math.round(pulse);
    }
    if (!isNaN(glic)) {
      if (!(glic >= 20 && glic <= 600)) { res.erros.push({ n, msg: "Glicemia fora do esperado (20 a 600): " + cel("glic") }); continue; }
      item.glic = Math.round(glic);
      item.momento = mapearMomento(col.momento != null ? cel("momento") : "") || "outro";
    }
    const obs = col.obs != null ? cel("obs") : "";
    if (obs) item.note = obs.slice(0, 140);

    const k = item.ms;
    const veze = (usados.get(k) || 0) + 1;
    usados.set(k, veze);
    item.id = "imp_" + k + (veze > 1 ? "_" + veze : "");
    res.linhas.push(item);
  }
  return res;
}
