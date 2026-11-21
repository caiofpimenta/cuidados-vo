// Firebase de mentira (em memória) só para testar as telas. Não é usado no app de verdade.
const store = new Map();
const ouvintes = new Set();
let seq = 1;

const ts = ms => ({ __ts: true, ms, toMillis: () => ms, toDate: () => new Date(ms) });
export const Timestamp = { fromMillis: ts, fromDate: d => ts(d.getTime()) };
export const serverTimestamp = () => ({ __st: true });
export const increment = n => ({ __inc: n });
const resolve = (v, atual) => {
  if (v && v.__inc != null) return (Number(atual) || 0) + v.__inc;
  if (v && v.__st) return ts(Date.now());
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === "object" && !v.__ts) { const o = {}; for (const k in v) o[k] = resolve(v[k], atual && atual[k]); return o; }
  return v;
};
const valor = v => (v && v.__ts ? v.ms : v);

export const configurado = true;
export const cfg = {};
export const vapidKey = "";
export const app = {}, auth = {}, db = {};
export const obterMessaging = async () => null;
export const getToken = async () => "";
export const deleteToken = async () => true;
export const onMessage = () => {};

const caminho = partes => partes.join("/");
export const collection = (_d, ...p) => ({ kind: "col", path: caminho(p) });
export const doc = (d, ...p) => {
  if (d && d.kind === "col" && !p.length) { const id = "n" + seq++; return { kind: "doc", path: d.path + "/" + id, id }; }
  return { kind: "doc", path: caminho(p), id: p[p.length - 1] };
};
export const where = (campo, op, v) => ({ t: "where", campo, op, v });
export const orderBy = (campo, dir) => ({ t: "order", campo, dir: dir || "asc" });
export const limit = n => ({ t: "limit", n });
export const query = (col, ...cons) => ({ kind: "q", col, cons });

function docsDe(ref) {
  const col = ref.kind === "q" ? ref.col : ref;
  const cons = ref.kind === "q" ? ref.cons : [];
  let docs = [];
  for (const [p, d] of store) {
    const i = p.lastIndexOf("/");
    if (p.slice(0, i) === col.path) docs.push({ id: p.slice(i + 1), d });
  }
  for (const c of cons) {
    if (c.t === "where") {
      docs = docs.filter(x => {
        const a = valor(x.d[c.campo]), b = valor(c.v);
        return c.op === ">=" ? a >= b : c.op === "<=" ? a <= b : c.op === "<" ? a < b : c.op === ">" ? a > b : c.op === "==" ? a === b : true;
      });
    }
  }
  const ord = cons.find(c => c.t === "order");
  if (ord) docs.sort((x, y) => (valor(x.d[ord.campo]) - valor(y.d[ord.campo])) * (ord.dir === "desc" ? -1 : 1));
  const lim = cons.find(c => c.t === "limit");
  if (lim) docs = docs.slice(0, lim.n);
  return docs;
}
const snapDoc = x => ({ id: x.id, data: () => JSON.parse(JSON.stringify(x.d, (k, v) => v), (k, v) => v), exists: () => true });
const reviver = d => {
  const o = {};
  for (const k in d) o[k] = d[k];
  return o;
};
const snapCol = ref => {
  const docs = docsDe(ref).map(x => ({ id: x.id, exists: () => true, data: () => reviver(x.d) }));
  return { docs, size: docs.length, empty: !docs.length };
};

export function onSnapshot(ref, cb) {
  const emitir = () => {
    if (ref.kind === "doc") {
      const d = store.get(ref.path);
      cb({ id: ref.id, exists: () => !!d, data: () => d && reviver(d) });
    } else cb(snapCol(ref));
  };
  const o = { ref, emitir };
  ouvintes.add(o);
  setTimeout(emitir, 5);
  return () => ouvintes.delete(o);
}
const avisar = () => setTimeout(() => ouvintes.forEach(o => o.emitir()), 5);

export async function getDoc(ref) {
  const d = store.get(ref.path);
  return { id: ref.id, exists: () => !!d, data: () => d && reviver(d) };
}
export async function getDocs(q) { return snapCol(q); }
export async function setDoc(ref, data) {
  if (store.has(ref.path) && /^entries\/dose_/.test(ref.path) && !globalThis.__admin) {
    throw Object.assign(new Error("negado"), { code: "permission-denied" });
  }
  store.set(ref.path, resolve(data)); avisar();
}
export async function addDoc(col, data) {
  const id = "id" + seq++;
  store.set(col.path + "/" + id, resolve(data)); avisar();
  return { id, path: col.path + "/" + id };
}
export async function updateDoc(ref, data) { const at = store.get(ref.path) || {}; store.set(ref.path, Object.assign({}, at, resolve(data, at))); avisar(); }
export async function deleteDoc(ref) { store.delete(ref.path); avisar(); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d) => { ops.push(["set", r, d]); },
    update: (r, d) => { ops.push(["upd", r, d]); },
    commit: async () => {
      for (const [k, r] of ops) if (k === "set" && store.has(r.path) && /^entries\/dose_/.test(r.path) && !globalThis.__admin) throw Object.assign(new Error("negado"), { code: "permission-denied" });
      ops.forEach(([k, r, d]) => { const at = store.get(r.path) || {}; store.set(r.path, k === "set" ? resolve(d, at) : Object.assign({}, at, resolve(d, at))); });
      avisar();
    }
  };
}

const usuarioFalso = { uid: "u1" };
let cbAuth = null;
export function onAuthStateChanged(_a, cb) { cbAuth = cb; setTimeout(() => cb(globalThis.__deslogado ? null : usuarioFalso), 20); return () => {}; }
export async function signInWithEmailAndPassword() { setTimeout(() => cbAuth && cbAuth(usuarioFalso), 5); return { user: usuarioFalso }; }
export async function createUserWithEmailAndPassword() { return { user: { uid: "u9" } }; }
export async function signOut() { setTimeout(() => cbAuth && cbAuth(null), 5); }
export async function deleteUser() {}

/* dados de exemplo */
const agora = Date.now();
const h = (diasAtras, hora, min) => { const d = new Date(agora); d.setDate(d.getDate() - diasAtras); d.setHours(hora, min, 0, 0); return d.getTime(); };
const hojeStr = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
store.set("caregivers/u1", { name: "Caio" });
store.set("caregivers/u2", { name: "Maria (filha)" });
store.set("caregivers/u3", { name: "João" });
store.set("admins/u1", { setupKey: "x" });
store.set("config/app", { patientName: "Maria José Pimenta", tz: "America/Cuiaba" });
store.set("config/secret", { joinCode: "FAMILIA2026" });
store.set("meds/m1", { name: "Losartana", kind: "comprimido", dose: "50 mg, 1 comprimido", mode: "fixo", times: ["00:01", "20:00"], start: "2026-11-01", end: null, active: true, by: "u2", note: "depois do café" });
store.set("meds/m2", { name: "Insulina NPH", kind: "insulina", insulinType: "NPH", units: 10, mode: "fixo", times: ["00:02", "14:00"], start: "2026-11-01", end: null, active: true, by: "u2" });
store.set("meds/m3", { name: "Insulina Regular", kind: "insulina", insulinType: "Regular", units: null, mode: "glicemia", times: [], start: "2026-11-01", end: null, active: true, by: "u1", note: "antes do almoço, se glicemia alta" });
store.set("meds/m4", { name: "Amoxicilina", kind: "comprimido", dose: "500 mg", mode: "fixo", times: ["08:00", "16:00"], start: "2026-11-15", end: hojeStr, active: true, by: "u3" });
store.set("meds/m1", Object.assign(store.get("meds/m1"), { stockOn: true, stockQty: 11, stockUnit: "comprimidos", perDose: 1, pack: 30, alertDays: 7, stockAt: ts(agora - 2 * 86400000), stockBy: "u2" }));
store.set("meds/m2", Object.assign(store.get("meds/m2"), { stockOn: true, stockQty: 640, stockUnit: "UI", pack: 300, alertDays: 10, stockAt: ts(agora - 5 * 86400000), stockBy: "u1" }));
store.set("supplies/s1", { name: "Fraldas G", unit: "fraldas", stockQty: 14, pack: 36, alertDays: 7, minQty: 0, perDay: 0, active: true, by: "u2", stockAt: ts(agora - 86400000), stockBy: "u3" });
store.set("supplies/s2", { name: "Fraldas noturnas", unit: "fraldas", stockQty: 40, pack: 24, alertDays: 7, minQty: 10, perDay: 1, active: true, by: "u2", stockAt: ts(agora - 3 * 86400000), stockBy: "u2" });
for (let i = 1; i <= 8; i++) store.set("stockLog/l" + i, { item: "sup:s1", type: "saida", qty: 6, delta: -6, by: ["u2", "u3"][i % 2], ts: ts(agora - i * 86400000 - 3600000) });
store.set("stockLog/l20", { item: "sup:s1", type: "entrada", qty: 36, delta: 36, by: "u2", ts: ts(agora - 9 * 86400000) });
for (let i = 0; i < 12; i++) {
  store.set("entries/med" + i, { type: "medicao", sys: 120 + (i * 7) % 25, dia: 76 + (i * 3) % 12, pulse: 70 + i % 8, glic: 98 + (i * 11) % 60, momento: ["jejum", "apos", "deitar"][i % 3], by: ["u2", "u3", "u1"][i % 3], ts: ts(h(Math.floor(i / 2), i % 2 ? 20 : 8, 10 + i)) });
}
store.set("entries/ins1", { type: "dose", medId: "m2", medName: "Insulina NPH", kind: "insulina", doseText: "10 UI", units: 10, site: "abdE", glicBefore: 104, sched: hojeStr + "T00:02", by: "u2", ts: ts(h(0, 0, 5)) });
store.set("entries/ins2", { type: "dose", medId: "m2", medName: "Insulina NPH", kind: "insulina", doseText: "8 UI", units: 8, site: "coxaD", sched: null, by: "u3", ts: ts(h(1, 14, 2)) });
store.set("entries/dose_m1_" + hojeStr.replace(/-/g, "") + "T0001", { type: "dose", medId: "m1", medName: "Losartana", kind: "comprimido", doseText: "50 mg", sched: hojeStr + "T00:01", by: "u3", ts: ts(h(0, 0, 4)) });
