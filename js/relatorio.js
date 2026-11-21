import { dayStr, hm, dm, dmy, dmHm, MIN, DIA, MOMENTOS, LOCAIS, slotsDoDia, mapaDoses, fmtNum, slugArquivo } from "./util.js";

const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const AUTOTABLE = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";

function carregar(src) {
  return new Promise((ok, erro) => {
    if (document.querySelector('script[data-src="' + src + '"]')) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => ok();
    s.onerror = () => erro(new Error("Não foi possível carregar o gerador de PDF. Verifique a internet e tente de novo."));
    document.head.appendChild(s);
  });
}

const inicioDoDia = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function textoDose(m) {
  if (m.kind === "insulina") return m.mode === "glicemia" ? "Dose conforme a glicemia" : fmtNum(m.units) + " UI";
  return m.dose || "";
}
function textoDuracao(m) {
  if (m.active === false) return "Suspenso";
  if (!m.end) return "Contínuo";
  return "Até " + dmy(new Date(m.end + "T00:00"));
}

export function calcular({ entries, meds, from, to }) {
  const medicoes = entries.filter(e => e.type === "medicao").sort((a, b) => a.ms - b.ms);
  const pa = medicoes.filter(e => e.sys != null);
  const gl = medicoes.filter(e => e.glic != null);
  const insulina = entries.filter(e => e.type === "dose" && e.kind === "insulina").sort((a, b) => a.ms - b.ms);
  const dias = Math.round((inicioDoDia(to) - inicioDoDia(from)) / DIA) + 1;
  const soma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const unidades = insulina.filter(e => e.units != null);

  const agora = Date.now();
  const dadas = mapaDoses(entries);
  const aderencia = {};
  let esperadasTotal = 0, dadasTotal = 0;
  const ini = inicioDoDia(from), fim = inicioDoDia(to);
  for (const m of meds) {
    aderencia[m.id] = { esperadas: 0, dadas: 0, extras: 0 };
  }
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const ds = dayStr(d);
    for (const s of slotsDoDia(meds, ds)) {
      if (s.when.getTime() > agora) continue;
      aderencia[s.med.id].esperadas++;
      esperadasTotal++;
      if (dadas[s.med.id + "|" + s.sched]) { aderencia[s.med.id].dadas++; dadasTotal++; }
    }
  }
  for (const e of entries) {
    if (e.type === "dose" && !e.sched && aderencia[e.medId]) aderencia[e.medId].extras++;
  }

  return {
    medicoes, pa, gl, insulina, dias, aderencia, esperadasTotal, dadasTotal,
    paMedia: pa.length ? { sys: soma(pa, e => e.sys) / pa.length, dia: soma(pa, e => e.dia) / pa.length } : null,
    paMax: pa.length ? pa.reduce((a, e) => (e.sys > a.sys ? e : a), pa[0]) : null,
    paMin: pa.length ? pa.reduce((a, e) => (e.sys < a.sys ? e : a), pa[0]) : null,
    glMedia: gl.length ? soma(gl, e => e.glic) / gl.length : null,
    glMax: gl.length ? Math.max(...gl.map(e => e.glic)) : null,
    glMin: gl.length ? Math.min(...gl.map(e => e.glic)) : null,
    uiTotal: soma(unidades, e => e.units),
    uiPorDia: unidades.length ? soma(unidades, e => e.units) / dias : null
  };
}

function medsDoPeriodo(meds, from, to) {
  const f = dayStr(from), t = dayStr(to);
  return meds.filter(m => !(m.end && m.end < f) && !(m.start && m.start > t));
}

function grafico(doc, x, y, w, h, titulo, series, from, to) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
  doc.text(titulo, x, y);
  let lx = x + doc.getTextWidth(titulo) + 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  for (const s of series) {
    doc.setFillColor(...s.cor); doc.rect(lx, y - 6, 7, 7, "F");
    doc.setTextColor(80, 80, 80); doc.text(s.rotulo, lx + 10, y);
    lx += 10 + doc.getTextWidth(s.rotulo) + 14;
  }
  const esq = x + 30, dir = x + w, topo = y + 10, base = y + h - 14;
  const vals = [];
  series.forEach(s => s.pts.forEach(p => vals.push(p.v)));
  if (!vals.length) {
    doc.setTextColor(120, 120, 120); doc.text("Sem medições no período.", esq, topo + 20);
    return;
  }
  let lo = Math.min(...vals) - 6, hi = Math.max(...vals) + 6;
  const passo = hi - lo <= 110 ? 20 : hi - lo <= 260 ? 50 : 100;
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
  const t0 = from.getTime(), t1 = to.getTime();
  const X = t => esq + (t - t0) / (t1 - t0) * (dir - esq);
  const Y = v => base - (v - lo) / (hi - lo) * (base - topo);
  doc.setLineWidth(0.4);
  doc.setFontSize(7);
  for (let v = lo; v <= hi; v += passo) {
    doc.setDrawColor(215, 220, 224); doc.line(esq, Y(v), dir, Y(v));
    doc.setTextColor(110, 110, 110); doc.text(String(v), esq - 4, Y(v) + 2.5, { align: "right" });
  }
  const marcas = 4;
  for (let i = 0; i <= marcas; i++) {
    const t = t0 + (t1 - t0) * i / marcas;
    doc.setTextColor(110, 110, 110);
    doc.text(dm(new Date(t)), X(t), base + 10, { align: i === 0 ? "left" : i === marcas ? "right" : "center" });
  }
  for (const s of series) {
    const pts = s.pts.slice().sort((a, b) => a.t - b.t);
    doc.setDrawColor(...s.cor); doc.setFillColor(...s.cor); doc.setLineWidth(1);
    for (let i = 1; i < pts.length; i++) doc.line(X(pts[i - 1].t), Y(pts[i - 1].v), X(pts[i].t), Y(pts[i].v));
    pts.forEach(p => doc.circle(X(p.t), Y(p.v), 1.6, "F"));
  }
}

export async function gerarPDF({ entries, meds, nomes, paciente, from, to }) {
  await carregar(JSPDF);
  await carregar(AUTOTABLE);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 40;
  const r = calcular({ entries, meds, from, to });
  const quem = uid => (nomes[uid] && nomes[uid].name) || "";
  const fromD = inicioDoDia(from), toD = inicioDoDia(to);
  const periodoTxt = dmy(fromD) + " a " + dmy(toD);

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(11, 110, 120);
  doc.text("Acompanhamento de saúde", M, 52);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text("Paciente: " + paciente, M, 72);
  doc.setFontSize(10); doc.setTextColor(90, 90, 90);
  doc.text("Período: " + periodoTxt, W - M, 52, { align: "right" });
  const agoraD = new Date();
  doc.text("Gerado em " + dmy(agoraD) + " às " + hm(agoraD), W - M, 66, { align: "right" });
  doc.setDrawColor(11, 110, 120); doc.setLineWidth(1); doc.line(M, 82, W - M, 82);

  const linhasResumo = [];
  linhasResumo.push(["Pressão arterial", r.pa.length
    ? r.pa.length + " medições · média " + fmtNum(r.paMedia.sys, 0) + "/" + fmtNum(r.paMedia.dia, 0) +
      " · maior " + r.paMax.sys + "/" + r.paMax.dia + " (" + dm(new Date(r.paMax.ms)) + ") · menor " + r.paMin.sys + "/" + r.paMin.dia + " (" + dm(new Date(r.paMin.ms)) + ") mmHg"
    : "Nenhuma medição no período"]);
  linhasResumo.push(["Glicemia", r.gl.length
    ? r.gl.length + " medições · média " + fmtNum(r.glMedia, 0) + " · menor " + r.glMin + " · maior " + r.glMax + " mg/dL"
    : "Nenhuma medição no período"]);
  linhasResumo.push(["Insulina", r.insulina.length
    ? r.insulina.length + " aplicações · total " + fmtNum(r.uiTotal) + " UI" + (r.uiPorDia != null ? " · média " + fmtNum(r.uiPorDia) + " UI por dia" : "")
    : "Nenhuma aplicação no período"]);
  linhasResumo.push(["Remédios com horário", r.esperadasTotal
    ? r.dadasTotal + " de " + r.esperadasTotal + " doses programadas registradas (" + Math.round(100 * r.dadasTotal / r.esperadasTotal) + "%)"
    : "Sem horários programados no período"]);

  let y = 96;
  doc.autoTable({
    startY: y, body: linhasResumo, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 3, textColor: [40, 40, 40] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 110 } }
  });
  y = doc.lastAutoTable.finalY + 14;

  const paSeries = [
    { rotulo: "Máxima", cor: [11, 110, 120], pts: r.pa.map(e => ({ t: e.ms, v: e.sys })) },
    { rotulo: "Mínima", cor: [194, 87, 12], pts: r.pa.map(e => ({ t: e.ms, v: e.dia })) }
  ];
  grafico(doc, M, y, W - 2 * M, 118, "Pressão arterial (mmHg)", paSeries, fromD, new Date(toD.getTime() + DIA));
  y += 128;
  grafico(doc, M, y, W - 2 * M, 104, "Glicemia (mg/dL)", [{ rotulo: "Glicemia", cor: [11, 110, 120], pts: r.gl.map(e => ({ t: e.ms, v: e.glic })) }], fromD, new Date(toD.getTime() + DIA));
  y += 116;

  const titulo = (txt) => {
    if (y > H - 170) { doc.addPage(); y = 52; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(11, 110, 120);
    doc.text(txt, M, y);
    y += 6;
  };
  const tabela = (head, body, widths) => {
    doc.autoTable({
      startY: y, head: [head], body, theme: "grid", margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 3, textColor: [40, 40, 40], lineColor: [210, 216, 220], lineWidth: 0.4 },
      headStyles: { fillColor: [11, 110, 120], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 247, 248] },
      columnStyles: widths
    });
    y = doc.lastAutoTable.finalY + 16;
  };

  titulo("Pressão e glicemia");
  if (r.medicoes.length) {
    tabela(
      ["Data", "Hora", "Pressão (mmHg)", "Pulso", "Glicemia (mg/dL)", "Momento", "Observação", "Registrado por"],
      r.medicoes.map(e => {
        const d = new Date(e.ms);
        return [dmy(d), hm(d), e.sys != null ? e.sys + "/" + e.dia : "-", e.pulse != null ? e.pulse : "-",
          e.glic != null ? e.glic : "-", e.glic != null ? (MOMENTOS[e.momento] || "") : "", e.note || "", quem(e.by)];
      }),
      { 0: { cellWidth: 56 }, 1: { cellWidth: 34 }, 2: { cellWidth: 62 }, 3: { cellWidth: 34 }, 4: { cellWidth: 64 }, 5: { cellWidth: 70 }, 7: { cellWidth: 60 } }
    );
  } else {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
    doc.text("Nenhuma medição no período.", M, y + 12); y += 30;
  }

  titulo("Medicamentos");
  const lista = medsDoPeriodo(meds, fromD, toD).sort((a, b) => a.name.localeCompare(b.name));
  if (lista.length) {
    tabela(
      ["Remédio", "Dose", "Horários", "Duração", "Registros no período", "Observação"],
      lista.map(m => {
        const a = r.aderencia[m.id] || { esperadas: 0, dadas: 0, extras: 0 };
        let reg;
        if (m.mode === "glicemia") reg = a.extras + " aplicações";
        else reg = a.dadas + " de " + a.esperadas + (a.extras ? " (+" + a.extras + " extras)" : "");
        return [m.kind === "insulina" && m.insulinType && !m.name.toLowerCase().includes(m.insulinType.toLowerCase()) ? m.name + " (" + m.insulinType + ")" : m.name,
          textoDose(m), m.mode === "glicemia" ? "Conforme a glicemia" : (m.times || []).join(", "), textoDuracao(m), reg, m.note || ""];
      }),
      { 0: { cellWidth: 100 }, 1: { cellWidth: 70 }, 2: { cellWidth: 80 }, 3: { cellWidth: 62 }, 4: { cellWidth: 80 } }
    );
  } else {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
    doc.text("Nenhum medicamento cadastrado para o período.", M, y + 12); y += 30;
  }

  if (r.insulina.length) {
    titulo("Insulina: aplicações");
    tabela(
      ["Data", "Hora", "Insulina", "Dose (UI)", "Local", "Glicemia antes", "Programada", "Registrado por"],
      r.insulina.map(e => {
        const d = new Date(e.ms);
        return [dmy(d), hm(d), e.medName || "", e.units != null ? fmtNum(e.units) : "-", LOCAIS[e.site] || "",
          e.glicBefore != null ? e.glicBefore : "-", e.sched ? e.sched.split("T")[1] : "extra", quem(e.by)];
      }),
      { 0: { cellWidth: 56 }, 1: { cellWidth: 34 }, 3: { cellWidth: 50 }, 5: { cellWidth: 62 }, 6: { cellWidth: 56 } }
    );
  }

  const outras = entries.filter(e => e.type === "dose" && e.kind !== "insulina");
  if (outras.length) {
    titulo("Outros remédios: doses registradas");
    tabela(
      ["Data", "Hora", "Remédio", "Dose", "Horário programado", "Registrado por"],
      outras.sort((a, b) => a.ms - b.ms).map(e => {
        const d = new Date(e.ms);
        return [dmy(d), hm(d), e.medName || "", e.doseText || "", e.sched ? e.sched.split("T")[1] : "extra", quem(e.by)];
      }),
      { 0: { cellWidth: 56 }, 1: { cellWidth: 34 }, 4: { cellWidth: 80 } }
    );
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text("Valores digitados pelos cuidadores. Documento de apoio à consulta.", M, H - 22);
    doc.text("Página " + i + " de " + n, W - M, H - 22, { align: "right" });
  }

  const nome = "acompanhamento_" + slugArquivo(paciente) + "_" + dayStr(fromD) + "_a_" + dayStr(toD) + ".pdf";
  return { blob: doc.output("blob"), nome };
}

export function gerarCSV({ entries, nomes, paciente, from, to }) {
  const q = uid => (nomes[uid] && nomes[uid].name) || "";
  const cel = v => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const cab = ["Data", "Hora", "Tipo", "Pressao maxima", "Pressao minima", "Pulso", "Glicemia mg/dL", "Momento da glicemia",
    "Remedio", "Dose", "Unidades (UI)", "Local da aplicacao", "Glicemia antes", "Horario programado", "Observacao", "Registrado por"];
  const linhas = entries.slice().sort((a, b) => a.ms - b.ms).map(e => {
    const d = new Date(e.ms);
    if (e.type === "medicao") {
      return [dmy(d), hm(d), "Medicao", e.sys, e.dia, e.pulse, e.glic, e.glic != null ? MOMENTOS[e.momento] : "", "", "", "", "", "", "", e.note, q(e.by)];
    }
    return [dmy(d), hm(d), e.kind === "insulina" ? "Insulina" : "Remedio", "", "", "", "", "", e.medName, e.doseText, e.units, LOCAIS[e.site] || "",
      e.glicBefore, e.sched ? e.sched.replace("T", " ") : "", e.note, q(e.by)];
  });
  const texto = "﻿" + [cab].concat(linhas).map(l => l.map(cel).join(";")).join("\r\n");
  const nome = "registros_" + slugArquivo(paciente) + "_" + dayStr(from) + "_a_" + dayStr(to) + ".csv";
  return { blob: new Blob([texto], { type: "text/csv;charset=utf-8" }), nome };
}
