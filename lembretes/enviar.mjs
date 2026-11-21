// Robô de lembretes: roda no GitHub Actions a cada poucos minutos.
// Lê os remédios no Firestore, vê quais horários já passaram sem registro e manda notificação.
import { pathToFileURL } from "node:url";

const p2 = n => String(n).padStart(2, "0");

/** Data e hora "de parede" no fuso informado, como números comparáveis. */
export function agoraNoFuso(tz, instante = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).formatToParts(instante);
  const g = t => Number(partes.find(p => p.type === t).value);
  const [a, m, d, h, mi] = [g("year"), g("month"), g("day"), g("hour"), g("minute")];
  return { dia: a + "-" + p2(m) + "-" + p2(d), minutos: Date.UTC(a, m - 1, d, h, mi) / 60000, a, m, d };
}

export function diaAnterior(dia) {
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d - 1));
  return x.getUTCFullYear() + "-" + p2(x.getUTCMonth() + 1) + "-" + p2(x.getUTCDate());
}

/** Horários programados do dia que já passaram (até 4 h atrás). Retorna a defasagem em minutos. */
export function horariosVencidos(meds, tz, instante = new Date()) {
  const agora = agoraNoFuso(tz, instante);
  const saida = [];
  for (const dia of [diaAnterior(agora.dia), agora.dia]) {
    for (const m of meds) {
      if (m.active === false || m.mode === "glicemia") continue;
      if (m.start && m.start > dia) continue;
      if (m.end && m.end < dia) continue;
      for (const t of m.times || []) {
        const [h, mi] = t.split(":").map(Number);
        const [a, mo, d] = dia.split("-").map(Number);
        const programado = Date.UTC(a, mo - 1, d, h, mi) / 60000;
        const atraso = agora.minutos - programado;
        if (atraso >= 0 && atraso <= 240) {
          const sched = dia + "T" + t;
          saida.push({ med: m, sched, atraso, idDose: "dose_" + m.id + "_" + sched.replace(/[-:]/g, "") });
        }
      }
    }
  }
  return saida;
}

function textoAviso(v, etapa) {
  const hora = v.sched.split("T")[1];
  const ins = v.med.kind === "insulina";
  const dose = ins ? (v.med.units != null ? v.med.units + " UI" : "") : (v.med.dose || "");
  const nome = v.med.name + (dose ? " · " + dose : "");
  return etapa === 1
    ? { title: ins ? "Hora da insulina" : "Hora do remédio", body: nome + " · marcado para " + hora }
    : { title: "Remédio atrasado", body: nome + " · marcado para " + hora + ". Ainda sem registro." };
}

async function principal() {
  const admin = (await import("firebase-admin")).default;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!sa.project_id) throw new Error("Falta o segredo FIREBASE_SERVICE_ACCOUNT no GitHub.");
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const cfg = await db.doc("config/app").get();
  const tz = (cfg.exists && cfg.data().tz) || "America/Sao_Paulo";
  const medsSnap = await db.collection("meds").get();
  const meds = medsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const vencidos = horariosVencidos(meds, tz);
  console.log("Fuso:", tz, "| remédios:", meds.length, "| horários vencidos na janela:", vencidos.length);

  const pendentes = [];
  for (const v of vencidos) {
    const dose = await db.doc("entries/" + v.idDose).get();
    if (dose.exists) continue;
    const base = (v.med.id + "_" + v.sched).replace(/[-:]/g, "");
    const etapas = [1];
    if (v.atraso >= 30) etapas.push(2);
    for (const etapa of etapas) {
      const ref = db.doc("reminders/" + base + "_" + etapa);
      if (!(await ref.get()).exists) pendentes.push({ v, etapa, ref });
    }
  }
  if (!pendentes.length) { console.log("Nada a avisar."); return; }

  const tokensSnap = await db.collection("tokens").get();
  const tokens = tokensSnap.docs.map(d => d.id);
  console.log("Avisos a enviar:", pendentes.length, "| aparelhos:", tokens.length);

  for (const { v, etapa, ref } of pendentes) {
    const msg = textoAviso(v, etapa);
    if (tokens.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: msg.title, body: msg.body, tag: v.med.id + "_" + v.sched.replace(/[-:]/g, ""), url: "./" },
        webpush: { headers: { Urgency: "high", TTL: "7200" } }
      });
      for (let i = 0; i < resp.responses.length; i++) {
        const r = resp.responses[i];
        if (!r.success && r.error && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error.code || "")) {
          await db.doc("tokens/" + tokens[i]).delete().catch(() => {});
        }
      }
      console.log("Enviado:", msg.title, "-", msg.body, "| ok:", resp.successCount, "falhas:", resp.failureCount);
    }
    await ref.set({ at: admin.firestore.FieldValue.serverTimestamp(), etapa, sched: v.sched });
  }

  const velhos = await db.collection("reminders").where("at", "<", new Date(Date.now() - 7 * 86400000)).limit(300).get();
  const lote = db.batch();
  velhos.docs.forEach(d => lote.delete(d.ref));
  if (!velhos.empty) await lote.commit();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
