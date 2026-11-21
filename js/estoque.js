// Estoque de remédios e suprimentos (fraldas etc.): quanto tem, para quantos dias dá e quando comprar.
// Não depende do navegador, para poder ser testado com números (tools/teste-estoque.mjs).

const DIA = 86400000;

export const chaveMed = id => "med:" + id;
export const chaveSup = id => "sup:" + id;

const ms = t => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : 0);
const num = (v, pad) => (typeof v === "number" && isFinite(v) ? v : pad);

/** Junta os remédios com estoque controlado e os suprimentos numa lista só. */
export function listarItens(meds, supplies) {
  const out = [];
  for (const m of meds || []) {
    if (!m.stockOn) continue;
    out.push({
      key: chaveMed(m.id), tipo: "med", id: m.id, nome: m.name, raw: m,
      unidade: m.stockUnit || "unidades", qty: num(m.stockQty, 0), alertDays: num(m.alertDays, 7),
      pack: num(m.pack, 0), minQty: 0, perDay: 0, quando: ms(m.stockAt), por: m.stockBy || null
    });
  }
  for (const s of supplies || []) {
    if (s.active === false) continue;
    out.push({
      key: chaveSup(s.id), tipo: "sup", id: s.id, nome: s.name, raw: s,
      unidade: s.unit || "unidades", qty: num(s.stockQty, 0), alertDays: num(s.alertDays, 7),
      pack: num(s.pack, 0), minQty: num(s.minQty, 0), perDay: num(s.perDay, 0), quando: ms(s.stockAt), por: s.stockBy || null
    });
  }
  return out;
}

/** Quanto de um remédio sai por dia. perDay null = ainda não dá para saber. */
export function consumoMed(m, ctx) {
  if (m.active === false) return { perDay: 0, parado: "suspenso" };
  if (m.end && m.end < ctx.hoje) return { perDay: 0, parado: "encerrado" };
  const insulina = m.kind === "insulina";
  if (m.mode === "glicemia") {
    const doses = (ctx.entries || []).filter(e => e.type === "dose" && e.medId === m.id && e.ms >= ctx.now - 14 * DIA);
    if (!doses.length) return { perDay: null };
    const primeira = Math.min(...doses.map(e => e.ms));
    const dias = Math.min(14, Math.max(3, Math.ceil((ctx.now - primeira) / DIA)));
    const soma = doses.reduce((s, e) => s + (Number(e.units) || 0), 0);
    return { perDay: soma / dias, estimado: true };
  }
  const por = insulina ? Number(m.units) || 0 : (m.perDose > 0 ? m.perDose : 1);
  return { perDay: (m.times || []).length * por };
}

/** Quanto de um suprimento sai por dia, pelo que os cuidadores anotaram nos últimos 14 dias. */
export function consumoSup(it, ctx) {
  const mov = (ctx.log || []).filter(l => l.item === it.key && l.ms >= ctx.now - 14 * DIA);
  const saidas = mov.filter(l => l.type === "saida").reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const primeiro = mov.length ? Math.min(...mov.map(l => l.ms)) : ctx.now;
  const diasDados = (ctx.now - primeiro) / DIA;
  if (saidas > 0 && diasDados >= 3) return { perDay: saidas / Math.min(14, Math.ceil(diasDados)), estimado: true };
  if (it.perDay > 0) return { perDay: it.perDay, informado: true };
  if (saidas > 0) return { perDay: saidas / Math.max(1, diasDados), estimado: true, provisorio: true };
  return { perDay: null };
}

/**
 * Situação de um item.
 * nivel: "ok" | "atencao" (comprar em breve) | "urgente" (comprar já) | "zerado" | "parado" (remédio suspenso ou encerrado)
 */
export function situacao(it, ctx) {
  const bruto = it.qty;
  const q = Math.max(0, bruto);
  const c = it.tipo === "med" ? consumoMed(it.raw, ctx) : consumoSup(it, ctx);
  const perDay = c.perDay;
  const dias = perDay > 0 ? q / perDay : null;
  const r = {
    qty: q, negativo: bruto < 0, perDay, dias, estimado: !!c.estimado, provisorio: !!c.provisorio, informado: !!c.informado,
    acabaEm: dias != null ? ctx.now + dias * DIA : null, nivel: "ok", cobreAteFim: false
  };
  if (c.parado) { r.nivel = "parado"; r.parado = c.parado; return r; }
  if (q <= 0) { r.nivel = "zerado"; return r; }
  if (dias != null) {
    const fim = it.tipo === "med" ? it.raw.end : null;
    if (fim) {
      const restam = Math.max(0, Math.round((new Date(fim + "T00:00") - new Date(ctx.hoje + "T00:00")) / DIA) + 1);
      if (q >= perDay * restam) r.cobreAteFim = true;
    }
    if (!r.cobreAteFim) {
      if (dias <= Math.min(3, it.alertDays)) r.nivel = "urgente";
      else if (dias <= it.alertDays) r.nivel = "atencao";
    }
  }
  if (r.nivel === "ok" && it.minQty > 0 && q <= it.minQty) r.nivel = "atencao";
  return r;
}

const PESO = { zerado: 0, urgente: 1, atencao: 2, ok: 3, parado: 4 };
/** Itens que precisam de compra, do mais urgente para o menos. */
export function precisaComprar(itens, ctx) {
  return itens
    .map(it => ({ it, s: situacao(it, ctx) }))
    .filter(x => x.s.nivel === "zerado" || x.s.nivel === "urgente" || x.s.nivel === "atencao")
    .sort((a, b) => PESO[a.s.nivel] - PESO[b.s.nivel] || (a.s.dias == null) - (b.s.dias == null) || (a.s.dias || 0) - (b.s.dias || 0));
}

export const ROTULO_NIVEL = { zerado: "Acabou", urgente: "Comprar já", atencao: "Comprar em breve", ok: "Em dia", parado: "Sem uso agora" };

export function fraseDias(dias) {
  if (dias == null) return "";
  if (dias < 1) return "menos de 1 dia";
  if (dias < 2) return "cerca de 1 dia";
  if (dias >= 60) return "mais de " + Math.floor(dias / 30) + " meses";
  return "cerca de " + Math.floor(dias) + " dias";
}
