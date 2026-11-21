export const $ = (s, r) => (r || document).querySelector(s);
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const p2 = n => String(n).padStart(2, "0");
export const dayStr = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
export const hm = d => p2(d.getHours()) + ":" + p2(d.getMinutes());
export const dm = d => p2(d.getDate()) + "/" + p2(d.getMonth() + 1);
export const dmy = d => dm(d) + "/" + d.getFullYear();
export const dmHm = d => dm(d) + " às " + hm(d);
export const longDay = d => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(d);
export const shortDay = d => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" }).format(d);
export const MIN = 60000;
export const DIA = 86400000;

export const MOMENTOS = {
  jejum: "Em jejum",
  antes: "Antes de comer",
  apos: "Depois de comer",
  deitar: "Ao deitar",
  outro: "Outro momento"
};
export const LOCAIS = {
  abdD: "Abdômen D", abdE: "Abdômen E",
  coxaD: "Coxa D", coxaE: "Coxa E",
  bracoD: "Braço D", bracoE: "Braço E"
};
export const RODIZIO = ["abdD", "abdE", "coxaD", "coxaE", "bracoD", "bracoE"];
export const INSULINAS = ["NPH", "Regular", "Glargina", "Detemir", "Degludec", "Lispro", "Asparte", "Glulisina", "Pré-misturada", "Outra"];
export const TIPOS = { comprimido: "Comprimido", liquido: "Líquido ou gotas", insulina: "Insulina", outro: "Outro" };

export function normUser(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9._-]/g, "");
}
export const emailDe = u => u + "@cuidados-vo.app";

export function fmtNum(n, dec) {
  if (n == null || isNaN(n)) return "-";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 1 : dec });
}

export function slugArquivo(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Horários programados de um dia ("YYYY-MM-DD"). Insulina "conforme a glicemia" não tem horário fixo. */
export function slotsDoDia(meds, ds) {
  const out = [];
  for (const m of meds) {
    if (m.active === false || m.mode === "glicemia") continue;
    if (m.start && m.start > ds) continue;
    if (m.end && m.end < ds) continue;
    for (const t of (m.times || [])) {
      const sched = ds + "T" + t;
      out.push({ med: m, time: t, sched, when: new Date(sched) });
    }
  }
  return out.sort((a, b) => a.when - b.when || a.med.name.localeCompare(b.med.name));
}

/** Doses já registradas, por "idDoRemédio|horárioProgramado". Se duas pessoas marcarem, vale a mais antiga. */
export function mapaDoses(entries) {
  const g = {};
  const ordenadas = entries.filter(e => e.type === "dose" && e.sched).sort((a, b) => b.ms - a.ms);
  for (const e of ordenadas) g[e.medId + "|" + e.sched] = e;
  return g;
}

export function ehIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function emModoApp() {
  return !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
}
