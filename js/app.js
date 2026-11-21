import {
  configurado, auth, db, vapidKey, obterMessaging,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, deleteUser,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, getToken, deleteToken, onMessage
} from "./fb.js";
import {
  $, esc, p2, dayStr, hm, dm, dmy, dmHm, longDay, shortDay, MIN, DIA,
  MOMENTOS, LOCAIS, RODIZIO, INSULINAS, TIPOS, normUser, emailDe, fmtNum,
  slotsDoDia, mapaDoses, ehIOS, emModoApp
} from "./util.js";

const S = {
  view: "auth", authMode: "entrar", authMsg: "",
  uid: null, name: "", isAdmin: false,
  cfg: { patientName: "Maria José Pimenta", tz: "" },
  caregivers: {}, meds: [], entries: [], unsubs: [],
  tab: "hoje", hist: "med", range: 7, more: 60,
  base0: 0, olderIni: 0, older: [], semMais: false, carregandoAntigos: false,
  confirm: null, confirmT: null,
  sig: "", lastMinute: "",
  err: null, authBusy: false, pushState: "default", msgOuvindo: false,
  relDias: 15, relDe: "", relAte: "", relBusy: false, relMsg: "", relArq: null,
  installEvt: null
};

/* ---------- utilidades de tela ---------- */
const nomeDe = uid => (S.caregivers[uid] && S.caregivers[uid].name) || "Alguém";
let sheetOnClose = null;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3400);
}
function openSheet(html, opts) {
  opts = opts || {};
  const ov = $("#ov"), p = $("#panel");
  p.innerHTML = html; ov.hidden = false;
  sheetOnClose = opts.onClose || null;
  setTimeout(() => { const f = p.querySelector("[autofocus]"); if (f) f.focus(); }, 30);
  tickStamp();
}
function closeSheet() {
  $("#ov").hidden = true; $("#panel").innerHTML = "";
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}
function tickStamp() {
  const d = new Date();
  document.querySelectorAll("[data-stamp]").forEach(el => { el.textContent = dmHm(d); });
}
const setErr = m => { const e = $("#f-err"); if (e) e.textContent = m || ""; };
const numVal = id => { const el = $("#" + id); const v = el && el.value.trim().replace(",", "."); return v === "" || v == null ? NaN : Number(v); };
const radio = nome => { const r = document.querySelector('input[name="' + nome + '"]:checked'); return r ? r.value : ""; };

async function guardado(fn, okMsg) {
  const b = $("#save"); if (b) b.disabled = true;
  try {
    await fn();
    closeSheet();
    if (okMsg) toast(okMsg);
  } catch (e) {
    if (b) b.disabled = false;
    if (e && e.code === "permission-denied") setErr("Não foi permitido. Se este registro já existe ou seu acesso foi alterado, fale com o administrador.");
    else setErr("Não foi possível salvar. Verifique a conexão e tente de novo.");
  }
}

/* ---------- login ---------- */
function authMsg(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return "Usuário ou senha incorretos.";
  if (c.includes("email-already-in-use")) return "Esse usuário já existe. Escolha outro nome de usuário ou use Entrar.";
  if (c.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (c.includes("network")) return "Sem internet. Tente de novo.";
  if (c.includes("too-many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (c.includes("operation-not-allowed")) return "Falta ativar o login por e-mail e senha no Firebase. Veja o passo 2 do COMO_CONFIGURAR.";
  return "Não foi possível continuar (" + (c || "erro") + ").";
}

function bannerIOS() {
  if (ehIOS() && !emModoApp()) {
    return '<div class="notice info"><b>iPhone:</b> para receber os avisos de remédio, toque em Compartilhar no Safari, depois em <b>Adicionar à Tela de Início</b>, e abra o app pelo ícone novo. Precisa do iOS 16.4 ou mais novo.</div>';
  }
  return "";
}

function renderAuth() {
  S.view = "auth";
  $("#top").hidden = true; $("#tabs").hidden = true;
  const m = S.authMode;
  const campos = {
    entrar: '<label class="fld">Usuário<input id="a-user" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus></label>' +
            '<label class="fld">Senha<input id="a-pass" type="password" autocomplete="current-password"></label>',
    novo: '<label class="fld">Seu nome<span class="u">como os outros cuidadores vão ver você</span><input id="a-nome" type="text" maxlength="40" autocomplete="name" placeholder="Ex.: Maria (filha)" autofocus></label>' +
          '<label class="fld">Código da família<span class="u">quem administra o app passa para você</span><input id="a-code" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>' +
          '<label class="fld">Usuário para entrar<span class="u">letras e números, sem espaços</span><input id="a-user" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></label>' +
          '<label class="fld">Crie uma senha<span class="u">mínimo de 6 caracteres</span><input id="a-pass" type="password" autocomplete="new-password"></label>',
    admin: '<label class="fld">Chave de instalação<span class="u">a que você colocou nas regras do Firestore</span><input id="a-key" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus></label>' +
           '<label class="fld">Nome da paciente<input id="a-pac" type="text" maxlength="80" value="' + esc(S.cfg.patientName) + '"></label>' +
           '<label class="fld">Seu nome<input id="a-nome" type="text" maxlength="40" autocomplete="name" placeholder="Ex.: Caio"></label>' +
           '<label class="fld">Seu usuário<input id="a-user" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></label>' +
           '<label class="fld">Sua senha<span class="u">mínimo de 6 caracteres</span><input id="a-pass" type="password" autocomplete="new-password"></label>' +
           '<label class="fld">Código da família<span class="u">os cuidadores digitam este código uma vez, para criar o acesso deles</span><input id="a-code" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>'
  };
  const rotulo = { entrar: "Entrar", novo: "Criar meu acesso", admin: "Instalar como administrador" };
  $("#main").innerHTML =
    '<div class="auth"><img class="logo" src="icons/icon-192.png" alt=""><div><h1>Cuidados da Vó</h1><p class="muted" style="margin:4px 0 0">Pressão, glicemia e remédios, compartilhados entre quem cuida.</p></div>' +
    bannerIOS() +
    (m === "admin" ? '<div class="notice info">Use esta opção só uma vez, na primeira instalação.</div>' :
      '<div class="seg" role="group"><button type="button" data-auth="entrar" aria-pressed="' + (m === "entrar") + '">Entrar</button><button type="button" data-auth="novo" aria-pressed="' + (m === "novo") + '">Primeiro acesso</button></div>') +
    (S.authMsg ? '<div class="notice bad">' + esc(S.authMsg) + "</div>" : "") +
    '<form id="f-auth" class="card stack" novalidate>' + campos[m] +
    '<label style="display:flex;gap:10px;align-items:center;font-size:.9rem"><input type="checkbox" id="a-show" style="width:22px;height:22px"> Mostrar a senha</label>' +
    '<p class="err" id="f-err" role="alert"></p>' +
    '<button class="btn primary block" id="a-go" type="submit">' + rotulo[m] + "</button></form>" +
    (m === "admin" ? '<button class="linkbtn" type="button" data-auth="entrar">Voltar</button>' :
      '<button class="linkbtn" type="button" data-auth="admin">Sou o administrador e vou instalar o app</button>') + "</div>";
}

async function enviarAuth() {
  const m = S.authMode;
  const usuario = normUser($("#a-user").value), senha = $("#a-pass").value;
  S.authMsg = ""; setErr("");
  if (usuario.length < 3) return setErr("O usuário precisa ter pelo menos 3 letras ou números, sem espaços.");
  if (senha.length < 6) return setErr("A senha precisa ter pelo menos 6 caracteres.");
  let nome = "", code = "", chave = "", pac = "";
  if (m !== "entrar") {
    nome = $("#a-nome").value.trim(); code = $("#a-code").value.trim().toUpperCase();
    if (!nome) return setErr("Escreva seu nome.");
    if (code.length < 4) return setErr("Informe o código da família (mínimo de 4 caracteres).");
  }
  if (m === "admin") {
    chave = $("#a-key").value.trim(); pac = $("#a-pac").value.trim();
    if (!chave) return setErr("Informe a chave de instalação.");
    if (!pac) return setErr("Informe o nome da paciente.");
  }
  const btn = $("#a-go"); btn.disabled = true;
  try {
    if (m === "entrar") {
      await signInWithEmailAndPassword(auth, emailDe(usuario), senha);
      return;
    }
    S.authBusy = true;
    const cred = await createUserWithEmailAndPassword(auth, emailDe(usuario), senha);
    try {
      if (m === "novo") {
        await setDoc(doc(db, "caregivers", cred.user.uid), { name: nome, username: usuario, joinCode: code, createdAt: serverTimestamp() });
      } else {
        const b = writeBatch(db);
        b.set(doc(db, "admins", cred.user.uid), { setupKey: chave, createdAt: serverTimestamp() });
        b.set(doc(db, "config", "app"), { patientName: pac, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo", createdAt: serverTimestamp() });
        b.set(doc(db, "config", "secret"), { joinCode: code });
        b.set(doc(db, "caregivers", cred.user.uid), { name: nome, username: usuario, createdAt: serverTimestamp() });
        await b.commit();
      }
    } catch (e) {
      try { await deleteUser(cred.user); } catch (x) { /* segue */ }
      if (e && e.code === "permission-denied") {
        throw Object.assign(new Error("negado"), { code: m === "novo" ? "x-codigo" : "x-chave" });
      }
      throw e;
    }
    S.authBusy = false;
    await entrar(cred.user);
  } catch (e) {
    S.authBusy = false;
    btn.disabled = false;
    if (e.code === "x-codigo") setErr("Código da família incorreto.");
    else if (e.code === "x-chave") setErr("Chave incorreta, ou o app já foi instalado por alguém. Veja o COMO_CONFIGURAR.");
    else setErr(authMsg(e));
  }
}

/* ---------- sessão ---------- */
function pararDados() {
  S.unsubs.forEach(u => { try { u(); } catch (e) { /* segue */ } });
  S.unsubs = [];
  S.caregivers = {}; S.meds = []; S.entries = []; S.err = null;
}

async function entrar(user) {
  S.uid = user.uid;
  try {
    const cg = await getDoc(doc(db, "caregivers", user.uid));
    if (!cg.exists()) {
      await signOut(auth);
      S.authMsg = "Seu acesso não está liberado. Use Primeiro acesso com o código da família.";
      S.authMode = "novo";
      renderAuth();
      return;
    }
    S.name = cg.data().name;
    const ad = await getDoc(doc(db, "admins", user.uid));
    S.isAdmin = ad.exists();
  } catch (e) {
    S.view = "auth";
    $("#main").innerHTML = '<div class="notice bad">Não foi possível abrir seus dados. Verifique a internet e <button class="linkbtn" type="button" data-act="recarregar">tente de novo</button>.</div>';
    return;
  }
  S.view = "app";
  $("#top").hidden = false; $("#tabs").hidden = false;
  iniciarDados();
  atualizarPush();
  render();
}

function iniciarDados() {
  pararDados();
  S.base0 = Date.now() - 60 * DIA;
  S.olderIni = S.base0; S.older = []; S.semMais = false;
  const falha = e => { S.err = (e && e.code) || "erro"; render(); };
  const lerDoc = d => {
    const x = d.data({ serverTimestamps: "estimate" });
    return Object.assign({}, x, { id: d.id, ms: x.ts && x.ts.toMillis ? x.ts.toMillis() : Date.now() });
  };
  S.unsubs.push(onSnapshot(collection(db, "caregivers"), s => {
    S.caregivers = {}; s.docs.forEach(d => { S.caregivers[d.id] = d.data(); });
    if (S.caregivers[S.uid]) S.name = S.caregivers[S.uid].name;
    render();
  }, falha));
  S.unsubs.push(onSnapshot(collection(db, "meds"), s => {
    S.meds = s.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    render();
  }, falha));
  S.unsubs.push(onSnapshot(
    query(collection(db, "entries"), where("ts", ">=", Timestamp.fromMillis(S.base0)), orderBy("ts", "desc"), limit(2500)),
    s => { S.entries = s.docs.map(lerDoc); render(); }, falha));
  S.unsubs.push(onSnapshot(doc(db, "config", "app"), s => {
    if (s.exists()) S.cfg = Object.assign({}, S.cfg, s.data());
    render();
  }, falha));
}

/* ---------- dados derivados ---------- */
const ultimo = filtro => S.entries.find(filtro);
/** Registros recentes (ao vivo) mais os antigos carregados sob demanda. */
const entradas = () => (S.older && S.older.length ? S.entries.concat(S.older) : S.entries);
const autorDe = e => (e.importado ? "histórico importado" : nomeDe(e.by));

async function carregarAntigos(ateMs) {
  if (S.carregandoAntigos || (S.semMais && !ateMs)) return;
  S.carregandoAntigos = true; render();
  try {
    const ini = ateMs ? Math.min(S.olderIni - 180 * DIA, ateMs - DIA) : S.olderIni - 180 * DIA;
    const snap = await getDocs(query(collection(db, "entries"),
      where("ts", ">=", Timestamp.fromMillis(ini)), where("ts", "<", Timestamp.fromMillis(S.olderIni)), orderBy("ts", "desc"), limit(4000)));
    const novos = snap.docs.map(d => {
      const x = d.data({ serverTimestamps: "estimate" });
      return Object.assign({}, x, { id: d.id, ms: x.ts && x.ts.toMillis ? x.ts.toMillis() : 0 });
    });
    S.olderIni = ini;
    if (!novos.length) S.semMais = true;
    const ids = new Set(S.older.map(e => e.id));
    S.older = S.older.concat(novos.filter(e => !ids.has(e.id))).sort((a, b) => b.ms - a.ms);
    toast(novos.length ? novos.length + " registros mais antigos carregados" : "Não há registros mais antigos");
  } catch (e) {
    toast("Não foi possível carregar o histórico antigo. Tente de novo.");
  }
  S.carregandoAntigos = false; render();
}
function rel(ms) {
  const m = Math.round((Date.now() - ms) / MIN);
  if (m < 1) return "agora mesmo";
  if (m < 60) return "há " + m + " min";
  const h = Math.floor(m / 60);
  if (h < 24) return "há " + h + " h";
  return dm(new Date(ms));
}
function slotsComStatus(ds) {
  const dadas = mapaDoses(S.entries);
  const agora = Date.now();
  return slotsDoDia(S.meds, ds).map(s => {
    const g = dadas[s.med.id + "|" + s.sched];
    let st = "futuro";
    if (g) st = "dado";
    else if (s.when.getTime() <= agora) st = agora - s.when.getTime() > 60 * MIN ? "atrasado" : "agora";
    return Object.assign({}, s, { key: s.med.id + "|" + s.sched, given: g, st });
  });
}
const pendentes = () => slotsComStatus(dayStr(new Date())).filter(s => s.st === "agora" || s.st === "atrasado");
const ehInsulina = m => m.kind === "insulina";
function textoDoseMed(m) {
  if (ehInsulina(m)) return m.mode === "glicemia" ? "dose conforme a glicemia" : fmtNum(m.units) + " UI";
  return m.dose || "";
}

/* ---------- telas ---------- */
function bloco(label, valor, unidade, sub) {
  return '<div class="read"><span class="lbl">' + label + '</span><span class="val">' + valor + "<small>" + unidade + "</small></span>" + sub + "</div>";
}
function cardUltima() {
  const pa = ultimo(e => e.type === "medicao" && e.sys != null);
  const gl = ultimo(e => e.type === "medicao" && e.glic != null);
  const c1 = pa
    ? bloco("Pressão", pa.sys + "/" + pa.dia, "mmHg", '<span class="when">' + rel(pa.ms) + " · " + hm(new Date(pa.ms)) + "<br>" + (pa.pulse != null ? "pulso " + pa.pulse + " · " : "") + (pa.importado ? "" : "por ") + esc(autorDe(pa)) + "</span>")
    : bloco("Pressão", "-", "", '<span class="when">Ainda sem registro</span>');
  const c2 = gl
    ? bloco("Glicemia", gl.glic, "mg/dL", '<span class="when">' + rel(gl.ms) + " · " + hm(new Date(gl.ms)) + "<br>" + esc(MOMENTOS[gl.momento] || "") + " · " + (gl.importado ? "" : "por ") + esc(autorDe(gl)) + "</span>")
    : bloco("Glicemia", "-", "", '<span class="when">Ainda sem registro</span>');
  return '<div class="card reads">' + c1 + c2 + "</div>";
}
function botaoDose(s, grande) {
  const ins = ehInsulina(s.med);
  const ask = !ins && S.confirm === s.key;
  const rot = ins ? "Aplicar" : (ask ? "Confirmar: já dei" : "Dei agora");
  const cls = ask ? "warn" : "primary";
  return '<button class="btn ' + (grande ? "" : "sm ") + cls + '" data-act="' + (ins ? "dose-ins" : "dose") + '" data-key="' + esc(s.key) + '">' + rot + "</button>";
}
function slotRow(s) {
  const m = s.med;
  let direita;
  if (s.st === "dado") direita = '<span class="chip ok">Dado ' + hm(new Date(s.given.ms)) + "</span>";
  else if (s.st === "futuro") direita = '<span class="chip mute">Mais tarde</span>';
  else direita = botaoDose(s, false);
  let sub = esc(textoDoseMed(m));
  if (s.st === "dado") {
    if (s.given.units != null && ehInsulina(m)) sub = esc(fmtNum(s.given.units) + " UI") + (s.given.site ? " · " + esc(LOCAIS[s.given.site] || "") : "");
    sub += " · por " + esc(nomeDe(s.given.by));
  }
  if (m.note && s.st !== "dado") sub += " · " + esc(m.note);
  if (s.st === "atrasado") sub += ' · <b style="color:var(--bad)">atrasado</b>';
  return '<li class="slot ' + (s.st === "dado" ? "done" : "") + '"><span class="tm">' + esc(s.time) + '</span><div class="nm"><b>' + esc(m.name) + "</b><span>" + sub + "</span></div><div>" + direita + "</div></li>";
}
function cardsInsulinaLivre(hoje) {
  const livres = S.meds.filter(m => m.active !== false && m.mode === "glicemia" && (!m.start || m.start <= hoje) && (!m.end || m.end >= hoje));
  return livres.map(m => {
    const doHoje = S.entries.filter(e => e.type === "dose" && e.medId === m.id && dayStr(new Date(e.ms)) === hoje).sort((a, b) => a.ms - b.ms);
    return '<div class="card stack" style="gap:10px"><div><b style="font-size:1.1rem">' + esc(m.name) + '</b><div class="muted small">Dose conforme a glicemia' + (m.note ? " · " + esc(m.note) : "") + "</div></div>" +
      (doHoje.length ? '<ul class="slots">' + doHoje.map(e => '<li class="slot"><span class="tm">' + hm(new Date(e.ms)) + '</span><div class="nm"><b>' + esc(fmtNum(e.units)) + ' UI</b><span>' + esc(LOCAIS[e.site] || "") + (e.glicBefore != null ? " · glicemia " + e.glicBefore : "") + " · por " + esc(nomeDe(e.by)) + "</span></div><span></span></li>").join("") + "</ul>" : '<div class="muted small">Nenhuma aplicação hoje.</div>') +
      '<button class="btn primary" data-act="dose-livre" data-id="' + esc(m.id) + '">Registrar aplicação</button></div>';
  }).join("");
}

function viewHoje() {
  const hoje = dayStr(new Date());
  const slots = slotsComStatus(hoje);
  const pend = slots.filter(s => s.st === "agora" || s.st === "atrasado");
  let h = "";
  if (pend.length) {
    h += '<section class="alert" aria-label="Remédios na hora"><h2>Hora do remédio</h2>' + pend.map(s =>
      '<div class="it"><div class="nm"><b>' + esc(s.med.name) + "</b><span>" + esc(textoDoseMed(s.med)) + " · marcado para " + esc(s.time) + (s.st === "atrasado" ? " · <b>atrasado</b>" : "") + "</span></div>" + botaoDose(s, true) + "</div>").join("") + "</section>";
  }
  h += '<div class="actions"><button class="btn primary" data-act="nova-medicao">Nova medição<small>pressão e glicemia, com data e hora automáticas</small></button></div>';
  h += '<div class="sec-title"><h2>Última medição</h2></div>' + cardUltima();
  h += '<div class="sec-title"><h2>Remédios de hoje</h2><span class="small muted">' + slots.filter(s => s.st === "dado").length + " de " + slots.length + " dados</span></div>";
  h += slots.length
    ? '<div class="card"><ul class="slots">' + slots.map(slotRow).join("") + "</ul></div>"
    : '<div class="card empty"><b>Nenhum remédio com horário hoje</b>Cadastre os remédios na aba Remédios para receber os avisos.</div>';
  h += cardsInsulinaLivre(hoje);
  if (S.pushState === "default" || S.pushState === "ios-install") {
    h += '<button class="btn" data-act="ajustes">Ativar avisos de remédio neste aparelho</button>';
  }
  h += '<p class="hint">Quando alguém marca uma dose como dada, todos veem na hora.</p>';
  return h;
}

function chartSvg(series, desde, ate) {
  const W = 360, H = 190, L = 36, R = 14, T = 12, B = 26;
  const vals = []; series.forEach(s => s.pts.forEach(p => vals.push(p.v)));
  if (!vals.length) return '<div class="empty">Sem medições neste período.</div>';
  let lo = Math.min(...vals) - 8, hi = Math.max(...vals) + 8;
  const span0 = hi - lo, step = span0 <= 110 ? 20 : span0 <= 260 ? 50 : 100;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const X = t => L + (t - desde) / (ate - desde) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = "";
  for (let v = lo; v <= hi; v += step) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + v + "</text>";
  const dias = Math.round((ate - desde) / DIA), nt = dias <= 7 ? dias : 4;
  for (let i = 0; i <= nt; i++) {
    const t = desde + (ate - desde) * i / nt;
    g += '<text class="ax" x="' + X(t) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? "start" : i === nt ? "end" : "middle") + '">' + dm(new Date(t)) + "</text>";
  }
  series.forEach(s => {
    const pts = s.pts.slice().sort((a, b) => a.t - b.t);
    if (pts.length > 1) g += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" points="' + pts.map(p => X(p.t).toFixed(1) + "," + Y(p.v).toFixed(1)).join(" ") + '"/>';
    pts.forEach(p => { g += '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3.5" fill="' + s.color + '" stroke="var(--surface)" stroke-width="1.5"/>'; });
  });
  return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico das medições">' + g + "</svg>";
}

function botaoCorrigir(e) {
  return S.isAdmin ? '<button class="btn sm" data-act="edit-entry" data-id="' + esc(e.id) + '">Corrigir</button>' : "";
}
function rodape(e) {
  let by = '<span class="by">' + (e.importado ? "" : "por ") + esc(autorDe(e)) + (e.editedAt ? " · corrigido pelo administrador" : "") + "</span>";
  if (e.note) by += '<span class="by">“' + esc(e.note) + "”</span>";
  return by;
}
function linhaMedicao(e) {
  const d = new Date(e.ms);
  let main = '<div class="l">';
  if (e.sys != null) main += "<b>" + e.sys + "/" + e.dia + ' <span class="muted small">mmHg' + (e.pulse != null ? " · pulso " + e.pulse : "") + "</span></b>";
  if (e.glic != null) main += "<b>" + e.glic + ' <span class="muted small">mg/dL · ' + esc((MOMENTOS[e.momento] || "").toLowerCase()) + "</span></b>";
  main += "</div>";
  return '<li class="row"><span class="tm">' + hm(d) + '</span><div class="mn">' + main + rodape(e) + '</div><div class="sd">' + botaoCorrigir(e) + "</div></li>";
}
function linhaDose(e) {
  const d = new Date(e.ms);
  let sub = esc(e.doseText || "");
  if (e.kind === "insulina") sub = esc(fmtNum(e.units) + " UI") + (e.site ? " · " + esc(LOCAIS[e.site] || "") : "") + (e.glicBefore != null ? " · glicemia antes: " + e.glicBefore : "");
  if (e.sched) sub += " · marcado para " + esc(e.sched.split("T")[1]);
  return '<li class="row"><span class="tm">' + hm(d) + '</span><div class="mn"><b>' + esc(e.medName) + '</b><span class="by">' + sub + "</span>" + rodape(e) + '</div><div class="sd"><span class="chip ok">Dado</span>' + botaoCorrigir(e) + "</div></li>";
}

function viewHist() {
  let h = '<div class="seg" role="group" aria-label="Tipo de registro"><button type="button" data-act="hist" data-v="med" aria-pressed="' + (S.hist === "med") + '">Pressão e glicemia</button><button type="button" data-act="hist" data-v="dose" aria-pressed="' + (S.hist === "dose") + '">Remédios</button></div>';
  const tipo = S.hist === "med" ? "medicao" : "dose";
  const lista = entradas().filter(e => e.type === tipo);
  if (tipo === "medicao") {
    const ate = Date.now();
    const desde = S.range === "all" ? Math.min(ate - 7 * DIA, ...lista.map(e => e.ms)) : ate - S.range * DIA;
    const dentro = lista.filter(e => e.ms >= desde);
    const pr = (v, t) => '<button class="pill" data-act="range" data-v="' + v + '" aria-pressed="' + (S.range === (v === "all" ? "all" : Number(v))) + '">' + t + "</button>";
    h += '<div class="pills" role="group" aria-label="Período">' + pr(7, "7 dias") + pr(30, "30 dias") + pr(90, "90 dias") + pr("all", "Tudo que está carregado") + "</div>";
    h += '<div class="card stack" style="gap:10px"><div class="legend"><span><i style="background:var(--c1)"></i>Máxima</span><span><i style="background:var(--c2)"></i>Mínima</span><span>Pressão (mmHg)</span></div>' +
      chartSvg([{ color: "var(--c1)", pts: dentro.filter(e => e.sys != null).map(e => ({ t: e.ms, v: e.sys })) }, { color: "var(--c2)", pts: dentro.filter(e => e.sys != null).map(e => ({ t: e.ms, v: e.dia })) }], desde, ate) + "</div>";
    h += '<div class="card stack" style="gap:10px"><div class="legend"><span><i style="background:var(--c1)"></i>Glicemia (mg/dL)</span></div>' +
      chartSvg([{ color: "var(--c1)", pts: dentro.filter(e => e.glic != null).map(e => ({ t: e.ms, v: e.glic })) }], desde, ate) + "</div>";
  }
  if (!lista.length) {
    h += '<div class="card empty"><b>Nada registrado ainda</b>Os registros de todos os cuidadores aparecem aqui.</div>';
  } else {
    const grupos = new Map();
    lista.slice(0, S.more).forEach(e => { const k = dayStr(new Date(e.ms)); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    const hoje = dayStr(new Date()), ontem = dayStr(new Date(Date.now() - DIA));
    grupos.forEach((arr, k) => {
      const lab = k === hoje ? "Hoje" : k === ontem ? "Ontem" : shortDay(new Date(arr[0].ms));
      h += '<div><div class="day">' + esc(lab) + " · " + arr.length + (arr.length === 1 ? " registro" : " registros") + '</div><ul class="rows">' + arr.map(tipo === "medicao" ? linhaMedicao : linhaDose).join("") + "</ul></div>";
    });
    if (lista.length > S.more) h += '<button class="btn" data-act="more">Mostrar mais registros</button>';
  }
  if (!S.semMais) h += '<button class="btn" data-act="antigos"' + (S.carregandoAntigos ? " disabled" : "") + ">" + (S.carregandoAntigos ? "Carregando…" : "Carregar histórico mais antigo") + '</button><p class="hint">O app mostra os últimos 60 dias ao vivo. Cada toque busca mais 6 meses para trás.</p>';
  return h;
}

function duracaoMed(m) {
  const hoje = dayStr(new Date());
  if (m.active === false) return { t: "Suspenso", c: "mute" };
  if (m.start && m.start > hoje) return { t: "Começa em " + dm(new Date(m.start + "T00:00")), c: "acc" };
  if (!m.end) return { t: "Uso contínuo", c: "acc" };
  if (m.end < hoje) return { t: "Encerrado em " + dm(new Date(m.end + "T00:00")), c: "mute" };
  const falta = Math.round((new Date(m.end + "T00:00") - new Date(hoje + "T00:00")) / DIA);
  return { t: "Até " + dm(new Date(m.end + "T00:00")) + (falta === 0 ? " (último dia)" : " · faltam " + falta + " dias"), c: "warn" };
}
function cardMed(m) {
  const du = duracaoMed(m);
  const tipoIns = m.insulinType && !m.name.toLowerCase().includes(m.insulinType.toLowerCase()) ? "Insulina " + m.insulinType + " · " : "";
  const sub = ehInsulina(m) ? tipoIns + textoDoseMed(m) : (m.dose || "");
  return '<article class="card med"><div class="hd"><div style="min-width:0"><b>' + esc(m.name) + '</b><div class="muted">' + esc(sub) + '</div></div><span class="chip ' + du.c + '">' + esc(du.t) + "</span></div>" +
    (m.mode === "glicemia" ? '<div class="small muted">Sem horário fixo: a dose é registrada a cada aplicação.</div>' : '<div class="times">' + (m.times || []).map(t => '<span class="mono">' + esc(t) + "</span>").join("") + "</div>") +
    (m.note ? '<div class="small muted">' + esc(m.note) + "</div>" : "") +
    '<div class="small muted">Cadastrado por ' + esc(nomeDe(m.by)) + "</div>" +
    (S.isAdmin ? '<div><button class="btn sm" data-act="edit-med" data-id="' + esc(m.id) + '">Corrigir ou encerrar</button></div>' : "") + "</article>";
}
function viewMeds() {
  const hoje = dayStr(new Date());
  const ms = S.meds.slice().sort((a, b) => a.name.localeCompare(b.name));
  const em = ms.filter(m => m.active !== false && (!m.end || m.end >= hoje));
  const velhos = ms.filter(m => !em.includes(m));
  let h = '<button class="btn primary" data-act="novo-med">Cadastrar remédio</button>';
  h += '<div class="sec-title"><h2>Em uso</h2><span class="small muted">' + em.length + "</span></div>";
  h += em.length ? em.map(cardMed).join("") : '<div class="card empty"><b>Nenhum remédio cadastrado</b>Informe nome, dose e horários. Todos os cuidadores passam a ver a lista e a receber o aviso na hora certa.</div>';
  if (velhos.length) h += '<div class="sec-title"><h2>Encerrados ou suspensos</h2></div>' + velhos.map(cardMed).join("");
  h += '<p class="hint">Depois de cadastrado, só o administrador corrige ou encerra um remédio.</p>';
  return h;
}

function viewRel() {
  const pill = (v, t) => '<button class="pill" data-act="rel-dias" data-v="' + v + '" aria-pressed="' + (String(S.relDias) === String(v)) + '">' + t + "</button>";
  let h = '<div class="card stack"><div><h2>Relatório para o médico</h2><p class="muted small" style="margin:4px 0 0">Pressão e glicemia juntas, remédios, aplicações de insulina e gráficos do período.</p></div>';
  h += '<div class="pills" role="group" aria-label="Período">' + pill(7, "7 dias") + pill(15, "15 dias") + pill(30, "30 dias") + pill(60, "60 dias") + pill("x", "Escolher datas") + "</div>";
  if (S.relDias === "x") {
    h += '<div class="fields"><label class="fld">De<input id="r-de" type="date" value="' + esc(S.relDe) + '"></label><label class="fld">Até<input id="r-ate" type="date" value="' + esc(S.relAte) + '"></label></div>';
  }
  h += '<div class="btns"><button class="btn primary" data-act="rel-pdf"' + (S.relBusy ? " disabled" : "") + '>Gerar PDF</button><button class="btn" data-act="rel-csv"' + (S.relBusy ? " disabled" : "") + ">Gerar planilha</button></div>";
  if (S.relMsg) h += '<p class="err" role="alert">' + esc(S.relMsg) + "</p>";
  if (S.relBusy) h += '<p class="hint">Preparando o documento…</p>';
  h += "</div>";
  if (S.relArq) {
    h += '<div class="card stack"><div><b>Documento pronto</b><div class="small muted" style="overflow-wrap:anywhere">' + esc(S.relArq.nome) + '</div></div><div class="btns">' +
      ((navigator.share && navigator.canShare) ? '<button class="btn primary" data-act="rel-share">Compartilhar</button>' : "") +
      '<button class="btn" data-act="rel-baixar">Baixar</button></div><button class="linkbtn" data-act="rel-limpar" type="button">Descartar</button></div>';
  }
  return h;
}

function render() {
  if (S.view !== "app") return;
  const t = new Date();
  $("#today-date").textContent = longDay(t);
  $("#who").innerHTML = "<b>" + esc(S.name) + "</b>" + (S.isAdmin ? " · admin" : "");
  document.querySelectorAll(".tabs button").forEach(b => {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const n = pendentes().length;
  const dot = $("#dot"); dot.hidden = !n; dot.textContent = n;
  document.title = (n ? "(" + n + ") " : "") + "Cuidados da Vó";
  let h = "";
  if (S.err === "permission-denied") h += '<div class="notice bad">Seu acesso foi removido ou ainda não foi liberado. Fale com o administrador do app.</div>';
  else if (S.err) h += '<div class="notice bad">Problema ao sincronizar (' + esc(S.err) + "). Se os dados não atualizarem, feche e abra o app.</div>";
  if (!navigator.onLine) h += '<div class="notice">Sem internet. O que você registrar fica guardado e é enviado quando a conexão voltar.</div>';
  h += S.tab === "hoje" ? viewHoje() : S.tab === "hist" ? viewHist() : S.tab === "meds" ? viewMeds() : viewRel();
  $("#main").innerHTML = h;
}

/* ---------- registros ---------- */
function registrarDose(med, sched, extra) {
  const base = { type: "dose", medId: med.id, medName: med.name, kind: med.kind || "outro", doseText: textoDoseMed(med), by: S.uid, ts: serverTimestamp() };
  if (sched) base.sched = sched;
  Object.assign(base, extra || {});
  if (sched) return setDoc(doc(db, "entries", "dose_" + med.id + "_" + sched.replace(/[-:]/g, "")), base);
  return addDoc(collection(db, "entries"), base);
}

function sheetMedicao() {
  openSheet('<h2>Nova medição</h2><div class="stamp">Será registrada em <b data-stamp></b> (hora deste aparelho)</div>' +
    '<p class="hint" style="margin-top:-6px">Preencha só o que foi medido.</p>' +
    '<div class="sect" style="border:0;padding:0"><b>Pressão arterial</b><div class="fields">' +
    '<label class="fld">Máxima<span class="u">o número maior</span><input class="big" id="f-sys" type="number" inputmode="numeric" min="50" max="260" autofocus></label>' +
    '<label class="fld">Mínima<span class="u">o número menor</span><input class="big" id="f-dia" type="number" inputmode="numeric" min="30" max="160"></label>' +
    '<label class="fld">Pulso<span class="u">opcional, bpm</span><input class="big" id="f-pul" type="number" inputmode="numeric" min="30" max="220"></label></div></div>' +
    '<div class="sect"><b>Glicemia</b><label class="fld">Valor<span class="u">mg/dL</span><input class="big" id="f-glic" type="number" inputmode="numeric" min="20" max="600"></label>' +
    '<div class="fld" role="group" aria-label="Momento">Momento da medição<div class="opts">' + Object.keys(MOMENTOS).map(k => '<label><input type="radio" name="f-mom" value="' + k + '"><span>' + MOMENTOS[k] + "</span></label>").join("") + "</div></div></div>" +
    '<label class="fld">Observação (opcional)<input id="f-note" type="text" maxlength="140" placeholder="Ex.: sentada, tontura"></label>' +
    '<p class="err" id="f-err" role="alert"></p><p class="hint">Depois de salvo, só o administrador consegue corrigir.</p>' +
    '<div class="btns"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Salvar</button></div>');
  $("#save").onclick = () => {
    const s = numVal("f-sys"), d = numVal("f-dia"), pl = numVal("f-pul"), gl = numVal("f-glic");
    const temPA = !isNaN(s) || !isNaN(d), temGl = !isNaN(gl);
    if (!temPA && !temGl) return setErr("Informe a pressão, a glicemia ou as duas.");
    const data = { type: "medicao", by: S.uid, ts: serverTimestamp() };
    if (temPA) {
      if (!(s >= 50 && s <= 260)) return setErr("Informe a máxima entre 50 e 260.");
      if (!(d >= 30 && d <= 160)) return setErr("Informe a mínima entre 30 e 160.");
      if (s <= d) return setErr("A máxima precisa ser maior que a mínima.");
      data.sys = Math.round(s); data.dia = Math.round(d);
      if (!isNaN(pl)) { if (!(pl >= 30 && pl <= 220)) return setErr("O pulso deve estar entre 30 e 220."); data.pulse = Math.round(pl); }
    }
    if (temGl) {
      if (!(gl >= 20 && gl <= 600)) return setErr("Informe a glicemia entre 20 e 600 mg/dL.");
      const m = radio("f-mom");
      if (!m) return setErr("Escolha o momento da glicemia (por exemplo, em jejum).");
      data.glic = Math.round(gl); data.momento = m;
    }
    const nota = $("#f-note").value.trim(); if (nota) data.note = nota;
    guardado(() => addDoc(collection(db, "entries"), data), "Medição registrada");
  };
}

function sugestaoLocal(medId) {
  const ult = S.entries.find(e => e.type === "dose" && e.kind === "insulina" && e.site);
  if (!ult) return RODIZIO[0];
  const i = RODIZIO.indexOf(ult.site);
  return RODIZIO[(i + 1) % RODIZIO.length];
}
function sheetInsulina(med, sched) {
  const sug = sugestaoLocal(med.id);
  const ultLocal = S.entries.find(e => e.type === "dose" && e.kind === "insulina" && e.site);
  const gl = S.entries.find(e => e.type === "medicao" && e.glic != null && Date.now() - e.ms < 3 * 60 * MIN);
  openSheet("<h2>Aplicar insulina</h2>" +
    '<p class="muted" style="margin:0">' + esc(med.name) + (med.mode === "glicemia" ? " · dose conforme a glicemia" : " · prescrita: " + esc(fmtNum(med.units)) + " UI" + (sched ? " · marcada para " + esc(sched.split("T")[1]) : "")) + "</p>" +
    '<div class="stamp">Será registrada em <b data-stamp></b> (hora deste aparelho)</div>' +
    '<label class="fld">Dose aplicada<span class="u">unidades (UI)</span><input class="big" id="f-un" type="number" inputmode="decimal" step="0.5" min="0.5" max="300" value="' + (med.mode === "glicemia" ? "" : esc(med.units)) + '" autofocus></label>' +
    '<div class="fld" role="group" aria-label="Local">Local da aplicação<div class="opts">' + RODIZIO.map(k => '<label><input type="radio" name="f-loc" value="' + k + '"' + (k === sug ? " checked" : "") + "><span>" + LOCAIS[k] + "</span></label>").join("") + "</div>" +
    '<span class="u">' + (ultLocal ? "Última vez: " + esc(LOCAIS[ultLocal.site]) + ", " + esc(dmHm(new Date(ultLocal.ms))) + ". Sugerido: " + esc(LOCAIS[sug]) + "." : "Sem aplicação anterior registrada.") + "</span></div>" +
    '<label class="fld">Glicemia antes (opcional)<span class="u">mg/dL' + (gl ? " · da medição das " + hm(new Date(gl.ms)) : "") + '</span><input id="f-gb" type="number" inputmode="numeric" min="20" max="600" value="' + (gl ? gl.glic : "") + '"></label>' +
    '<label class="fld">Observação (opcional)<input id="f-note" type="text" maxlength="140"></label>' +
    '<p class="err" id="f-err" role="alert"></p><p class="hint">Depois de salvo, só o administrador consegue corrigir.</p>' +
    '<div class="btns"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Confirmar aplicação</button></div>');
  $("#save").onclick = () => {
    const un = numVal("f-un"), gb = numVal("f-gb"), loc = radio("f-loc");
    if (!(un >= 0.5 && un <= 300)) return setErr("Informe a dose em unidades (entre 0,5 e 300).");
    if (!loc) return setErr("Escolha o local da aplicação.");
    const extra = { units: un, site: loc, doseText: fmtNum(un) + " UI" };
    if (!isNaN(gb)) { if (!(gb >= 20 && gb <= 600)) return setErr("Confira a glicemia anterior."); extra.glicBefore = Math.round(gb); }
    const nota = $("#f-note").value.trim(); if (nota) extra.note = nota;
    guardado(() => registrarDose(med, sched, extra), "Aplicação registrada");
  };
}

function linhaHorario(v) {
  return '<div class="trow"><input type="time" value="' + esc(v || "") + '" aria-label="Horário" style="min-height:56px;border:2px solid var(--line);border-radius:12px;padding:0 14px;background:var(--bg);font-size:1.15rem"><button type="button" class="btn sm" data-rmtime>Remover</button></div>';
}
function sheetMed(m) {
  const edit = !!m;
  const kind = m ? (m.kind || "outro") : "comprimido";
  const times = m && m.times && m.times.length ? m.times : ["08:00"];
  const cont = edit ? !m.end : true;
  const mode = m && m.mode === "glicemia" ? "glicemia" : "fixo";
  openSheet("<h2>" + (edit ? "Corrigir remédio" : "Cadastrar remédio") + "</h2>" +
    '<div class="fld" role="group" aria-label="Tipo">Tipo<div class="opts">' + Object.keys(TIPOS).map(k => '<label><input type="radio" name="f-kind" value="' + k + '"' + (k === kind ? " checked" : "") + "><span>" + TIPOS[k] + "</span></label>").join("") + "</div></div>" +
    '<label class="fld">Nome<span class="u" id="u-nome"></span><input id="f-name" type="text" maxlength="80" value="' + esc(m && m.name) + '" autofocus></label>' +
    '<div id="w-ins" class="stack" style="gap:16px"><div class="fld" role="group" aria-label="Tipo de insulina">Tipo de insulina<div class="opts">' + INSULINAS.map(k => '<label><input type="radio" name="f-it" value="' + k + '"' + (m && m.insulinType === k ? " checked" : "") + "><span>" + k + "</span></label>").join("") + "</div></div>" +
    '<div class="fld" role="group" aria-label="Quando aplicar">Quando aplicar<div class="opts"><label><input type="radio" name="f-mode" value="fixo"' + (mode === "fixo" ? " checked" : "") + '><span>Horários fixos</span></label><label><input type="radio" name="f-mode" value="glicemia"' + (mode === "glicemia" ? " checked" : "") + '><span>Conforme a glicemia</span></label></div><span class="u">Em "conforme a glicemia" a dose é digitada a cada aplicação.</span></div>' +
    '<label class="fld" id="w-units">Dose prescrita<span class="u">unidades (UI)</span><input id="f-units" type="number" inputmode="decimal" step="0.5" min="0.5" max="300" value="' + esc(m && m.units) + '"></label></div>' +
    '<label class="fld" id="w-dose">Dose<span class="u">Ex.: 50 mg, 1 comprimido, 20 gotas</span><input id="f-dose" type="text" maxlength="80" value="' + esc(m && m.dose) + '"></label>' +
    '<div class="fld" id="w-times">Horários do dia<div id="f-times">' + times.map(linhaHorario).join("") + '</div><button type="button" class="btn sm" id="add-time" style="align-self:flex-start">Adicionar horário</button></div>' +
    '<div class="fld" role="group" aria-label="Duração">Duração<div class="opts"><label><input type="radio" name="f-dur" value="cont"' + (cont ? " checked" : "") + '><span>Uso contínuo</span></label><label><input type="radio" name="f-dur" value="lim"' + (cont ? "" : " checked") + "><span>Por um período</span></label></div></div>" +
    '<div class="fields"><label class="fld">Começa em<input id="f-start" type="date" value="' + esc((m && m.start) || dayStr(new Date())) + '"></label>' +
    '<label class="fld" id="end-wrap"' + (cont ? " hidden" : "") + '>Termina em<input id="f-end" type="date" value="' + esc((m && m.end) || "") + '"></label></div>' +
    '<label class="fld">Observação (opcional)<input id="f-note" type="text" maxlength="140" value="' + esc(m && m.note) + '" placeholder="Ex.: depois do café da manhã"></label>' +
    (edit ? '<div class="fld" role="group" aria-label="Situação">Situação<div class="opts"><label><input type="radio" name="f-act" value="1"' + (m.active !== false ? " checked" : "") + '><span>Em uso</span></label><label><input type="radio" name="f-act" value="0"' + (m.active === false ? " checked" : "") + "><span>Suspenso</span></label></div></div>" : "") +
    '<p class="err" id="f-err" role="alert"></p>' +
    '<p class="hint">' + (edit ? "Como administrador, você pode corrigir qualquer remédio." : "Depois de cadastrado, só o administrador consegue corrigir.") + "</p>" +
    '<div class="btns"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Salvar</button></div>' +
    (edit ? '<button class="btn danger" id="del">Apagar remédio</button>' : ""));
  const p = $("#panel");
  const sync = () => {
    const ins = radio("f-kind") === "insulina";
    const livre = ins && radio("f-mode") === "glicemia";
    $("#w-ins").hidden = !ins; $("#w-dose").hidden = ins; $("#w-times").hidden = livre;
    $("#w-units").hidden = livre;
    $("#u-nome").textContent = ins ? "Marca ou nome. Se deixar em branco, usa o tipo de insulina." : "";
    $("#end-wrap").hidden = radio("f-dur") === "cont";
  };
  p.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener("change", sync));
  sync();
  $("#add-time").onclick = () => { $("#f-times").insertAdjacentHTML("beforeend", linhaHorario("")); };
  p.onclick = ev => {
    const b = ev.target.closest("[data-rmtime]");
    if (b && $("#f-times").children.length > 1) b.parentElement.remove();
  };
  $("#save").onclick = () => {
    const k = radio("f-kind"), ins = k === "insulina";
    const livre = ins && radio("f-mode") === "glicemia";
    let nome = $("#f-name").value.trim();
    const it = radio("f-it");
    if (ins) {
      if (!it) return setErr("Escolha o tipo de insulina.");
      if (!nome) nome = "Insulina " + it;
    }
    const dose = $("#f-dose").value.trim();
    const un = numVal("f-units");
    const times = [...new Set([...document.querySelectorAll("#f-times input")].map(i => i.value).filter(Boolean))].sort();
    const cont2 = radio("f-dur") === "cont";
    const ini = $("#f-start").value, fim = $("#f-end").value;
    if (!nome) return setErr("Informe o nome do remédio.");
    if (!ins && !dose) return setErr("Informe a dose.");
    if (ins && !livre && !(un >= 0.5 && un <= 300)) return setErr("Informe a dose prescrita em unidades (UI).");
    if (!livre && !times.length) return setErr("Informe pelo menos um horário.");
    if (!ini) return setErr("Informe quando começa.");
    if (!cont2 && !fim) return setErr("Informe quando termina.");
    if (!cont2 && fim < ini) return setErr("A data final precisa ser depois da inicial.");
    const data = {
      name: nome, kind: k, dose: ins ? "" : dose, mode: livre ? "glicemia" : "fixo", times: livre ? [] : times,
      start: ini, end: cont2 ? null : fim, continuous: cont2, note: $("#f-note").value.trim()
    };
    if (ins) { data.insulinType = it; data.units = (livre && isNaN(un)) ? null : un; }
    if (edit) {
      data.active = radio("f-act") === "1"; data.editedAt = serverTimestamp(); data.editedBy = S.uid;
      guardado(() => updateDoc(doc(db, "meds", m.id), data), "Remédio corrigido");
    } else {
      data.active = true; data.by = S.uid; data.createdAt = serverTimestamp();
      guardado(() => addDoc(collection(db, "meds"), data), "Remédio cadastrado");
    }
  };
  if (edit) {
    $("#del").onclick = function () {
      if (!this.dataset.ask) { this.dataset.ask = "1"; this.textContent = "Toque de novo para apagar de vez"; return; }
      guardado(() => deleteDoc(doc(db, "meds", m.id)), "Remédio apagado");
    };
  }
}

function paraInputLocal(ms) { const d = new Date(ms); return dayStr(d) + "T" + hm(d); }
function sheetEditarRegistro(e) {
  let campos = "";
  if (e.type === "medicao") {
    campos = '<div class="fields"><label class="fld">Máxima<input class="big" id="f-sys" type="number" inputmode="numeric" value="' + esc(e.sys) + '"></label><label class="fld">Mínima<input class="big" id="f-dia" type="number" inputmode="numeric" value="' + esc(e.dia) + '"></label><label class="fld">Pulso<input class="big" id="f-pul" type="number" inputmode="numeric" value="' + esc(e.pulse) + '"></label></div>' +
      '<label class="fld">Glicemia (mg/dL)<input class="big" id="f-glic" type="number" inputmode="numeric" value="' + esc(e.glic) + '"></label>' +
      '<div class="fld" role="group" aria-label="Momento">Momento<div class="opts">' + Object.keys(MOMENTOS).map(k => '<label><input type="radio" name="f-mom" value="' + k + '"' + (e.momento === k ? " checked" : "") + "><span>" + MOMENTOS[k] + "</span></label>").join("") + "</div></div>";
  } else if (e.kind === "insulina") {
    campos = '<p style="margin:0">' + esc(e.medName) + '</p><label class="fld">Dose (UI)<input class="big" id="f-un" type="number" inputmode="decimal" step="0.5" value="' + esc(e.units) + '"></label>' +
      '<div class="fld" role="group" aria-label="Local">Local<div class="opts">' + RODIZIO.map(k => '<label><input type="radio" name="f-loc" value="' + k + '"' + (e.site === k ? " checked" : "") + "><span>" + LOCAIS[k] + "</span></label>").join("") + "</div></div>" +
      '<label class="fld">Glicemia antes<input id="f-gb" type="number" inputmode="numeric" value="' + esc(e.glicBefore) + '"></label>';
  } else {
    campos = "<p style=\"margin:0\">" + esc(e.medName) + " · " + esc(e.doseText || "") + "</p>";
  }
  openSheet("<h2>Corrigir registro</h2><p class=\"hint\">Registro de " + esc(nomeDe(e.by)) + ". A correção fica marcada como feita pelo administrador.</p>" + campos +
    '<label class="fld">Data e hora<input id="f-dt" type="datetime-local" value="' + paraInputLocal(e.ms) + '"></label>' +
    '<label class="fld">Observação<input id="f-note" type="text" maxlength="140" value="' + esc(e.note) + '"></label>' +
    '<p class="err" id="f-err" role="alert"></p>' +
    '<div class="btns"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">Salvar</button></div>' +
    '<button class="btn danger" id="del">Apagar registro</button>');
  const ref = doc(db, "entries", e.id);
  $("#save").onclick = () => {
    const ms = new Date($("#f-dt").value).getTime();
    if (isNaN(ms)) return setErr("Data e hora inválidas.");
    const data = { ts: Timestamp.fromMillis(ms), note: $("#f-note").value.trim(), editedAt: serverTimestamp(), editedBy: S.uid };
    if (e.type === "medicao") {
      const s = numVal("f-sys"), d = numVal("f-dia"), pl = numVal("f-pul"), gl = numVal("f-glic");
      if (!isNaN(s) || !isNaN(d)) { if (!(s >= 50 && s <= 260 && d >= 30 && d <= 160 && s > d)) return setErr("Confira a máxima e a mínima."); data.sys = Math.round(s); data.dia = Math.round(d); } else { data.sys = null; data.dia = null; }
      data.pulse = isNaN(pl) ? null : Math.round(pl);
      if (!isNaN(gl)) { if (!(gl >= 20 && gl <= 600)) return setErr("Confira a glicemia."); data.glic = Math.round(gl); data.momento = radio("f-mom") || e.momento || "outro"; } else { data.glic = null; }
      if (data.sys == null && data.glic == null) return setErr("Deixe pelo menos a pressão ou a glicemia.");
    } else if (e.kind === "insulina") {
      const un = numVal("f-un"), gb = numVal("f-gb");
      if (!(un >= 0.5 && un <= 300)) return setErr("Confira a dose.");
      data.units = un; data.doseText = fmtNum(un) + " UI"; data.site = radio("f-loc") || e.site || null;
      data.glicBefore = isNaN(gb) ? null : Math.round(gb);
    }
    guardado(() => updateDoc(ref, data), "Registro corrigido");
  };
  $("#del").onclick = function () {
    if (!this.dataset.ask) { this.dataset.ask = "1"; this.textContent = "Toque de novo para apagar de vez"; return; }
    guardado(() => deleteDoc(ref), "Registro apagado");
  };
}

/* ---------- avisos (notificações) ---------- */
const avisosDesligados = () => { try { return localStorage.getItem("avisos-off") === "1"; } catch (e) { return false; } };
const marcarAvisos = off => { try { if (off) localStorage.setItem("avisos-off", "1"); else localStorage.removeItem("avisos-off"); } catch (e) { /* segue */ } };

async function atualizarPush() {
  if (ehIOS() && !emModoApp()) S.pushState = "ios-install";
  else if (!("Notification" in window) || !("serviceWorker" in navigator)) S.pushState = "unsupported";
  else S.pushState = Notification.permission;
  if (S.pushState === "granted" && !avisosDesligados()) registrarToken();
}
async function registrarToken() {
  try {
    if (!vapidKey || /COLE/i.test(vapidKey)) return;
    const m = await obterMessaging();
    if (!m) { S.pushState = "unsupported"; return; }
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(m, { vapidKey, serviceWorkerRegistration: reg });
    if (token) await setDoc(doc(db, "tokens", token), { uid: S.uid, ua: navigator.userAgent.slice(0, 140), updatedAt: serverTimestamp() });
    if (!S.msgOuvindo) {
      S.msgOuvindo = true;
      onMessage(m, p => { const d = (p && p.data) || {}; toast(d.body || "Hora do remédio"); render(); });
    }
  } catch (e) {
    S.pushErro = (e && e.code) || "erro";
  }
}
async function ativarAvisos() {
  try {
    const perm = await Notification.requestPermission();
    S.pushState = perm;
    if (perm === "granted") { marcarAvisos(false); await registrarToken(); }
  } catch (e) { /* segue */ }
  sheetAjustes();
}

async function desativarAvisos() {
  try {
    const m = await obterMessaging();
    if (m) {
      const reg = await navigator.serviceWorker.ready;
      const token = await getToken(m, { vapidKey, serviceWorkerRegistration: reg });
      if (token) await deleteDoc(doc(db, "tokens", token)).catch(() => {});
      await deleteToken(m);
    }
  } catch (e) { /* segue */ }
  marcarAvisos(true);
  sheetAjustes();
}

function tick() {
  const now = new Date();
  $("#clock").textContent = hm(now);
  tickStamp();
  if (S.view !== "app") return;
  const sig = pendentes().map(s => s.key).join(",");
  const minuto = dayStr(now) + hm(now);
  if (sig !== S.sig) { S.sig = sig; render(); }
  else if (minuto !== S.lastMinute) { S.lastMinute = minuto; render(); }
}

/* ---------- ajustes ---------- */
async function sheetAjustes() {
  let avisos;
  if (S.pushState === "granted" && avisosDesligados()) avisos = '<div class="notice">Avisos desligados neste aparelho.</div><button class="btn primary block" id="b-avisos">Ligar os avisos de novo</button>';
  else if (S.pushState === "granted") avisos = '<div class="notice info">Avisos ativados neste aparelho. Você recebe uma notificação na hora de cada remédio, sem alarme.</div><button class="btn block" id="b-desligar">Desligar avisos neste aparelho</button><p class="hint">O som e a vibração são os do próprio celular. Para mudar, abra as configurações de notificação do aparelho.</p>';
  else if (S.pushState === "denied") avisos = '<div class="notice bad">Os avisos estão bloqueados neste aparelho. Libere nas configurações do navegador ou do app e abra de novo.</div>';
  else if (S.pushState === "ios-install") avisos = '<div class="notice info"><b>iPhone:</b> toque em Compartilhar no Safari, depois em <b>Adicionar à Tela de Início</b>. Abra o app pelo ícone novo e volte aqui para ativar os avisos. Precisa do iOS 16.4 ou mais novo.</div>';
  else if (S.pushState === "unsupported") avisos = '<div class="notice">Este navegador não recebe avisos. O app ainda avisa quando está aberto.</div>';
  else avisos = '<button class="btn primary block" id="b-avisos">Ativar avisos de remédio</button>';
  const instalar = S.installEvt ? '<button class="btn block" id="b-instalar">Instalar o app neste aparelho</button>' : "";
  openSheet("<h2>Ajustes</h2>" +
    '<div class="sect" style="border:0;padding:0"><label class="fld">Seu nome no app<input id="f-meunome" type="text" maxlength="40" value="' + esc(S.name) + '"></label><button class="btn" id="b-nome">Salvar nome</button></div>' +
    '<div class="sect"><b>Avisos de remédio</b>' + avisos + instalar + "</div>" +
    '<div id="admin-box"></div>' +
    '<p class="err" id="f-err" role="alert"></p>' +
    '<div class="sect"><button class="btn danger block" id="b-sair">Sair</button><button class="btn block" data-close>Fechar</button></div>');
  $("#b-nome").onclick = async () => {
    const n = $("#f-meunome").value.trim();
    if (!n) return setErr("Escreva seu nome.");
    try { await updateDoc(doc(db, "caregivers", S.uid), { name: n }); S.name = n; render(); toast("Nome salvo"); } catch (e) { setErr("Não foi possível salvar."); }
  };
  if ($("#b-avisos")) $("#b-avisos").onclick = ativarAvisos;
  if ($("#b-desligar")) $("#b-desligar").onclick = desativarAvisos;
  if ($("#b-instalar")) $("#b-instalar").onclick = async () => { S.installEvt.prompt(); S.installEvt = null; closeSheet(); };
  $("#b-sair").onclick = async () => { closeSheet(); pararDados(); S.view = "auth"; S.authMode = "entrar"; await signOut(auth); };
  if (S.isAdmin) montarAdmin();
}
async function montarAdmin() {
  let code = "";
  try { const s = await getDoc(doc(db, "config", "secret")); if (s.exists()) code = s.data().joinCode || ""; } catch (e) { /* segue */ }
  const box = $("#admin-box"); if (!box) return;
  const pessoas = Object.keys(S.caregivers).map(uid => ({ uid, n: S.caregivers[uid].name })).sort((a, b) => a.n.localeCompare(b.n));
  box.innerHTML = '<div class="sect"><b>Administração</b>' +
    '<label class="fld">Nome da paciente<input id="f-pac" type="text" maxlength="80" value="' + esc(S.cfg.patientName) + '"></label>' +
    '<label class="fld">Código da família<span class="u">quem for criar o acesso precisa dele</span><input id="f-code" type="text" autocapitalize="characters" value="' + esc(code) + '"></label>' +
    '<button class="btn" id="b-adm">Salvar</button>' +
    '<div class="sect"><b>Histórico</b><p class="hint" style="margin:0">Traga medições antigas de uma planilha. Cada linha vira um registro com a data e a hora originais.</p><button class="btn" id="b-imp">Importar histórico de medições</button></div>' +
    '<div><b>Cuidadores</b>' + pessoas.map(p => '<div class="person"><span>' + esc(p.n) + (p.uid === S.uid ? ' <span class="muted small">(você)</span>' : "") + "</span>" +
      (p.uid === S.uid ? "" : '<button class="btn sm danger" data-rm="' + esc(p.uid) + '">Remover acesso</button>') + "</div>").join("") + "</div></div>";
  $("#b-imp").onclick = () => sheetImportar();
  $("#b-adm").onclick = async () => {
    const pac = $("#f-pac").value.trim(), cd = $("#f-code").value.trim().toUpperCase();
    if (!pac) return setErr("Informe o nome da paciente.");
    if (cd.length < 4) return setErr("O código precisa ter pelo menos 4 caracteres.");
    try {
      await updateDoc(doc(db, "config", "app"), { patientName: pac });
      await setDoc(doc(db, "config", "secret"), { joinCode: cd });
      toast("Salvo");
    } catch (e) { setErr("Não foi possível salvar."); }
  };
  box.onclick = async ev => {
    const b = ev.target.closest("[data-rm]"); if (!b) return;
    if (!b.dataset.ask) { b.dataset.ask = "1"; b.textContent = "Toque de novo para remover"; return; }
    try { await deleteDoc(doc(db, "caregivers", b.dataset.rm)); toast("Acesso removido"); montarAdmin(); } catch (e) { setErr("Não foi possível remover."); }
  };
}

/* ---------- importar histórico (administrador) ---------- */
async function lerArquivoTexto(arq) {
  const buf = await arq.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder("windows-1252").decode(buf); }
}

function sheetImportar() {
  openSheet("<h2>Importar histórico</h2>" +
    '<p class="muted" style="margin:0">Cole as linhas da planilha, com a linha de cabeçalho, ou escolha um arquivo. Colunas aceitas: <b>Data</b>, <b>Hora</b>, <b>Máxima</b>, <b>Mínima</b>, <b>Pulso</b>, <b>Glicemia</b>, <b>Momento</b> e <b>Observação</b>. A pressão também pode vir numa coluna só, como 120/80.</p>' +
    '<label class="fld">Tabela<textarea id="f-imp" rows="8" placeholder="Data&#9;Hora&#9;Máxima&#9;Mínima&#9;Pulso&#9;Glicemia"></textarea></label>' +
    '<label class="fld">Ou escolha um arquivo (.csv ou .txt)<input id="f-arq" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain"></label>' +
    '<label class="fld">Hora para linhas sem horário<span class="u">usada só quando a linha não tem hora nem período (manhã, tarde, noite)</span><input id="f-hp" type="time" value="08:00"></label>' +
    '<div id="imp-prev" class="stack" style="gap:10px"></div><p class="err" id="f-err" role="alert"></p>' +
    '<div class="btns"><button class="btn" data-close>Fechar</button><button class="btn primary" id="b-conf">Conferir</button></div>');
  let ultimo = null;
  $("#f-arq").onchange = async ev => {
    const arq = ev.target.files && ev.target.files[0];
    if (!arq) return;
    try { $("#f-imp").value = await lerArquivoTexto(arq); setErr(""); } catch (e) { setErr("Não foi possível ler o arquivo."); }
  };
  $("#b-conf").onclick = async () => {
    setErr(""); $("#imp-prev").innerHTML = "";
    const M = await import("./importar.js");
    const r = M.converter($("#f-imp").value, { horaPadrao: $("#f-hp").value || "08:00" });
    ultimo = r;
    const lista = r.erros.slice(0, 15).map(e => "<li>" + (e.n ? "Linha " + e.n + ": " : "") + esc(e.msg) + "</li>").join("");
    let h = '<div class="notice info"><b>' + r.linhas.length + "</b> medições prontas para importar" +
      (r.ignoradas ? " · " + r.ignoradas + " linhas vazias ignoradas" : "") +
      (r.semHora ? " · " + r.semHora + " sem horário (vão usar " + esc($("#f-hp").value || "08:00") + ")" : "") + ".</div>";
    if (r.erros.length) h += '<div class="notice bad"><b>' + r.erros.length + (r.erros.length === 1 ? " linha com problema" : " linhas com problema") + " (não serão importadas):</b><ul style=\"margin:6px 0 0;padding-left:18px\">" + lista + (r.erros.length > 15 ? "<li>… e mais " + (r.erros.length - 15) + "</li>" : "") + "</ul></div>";
    if (r.linhas.length) {
      const amostra = r.linhas.slice(0, 5).map(l => {
        const d = new Date(l.ms);
        return "<li><b>" + dmy(d) + " " + hm(d) + "</b> · " + (l.sys != null ? l.sys + "/" + l.dia : "") + (l.glic != null ? " · glicemia " + l.glic : "") + "</li>";
      }).join("");
      h += '<div class="notice"><b>Primeiras linhas, para você conferir:</b><ul style="margin:6px 0 0;padding-left:18px">' + amostra + "</ul></div>";
      h += '<p class="hint">Se você importar de novo as mesmas linhas, elas não duplicam: o registro com a mesma data e hora é atualizado.</p>' +
        '<button class="btn primary" id="b-go">Importar ' + r.linhas.length + " medições</button>";
    }
    $("#imp-prev").innerHTML = h;
    const go = $("#b-go");
    if (go) go.onclick = async () => {
      go.disabled = true; $("#b-conf").disabled = true;
      const linhas = ultimo.linhas;
      try {
        for (let i = 0; i < linhas.length; i += 400) {
          const b = writeBatch(db);
          linhas.slice(i, i + 400).forEach(l => {
            const d = { type: "medicao", by: S.uid, ts: Timestamp.fromMillis(l.ms), importado: true, importedAt: serverTimestamp() };
            ["sys", "dia", "pulse", "glic", "momento", "note"].forEach(k => { if (l[k] != null) d[k] = l[k]; });
            b.set(doc(db, "entries", l.id), d);
          });
          await b.commit();
          go.textContent = "Importando… " + Math.min(i + 400, linhas.length) + " de " + linhas.length;
        }
        closeSheet();
        S.older = []; S.olderIni = S.base0; S.semMais = false;
        S.tab = "hist"; S.hist = "med"; S.range = "all";
        await carregarAntigos(Math.min(...linhas.map(l => l.ms)));
        toast(linhas.length + " medições importadas");
      } catch (e) {
        go.disabled = false; $("#b-conf").disabled = false;
        go.textContent = "Importar " + linhas.length + " medições";
        setErr(e && e.code === "permission-denied"
          ? "O Firestore recusou a importação. As regras novas ainda não foram publicadas no console do Firebase."
          : "Não foi possível importar. Verifique a conexão e tente de novo.");
      }
    };
  };
}

/* ---------- relatório ---------- */
async function gerarRelatorio(modo) {
  S.relMsg = ""; S.relArq = null;
  let de, ate;
  const hoje = new Date();
  if (S.relDias === "x") {
    S.relDe = ($("#r-de") || {}).value || S.relDe; S.relAte = ($("#r-ate") || {}).value || S.relAte;
    if (!S.relDe || !S.relAte) { S.relMsg = "Escolha as duas datas."; render(); return; }
    de = new Date(S.relDe + "T00:00"); ate = new Date(S.relAte + "T00:00");
    if (ate < de) { S.relMsg = "A data final precisa ser depois da inicial."; render(); return; }
    if ((ate - de) / DIA > 180) { S.relMsg = "Escolha no máximo 180 dias."; render(); return; }
  } else {
    ate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    de = new Date(ate.getTime()); de.setDate(de.getDate() - (Number(S.relDias) - 1));
  }
  const fim = new Date(ate.getTime()); fim.setHours(23, 59, 59, 999);
  S.relBusy = true; render();
  try {
    const snap = await getDocs(query(collection(db, "entries"), where("ts", ">=", Timestamp.fromDate(de)), where("ts", "<=", Timestamp.fromDate(fim)), orderBy("ts")));
    const entries = snap.docs.map(d => { const x = d.data({ serverTimestamps: "estimate" }); return Object.assign({}, x, { id: d.id, ms: x.ts && x.ts.toMillis ? x.ts.toMillis() : Date.now() }); });
    const R = await import("./relatorio.js");
    const dados = { entries, meds: S.meds, nomes: S.caregivers, paciente: S.cfg.patientName, from: de, to: ate };
    S.relArq = modo === "pdf" ? await R.gerarPDF(dados) : R.gerarCSV(dados);
  } catch (e) {
    S.relMsg = (e && e.message && !e.code) ? e.message : "Não foi possível gerar o documento. Verifique a internet e tente de novo.";
  }
  S.relBusy = false; render();
}
function baixar(arq) {
  const url = URL.createObjectURL(arq.blob);
  const a = document.createElement("a");
  a.href = url; a.download = arq.nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function compartilhar(arq) {
  try {
    const file = new File([arq.blob], arq.nome, { type: arq.blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "Acompanhamento de saúde" });
    else baixar(arq);
  } catch (e) {
    if (e && e.name !== "AbortError") baixar(arq);
  }
}

/* ---------- eventos ---------- */
document.addEventListener("click", ev => {
  if (ev.target.closest("[data-close]")) { closeSheet(); return; }
  if (ev.target === $("#ov")) { closeSheet(); return; }
  const au = ev.target.closest("[data-auth]");
  if (au) { S.authMode = au.dataset.auth; S.authMsg = ""; renderAuth(); return; }
  const tb = ev.target.closest(".tabs button");
  if (tb) { S.tab = tb.dataset.tab; S.more = 60; render(); window.scrollTo(0, 0); return; }
  if (ev.target.closest("#who")) { sheetAjustes(); return; }
  const a = ev.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act;
  if (act === "recarregar") { location.reload(); return; }
  if (S.view !== "app") return;
  if (act === "nova-medicao") sheetMedicao();
  else if (act === "novo-med") sheetMed(null);
  else if (act === "ajustes") sheetAjustes();
  else if (act === "hist") { S.hist = a.dataset.v; S.more = 60; render(); }
  else if (act === "range") { S.range = a.dataset.v === "all" ? "all" : Number(a.dataset.v); render(); }
  else if (act === "antigos") carregarAntigos();
  else if (act === "more") { S.more += 60; render(); }
  else if (act === "edit-entry") { const e = entradas().find(x => x.id === a.dataset.id); if (e) sheetEditarRegistro(e); }
  else if (act === "edit-med") { const m = S.meds.find(x => x.id === a.dataset.id); if (m) sheetMed(m); }
  else if (act === "dose-livre") { const m = S.meds.find(x => x.id === a.dataset.id); if (m) sheetInsulina(m, null); }
  else if (act === "dose-ins") {
    const s = slotsComStatus(dayStr(new Date())).find(x => x.key === a.dataset.key);
    if (s && !s.given) sheetInsulina(s.med, s.sched);
    else if (s) { toast("Já foi registrada por " + nomeDe(s.given.by)); render(); }
  } else if (act === "dose") {
    const key = a.dataset.key;
    if (S.confirm !== key) { S.confirm = key; render(); clearTimeout(S.confirmT); S.confirmT = setTimeout(() => { S.confirm = null; render(); }, 5000); return; }
    S.confirm = null;
    const s = slotsComStatus(dayStr(new Date())).find(x => x.key === key);
    if (!s) { render(); return; }
    if (s.given) { toast("Já foi registrada por " + nomeDe(s.given.by)); render(); return; }
    registrarDose(s.med, s.sched, {}).then(() => toast("Dose registrada")).catch(e => {
      toast(e && e.code === "permission-denied" ? "Outra pessoa acabou de registrar esta dose." : "Não foi possível registrar. Tente de novo.");
    });
    render();
  } else if (act === "rel-dias") { S.relDias = a.dataset.v === "x" ? "x" : Number(a.dataset.v); S.relMsg = ""; render(); }
  else if (act === "rel-pdf") gerarRelatorio("pdf");
  else if (act === "rel-csv") gerarRelatorio("csv");
  else if (act === "rel-share") compartilhar(S.relArq);
  else if (act === "rel-baixar") baixar(S.relArq);
  else if (act === "rel-limpar") { S.relArq = null; render(); }
});
document.addEventListener("change", ev => {
  if (ev.target.id === "a-show") { const p = $("#a-pass"); if (p) p.type = ev.target.checked ? "text" : "password"; }
  if (ev.target.id === "r-de") S.relDe = ev.target.value;
  if (ev.target.id === "r-ate") S.relAte = ev.target.value;
});
document.addEventListener("submit", ev => {
  if (ev.target.id === "f-auth") { ev.preventDefault(); enviarAuth(); }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("#ov").hidden) closeSheet(); });
window.addEventListener("online", () => render());
window.addEventListener("offline", () => render());
window.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); S.installEvt = ev; });

/* ---------- início ---------- */
function telaConfigurar() {
  $("#top").hidden = true; $("#tabs").hidden = true;
  $("#main").innerHTML = '<div class="auth"><img class="logo" src="icons/icon-192.png" alt=""><h1>Cuidados da Vó</h1>' +
    '<div class="notice bad"><b>Falta configurar o Firebase.</b><br>Abra o arquivo <b>firebase-config.js</b>, cole os dados do seu projeto e publique de novo. O passo a passo está em <b>COMO_CONFIGURAR.md</b>.</div></div>';
}

(function iniciar() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  setInterval(tick, 15000);
  tick();
  if (!configurado) { telaConfigurar(); return; }
  onAuthStateChanged(auth, async user => {
    if (S.authBusy) return;
    if (!user) { pararDados(); S.uid = null; renderAuth(); return; }
    await entrar(user);
  });
})();
