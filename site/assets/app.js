/* Ballytics — sitio estático. Lee data/*.json que genera pipeline/generar.py. */
(() => {
"use strict";
const D = { ligas: {} };
const $app = document.getElementById("app");
const MAXG = 10;
const ODDS = {};
let R = { v: "inicio" };
const timers = [];

/* ---------------- utilidades ---------------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 0) => x == null || isNaN(x) ? "—" : (100 * x).toFixed(d).replace(".", ",") + "%";
const dec = (x, d = 2) => x == null || isNaN(x) ? "—" : Number(x).toFixed(d).replace(".", ",");
const sgn = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x);
const DAYMS = 864e5;
const isoDay = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dayKey = iso => isoDay(new Date(iso));
function dayLabel(key) {
  const t = new Date();
  if (key === isoDay(t)) return "Hoy";
  if (key === isoDay(new Date(t.getTime() + DAYMS))) return "Mañana";
  if (key === isoDay(new Date(t.getTime() - DAYMS))) return "Ayer";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
}
const hhmm = iso => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fecha = iso => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
const cuando = iso => `${dayLabel(dayKey(iso))} · ${hhmm(iso)}`;
function weekStart(iso) { const d = new Date(iso); const w = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - w); return isoDay(d); }
function hashColor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 38%)`; }
/* texto blanco u oscuro, el que tenga más contraste sobre ese color (fórmula WCAG) */
function inkOn(hex) { const n = parseInt(hex, 16), ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const L = 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255); return 1.05 / (L + 0.05) >= (L + 0.05) / 0.053 ? "#fff" : "#07090f"; }
function lum(hex) { const n = parseInt(hex, 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
const pts5 = f => (f || []).reduce((s, c) => s + ({ G: 3, E: 1, P: 0 }[c] || 0), 0);

function info(L, t) { return (L && L.equipos && L.equipos[t]) || {}; }
const corto = (L, t) => info(L, t).corto || t;
const LOK = window.__lok || (window.__lok = new Set());   // escudos que ya cargaron en esta visita
const LOK_JS = "this.parentNode.classList.add('ok');window.__lok.add(this.getAttribute('src'))";
/* íconos propios (en vez de emojis, que cambian según el teléfono y se ven poco profesionales) */
const ICO = {
  bell: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>`,
  belloff: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H7M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/></svg>`,
  trophy: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 21h7M10 17h4v4h-4z"/></svg>`,
  glove: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21v-6L4.5 11a1.6 1.6 0 0 1 2.6-1.8L9 11V5a1.5 1.5 0 0 1 3 0v5-6a1.5 1.5 0 0 1 3 0v6-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6z"/></svg>`,
};
const YC = `<i class="ycard" role="img" aria-label="amarilla"></i>`, RC = `<i class="rcard" role="img" aria-label="roja"></i>`;
/* imágenes en el tamaño justo: ESPN tiene su propio redimensionador y las de API-Football pasan por wsrv.nl (WebP, caché de 1 año).
   Un escudo de 500 px pesa 30–300 KB; a 80 px pesa 1–7 KB. Si el redimensionado falla, se pide la imagen original (data-o). */
const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));   // sin redondear: 1,75 pide 128 px y no 200
function IMG(u, px = 32) {
  u = String(u || ""); if (!u) return u;
  const n = px * DPR, s = n <= 48 ? 48 : n <= 80 ? 80 : n <= 128 ? 128 : 200;
  let m = u.match(/^https?:\/\/a\.espncdn\.com\/(i\/(?!headshots)[^?#]+\.png)$/i);
  if (m) return `https://a.espncdn.com/combiner/i?img=/${m[1]}&w=${s}&h=${s}`;
  m = u.match(/^https?:\/\/(media\.api-sports\.io\/[^?#]+\.(?:png|jpe?g))$/i);
  if (m) return `https://wsrv.nl/?url=${m[1]}&w=${s}&h=${s}&fit=${/\/(players|coachs)\//.test(m[1]) ? "cover&a=top" : "contain"}&output=webp`;
  return u;
}
const isrc = (u, px) => { const r = IMG(u, px); return ` src="${esc(r)}"${r !== u ? ` data-o="${esc(u)}"` : ""}`; };
window.imgErr = img => { const o = img && img.dataset && img.dataset.o; if (o) { img.dataset.o = ""; img.src = o; return true; } return false; };
const BADGE_PX = { xs: 32, sm: 24, lg: 56, xl: 72 };
function badge(L, t, size = "") {
  const i = info(L, t), c = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? i.color : null;
  const bg = c ? "#" + c : hashColor(t), fg = c ? inkOn(c) : "#fff";
  const ab = (i.abr || t.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 3)).toUpperCase();
  const logo = typeof i.logo === "string" && /^https:\/\//.test(i.logo) ? i.logo : null;
  const img = logo ? `<img class="crest"${isrc(logo, BADGE_PX[size] || 32)} alt="" loading="${LOK.has(logo) ? "eager" : "lazy"}" decoding="async" referrerpolicy="no-referrer" onload="${LOK_JS}" onerror="if(!imgErr(this)){this.parentNode.classList.remove('logo');this.remove()}">` : "";
  return `<span class="badge ${size}${logo ? " logo" : ""}${logo && LOK.has(logo) ? " ok" : ""}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(ab)}${img}</span>`;
}
/* si un escudo o bandera no carga, se reemplaza por un emblema con iniciales (nunca queda un cuadro vacío) */
window.bfb = img => {
  if (window.imgErr(img)) return;
  const n = String(img.dataset.n || "").trim();
  const ini = iniOf(n);
  const cs = getComputedStyle(img), h = parseFloat(cs.height) || 22, wd = parseFloat(cs.width) || h;
  const s = document.createElement("span");
  s.className = "tfb " + (img.className || "").replace(/\b(cimg|flagimg|crest)\b/g, "");
  s.textContent = ini; s.setAttribute("aria-hidden", "true");
  s.style.cssText = `--c:${hashColor(n || "?")};width:${Math.round(wd)}px;height:${Math.round(h)}px;font-size:${Math.max(7, Math.round(h * .36))}px`;
  img.replaceWith(s);
};
// emblema con iniciales para equipos sin escudo (mismo estilo que el respaldo de bfb)
function iniOf(n) { n = String(n || "").trim(); const w = n.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 && !/^[A-Z]{3}$/.test(n) ? w.filter(x => x.length > 2 || /^[A-Z]/.test(x)).slice(0, 2).map(x => x[0]).join("") || w[0][0] : (w[0] || "?").slice(0, 3)).toUpperCase(); }
const fbSpan = (n, abr) => `<span class="tfb fit" style="--c:${hashColor(String(n || "?"))}" aria-hidden="true">${esc(abr && abr.length <= 3 ? abr : iniOf(n))}</span>`;
const NOFOTO = (() => { const c = lsGet("bt_nofoto", null); return new Set(c && Date.now() - c.t < 14 * DAYMS ? c.ids : []); })();
let nofotoT0 = 0, nofotoTm = null;
window.__nofoto = id => { id = String(id || ""); if (!/^\d+$/.test(id) || NOFOTO.has(id)) return; NOFOTO.add(id); if (!nofotoT0) nofotoT0 = Date.now();
  clearTimeout(nofotoTm); nofotoTm = setTimeout(() => { const c = lsGet("bt_nofoto", null); lsSet("bt_nofoto", { t: c && c.t && Date.now() - c.t < 14 * DAYMS ? c.t : nofotoT0, ids: [...NOFOTO].slice(-1500) }); }, 1500); };
/* cara del jugador: foto de ESPN (o de API-Football), con iniciales y color del equipo si no hay foto */
function face(L, t, jid, name, size = "", alt = "") {
  const i = info(L, t), c = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? i.color : null;
  const bg = c ? "#" + c : hashColor(t || name || ""), fg = c ? inkOn(c) : "#fff";
  const w = String(name || "").replace(/[^A-Za-zÀ-ÿ' -]/g, "").trim().split(/\s+/).filter(Boolean);
  const ini = ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  const espn = /^\d+$/.test(String(jid || "")) && !NOFOTO.has(String(jid)) ? `https://a.espncdn.com/i/headshots/soccer/players/full/${jid}.png` : "";
  if (!alt && jid) alt = fotoDe(jid);
  const api = typeof alt === "string" && /^https:\/\/media\.api-sports\.io\//.test(alt) ? alt : "";
  // si ya sabemos su foto de API-Football se usa primero (ESPN casi no tiene fotos de fútbol)
  const FPX = { sm: 26, lg: 60, xl: 120 }[size] || 36;
  // foto de API-Football en tamaño justo (si falla, la original); si no hay, la de ESPN
  const img = api ? `<span class="ph"><img class="sq"${isrc(api, FPX)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${espn ? ` data-alt="${esc(espn)}"` : ""} onload="this.parentNode.classList.add('ok')" onerror="if(!imgErr(this)){if(this.dataset.alt){this.className='wide';this.src=this.dataset.alt;this.dataset.alt=''}else{__nofoto('${/^\d+$/.test(String(jid)) ? jid : ""}');this.parentNode.remove()}}"></span>`
    : espn ? `<span class="ph"><img class="wide" src="${esc(espn)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="__nofoto('${/^\d+$/.test(String(jid)) ? jid : ""}');this.parentNode.remove()"></span>` : "";
  const crest = size !== "sm" && t ? `<span class="fb">${badge(L, t, "xs")}</span>` : "";
  return `<span class="pface ${size}" style="--fc:${bg};--ff:${fg}" aria-hidden="true"><i>${esc(ini)}</i>${img}${crest}</span>`;
}
function leagueMark(L, size = "") {
  const logo = L.logo && /^(https:\/\/|assets\/logos\/)/.test(L.logo) ? L.logo : null;
  const ab = L.nombre.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();
  return `<span class="lmark ${size}${logo ? " logo" : ""}${logo && LOK.has(logo) ? " ok" : ""}" aria-hidden="true">${esc(ab)}${logo ? `<img${isrc(logo, { sm: 20, xl: 64 }[size] || 28)} alt="" loading="${LOK.has(logo) ? "eager" : "lazy"}" referrerpolicy="no-referrer" onload="${LOK_JS}" onerror="if(!imgErr(this)){this.parentNode.classList.remove('logo');this.remove()}">` : ""}</span>`;
}

/* ---------------- modelo (igual que en Python) ---------------- */
function pois(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
const poisOver = (line, l) => { let c = 0; for (let k = 0; k <= Math.floor(line); k++) c += pois(k, l); return 1 - c; };
function rates(M, h, a) {
  const [ah, dh] = M.equipos[h] || [0, 0], [aa, da] = M.equipos[a] || [0, 0];
  const hv = (M.local && M.local[h]) || 0;
  return [Math.exp(M.mu + M.home + hv + ah - da), Math.exp(M.mu + aa - dh)];
}
function matrix(M, h, a) { const [lh, la] = rates(M, h, a); return matrixLam(lh, la, M.rho); }
/* tabla de marcadores del partido con los goles esperados publicados (ajustados a la cuota si la hay) */
function pmatrix(L, p) { return p && p.lh != null && p.la != null ? matrixLam(p.lh, p.la, L.modelo.rho) : matrix(L.modelo, p.home, p.away); }
function noVig(c) {
  if (!c || !c.h || !c.d || !c.a) return null;
  const inv = [1 / c.h, 1 / c.d, 1 / c.a], s = inv[0] + inv[1] + inv[2];
  let o = null; if (c.linea === 2.5 && c.over && c.under) o = (1 / c.over) / (1 / c.over + 1 / c.under);
  return { p: inv.map(x => x / s), o, casa: c.casa || "la casa" };
}
/* mercado del partido: Pinnacle o promedio de casas (The Odds API); si no, DraftKings vía ESPN */
function mktOf(p) {
  const m = p && p.mercado;
  if (m && m.h && m.d && m.a) { const s = m.h + m.d + m.a; return { p: [m.h / s, m.d / s, m.a / s], o: m.linea === 2.5 ? m.over : null, casa: m.fuente || "mercado" }; }
  return noVig(p && p.cuotas);
}
function matrixLam(lh, la, r) {
  const m = []; let s = 0;
  for (let i = 0; i <= MAXG; i++) { m.push([]); for (let j = 0; j <= MAXG; j++) {
    let p = pois(i, lh) * pois(j, la);
    if (i === 0 && j === 0) p *= 1 - lh * la * r; else if (i === 0 && j === 1) p *= 1 + lh * r;
    else if (i === 1 && j === 0) p *= 1 + la * r; else if (i === 1 && j === 1) p *= 1 - r;
    m[i].push(p); s += p; } }
  m.forEach(row => row.forEach((_, j) => row[j] /= s));
  return { m, lh, la };
}
function markets(m) {
  let H = 0, X = 0, A = 0, O15 = 0, O25 = 0, O35 = 0, B = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { const p = m[i][j], t = i + j;
    if (i > j) H += p; else if (i === j) X += p; else A += p;
    if (t > 1.5) O15 += p; if (t > 2.5) O25 += p; if (t > 3.5) O35 += p; if (i && j) B += p; }
  return { H, D: X, A, O15, O25, O35, B };
}

/* ---------------- datos ---------------- */
async function getJSON(p) {
  // index.html ya pidió el índice y la agenda mientras bajaba este archivo: se usa esa misma descarga (una sola vez)
  const pre = window.__pre && window.__pre[p]; if (pre) { delete window.__pre[p]; return pre; }
  const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }
const PEND = {}, LOADERR = {};
function ensure(id) {
  // si falla, se borra la promesa (para poder reintentar) y se anota el error; nunca se reintenta en bucle
  if (D.ligas[id] && !D.ligas[id].lite) return Promise.resolve(D.ligas[id]);
  return PEND[id] || (PEND[id] = getJSON(`data/${id}.json`).then(L => { D.ligas[id] = L; delete LOADERR[id]; return L; })
    .catch(e => { delete PEND[id]; const x = LOADERR[id] || { n: 0 }; LOADERR[id] = { n: x.n + 1, t: Date.now(), msg: String(e.message || e) }; return null; }));
}
// detalle de los partidos de una liga (goleadores, amarillas, alineación probable, historial, cruces): solo al abrir un partido
const DETP = {};
const DETJ = {};   // la descarga del detalle puede empezar antes de que llegue la liga (van en paralelo)
const detJSON = id => DETJ[id] || (DETJ[id] = getJSON(`data/detalle/${id}.json`).catch(() => ({})));
function ensureDet(id) {
  const L = D.ligas[id];
  if (L && !L.lite && L._det) return Promise.resolve(L);
  return DETP[id] || (DETP[id] = Promise.all([ensure(id), detJSON(id)]).then(([x, det]) => {
    delete DETP[id]; delete DETJ[id];
    const L2 = D.ligas[id]; if (!x || !L2 || L2.lite) return null;
    if (!L2._det) { (L2.partidos || []).forEach(p => { const d = det[String(p.id)]; if (d) Object.assign(p, d); }); L2._det = true; }
    return L2; }));
}
// todas las ligas completas: solo cuando hace falta (buscador, IA, en vivo, más análisis) o con buena conexión después de un rato
// el registro (pesado), la metodología y las fotos de jugadores: solo cuando una pantalla los usa
function loadExtras() {
  return D.regP || (D.regP = Promise.all([getJSON("data/registro.json").catch(() => null), getJSON("data/metodologia.json").catch(() => null)]).then(([g, m]) => { D.registro = g; D.metodo = m;
    if (R && ["registro", "metodo", "partido", "inicio"].includes(R.v)) rerenderKeep(); }));
}
function loadFotos() {
  return D.fotP || (D.fotP = getJSON("data/fotos.json").catch(() => ({})).then(f => { D.fotos = f || {};
    if (R && ["partido", "jugador", "inicio", "envivo", "equipo", "arbitro"].includes(R.v)) rerenderKeep(); }));
}
let ALLP = null; const ALLW = [];
function loadAll() {
  if (ALLP) return ALLP;
  const idle = () => new Promise(r => (window.requestIdleCallback || (f => setTimeout(f, 60)))(() => r(), { timeout: 1500 }));
  ALLP = (async () => { const ids = D.indice.ligas.map(l => l.id);
    for (let i = 0; i < ids.length; i += 2) { await idle(); await Promise.all(ids.slice(i, i + 2).map(ensure)); } })()
    .then(() => { D.allLoaded = true; ALLW.splice(0).forEach(f => { try { f(); } catch (e) {} }); });
  return ALLP;
}
const whenAll = f => D.allLoaded ? f() : ALLW.push(f);   // espera sin provocar la descarga
const rerenderKeep = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
async function load() {
  // entrada directa a una liga, partido o jugador: su archivo (y el detalle) se piden ya, en paralelo con el índice
  const h0 = curHash().slice(2).split("/");
  if (["liga", "partido", "equipo", "jugador", "comparar", "arbitro"].includes(h0[0]) && /^[a-z0-9_-]{2,30}$/.test(h0[1] || "")) {
    ensure(h0[1]); if (["partido", "jugador"].includes(h0[0])) detJSON(h0[1]);
  }
  // lo mínimo para la primera pantalla: el índice y la agenda liviana (todas las ligas, solo los partidos cercanos)
  const [ind, ag] = await Promise.all([getJSON("data/indice.json"), getJSON("data/agenda.json").catch(() => null)]);
  D.indice = ind; D.fotos = {}; D.agenda = !!ag;
  if (ag) Object.entries(ag.ligas || {}).forEach(([id, Lg]) => { if (!D.ligas[id]) D.ligas[id] = { ...Lg, lite: true }; });

  D.meta = {}; D.indice.ligas.forEach(l => D.meta[l.id] = l);
  // primero lo que se ve en pantalla; el resto se carga en segundo plano
  const h = curHash().slice(2).split("/");
  const prio = new Set((D.indice.portada && D.indice.portada.partidos || []).map(x => x.liga));
  (D.indice.portada && D.indice.portada.jugadores || []).slice(0, 2).forEach(x => prio.add(x.liga));
  prio.add(D.indice.ligas[0].id);
  if (["liga", "partido", "equipo", "jugador", "comparar", "partidos", "arbitro"].includes(h[0]) && D.meta[h[1]]) { prio.clear(); prio.add(h[1]); }
  else if (ag) prio.clear();   // con la agenda, el inicio no necesita ninguna liga completa para mostrarse
  // sin agenda (sitio viejo en caché) se vuelve a bajar todo como antes
  const lento = !!(navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || "")));
  // en el computador (conexión fija) se adelanta todo después de un rato; en el teléfono, solo cuando se usa
  const pc = window.matchMedia && matchMedia("(pointer:fine)").matches;
  if (!ag) loadAll(); else if (pc && !lento) setTimeout(() => { loadAll(); loadExtras(); loadFotos(); }, 8000);
  await Promise.all([...prio].map(ensure));
  getJSON("data/picks_publicos.json").then(x => { D.picksPub = x; if (R && (R.v === "inicio" || R.v === "picks")) render(); }).catch(() => {});
  document.getElementById("foot-upd").innerHTML = `<span class="dot"></span>Actualizado ${new Date(D.indice.actualizado).toLocaleDateString("es-CL")} ${hhmm(D.indice.actualizado)}`;
  buildMenu();
}
const ligasIds = () => D.indice ? D.indice.ligas.map(l => l.id).filter(id => D.ligas[id]) : [];
const allMatches = () => ligasIds().flatMap(id => D.ligas[id].partidos.map(p => ({ ...p, L: D.ligas[id] })));
const findMatch = (liga, id) => { const L = D.ligas[liga]; return L && L.partidos.find(p => String(p.id) === String(id)); };
const statOf = (L, t) => (L.stats || []).find(s => s.equipo === t) || {};
const rowOf = (L, t) => { const s = (L.tabla || []).find(s => s.equipo === t) || {}; return L.tabla_ok ? s : { ...s, pos: null, pts: s.pts, zonas: null, pts_esp: null }; };
const strength = (L, t) => { const s = rowOf(L, t); return (s.ataque || 1) / (s.defensa || 1); };

/* ---------------- menú y búsqueda ---------------- */
function buildMenu() {
  const groups = {};
  D.indice.ligas.forEach(l => (groups[l.region] ||= []).push(l));
  const m = document.getElementById("dd-menu");
  m.innerHTML = Object.entries(groups).map(([g, ls]) => `<div class="dd-col"><span class="lbl">${esc(g)}</span>` +
    ls.map(L => `<button class="dd-item" data-go="liga" data-liga="${L.id}" data-tab="resumen">${leagueMark(L)}<span>${esc(L.nombre)}<small>${esc(L.pais)}</small></span></button>`).join("") + `</div>`).join("")
    + `<div class="dd-all"><span class="lbl">Ligas con probabilidades de Ballytics. Resultados, tablas y partidos en vivo de más de 180 competiciones:</span><button class="btn sm" data-go="competiciones">Todas las competiciones →</button></div>`;
  const btns = [...document.querySelectorAll(".dd-toggle")];
  const setOpen = open => { m.hidden = !open; btns.forEach(b => b.setAttribute("aria-expanded", String(open))); document.body.classList.toggle("sheet-open", open); };
  btns.forEach(b => b.addEventListener("click", e => { e.stopPropagation(); setOpen(m.hidden); }));
  document.addEventListener("click", e => { if (!e.target.closest(".dd-menu") && !e.target.closest(".dd-toggle")) setOpen(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { setOpen(false); document.getElementById("sres").hidden = true; } });
  const q = document.getElementById("q"), res = document.getElementById("sres");
  let idx = [];
  const norm = x => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const indexAll = () => {
    const ligas = D.indice.ligas.map(l => ({ k: "Ligas", n: l.nombre, sub: l.pais, html: leagueMark(l), go: `data-go="liga" data-liga="${l.id}" data-tab="resumen"` }));
    const eq = [], seen = new Set(), pl = [], seenP = new Set();
    ligasIds().forEach(id => { const L = D.ligas[id];
      Object.keys(L.equipos).forEach(t => { const key = id + "|" + t; if (seen.has(key)) return; seen.add(key);
        eq.push({ k: "Equipos", n: corto(L, t), alt: t, sub: L.nombre, reg: L.region, copa: /copa|champions|libertadores|sudamericana|europa|conference/i.test(L.region + " " + L.nombre), html: badge(L, t), go: `data-go="equipo" data-liga="${id}" data-team="${esc(t)}"` }); });
      (L.goleadores || []).forEach(g => { const key = g.jid + "|" + id; if (seenP.has(key)) return; seenP.add(key);
        pl.push({ k: "Jugadores", n: g.jugador, sub: `${corto(L, g.equipo)} · ${L.nombre} · ${g.goles} goles`, html: face(L, g.equipo, g.jid, g.jugador), go: `data-go="jugador" data-liga="${id}" data-id="${esc(g.jid)}"` }); });
    });
    const sel = ((VV.sel || {}).equipos || []).map(t => ({ k: "Selecciones", n: t.n, alt: t.en, sub: (VV.sel.conf[t.cf] || "").split(" (")[0], html: selImg(t), go: `data-go="club" data-liga="sel" data-id="${esc(t.id)}"` }));
    const comps = (VV.comps || []).map(c => ({ k: "Competiciones", n: c.n, alt: c.p, sub: c.p, html: compImg(c), go: `data-go="comp" data-liga="${esc(c.s)}"` }));
    // un mismo equipo aparece en su liga y en las copas: se deja una sola vez (la de su liga) y se nombran las demás
    const byName = new Map();
    eq.sort((a, b) => a.copa - b.copa).forEach(x => { const k = norm(x.alt || x.n); const y = byName.get(k); if (!y) byName.set(k, x); else if (!y.sub.includes(x.sub)) y.sub += " · " + x.sub; });
    idx = [...ligas, ...byName.values(), ...sel, ...comps, ...pl].map(x => ({ ...x, s: norm(x.n + " " + (x.alt || "")), w: norm(x.n + " " + (x.alt || "")).split(/[^a-z0-9]+/).filter(Boolean) }));
  };
  indexAll(); whenAll(indexAll); Promise.all([vComps(), vSel()]).then(indexAll);
  q.addEventListener("focus", () => loadAll(), { once: true });   // el buscador completo necesita todas las ligas
  let act = -1;
  const items = () => [...res.querySelectorAll(".dd-item")];
  const setAct = i => { const it = items(); if (!it.length) return; act = (i + it.length) % it.length; it.forEach((x, j) => x.classList.toggle("act", j === act)); it[act].scrollIntoView({ block: "nearest" }); };
  q.addEventListener("input", () => {
    const v = norm(q.value.trim()); act = -1;
    if (v.length < 2) { res.hidden = true; return; }
    // primero la coincidencia exacta de una palabra, después el comienzo del nombre; Chile y Sudamérica primero en los empates
    const sc = x => (x.w.includes(v) ? 4 : 0) + (x.s.startsWith(v) ? 3 : 0) + (x.w.some(w => w.startsWith(v)) ? 2 : 0) + (x.reg === "Sudamérica" ? 0.8 : 0) - x.n.length / 200;
    const hits = idx.filter(x => x.s.includes(v)).sort((a, b) => sc(b) - sc(a)).slice(0, 14);
    const groups = {}; hits.forEach(h => (groups[h.k] ||= []).push(h));
    res.innerHTML = hits.length ? ["Ligas", "Equipos", "Selecciones", "Competiciones", "Jugadores"].filter(k => groups[k]).map(k => `<span class="lbl sgrp">${k}</span>` +
      groups[k].slice(0, k === "Jugadores" || k === "Competiciones" ? 5 : 6).map(x => `<button class="dd-item" ${x.go}>${x.html}<span>${esc(x.n)}<small>${esc(x.sub)}</small></span></button>`).join("")).join("")
      : `<p class="note" style="padding:10px">Sin resultados.</p>`;
    res.hidden = false;
  });
  q.addEventListener("keydown", e => {
    if (res.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAct(act + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct(act - 1); }
    else if (e.key === "Enter") { const it = items(); const t = it[act >= 0 ? act : 0]; if (t) { e.preventDefault(); t.click(); q.blur(); } }
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) res.hidden = true; });
  res.addEventListener("click", () => { res.hidden = true; q.value = ""; });
  // atajos: "/" o Ctrl/Cmd + K abren el buscador desde cualquier pantalla
  document.addEventListener("keydown", e => { const k = (e.key || "").toLowerCase(), tag = document.activeElement.tagName;
    if ((k === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) || (k === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); q.focus(); q.select(); } });
  m.addEventListener("click", e => { if (e.target.closest("[data-go]")) setOpen(false); });
}

/* ---------------- rutas ---------------- */
// Las páginas para Google tienen dirección propia (partido/premier/123-chelsea-vs-…/); el resto del sitio usa "#/…"
const BASE = new URL(".", document.baseURI).pathname, BASE_URL = new URL(".", document.baseURI).href;
const slugify = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function pathHash() {
  const rest = decodeURIComponent(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : "").replace(/index\.html$/, "").replace(/\/+$/, "");
  if (!rest) return null;
  const s = rest.split("/");
  if (s[0] === "partido" && s[1] && s[2]) return `#/partido/${s[1]}/${s[2].split("-")[0]}`;
  if (s[0] === "liga" && s[1]) return `#/liga/${s[1]}/resumen`;
  if (s[0] === "arbitro" && s[1] && s[2]) return `#/arbitro/${s[1]}/${s[2]}`;
  if (s[0] === "modelo") return "#/registro";
  if (["picks", "metodo", "terminos", "privacidad", "responsable", "sobre", "ia", "vivo", "prode", "seguimiento", "competiciones"].includes(s[0])) return "#/" + s[0];
  return "#/nf";
}
const curHash = () => (location.hash && location.hash !== "#" ? location.hash : pathHash() || "#/");
// dirección para compartir: la página propia del partido (con su vista previa en WhatsApp) cuando existe
function cleanUrl(r) {
  if (r.v === "partido" && /^\d+$/.test(String(r.id))) { const p = findMatch(r.liga, r.id) || (D.registro && (D.registro.filas || []).find(f => String(f.id) === String(r.id)));
    if (p) return `${BASE_URL}partido/${r.liga}/${r.id}-${slugify(p.home)}-vs-${slugify(p.away)}/`; }
  if (r.v === "liga" && (!r.tab || r.tab === "resumen")) return `${BASE_URL}liga/${r.liga}/`;
  if (r.v === "picks") return `${BASE_URL}picks/`;
  if (r.v === "arbitro") return `${BASE_URL}arbitro/${r.liga}/${r.id}/`;
  if (r.v === "registro" && !r.tab) return `${BASE_URL}modelo/`;
  return BASE_URL + toHash(r);
}
function toHash(r) {
  if (r.v === "liga") return `#/liga/${r.liga}/${r.tab || "resumen"}`;
  if (r.v === "partido") return `#/partido/${r.liga}/${encodeURIComponent(r.id)}${r.tab && r.tab !== "resumen" ? "/" + r.tab : ""}`;
  if (r.v === "equipo") return `#/equipo/${r.liga}/${encodeURIComponent(r.team)}`;
  if (r.v === "registro" && r.tab) return `#/registro/${r.tab}`;
  if (r.v === "jugador") return `#/jugador/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "arbitro") return `#/arbitro/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "comparar") return `#/comparar/${r.liga}/${encodeURIComponent(r.team || "")}/${encodeURIComponent(r.id || "")}`;
  if (r.v === "inicio") return r.liga && r.liga !== "todas" ? `#/partidos/${r.liga}` : "#/";
  if (r.v === "vivo") return `#/vivo${r.tab || r.id === "envivo" ? "/" + (r.tab || "hoy") : ""}${r.id === "envivo" ? "/envivo" : ""}`;
  if (r.v === "envivo") return `#/envivo/${encodeURIComponent(r.id)}${r.tab && r.tab !== "resumen" ? "/" + r.tab : ""}`;
  if (r.v === "ficha") return `#/ficha/${encodeURIComponent(r.id)}`;
  if (r.v === "prode") return `#/prode${r.id ? "/" + encodeURIComponent(r.id) + (r.tab && r.tab !== "pronosticar" ? "/" + r.tab : "") : ""}`;
  if (r.v === "comp") return `#/comp/${r.liga}${r.tab && r.tab !== "partidos" ? "/" + r.tab : ""}`;
  if (r.v === "club") return `#/club/${r.liga}/${encodeURIComponent(r.id)}${r.tab && r.tab !== "partidos" ? "/" + r.tab : ""}`;
  return `#/${r.v}`;
}
function fromHash() {
  const p = curHash().slice(2).split("/").map(decodeURIComponent);
  const first = ligasIds()[0];
  switch (p[0]) {
    case "liga": return (D.ligas[p[1]] || (D.meta && D.meta[p[1]])) ? { v: "liga", liga: p[1], tab: p[2] || "resumen" } : p[1] ? { v: "nf", what: "liga" } : { v: "liga", liga: first, tab: "resumen" };
    case "partido": return { v: "partido", liga: p[1], id: p[2], tab: p[3] || "resumen" };
    case "equipo": return { v: "equipo", liga: p[1], team: p[2] };
    case "registro": return { v: "registro", tab: p[1] };
    case "metodo": return { v: "metodo" };
    case "sobre": return { v: "sobre" };
    case "combinada": return { v: "combinada" };
    case "seguimiento": return { v: "seguimiento" };
    case "responsable": return { v: "responsable" };
    case "privacidad": return { v: "privacidad" };
    case "jugador": return { v: "jugador", liga: p[1], id: p[2] };
    case "comparar": return { v: "comparar", liga: (D.ligas[p[1]] || (D.meta && D.meta[p[1]])) ? p[1] : first, team: p[2], id: p[3] };
    case "partidos": return { v: "inicio", liga: D.ligas[p[1]] ? p[1] : "todas" };
    case "vivo": return { v: "vivo", tab: /^\d{8}$/.test(p[1] || "") ? p[1] : undefined, id: p[2] || (p[1] === "envivo" ? "envivo" : undefined) };
    case "envivo": return /^\d+$/.test(p[1] || "") ? { v: "envivo", id: p[1], tab: p[2] || "resumen" } : { v: "envivo", id: p[2], tab: p[3] || "resumen" };
    case "competiciones": return { v: "competiciones" };
    case "selecciones": return { v: "selecciones" };
    case "ficha": return { v: "ficha", id: p[1] };
    case "prode": return { v: "prode", id: p[1], tab: p[2] };
    case "noticias": return { v: "noticias" };
    case "ia": return { v: "ia" };
    case "picks": return { v: "picks" };
    case "arbitro": return { v: "arbitro", liga: p[1], id: p[2] };
    case "terminos": return { v: "terminos" };
    case "comp": return { v: "comp", liga: p[1], tab: p[2] || "partidos" };
    case "club": return { v: "club", liga: p[1], id: p[2], tab: p[3] || "partidos" };
    case "": case undefined: return { v: "inicio", liga: "todas" };
    default: return { v: "nf" };
  }
}
let skipHash = false, lastUrl = location.href;
function go(r, push = true) {
  const keep = r.keepScroll;
  R = r; render();
  if (push) { const h = toHash(r);
    // desde una página con dirección propia se vuelve a la dirección principal con "#", sin recargar
    if (location.pathname !== BASE && !location.pathname.endsWith(BASE + "index.html")) { try { history.pushState(null, "", BASE + h); } catch (e) {} }
    else if (location.hash !== h) { skipHash = true; try { location.hash = h; } catch (e) {} }
    lastUrl = location.href; }
  if (!keep) window.scrollTo({ top: 0 });
}
function syncRoute() { if (skipHash) { skipHash = false; lastUrl = location.href; return; } if (location.href === lastUrl) return; lastUrl = location.href; R = fromHash(); render(); }
window.addEventListener("hashchange", syncRoute);
window.addEventListener("popstate", syncRoute);
document.addEventListener("click", e => {
  const el = e.target.closest("[data-go]"); if (!el) return;
  const v = el.dataset.go;
  go({ v, liga: el.dataset.liga || (v === "inicio" ? (R.v === "inicio" ? R.liga : "todas") || "todas" : undefined), id: el.dataset.id, team: el.dataset.team, tab: el.dataset.tab,
       wk: el.dataset.wk, sort: el.dataset.sort, dia: el.dataset.dia || (v === "inicio" && R.v === "inicio" ? R.dia : undefined), keepScroll: el.hasAttribute("data-keep") });
  if (el.classList.contains("lpick")) { const g = document.querySelector(".lgrid"); if (g) window.scrollTo({ top: g.getBoundingClientRect().top + window.scrollY - 90 }); }
});

let masObs = null;
function vigilarMas() {   // al llegar a "Más análisis" se bajan las ligas completas (tablas, rankings, rachas)
  if (D.allLoaded || !("IntersectionObserver" in window)) return;
  const el = document.getElementById("mas-analisis"); if (!el) return;
  if (masObs) masObs.disconnect();
  masObs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { masObs.disconnect(); loadAll(); loadExtras(); loadFotos(); } }, { rootMargin: "600px" });
  masObs.observe(el);
}
function render() {
  timers.splice(0).forEach(clearInterval);
  const need = ["liga", "partido", "equipo", "jugador", "comparar", "arbitro"].includes(R.v) && R.liga && D.meta && D.meta[R.liga] && (!D.ligas[R.liga] || D.ligas[R.liga].lite) ? R.liga : null;
  // el partido y el jugador necesitan además el detalle de los partidos de esa liga
  if (!need && ["partido", "jugador"].includes(R.v) && D.ligas[R.liga] && !D.ligas[R.liga]._det) {
    $app.innerHTML = skeleton(); const want = R.liga;
    ensureDet(want).then(() => { if (R.liga === want && ["partido", "jugador"].includes(R.v)) render(); });
    return;
  }
  if (need) {
    const er = LOADERR[need];
    if (er && er.n >= 2) { $app.innerHTML = `<div class="panel empty stack"><b>No pude cargar ${esc((D.meta[need] || {}).nombre || "esta liga")}.</b><span class="muted">Puede ser la conexión o que el sitio se está actualizando.</span><button class="btn" data-retry="${esc(need)}">Reintentar</button></div>`; return; }
    $app.innerHTML = skeleton();
    const want = need;
    setTimeout(() => (["partido", "jugador"].includes(R.v) ? ensureDet(want) : ensure(want)).then(() => { if (R.liga === want) render(); }), er ? 1500 : 0);
    return;
  }
  const sec = ({ partido: "inicio", equipo: "liga", jugador: "liga", comparar: "liga", sobre: "metodo", responsable: "metodo", privacidad: "metodo", terminos: "metodo", arbitro: "liga", combinada: "seguimiento", envivo: "vivo", competiciones: "vivo", comp: "vivo", club: "vivo", noticias: "vivo", selecciones: "vivo", ficha: "vivo", prode: "prode" }[R.v] || R.v);
  document.querySelectorAll("[data-nav]").forEach(b => b.setAttribute("aria-current", b.dataset.nav === sec ? "page" : "false"));
  const f = { inicio: vInicio, liga: vLiga, partido: vPartido, equipo: vEquipo, registro: vRegistro, metodo: vMetodo,
    sobre: vSobre, responsable: vResponsable, jugador: vJugador, comparar: vComparar, combinada: vCombinada, seguimiento: vSeguimiento,
    vivo: vVivo, envivo: vEnVivo, competiciones: vCompeticiones, comp: vComp, club: vClub, noticias: vNoticias, selecciones: vSelecciones, ficha: vFicha, prode: vProde, privacidad: vPrivacidad, nf: vNoEncontrado, ia: vIA, picks: vPicks, terminos: vTerminos, arbitro: vArbitro }[R.v] || vInicio;
  $app.innerHTML = staleBanner() + f();
  try { document.title = routeTitle(); } catch (e) {}
  if (R.v === "partido") { bindOdds(); if (R.tab === "alineaciones" || document.getElementById("xi-adj")) loadSummary(); }
  if (R.v === "comparar") bindCompare();
  if (R.v === "combinada") bindCombinada();
  if (R.v === "seguimiento") bindSeguimiento();
  paintComboBar();
  hydrateVotes();
  bindCarousels();
  paintLive();
  paintCountdown();
  if (R.v === "inicio") vigilarMas();
  if (["registro", "metodo", "partido", "picks"].includes(R.v)) loadExtras();
  if (["partido", "jugador", "equipo", "envivo", "arbitro", "liga"].includes(R.v)) loadFotos();
  centrarActivos();
}
/* en las barras que se deslizan de lado, deja a la vista la opción elegida (p. ej. "Árbitros" en el teléfono) */
function centrarActivos() {
  for (const sc of document.querySelectorAll(".hsort,.tabs2.wide,.vdays,.mtabs,.vhub,.lscroll")) {
    if (sc.scrollWidth <= sc.clientWidth + 2) continue;
    const b = sc.querySelector('[aria-pressed="true"],[aria-selected="true"],[aria-current="page"]'); if (!b) continue;
    const x = b.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
    if (x < sc.scrollLeft || x + b.offsetWidth > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = Math.max(0, x - (sc.clientWidth - b.offsetWidth) / 2);
  }
}

// para las pruebas automáticas (tests/): ruta actual, enlace limpio y datos cargados
window.__bt = { route: () => R, cleanUrl: () => cleanUrl(R), data: () => D,
  ia: { dia: async q => { const { ctx, idmap } = await iaCtxDia(q); return { ctx, dias: Object.fromEntries(Object.entries(idmap).map(([k, c]) => [k, iaDia(new Date(c.t).toISOString())])),
      mids: Object.fromEntries(Object.entries(idmap).map(([k, c]) => [k, iaEvId(c)])),
      picks: ((D.picksPub || {}).dias || []).filter(d => d.dia === isoDay(new Date())).flatMap(d => d.picks.map(f => String(f.id))) }; },
    partido: async (liga, id) => { await ensureDet(liga); const L = D.ligas[liga], p = findMatch(liga, id); return L && p ? iaCtxPartido(L, p) : null; } } };
function routeTitle() {
  const L = D.ligas[R.liga], T = " | Ballytics";
  if (R.v === "partido") { const p = findMatch(R.liga, R.id) || (D.registro && (D.registro.filas || []).find(f => String(f.id) === String(R.id))); if (p) return `${p.home} vs ${p.away}: probabilidades y pronóstico${T}`; }
  if ((R.v === "liga" || R.v === "inicio" && R.liga && R.liga !== "todas") && L) return `${L.nombre}: probabilidades y pronósticos${T}`;
  if (R.v === "equipo" && R.team) return `${R.team}: partidos y probabilidades${T}`;
  if (R.v === "arbitro") { const r = ((D.arbH || {})[R.liga] || {}).refs; const x = r && r[R.id]; if (x) return `${x.n}: árbitro, tarjetas e historial${T}`; }
  if (R.v === "jugador" && L) { const g = (L.goleadores || []).find(x => String(x.jid) === String(R.id)); if (g) return g.jugador + T; }
  const fijo = { picks: "Picks públicos", registro: "Resultados del modelo", metodo: "Cómo funciona", vivo: "Partidos en vivo", prode: "Prode", seguimiento: "Mis pronósticos", terminos: "Términos de uso", privacidad: "Privacidad",
    responsable: "Juego responsable", sobre: "Sobre Ballytics", competiciones: "Todas las competiciones", combinada: "Combinada", ia: "Ballytics IA", noticias: "Noticias", selecciones: "Selecciones" }[R.v];
  return fijo ? fijo + T : "Ballytics: probabilidades de fútbol";
}
/* ---------------- componentes ---------------- */
const formHtml = f => `<span class="form">${(f || []).map(x => `<i class="${x}">${x}</i>`).join("")}</span>`;
const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="lbl">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;
const bar3 = (h, d, a) => `<span class="bars"><i style="width:${100 * h}%"></i><i style="width:${100 * d}%"></i><i style="width:${100 * a}%"></i></span>`;
function zoneOf(L, pos) { return (L.zonas || []).find(z => pos >= z.desde && pos <= z.hasta); }
function posTag(L, pos) { const z = zoneOf(L, pos); return `<span class="pos ${z ? "z-" + z.cls : ""}" ${z ? `title="${esc(z.nombre)}"` : ""}>${pos}</span>`; }

const shortDay = iso => new Date(iso).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
function matchRow(p, showLeague, isFav, showDate, met) {
  const L = p.L || D.ligas[p.liga], fav = p.pH >= p.pA ? "h" : "a";
  const pick = p.pH >= p.pD && p.pH >= p.pA ? "1" : p.pA >= p.pD ? "2" : "X";
  return `<button class="mrow ${isFav ? "isfav" : ""}" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
    <span class="t" data-live-t="${esc(p.id)}">${showDate && p.estado !== "en_vivo" ? `<small class="mdate">${esc(shortDay(p.kickoff))}</small>` : ""}${p.estado === "en_vivo" ? `<span class="livetag">EN VIVO</span>` : hhmm(p.kickoff)}${new Date(p.kickoff).getTime() - Date.now() < 3 * 3600e3 ? `<span class="cdown sm" data-cd="${esc(p.kickoff)}"></span>` : ""}${showLeague ? `<span class="lg">${esc(L.nombre)}</span>` : ""}</span>
    <span class="teams">
      <span class="tline">${badge(L, p.home)}<span class="n ${fav === "h" ? "fav" : "und"}">${esc(corto(L, p.home))}</span></span>
      <span class="tline">${badge(L, p.away)}<span class="n ${fav === "a" ? "fav" : "und"}">${esc(corto(L, p.away))}</span></span>
    </span>
    <span class="p3">${met ? `<span class="mmet">${esc(met)}</span>` : ""}${bar3(p.pH, p.pD, p.pA)}<span class="nums"><span><b>${pct(p.pH)}</b></span><span>${pct(p.pD)}</span><span><b>${pct(p.pA)}</b></span></span></span>
    <span class="pick" data-live-s="${esc(p.id)}"><span class="s">${esc(p.top)}</span><span class="l">Pick ${pick}</span></span>
  </button>`;
}
function resultRow(L, x) {
  return `<div class="rrow"><span class="num muted">${fecha(x.kickoff)}</span>
    <span class="rt r">${esc(corto(L, x.home))}${badge(L, x.home)}</span>
    <b class="score num">${x.hg} – ${x.ag}</b>
    <span class="rt">${badge(L, x.away)}${esc(corto(L, x.away))}</span></div>`;
}
function card(title, body, extra = "", cls = "") {
  return `<article class="panel wcard ${cls}"><header class="wh"><h3>${title}</h3>${extra}</header>${body}</article>`;
}
function picker(key, sel, items) {
  const cur = items.find(x => x.id === sel) || items[0];
  return `<div class="pk" data-pk="${key}"><button class="pk-btn" aria-haspopup="listbox" aria-expanded="false">${leagueMark(cur.L, "sm")}<span>${esc(cur.L.nombre)}</span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <div class="pk-menu" role="listbox" hidden>${items.map(x => `<button role="option" aria-selected="${x.id === cur.id}" ${x.attrs}>${leagueMark(x.L, "sm")}<span>${esc(x.L.nombre)}<small>${esc(x.L.pais)}</small></span></button>`).join("")}</div></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest(".pk-btn");
  document.querySelectorAll(".pk-menu").forEach(m => { if (!b || m.parentNode !== b.parentNode) { m.hidden = true; m.parentNode.querySelector(".pk-btn").setAttribute("aria-expanded", "false"); } });
  if (b) { const m = b.parentNode.querySelector(".pk-menu"); m.hidden = !m.hidden; b.setAttribute("aria-expanded", String(!m.hidden)); }
});
function carousel(id, slides, label) {
  if (!slides.length) return `<p class="note">Sin datos todavía.</p>`;
  return `<div class="car" data-car="${id}" aria-roledescription="carrusel" aria-label="${esc(label)}">
    <div class="car-track">${slides.map((s, i) => `<div class="car-slide" ${i ? "hidden" : ""}>${s}</div>`).join("")}</div>
    ${slides.length > 1 ? `<div class="car-dots">${slides.map((_, i) => `<button aria-label="Ver ${i + 1} de ${slides.length}" aria-pressed="${i === 0}" data-i="${i}"></button>`).join("")}</div>` : ""}
  </div>`;
}
function bindCarousels() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".car").forEach(c => {
    const slides = [...c.querySelectorAll(".car-slide")], dots = [...c.querySelectorAll(".car-dots button")];
    if (slides.length < 2) return;
    let i = 0, paused = false;
    const show = k => { i = (k + slides.length) % slides.length; slides.forEach((s, j) => s.hidden = j !== i); dots.forEach((d, j) => d.setAttribute("aria-pressed", String(j === i)));
      document.querySelectorAll(`.car[data-sync="${c.dataset.car}"] .car-slide`).forEach((s, j) => s.hidden = j !== i); };
    if (c.dataset.sync) return;
    dots.forEach(d => d.addEventListener("click", e => { e.stopPropagation(); show(+d.dataset.i); paused = true; }));
    // deslizar con el dedo
    let sx = null, sy = 0, st = 0;
    c.addEventListener("touchstart", e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); paused = true; }, { passive: true });
    c.addEventListener("touchend", e => {
      if (sx === null) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > 1.4 * Math.abs(dy) && Date.now() - st < 800) {
        c.dataset.swiped = String(Date.now()); const dir = dx < 0 ? 1 : -1; show(i + dir);
        const sl = slides[i]; sl.classList.remove("in-l", "in-r"); void sl.offsetWidth; sl.classList.add(dir > 0 ? "in-r" : "in-l");
      }
    }, { passive: true });
    c.addEventListener("click", e => { if (Date.now() - (+c.dataset.swiped || 0) < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
    c.addEventListener("mouseenter", () => paused = true);
    c.addEventListener("mouseleave", () => paused = false);
    c.addEventListener("focusin", () => paused = true);
    if (!reduce && c.dataset.car === "hero") timers.push(setInterval(() => { if (!paused && !document.hidden) show(i + 1); }, 8000));   // solo el destacado gira solo
  });
}

/* ---------------- días ---------------- */
function dayList(sel) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [...Array(8).keys()].map(i => isoDay(new Date(today.getTime() + (i - 1) * DAYMS)));
  const inSel = id => sel === "todas" || id === sel;
  const byDay = {};
  days.forEach(k => byDay[k] = { res: [], fx: [] });
  ligasIds().filter(inSel).forEach(id => {
    const L = D.ligas[id];
    L.resultados.forEach(x => { const k = dayKey(x.kickoff); if (byDay[k]) byDay[k].res.push({ ...x, L }); });
    L.partidos.forEach(p => { const k = dayKey(p.kickoff); if (byDay[k] && !byDay[k].res.some(x => String(x.id) === String(p.id))) byDay[k].fx.push({ ...p, L }); });
  });
  const cnt = k => byDay[k].res.length + byDay[k].fx.length;
  let dia = R.dia && byDay[R.dia] ? R.dia : null;
  if (!dia) dia = days.slice(1).find(k => byDay[k].fx.length) || days[1];
  const short = k => { const lab = dayLabel(k); if (["Hoy", "Mañana", "Ayer"].includes(lab)) return lab;
    const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d); return dt.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", ""); };
  const dnum = k => k.split("-")[2].replace(/^0/, "");
  const strip = `<div class="days" role="tablist" aria-label="Día">${days.map(k => `<button role="tab" class="dbtn" data-go="inicio" data-dia="${k}" data-liga="${sel}" data-keep aria-selected="${k === dia}"><span class="dn">${esc(short(k))}</span><b>${dnum(k)}</b><small>${cnt(k) || "–"}</small></button>`).join("")}</div>`;
  const items = [...byDay[dia].res.map(x => ({ t: x.kickoff, x, r: true })), ...byDay[dia].fx.map(p => ({ t: p.kickoff, x: p }))];
  const fav = it => isFavT(it.x.L.id, it.x.home) || isFavT(it.x.L.id, it.x.away) || isFavL(it.x.L.id);
  // ordenar como en Forebet: por hora o por lo que el modelo ve más claro en cada mercado
  const so = HSORT.find(x => x[0] === VV.hsort) || HSORT[0];
  if (so[0] === "hora") items.sort((a, b) => (fav(b) - fav(a)) || a.t.localeCompare(b.t));
  else items.sort((a, b) => (!!a.r - !!b.r) || ((b.r ? -1 : so[2](b.x) ?? -1) - (a.r ? -1 : so[2](a.x) ?? -1)) || a.t.localeCompare(b.t));
  const fila = (it, conLiga) => it.r ? resRow(it.x, conLiga, fav(it)) : matchRow(it.x, conLiga, fav(it), false, so[0] === "hora" ? null : so[3](it.x));
  let rows;
  if (sel === "todas" && so[0] === "hora") {
    // agrupados por liga, como en las apps grandes: primero las que sigues, después en el orden del menú
    const orden = D.indice.ligas.map(l => l.id), grupos = new Map();
    items.forEach(it => { const id = it.x.L.id; if (!grupos.has(id)) grupos.set(id, []); grupos.get(id).push(it); });
    const ids = [...grupos.keys()].sort((a, b) => (isFavL(b) - isFavL(a)) || (orden.indexOf(a) - orden.indexOf(b)));
    const lim = VV.homeLim || 40; let n = 0;
    rows = ids.map(id => { if (n >= lim) return ""; const L = D.ligas[id], g = grupos.get(id), vivo = g.some(it => !it.r && it.x.estado === "en_vivo");
      const cab = `<button class="lgh" data-go="liga" data-liga="${id}" data-tab="partidos">${leagueMark(L, "sm")}<span class="lgh-n"><b>${esc(L.nombre)}</b><small>${esc(L.pais || "")}</small></span>${vivo ? `<span class="livetag">EN VIVO</span>` : ""}<span class="lgh-c">${g.length}</span><svg class="lgh-a" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3 7.5 6 4.5 9"/></svg></button>`;
      const filas = g.slice(0, Math.max(1, lim - n)); n += filas.length;
      return `<div class="lgroup">${cab}${filas.map(it => fila(it, false)).join("")}</div>`; }).join("");
    if (items.length > lim) rows += `<button class="vmore" id="home-more">Ver ${Math.min(40, items.length - lim)} partidos más (${items.length - lim} restantes)</button>`;
  } else rows = items.map(it => fila(it, sel === "todas")).join("");
  const more = !D.allLoaded && !D.agenda ? `<div class="skel-row"><span class="skel" style="width:40%"></span></div>` : "";
  const sortBar = byDay[dia].fx.length > 1 ? `<div class="hsort" role="group" aria-label="Ordenar partidos"><span class="lbl">Ordenar</span>${HSORT.map(x => `<button data-hsort="${x[0]}" aria-pressed="${x === so}">${x[1]}</button>`).join("")}</div>` : "";
  return `${strip}${sortBar}${so[0] === "mercado" ? `<p class="note hs-note">Diferencia entre el modelo propio y el mercado sin margen. Es una comparación, no un consejo: en el backtest el mercado fue más preciso.</p>` : ""}<div class="panel flush daypanel">${rows || `<div class="empty">No hay partidos ${dayLabel(dia) === "Hoy" ? "hoy" : "este día"}${sel !== "todas" ? " en esta liga" : ""}.</div>`}${more}</div>`;
}
const mktDif = p => { const q = mktOf(p); if (!q || !p.modelo) return null; const own = [p.modelo.pH, p.modelo.pD, p.modelo.pA];
  const i = [0, 1, 2].sort((a, b) => Math.abs(own[b] - q.p[b]) - Math.abs(own[a] - q.p[a]))[0]; return { i, d: own[i] - q.p[i] }; };
const HSORT = [
  ["hora", "Hora"],
  ["seguro", "Más claro", p => Math.max(p.pH, p.pD, p.pA), p => { const m = Math.max(p.pH, p.pD, p.pA); return `${m === p.pH ? "Local" : m === p.pA ? "Visita" : "Empate"} ${pct(m)}`; }],
  ["goles", "+2,5 goles", p => p.pO25, p => p.pO25 != null ? `+2,5 · ${pct(p.pO25)}` : ""],
  ["btts", "Ambos marcan", p => p.pBTTS, p => p.pBTTS != null ? `Ambos · ${pct(p.pBTTS)}` : ""],
  ["mercado", "Modelo vs mercado", p => { const m = mktDif(p); return m ? Math.abs(m.d) : null; }, p => { const m = mktDif(p); return m ? `${["Local", "Empate", "Visita"][m.i]} ${m.d > 0 ? "+" : "−"}${Math.round(Math.abs(m.d) * 100)} pts` : "sin cuota"; }],
];
document.addEventListener("click", e => { if (e.target.id === "home-more") { VV.homeLim = (VV.homeLim || 40) + 40; go({ ...R, keepScroll: true }, false); } });
document.addEventListener("click", e => { const b = e.target.closest("[data-hsort]"); if (!b) return; VV.hsort = b.dataset.hsort; lsSet("bt_hsort", VV.hsort); go({ ...R, keepScroll: true }, false); });
function resRow(x, showLeague, fav) {
  const L = x.L, hw = x.hg > x.ag, aw = x.ag > x.hg;
  return `<div class="mrow res ${fav ? "isfav" : ""}">
    <span class="t"><span class="fttag">Final</span>${showLeague ? `<span class="lg">${esc(L.nombre)}</span>` : ""}</span>
    <span class="teams">
      <button class="tline" data-go="equipo" data-liga="${L.id}" data-team="${esc(x.home)}">${badge(L, x.home)}<span class="n ${hw ? "fav" : "und"}">${esc(corto(L, x.home))}</span></button>
      <button class="tline" data-go="equipo" data-liga="${L.id}" data-team="${esc(x.away)}">${badge(L, x.away)}<span class="n ${aw ? "fav" : "und"}">${esc(corto(L, x.away))}</span></button>
    </span>
    <span class="rscore num"><b class="${hw ? "w" : ""}">${x.hg}</b><b class="${aw ? "w" : ""}">${x.ag}</b></span>
    <span class="pick"><span class="l">${(x.goles || []).length ? esc(x.goles.map(g => (g.jug || "").split(" ").slice(-1)[0]).slice(0, 3).join(", ")) : ""}</span></span>
  </div>`;
}

/* ---------------- favoritos ---------------- */
const FAV_KEY = "bt_favs";
let FAVS = { t: [], l: [] };
try { FAVS = Object.assign(FAVS, JSON.parse(localStorage.getItem(FAV_KEY) || "{}")); } catch (e) {}
const isFavT = (liga, t) => FAVS.t.includes(liga + "|" + t);
const isFavL = liga => FAVS.l.includes(liga);
function toggleFav(kind, key) {
  const arr = FAVS[kind], i = arr.indexOf(key);
  if (i >= 0) arr.splice(i, 1); else arr.push(key);
  try { localStorage.setItem(FAV_KEY, JSON.stringify(FAVS)); } catch (e) {}
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-fav]"); if (!b) return;
  e.stopPropagation();
  toggleFav(b.dataset.fav, b.dataset.key);
  const on = FAVS[b.dataset.fav].includes(b.dataset.key);
  b.setAttribute("aria-pressed", String(on));
  b.querySelector("span").textContent = on ? "Siguiendo" : "Seguir";
});
const starBtn = (kind, key, label) => { const on = FAVS[kind].includes(key);
  return `<button class="star" data-fav="${kind}" data-key="${esc(key)}" aria-pressed="${on}" title="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg><span>${on ? "Siguiendo" : "Seguir"}</span></button>`; };
function misPartidos() {
  if (!FAVS.t.length && !FAVS.l.length)
    return `<div class="hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg><span>Sigue a tus equipos y ligas con el botón <b>Seguir</b> para ver aquí sus próximos partidos.</span></div>`;
  const now = Date.now();
  const ms = ligasIds().flatMap(id => D.ligas[id].partidos.filter(p => new Date(p.kickoff).getTime() >= now - 2 * 3600e3 &&
      (isFavL(id) || isFavT(id, p.home) || isFavT(id, p.away))).map(p => ({ ...p, L: D.ligas[id] })))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const seen = new Set(), uniq = ms.filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, 6);
  const teams = FAVS.t.map(k => { const [liga, ...t] = k.split("|"); return { L: D.ligas[liga] || D.meta[liga], t: t.join("|") }; }).filter(x => x.L && x.L.equipos);
  return `<section class="panel stack mine"><div class="row" style="justify-content:space-between"><h3>Mis partidos</h3>
      <div class="chips mini">${teams.map(x => `<button class="chip-btn tchip" data-go="equipo" data-liga="${x.L.id}" data-team="${esc(x.t)}">${badge(x.L, x.t)}${esc(corto(x.L, x.t))}</button>`).join("")}</div></div>
    ${uniq.length ? `<div class="mine-list">${uniq.map(p => matchRow(p, true, true)).join("")}</div>` : `<p class="note">Tus equipos no tienen partidos programados por ahora.</p>`}</section>`;
}

/* ---------------- esqueletos ---------------- */
// esqueletos de carga: tarjetas grises animadas con la forma de lo que viene
const skelRows = n => `<div class="panel flush skel-list" role="status" aria-busy="true" aria-label="Cargando">${Array.from({ length: n }, (_, i) => `<div class="skel-r"><span class="skel sk-c"></span><span class="skel" style="width:${[62, 48, 70, 55, 66][i % 5]}%"></span><span class="skel sk-s"></span></div>`).join("")}</div>`;
const skelHead = () => `<div class="skel-h" role="status" aria-busy="true" aria-label="Cargando"><span class="skel sk-l"></span><span class="skel" style="width:45%;height:22px"></span></div>`;
function skeleton() {
  const line = w => `<span class="skel" style="width:${w}"></span>`;
  return `<section class="view"><div class="panel skel-box" style="height:220px"></div>
    <div class="cards">${[1, 2, 3].map(() => `<div class="panel stack">${line("40%")}${line("90%")}${line("75%")}${line("60%")}</div>`).join("")}</div></section>`;
}

/* ---------------- asistente con IA ---------------- */
// La IA (Gemini en el servidor de Ballytics; si falla, la IA gratis de Cloudflare) responde solo con los datos que se
// le mandan desde aquí. Antes de preguntar se arma: qué días pide el usuario (hoy por defecto), todos los partidos
// de esos días con el modelo (también copas entre equipos que el modelo conoce), los que solo tienen cuota de mercado,
// rankings ya ordenados, partidos en vivo y resultados, el detalle de los equipos que nombra y cómo le va al modelo.
const iaNorm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COMUNES = new Set(["como", "real", "union", "nacional", "universidad", "independiente", "deportivo", "atletico", "sport", "city", "united", "club"]);
const reWord = n => new RegExp(`(^|[^a-z0-9])${iaNorm(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
function iaCtxPartido(L, p) {
  const k = markets(pmatrix(L, p).m), st = ODDS[p.id] || {}, q = mktOf(p), pin = q && /pinnacle/i.test(q.casa || ""), sh = rowOf(L, p.home), sa = rowOf(L, p.away), eh = statOf(L, p.home), ea = statOf(L, p.away);
  const tus = Object.fromEntries(Object.entries(st).filter(([key, v]) => key[0] !== "_" && v > 1));
  return {
    liga: L.nombre, partido: `${p.home} (local) vs ${p.away} (visita)`, cuando: `${iaDia(p.kickoff)} ${hhmm(p.kickoff)}`,
    prob_ballytics: { local: pct(k.H), empate: pct(k.D), visita: pct(k.A), mas_2_5: pct(k.O25), ambos_marcan: pct(k.B), marcador_mas_probable: p.top },
    cuota_justa: { local: dec(1 / k.H), empate: dec(1 / k.D), visita: dec(1 / k.A), mas_2_5: dec(1 / k.O25), ambos_marcan: dec(1 / k.B) },
    goles_esperados: { local: dec(p.lh), visita: dec(p.la), nota: "xG previsto por el modelo" },
    fuente_prob: p.calib ? "modelo ajustado a la cuota sin margen" : "modelo propio (sin cuota)",
    modelo_propio: p.modelo ? { local: pct(p.modelo.pH), empate: pct(p.modelo.pD), visita: pct(p.modelo.pA) } : null,
    comparativa_pinnacle: pin ? { pinnacle_sin_margen: { local: pct(q.p[0]), empate: pct(q.p[1]), visita: pct(q.p[2]) },
      diferencia_modelo_propio_pts: p.modelo ? { local: sgn(Math.round((p.modelo.pH - q.p[0]) * 100)), empate: sgn(Math.round((p.modelo.pD - q.p[1]) * 100)), visita: sgn(Math.round((p.modelo.pA - q.p[2]) * 100)) } : null } : "Pinnacle no publicó cuota para este partido",
    mercado_sin_margen: q && !pin ? { local: pct(q.p[0]), empate: pct(q.p[1]), visita: pct(q.p[2]), fuente: q.casa || "" } : null,
    cuotas_casa: p.cuotas ? { local: p.cuotas.h, empate: p.cuotas.d, visita: p.cuotas.a, casa: p.cuotas.casa || "ESPN", linea_goles: p.cuotas.linea, mas: p.cuotas.over, menos: p.cuotas.under } : null,
    cuotas_del_usuario: Object.keys(tus).length ? tus : null,
    corners_esperados: p.ch != null ? dec(p.ch + p.ca, 1) : null, tarjetas_esperadas: p.th != null ? dec(p.th + p.ta, 1) : null,
    promedios_temporada: { local: { goles: dec(eh.gf), recibe: dec(eh.gc), tiros_al_arco: dec(eh.tiros_arco, 1), corners: dec(eh.corners, 1), tarjetas: dec(eh.tarjetas, 1), posesion: eh.posesion != null ? dec(eh.posesion, 0) + "%" : null },
      visita: { goles: dec(ea.gf), recibe: dec(ea.gc), tiros_al_arco: dec(ea.tiros_arco, 1), corners: dec(ea.corners, 1), tarjetas: dec(ea.tarjetas, 1), posesion: ea.posesion != null ? dec(ea.posesion, 0) + "%" : null } },
    tabla: { local: sh.pos ? `${sh.pos}º, ${sh.pts} pts, forma ${(sh.forma || []).join("")}` : null, visita: sa.pos ? `${sa.pos}º, ${sa.pts} pts, forma ${(sa.forma || []).join("")}` : null },
    bajas: p.bajas ? { local: (p.bajas.h || []).slice(0, 8).map(x => `${x.jug} (${x.tipo === "Missing Fixture" ? "baja" : "duda"}${x.goles ? `, ${x.goles} goles` : ""})`), visita: (p.bajas.a || []).slice(0, 8).map(x => `${x.jug} (${x.tipo === "Missing Fixture" ? "baja" : "duda"}${x.goles ? `, ${x.goles} goles` : ""})`) } : "sin datos",
    goleadores_probables: (p.goleadores || []).slice(0, 5).map(g => `${g.jugador} ${pct(g.p)}`),
    arbitro: p.arbitro && p.arbitro.n ? iaArb(L, p) : "sin árbitro designado todavía",
    ultimos_cruces: (p.h2h || []).slice(0, 4).map(x => `${x.home} ${x.hg}-${x.ag} ${x.away}`),
  };
}
function iaArb(L, p) {
  const a = p.arbitro, lg = L.arbitros_liga || {}, eq = e => e && e.pj ? `${e.pj} PJ, ${e.g}-${e.e}-${e.p}, ${dec(e.tpp, 1)} tarjetas/PJ (con todos los árbitros ${dec(e.tpp_todos, 1)}), penales ${e.pf} a favor y ${e.pc} en contra` : "no lo ha dirigido esta temporada";
  return { nombre: a.n, partidos_temporada: a.pj, tarjetas_por_partido: a.tpp != null ? `${dec(a.tpp, 1)} (liga ${dec(lg.tpp, 1)})` : null, penales_por_partido: a.penpp != null ? `${dec(a.penpp, 2)} (liga ${dec(lg.penpp, 2)})` : null,
    gana_local: a.local != null ? `${pct(a.local, 0)} (liga ${pct(lg.local, 0)})` : null, tarjetas_esperadas_ajustadas_por_arbitro: a.tarjetas_aj != null ? dec(a.tarjetas_aj, 1) : null,
    con_local: eq((a.eq || {}).h), con_visita: eq((a.eq || {}).a),
    ...(a.h3 ? iaArb3(L, p) : {}),
    nota: "Con pocos partidos las diferencias son casi siempre azar: no digas que un árbitro favorece o perjudica a un equipo. Si una diferencia está marcada como LLAMATIVA, dila tal cual (por ejemplo: 'con él, X sumó 0,8 puntos por partido cuando lo normal para X es 1,7: llamativo') y aclara que no prueba favoritismo." };
}
function iaArb3(L, p) {
  const a = p.arbitro, H3 = a.h3, B = H3.liga || {};
  const perfil = (H3.perfil || []).map(k => (ARB_PERFIL[k] || [k])[0]).join(", ") || "pocos partidos para un perfil";
  const eq = (e, t) => !e || !e.pj ? `${t}: no lo ha dirigido en 3 temporadas` : `${t}: ${e.pj} PJ (${e.g}-${e.e}-${e.p}), ${dec(e.ppg, 2)} puntos por partido (lo normal ${dec(e.ppg_esp, 2)}${/mejor|peor/.test(e.v_p) ? `, LLAMATIVO: le fue ${e.v_p}` : ""})`
    + (e.tr != null ? `, ${dec(e.tr, 1)} tarjetas recibidas por partido (lo normal ${dec(e.tr_esp, 1)}${/mas|menos/.test(e.v_t) ? `, LLAMATIVO: ${e.v_t === "mas" ? "más" : "menos"} tarjetas` : ""})` : "")
    + (e.pf != null ? `, goles de penal a favor ${e.pf} y en contra ${e.pc}` : "");
  return { historial_3_temporadas: { partidos: H3.pj, perfil, tarjetas_por_partido: H3.tpp != null ? `${dec(H3.tpp, 1)} (liga ${dec(B.tpp, 1)})` : null,
    faltas_por_partido: H3.fpp != null ? `${dec(H3.fpp, 1)} (liga ${dec(B.fpp, 1)}; menos = deja jugar)` : null, rojas_por_partido: H3.rpp != null ? `${dec(H3.rpp, 2)} (liga ${dec(B.rpp, 2)})` : null,
    gana_local: `${pct(H3.local, 0)} (liga ${pct(B.local, 0)})`, con_local: eq((a.eq3 || {}).h, p.home), con_visita: eq((a.eq3 || {}).a, p.away),
    es_azar: H3.azar && H3.azar.p ? `En ${H3.azar.p.pares} pares árbitro-equipo de la liga, ${H3.azar.p.llamativos} diferencias de resultados son llamativas tras corregir por comparaciones múltiples; el ${pct(H3.azar.p.sobre2, 0)} se aleja mucho de lo normal cuando el azar daría 5 %: en resultados, lo que se ve es casi todo suerte.` : undefined } };
}
// ---- qué días pide el usuario
const DOW = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"], DOW_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dia0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const diaN = n => { const t = dia0(); t.setDate(t.getDate() + n); return t; };
function iaDia(iso) { const k = Math.round((new Date(new Date(iso).toDateString()) - dia0()) / DAYMS);
  return k === 0 ? "HOY" : k === 1 ? "MAÑANA" : k === -1 ? "AYER" : new Date(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric" }).toUpperCase(); }
function iaAlcance(q) {
  const s = iaNorm(q), dow = new Date().getDay();
  if (/pasado manana/.test(s)) return { a: 2, b: 3, nombre: "pasado mañana" };
  if (/\bmanana\b/.test(s) && !/(de|en|por|esta) la manana/.test(s)) return { a: 1, b: 2, nombre: "mañana" };
  if (/finde|fin de semana/.test(s)) return { a: dow === 6 || dow === 0 ? 0 : 6 - dow, b: dow === 0 ? 1 : 8 - dow, nombre: "el fin de semana" };
  for (let i = 0; i < 7; i++) if (reWord(DOW[i]).test(s)) { const k = (i - dow + 7) % 7; return { a: k, b: k + 1, nombre: k === 0 ? "hoy" : k === 1 ? "mañana" : "el " + DOW_ES[i] }; }
  if (/semana|proximos dias|7 dias/.test(s)) return { a: 0, b: 7, nombre: "los próximos 7 días" };
  if (/\bhoy\b|esta noche|esta tarde|ahora|en vivo|jugando/.test(s)) return { a: 0, b: 1, nombre: "hoy" };
  return { a: 0, b: 1, nombre: "hoy", auto: true };
}
// copas: si los dos equipos están en el modelo de alguna liga (p. ej. Premier + Championship), se calcula con ese modelo
function iaModeloPara(h, a) {
  let alt = null;
  for (const id of ligasIds()) { const L = D.ligas[id], M = L && L.modelo; if (!M || !M.equipos || !M.equipos[h] || !M.equipos[a]) continue;
    if ((L.tabla || []).some(s => s.equipo === h || s.equipo === a)) return L; alt = alt || L; }
  return alt;
}
const iaEvId = c => String(c.kind === "liga" ? c.p.id : c.ev.id);
async function iaCandidatos(al) {
  const now = Date.now(), desde = diaN(al.a).getTime(), hasta = diaN(al.b).getTime(), out = [];
  const enRango = t => t >= desde && t < hasta && t > now - 3 * 3600e3;
  allMatches().forEach(p => { const t = new Date(p.kickoff).getTime(); if (enRango(t)) out.push({ kind: "liga", p, L: p.L, t, home: p.home, away: p.away, comp: p.L.nombre,
    k: { H: p.pH, D: p.pD, A: p.pA, O25: p.pO25, B: p.pBTTS, lh: p.lh, la: p.la } }); });
  const keys = []; for (let i = al.a; i < Math.min(al.b, al.a + 7); i++) keys.push(ymd(diaN(i)));
  if (al.a > 0) keys.unshift(ymd(diaN(0)));   // siempre se mira hoy, para saber qué está en vivo
  const evs = (await Promise.all([...new Set(keys)].map(k => withTimeout(vFetchDay(k), 8000).catch(() => [])))).flat();
  const ya = new Set(out.map(iaEvId)), live = {};
  for (const e of evs) {
    if (e.state === "in" || e.state === "post") live[String(e.id)] = e;
    if (ya.has(String(e.id))) continue;
    const t = new Date(e.date).getTime(); if (!enRango(t) || e.state === "post") continue;
    const hn = e.h.full || e.h.name, an = e.a.full || e.a.name, L = iaModeloPara(hn, an);
    if (L) { const [lh, la] = rates(L.modelo, hn, an), mk = markets(matrixLam(lh, la, L.modelo.rho).m);
      out.push({ kind: "copa", ev: e, L, t, home: hn, away: an, comp: e.comp, q: e.o ? noVig(e.o) : null, k: { H: mk.H, D: mk.D, A: mk.A, O25: mk.O25, B: mk.B, lh, la } }); ya.add(String(e.id)); continue; }
    const C = VV.byId[e.lid], q = e.o ? noVig(e.o) : null;
    if (q && C && C.o <= 100 && !(C.t || []).includes("juv")) { out.push({ kind: "mercado", ev: e, t, home: hn, away: an, comp: e.comp, q, k: { H: q.p[0], D: q.p[1], A: q.p[2], O25: q.o } }); ya.add(String(e.id)); }
  }
  return { out: out.sort((x, y) => x.t - y.t), live, evs };
}
async function iaCtxDia(q) {
  await loadAll(); await Promise.all([vComps(), vSel()]);
  let al = iaAlcance(q), C = await iaCandidatos(al), nota = "";
  const now = Date.now(), sinEmpezar = cs => cs.filter(c => c.kind !== "mercado" && !C.live[iaEvId(c)] && c.t > now).length;
  if (al.auto && sinEmpezar(C.out) < 6) {
    const n = sinEmpezar(C.out); al = { a: 0, b: 2, nombre: "hoy y mañana" }; C = await iaCandidatos(al);
    nota = `Hoy quedan solo ${n} partidos con probabilidades de Ballytics sin empezar. También van los de mañana (marcados MAÑANA): dilo claramente y separa hoy de mañana.`;
  }
  const idmap = {}; let nm = 0, nx = 0;
  const modelo = C.out.filter(c => c.kind !== "mercado").slice(0, 80), merc = C.out.filter(c => c.kind === "mercado").slice(0, 30);
  modelo.forEach(c => { c.id = "m" + (++nm); idmap[c.id] = c; }); merc.forEach(c => { c.id = "x" + (++nx); idmap[c.id] = c; });
  const est = c => { const e = C.live[iaEvId(c)]; if (!e) return ""; const sc = `${e.h.score ?? 0}-${e.a.score ?? 0}`; return e.state === "in" ? ` | EN VIVO ${e.clock || e.detail} ${sc}` : ` | TERMINADO ${sc}`; };
  const cuando = c => `${iaDia(new Date(c.t).toISOString())} ${hhmm(new Date(c.t).toISOString())}`;
  const merK = q => q ? `${/pinnacle/i.test(q.casa || "") ? "Pinnacle" : "mercado " + (q.casa || "")} L ${pct(q.p[0])} E ${pct(q.p[1])} V ${pct(q.p[2])}` : "sin cuota";
  const linea = c => {
    const k = c.k, base = [c.id, cuando(c), c.kind === "copa" ? `${c.comp} (copa)` : c.comp, `${c.home} vs ${c.away}${est(c)}`];
    if (c.kind === "mercado") return [...base, `SOLO MERCADO ${merK(c.q)}`, k.O25 != null ? `+2,5 ${pct(k.O25)}` : ""].filter(Boolean).join(" | ");
    const p = c.p, eh = c.L ? statOf(c.L, c.home) : {}, ea = c.L ? statOf(c.L, c.away) : {};
    return [...base, `${c.kind === "copa" ? "modelo (fuerza de liga, sin cuota)" : "Ballytics"} L ${pct(k.H)} E ${pct(k.D)} V ${pct(k.A)}`, `xG ${dec(k.lh, 1)}–${dec(k.la, 1)}`, `+2,5 ${pct(k.O25)}`, `ambos ${pct(k.B)}`,
      p ? `marcador ${p.top}` : "", eh.tiros_arco != null ? `tiros al arco ${dec(eh.tiros_arco, 1)}–${dec(ea.tiros_arco, 1)}` : "",
      p && p.ch != null ? `córners ${dec(p.ch + p.ca, 1)}` : "", p && p.th != null ? `tarjetas ${dec(p.th + p.ta, 1)}` : "",
      p && p.arbitro && p.arbitro.n ? `árbitro ${p.arbitro.n}${p.arbitro.tpp != null ? ` (${dec(p.arbitro.tpp, 1)} tarjetas/PJ)` : ""}` : "",
      p && p.bajas ? `bajas ${(p.bajas.h || []).filter(x => x.tipo === "Missing Fixture").length}–${(p.bajas.a || []).filter(x => x.tipo === "Missing Fixture").length}` : "",
      p ? merK(mktOf(p)) : c.q ? merK(c.q) : ""].filter(Boolean).join(" | ");
  };
  // rankings ya ordenados (solo partidos que no empezaron), para que la IA no tenga que ordenar
  const pre = modelo.filter(c => !C.live[iaEvId(c)] && c.t > now);
  const top = (f, fmt, n = 10, arr = pre) => arr.filter(c => f(c) != null && !isNaN(f(c))).sort((a, b) => f(b) - f(a)).slice(0, n).map(c => `${c.id} ${c.home} vs ${c.away} (${cuando(c)}): ${fmt(c)}`);
  const fav = c => Math.max(c.k.H, c.k.A), favN = c => c.k.H >= c.k.A ? `gana ${c.home} ${pct(c.k.H)}` : `gana ${c.away} ${pct(c.k.A)}`;
  const rankings = {
    favoritos_claros: top(fav, favN), mas_goles: top(c => c.k.O25, c => `+2,5 goles ${pct(c.k.O25)}`), pocos_goles: top(c => c.k.O25 == null ? null : 1 - c.k.O25, c => `menos de 2,5 ${pct(1 - c.k.O25)}`, 6),
    ambos_marcan: top(c => c.k.B, c => `ambos marcan ${pct(c.k.B)}`), mas_parejos: top(c => -Math.max(c.k.H, c.k.D, c.k.A), c => `L ${pct(c.k.H)} E ${pct(c.k.D)} V ${pct(c.k.A)}`, 6),
    mas_empate: top(c => c.k.D, c => `empate ${pct(c.k.D)}`, 5),
    diferencia_con_mercado: top(c => { const q = c.p && mktOf(c.p); if (!q || !c.p.modelo) return null; const o = [c.p.modelo.pH, c.p.modelo.pD, c.p.modelo.pA]; return Math.max(...o.map((v, i) => Math.abs(v - q.p[i]))); },
      c => { const q = mktOf(c.p), o = [c.p.modelo.pH, c.p.modelo.pD, c.p.modelo.pA], i = [0, 1, 2].sort((a, b) => Math.abs(o[b] - q.p[b]) - Math.abs(o[a] - q.p[a]))[0];
        return `${["local", "empate", "visita"][i]}: modelo propio ${pct(o[i])} vs ${/pinnacle/i.test(q.casa || "") ? "Pinnacle" : "mercado"} ${pct(q.p[i])}`; }, 6),
    mas_corners: top(c => c.p && c.p.ch != null ? c.p.ch + c.p.ca : null, c => `${dec(c.p.ch + c.p.ca, 1)} córners`, 6),
    mas_tarjetas: top(c => c.p && c.p.th != null ? c.p.th + c.p.ta : null, c => `${dec(c.p.th + c.p.ta, 1)} tarjetas`, 6),
    favoritos_solo_mercado: top(fav, c => `${favN(c)} (mercado ${c.q.casa || ""})`, 6, merc.filter(c => c.t > now && !C.live[iaEvId(c)])),
  };
  Object.keys(rankings).forEach(k => { if (!rankings[k].length) delete rankings[k]; });
  // en vivo y resultados de hoy (competiciones conocidas)
  const hoyK = ymd(new Date()), conocida = e => VV.byId[e.lid] && VV.byId[e.lid].o <= 100;
  const vivos = C.evs.filter(e => e.state === "in" && conocida(e)).slice(0, 20).map(e => `${e.comp}: ${e.h.name} ${e.h.score ?? 0}-${e.a.score ?? 0} ${e.a.name} (${e.clock || e.detail})`);
  const finales = C.evs.filter(e => e.state === "post" && localDay(e.date) === hoyK && conocida(e)).slice(0, 20).map(e => `${e.comp}: ${e.h.name} ${e.h.score ?? 0}-${e.a.score ?? 0} ${e.a.name}`);
  // equipos que nombra el usuario: detalle completo de su próximo partido
  // nombres de equipo que también son palabras comunes ("¿Cómo llega…?") solo cuentan escritos con mayúscula y no al inicio
  const nombra = n => { const k = iaNorm(n); if (!COMUNES.has(k)) return reWord(n).test(s);
    const m = q.replace(/^[\s¿¡"']*\S+/, "").match(new RegExp(`(^|[^\\wÀ-ÿ])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\wÀ-ÿ]|$)`)); return !!m; };
  const s = iaNorm(q), vistos = new Set(), equipos = [];
  const elegidos = [];
  allMatches().filter(p => new Date(p.kickoff).getTime() > now - 3 * 3600e3).sort((a, b) => a.kickoff.localeCompare(b.kickoff)).forEach(p => {
    if (elegidos.length >= 2 || vistos.has(p.id)) return;
    const names = [p.home, p.away, corto(p.L, p.home), corto(p.L, p.away)].filter(n => n && n.length > 3);
    if (names.some(nombra)) { vistos.add(p.id); elegidos.push(p); }
  });
  await Promise.all(elegidos.map(p => ensureDet(p.L.id)));   // goleadores, bajas y cruces de esos partidos
  elegidos.forEach(p => { const L = D.ligas[p.L.id], q = findMatch(L.id, p.id) || p; equipos.push(iaCtxPartido(L, q)); });
  const g = D.registro, G = g && g.global;
  const ahora = new Date();
  const ctx = {
    ahora: `${ahora.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}, ${hhmm(ahora.toISOString())} (hora de Chile)`,
    alcance: al.nombre, nota_alcance: nota || (al.auto ? "El usuario no dijo el día: se usan los partidos de HOY." : ""),
    cobertura: `${modelo.length} partidos con probabilidades de Ballytics y ${merc.length} solo con cuota de mercado para ${al.nombre}`,
    formato: "id | día y hora | competición | partido (y estado si empezó) | probabilidades local/empate/visita | xG previsto | +2,5 | ambos marcan | marcador más probable | tiros al arco | córners | tarjetas | bajas confirmadas | Pinnacle o mercado sin margen",
    partidos: modelo.map(linea), solo_mercado: merc.map(linea), rankings,
    en_vivo_ahora: vivos, resultados_de_hoy: finales,
    equipos_consultados: equipos.length ? equipos : undefined,
    registro_modelo: g && g.n ? { partidos_calificados: g.n, acierto_ganador: pct(g.acierto_1x2, 1), aciertos_si_no: G ? `${G.aciertos} de ${G.n} (${pct(G.aciertos / G.n, 1)})` : null,
      por_mercado: G ? G.por.map(x => `${x.mercado} ${pct(x.acierto, 0)} en ${x.n}`) : null, log_loss: `${dec(g.logloss, 3)} (respuesta ingenua ${dec(g.logloss_ingenuo, 3)}; menos es mejor)`,
      clv: g.clv && g.clv.n ? `En ${g.clv.n} partidos donde el modelo veía más que la cuota temprana, el mercado se movió hacia el modelo el ${pct(g.clv.a_favor, 0)} de las veces (movimiento medio ${dec(g.clv.mov_pts, 1)} puntos)` : "el CLV recién empieza a medirse" } : null,
    picks_publicos: iaCtxPicks(),
  };
  return { ctx, idmap };
}
// picks públicos (regla fija, calificados gane o pierda): la IA los cita si preguntan por "los picks de hoy" o por el récord
function iaCtxPicks() {
  const P = D.picksPub; if (!P) return undefined;
  const hoyK = isoDay(new Date()), Rs = P.resumen || {};
  const lst = (P.dias || []).filter(d => d.dia >= hoyK).sort((a, b) => a.dia.localeCompare(b.dia)).slice(0, 2).map(d => ({ dia: iaDia(d.dia + "T12:00"),
    picks: d.picks.map(f => { const L = D.ligas[f.liga] || { equipos: {} }; return `${PP_EST[f.est].n}: ${f.home} vs ${f.away} → ${f.lado === "D" ? "Empate" : "Gana " + corto(L, f.lado === "H" ? f.home : f.away)} · cuota real ${dec(f.cuota)} · ${f.est === "valor" ? `modelo propio ${pct(f.prob)} contra mercado sin margen ${pct(f.mercado)}` : `probabilidad Ballytics ${pct(f.prob)}`}${f.res ? ` · ${f.res === "G" ? "GANADO" : f.res === "P" ? "PERDIDO" : "NULO"}` : ""}`; }) }));
  const rec = k => { const x = Rs[k]; return x && x.n ? `${x.n} calificados, ${x.ganados} ganados, ${ppU(x.unidades)} (ROI ${pct(x.roi, 1)})` : "sin picks calificados aún"; };
  return { reglas: P.reglas ? `Seguros: ${P.reglas.seguro} Valor: ${P.reglas.valor} ${P.reglas.fijado}` : undefined, listas: lst, record_seguros: rec("seguro"), record_valor: rec("valor"), desde: (P.reglas || {}).desde };
}
const iaMd = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#{1,4} (.+)$/gm, "<b>$1</b>").split(/\n+/).map(l => /^\s*[-•*] /.test(l) ? `<li>${l.replace(/^\s*[-•*] /, "")}</li>` : /^\s*\d+[.)] /.test(l) ? `<li>${l.replace(/^\s*\d+[.)] /, "")}</li>` : `<p>${l}</p>`).join("").replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
// ---- tarjetas de los partidos que nombró la IA
const MKT = { H: ["1", c => c.k.H, c => `Gana ${c.L ? corto(c.L, c.home) : c.home}`], D: ["X", c => c.k.D, () => "Empate"], A: ["2", c => c.k.A, c => `Gana ${c.L ? corto(c.L, c.away) : c.away}`],
  O25: ["+2,5", c => c.k.O25, () => "Goles: Más de 2,5"], U25: ["−2,5", c => c.k.O25 == null ? null : 1 - c.k.O25, () => "Goles: Menos de 2,5"],
  BY: ["Ambos", c => c.k.B, () => "Ambos marcan: Sí"], BN: ["No ambos", c => c.k.B == null ? null : 1 - c.k.B, () => "Ambos marcan: No"] };
function iaCardsRefs(refs, idmap) {
  const seen = new Set(), items = refs.map(r => ({ m: MKT[r.mercado] ? r.mercado : null, c: idmap[r.id] })).filter(x => x.c && !seen.has(x.c.id) && seen.add(x.c.id)).slice(0, 8);
  if (!items.length) return "";
  const card = ({ c, m }) => {
    if (c.kind === "liga") {
      const p = c.p, L = c.L, keys = ["H", "D", "A", m === "U25" ? "U25" : "O25", m === "BN" ? "BN" : "BY"];
      const btns = keys.map(k => { const pr = MKT[k][1](c); return pr == null ? "" : `<button class="addsel iasel${k === m ? " rec" : ""}" data-sel="${k}" data-label="${esc(MKT[k][2](c))}" data-liga="${L.id}" data-mid="${esc(p.id)}" aria-pressed="${inCombo(p.id, k)}" title="Agregar a la combinada"><span>${MKT[k][0]}</span><b class="num">${pct(pr)}</b></button>`; }).join("");
      return `<div class="iacard"><button class="iac-top" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">${leagueMark(L, "sm")}<span class="iac-lg">${esc(L.nombre)} · ${esc(cuando(p.kickoff))}</span><span class="iac-go">Ver partido ›</span></button>
        <div class="iac-t"><span>${badge(L, p.home)}<b>${esc(corto(L, p.home))}</b></span><span class="faint">vs</span><span><b>${esc(corto(L, p.away))}</b>${badge(L, p.away)}</span></div><div class="iac-b">${btns}</div></div>`;
    }
    const e = c.ev, keys = ["H", "D", "A", "O25"].filter(k => MKT[k][1](c) != null);
    return `<div class="iacard"><button class="iac-top" data-go="envivo" data-id="${esc(e.id)}"><span class="iac-lg">${esc(c.comp)} · ${esc(cuando(e.date))}</span><span class="iac-go">Ver partido ›</span></button>
      <div class="iac-t"><span>${vLogo(e.h)}<b>${esc(e.h.name)}</b></span><span class="faint">vs</span><span><b>${esc(e.a.name)}</b>${vLogo(e.a)}</span></div>
      <div class="iac-b ro">${keys.map(k => `<span class="iasel${k === m ? " rec" : ""}"><span>${MKT[k][0]}</span><b class="num">${pct(MKT[k][1](c))}</b></span>`).join("")}</div>
      <p class="iac-note">${c.kind === "copa" ? "Estimación del modelo con la fuerza de liga (sin ajuste por cuota)" : `Probabilidad del mercado (${esc(c.q.casa || "casa")}), sin modelo Ballytics`}</p></div>`;
  };
  const picks = items.filter(x => x.c.kind === "liga" && x.m && MKT[x.m][1](x.c) != null).map(x => ({ c: x.c, k: x.m, pr: MKT[x.m][1](x.c) }));
  const tot = picks.reduce((a, x) => a * x.pr, 1);
  const combo = picks.length > 1 ? `<button class="iacombo" data-iacombo='${esc(JSON.stringify(picks.map(x => [x.c.L.id, x.c.p.id, x.k, MKT[x.k][2](x.c)])))}'><span><b>Agregar a mi combinada</b><small>${picks.map(x => esc(MKT[x.k][2](x.c))).join(" + ")}</small></span><span class="num"><b>${pct(tot, 1)}</b><small>cuota justa ${dec(1 / tot)}</small></span></button>` : "";
  return `<div class="iacards">${items.map(card).join("")}${combo}</div>`;
}
// respaldo (IA sin respuesta estructurada): busca en el texto los equipos de los partidos enviados
function iaRefsPorNombre(txt, idmap) {
  const T = iaNorm(txt), hit = [];
  Object.values(idmap).forEach(c => { const names = [c.home, c.away, c.L ? corto(c.L, c.home) : "", c.L ? corto(c.L, c.away) : ""].filter(n => n && n.length > 3 && !COMUNES.has(iaNorm(n)));
    const pos = Math.min(...names.map(n => { const m = T.search(reWord(n)); return m < 0 ? Infinity : m; }));
    const both = [[c.home, c.L && corto(c.L, c.home)], [c.away, c.L && corto(c.L, c.away)]].filter(ns => ns.some(n => n && n.length > 3 && reWord(n).test(T))).length;
    if (pos < Infinity) hit.push({ c, pos, both }); });
  const dos = hit.filter(h => h.both === 2);
  return (dos.length ? dos : hit).sort((a, b) => a.pos - b.pos).slice(0, 6).map(h => ({ id: h.c.id, mercado: null }));
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-iacombo]"); if (!b) return;
  JSON.parse(b.dataset.iacombo).forEach(([liga, mid, key, label]) => { if (inCombo(mid, key)) return; const p = findMatch(liga, mid); if (!p) return;
    COMBO.push({ liga, mid, key, label, home: p.home, away: p.away, kickoff: p.kickoff }); });
  saveCombo(); paintComboBar(); b.classList.add("ok"); b.querySelector("b").textContent = "Agregada a tu combinada ✓";
  b.closest(".iacards").querySelectorAll(".addsel.iasel").forEach(x => x.setAttribute("aria-pressed", String(inCombo(x.dataset.mid, x.dataset.sel))));
});
const IAH = {};   // conversaciones por tema (jornada o partido), solo en esta pestaña
const IA_SUG = {
  dia: ["¿Cuáles son los favoritos claros de hoy?", "¿Qué partidos de hoy tienen más goles?", "Arma una combinada de 3 favoritos para el finde", "¿Cómo van los partidos en vivo?", "¿Dónde ve el modelo más diferencia con Pinnacle?", "¿Qué partidos de mañana son más parejos?", "¿Dónde es más probable que marquen ambos?", "¿Cuánto acierta el modelo?"],
  p: ["¿Quién es favorito y por qué?", "¿Habrá muchos goles?", "¿Alguna cuota tiene valor?", "¿Cómo afectan las bajas?", "¿Quién puede marcar?", "¿Qué dice Pinnacle?"],
};
let IASCOPE = "dia";
function iaScopeAuto() { return R.v === "partido" && findMatch(R.liga, R.id) ? "p:" + R.id : "dia"; }
function iaMatchOf(scope) { if (!scope.startsWith("p:")) return null; const id = scope.slice(2); const L = Object.values(D.ligas).find(L => L.partidos.some(x => String(x.id) === id)); const p = L && findMatch(L.id, id); return p ? { L, p } : null; }
function iaChat(scope, mode) {
  const h = IAH[scope] || [], mp = iaMatchOf(scope);
  const sug = IA_SUG[scope.startsWith("p:") ? "p" : "dia"], half = Math.ceil(sug.length / 2);
  const chip = mp ? `<div class="ia-scope">${badge(mp.L, mp.p.home)}<span>Sobre <b>${esc(corto(mp.L, mp.p.home))} vs ${esc(corto(mp.L, mp.p.away))}</b></span><button class="link" data-iascope="dia">Preguntar por todos los partidos</button></div>`
    : (iaScopeAuto() !== "dia" ? `<div class="ia-scope"><span>Sobre todos los partidos</span><button class="link" data-iascope="${iaScopeAuto()}">Volver a este partido</button></div>` : "");
  const welcome = `<div class="ia-hello"><span class="ia-orb" aria-hidden="true">✦</span><h2>Bienvenido a <span class="ia-grad">Ballytics IA</span> <span class="ia-beta">Beta</span></h2>
    <p>${mp ? `Pregúntame lo que quieras de <b>${esc(corto(mp.L, mp.p.home))} vs ${esc(corto(mp.L, mp.p.away))}</b>: favoritos, goles, bajas, cuotas.` : "Soy tu analista de fútbol. Pregúntame por los partidos de hoy, de mañana o del finde, por un equipo, por lo que está en vivo o por cómo le va al modelo."}</p></div>
    <div class="ia-pop"><span class="lbl">Preguntas populares</span><div class="ia-grid">${sug.map(x => `<button data-iaq="${esc(x)}"><span class="ia-q-ic" aria-hidden="true">✦</span><span>${esc(x)}</span></button>`).join("")}</div></div>`;
  const last = h.length - 1;
  const fb = (m, i) => m.rid ? `<div class="ia-fb" role="group" aria-label="¿Te sirvió esta respuesta?">${m.v ? `<span class="faint">${m.v > 0 ? "Gracias 👍" : "Gracias, lo revisaremos 👎"}</span>` : `<span class="faint">¿Te sirvió?</span><button data-iavote="1" data-iai="${i}" aria-label="Sí, me sirvió">👍</button><button data-iavote="-1" data-iai="${i}" aria-label="No me sirvió">👎</button>`}</div>` : "";
  const log = h.map((m, i) => m.r === "ia" ? `<div class="ia-m ia"><span class="ia-av" aria-hidden="true">✦</span><div class="ia-bub">${iaMd(m.t)}${m.cards || ""}${fb(m, i)}${i === last && (m.sug || []).length ? `<div class="ia-next">${m.sug.map(x => `<button data-iaq="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}</div></div>` : `<div class="ia-m yo"><div class="ia-bub">${esc(m.t)}</div></div>`).join("");
  return `<div class="iachat ${mode}" data-ia="${esc(scope)}">${chip}<div class="ia-scroll">${h.length ? `<div class="ia-log" aria-live="polite">${log}</div>` : welcome}</div>
    <form class="ia-f" data-iaf="${esc(scope)}"><input name="q" maxlength="400" autocomplete="off" placeholder="Pregúntame lo que quieras" aria-label="Tu pregunta"><button class="ia-send" aria-label="Enviar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z"/></svg></button></form>
    <p class="ia-legal">Respuestas generadas por IA con los datos del modelo; puede equivocarse. No es un consejo de apuesta. +18.</p></div>`;
}
function iaRepaint() {
  const d = document.getElementById("iad"); if (d && !d.hidden) { d.querySelector(".iad-body").innerHTML = iaChat(IASCOPE, "drawer"); const r = d.querySelector("[data-iareset]"); if (r) r.hidden = !(IAH[IASCOPE] || []).length; }
  const pg = document.getElementById("ia-page"); if (pg) pg.innerHTML = iaChat("dia", "page");
  const sc = document.querySelector(".iachat .ia-scroll"); if (sc) sc.scrollTop = sc.scrollHeight;
}
function iaOpen(scope) {
  let d = document.getElementById("iad");
  if (!d) { d = document.createElement("aside"); d.id = "iad"; d.className = "iad"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Ballytics IA"); d.hidden = true;
    d.innerHTML = `<div class="iad-in"><header class="iad-h"><span class="ia-ic sm" aria-hidden="true">✦</span><b>Ballytics IA</b><span class="ia-beta">Beta</span><button class="iad-new" data-iareset hidden>Nueva conversación</button><button class="iad-x" data-iaclose aria-label="Cerrar">×</button></header><div class="iad-body"></div></div>`;
    document.body.appendChild(d); }
  IASCOPE = scope || iaScopeAuto(); d.hidden = false; document.body.classList.add("ia-open"); iaRepaint();
  setTimeout(() => { const i = d.querySelector(".ia-f input"); if (i && window.innerWidth > 760) i.focus(); }, 50);
}
function iaClose() { const d = document.getElementById("iad"); if (d) d.hidden = true; document.body.classList.remove("ia-open"); }
const IA_BUSY = {};
async function iaAsk(scope, q) {
  q = q.trim(); if (!q || IA_BUSY[scope]) return; IA_BUSY[scope] = true;
  const h = IAH[scope] || (IAH[scope] = []);
  h.push({ r: "yo", t: q }); iaRepaint();
  const box = document.querySelector(`.iachat[data-ia="${CSS.escape(scope)}"]`);
  if (box) { box.querySelector(".ia-log").insertAdjacentHTML("beforeend", `<div class="ia-m ia wait"><span class="ia-av spin" aria-hidden="true">✦</span><div class="ia-bub"><span class="muted">Revisando los partidos</span> <span class="dots"><i></i><i></i><i></i></span></div></div>`);
    box.querySelector(".ia-f button").disabled = true; const sc = box.querySelector(".ia-scroll"); sc.scrollTop = sc.scrollHeight; }
  try {
    let ctx, tipo, idmap = {}; const mp = iaMatchOf(scope);
    if (mp) { await ensureDet(mp.L.id); const L = D.ligas[mp.L.id]; ctx = iaCtxPartido(L, findMatch(L.id, mp.p.id) || mp.p); tipo = "partido"; } else { ({ ctx, idmap } = await iaCtxDia(q)); tipo = "dia"; }
    const url = await pushCfg(); if (!url) throw new Error("No pude conectar con la IA. Prueba de nuevo.");
    const r = await (await fetch(url + "/ia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, uid: myUid(), tipo, ctx, hist: h.slice(0, -1).slice(-4).map(m => ({ r: m.r, t: m.t })) }) })).json();
    if (!r.ok) throw new Error(r.error || "La IA no respondió. Prueba de nuevo.");
    const refs = tipo === "dia" ? (Array.isArray(r.refs) && r.refs.length ? r.refs : iaRefsPorNombre(r.r, idmap)) : [];
    h.push({ r: "ia", t: r.r, cards: iaCardsRefs(refs, idmap), sug: (r.sug || []).slice(0, 3), rid: r.rid, m: r.modelo, q, tipo });
  } catch (e) { h.pop(); IA_BUSY[scope] = false; iaRepaint(); const b = document.querySelector(`.iachat[data-ia="${CSS.escape(scope)}"] .ia-scroll`); if (b) b.insertAdjacentHTML("beforeend", `<div class="ia-m ia err"><div class="ia-bub">${esc(e.message && e.message.length > 12 ? e.message : "No pude conectar con la IA. Prueba de nuevo.")}</div></div>`); return; }
  IA_BUSY[scope] = false; iaRepaint();
}
document.addEventListener("submit", e => { const f = e.target.closest("[data-iaf]"); if (!f) return; e.preventDefault(); iaAsk(f.dataset.iaf, f.q.value); });
document.addEventListener("click", e => {
  const q = e.target.closest("[data-iaq]"); if (q) { const box = q.closest("[data-ia]"); if (box) iaAsk(box.dataset.ia, q.dataset.iaq); else { iaOpen(q.dataset.iascopeq || undefined); setTimeout(() => iaAsk(IASCOPE, q.dataset.iaq), 30); } return; }
  const o = e.target.closest("[data-iaopen]"); if (o) { e.preventDefault(); iaOpen(o.dataset.iaopen || undefined); return; }
  const s = e.target.closest("[data-iascope]"); if (s) { IASCOPE = s.dataset.iascope; iaRepaint(); return; }
  if (e.target.closest("[data-iareset]")) { IAH[IASCOPE] = []; iaRepaint(); return; }
  const vb = e.target.closest("[data-iavote]");
  if (vb) { const box = vb.closest("[data-ia]"), sc = box && box.dataset.ia, m = sc && (IAH[sc] || [])[+vb.dataset.iai]; if (!m || m.v) return;
    m.v = +vb.dataset.iavote; iaRepaint();
    pushCfg().then(url => url && fetch(url + "/ia/voto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rid: m.rid, v: m.v, uid: myUid(), q: m.q, r: m.t, m: m.m, tipo: m.tipo }) })).catch(() => {});
    return; }
  if (e.target.closest("[data-iaclose]") || e.target.id === "iad") { iaClose(); return; }
  if (e.target.closest("#iad [data-go]")) iaClose();
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("ia-open")) iaClose(); });
// botón flotante en todas las pantallas
(function () { const f = document.createElement("button"); f.id = "iafab"; f.setAttribute("data-iaopen", ""); f.setAttribute("aria-label", "Abrir Ballytics IA"); f.innerHTML = `<span aria-hidden="true">✦</span><b>IA</b>`; document.body.appendChild(f); })();
// en el partido: tarjeta corta que abre la IA con ese partido
function iaTeaser(p) {
  return `<div class="panel iateaser"><div class="ia-h"><span class="ia-ic" aria-hidden="true">✦</span><div><h3>Pregúntale a la IA</h3><small class="muted">Te explica este partido con las probabilidades y cuotas de Ballytics</small></div><button class="btn sm" data-iaopen="p:${esc(p.id)}">Abrir chat</button></div>
    <div class="ia-row">${IA_SUG.p.slice(0, 4).map(x => `<button data-iaq="${esc(x)}" data-iascopeq="p:${esc(p.id)}">${esc(x)}</button>`).join("")}</div></div>`;
}
function vIA() {
  setTimeout(iaRepaint, 0);
  return `<section class="view narrow" aria-labelledby="h-ia"><h1 id="h-ia" class="sr">Ballytics IA</h1><div class="panel flush iapage" id="ia-page"></div></section>`;
}

/* ---------------- página no encontrada ---------------- */
function vNoEncontrado(msg) {
  return `<section class="view narrow nf" aria-labelledby="h-nf"><div class="panel stack nf-box">
    <span class="nf-code num" aria-hidden="true">404</span>
    <h1 id="h-nf">${esc(msg || (R.what === "liga" ? "Esta liga no está en Ballytics" : "No encontramos esta página"))}</h1>
    <p class="muted">Puede que el enlace esté mal escrito o que el partido ya se haya jugado y salido del calendario. Busca un equipo, jugador o competición:</p>
    <div class="row nf-act"><button class="btn" data-focus-q>Buscar</button><button class="btn ghost" data-go="inicio" data-liga="todas">Ir al inicio</button><button class="btn ghost" data-go="vivo">Partidos de hoy</button><button class="btn ghost" data-go="registro">Resultados del modelo</button></div></div></section>`;
}
// enlace a la página propia del partido o la liga: en WhatsApp se ve con título y descripción
document.addEventListener("click", async e => {
  if (!e.target.closest("[data-sharelink]")) return;
  const url = cleanUrl(R), title = document.title;
  try { if (navigator.share && /Mobi|iPad|iPhone|Android/.test(navigator.userAgent)) { await navigator.share({ title, url }); return; } await navigator.clipboard.writeText(url); toast("Enlace copiado."); }
  catch (x) { if (x && x.name === "AbortError") return; try { await navigator.clipboard.writeText(url); toast("Enlace copiado."); } catch (y) { toast(url); } }
});
document.addEventListener("click", e => { if (e.target.closest("[data-focus-q]")) { const q = document.getElementById("q"); if (q) { window.scrollTo({ top: 0 }); q.focus(); } } });

/* ---------------- INICIO ---------------- */
let homeLiga = null;
function vInicio() {
  const P = D.indice.portada || {}, now = Date.now();
  const llenas = ligasIds().filter(id => !D.ligas[id].lite);
  const hl = D.ligas[homeLiga] && !D.ligas[homeLiga].lite && D.ligas[homeLiga].tabla_ok ? homeLiga : (llenas.find(id => D.ligas[id].tabla_ok) || llenas[0]);
  const HL = D.ligas[hl];

  // hero
  const heroMs = (P.partidos || []).map(x => ({ ...findMatch(x.liga, x.id), L: D.ligas[x.liga] })).filter(p => p.id);
  const hero = heroMs.map(p => {
    const L = p.L, sh = rowOf(L, p.home), sa = rowOf(L, p.away);
    return `<div class="hero-in cardlink" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
      <div class="hero-top">${leagueMark(L, "sm")}<span>${esc(L.nombre)}</span><span class="faint">·</span><span>${esc(cuando(p.kickoff))}</span><span class="cdown" data-cd="${esc(p.kickoff)}"></span></div>
      <div class="hero-face">
        <button class="ht" data-go="equipo" data-liga="${L.id}" data-team="${esc(p.home)}">${badge(L, p.home, "xl")}<b>${esc(corto(L, p.home))}</b>${formHtml(sh.forma)}</button>
        <div class="hero-mid"><span class="xg num">${dec(p.lh, 1)} <span class="faint">–</span> ${dec(p.la, 1)}</span><span class="lbl">goles previstos</span></div>
        <button class="ht" data-go="equipo" data-liga="${L.id}" data-team="${esc(p.away)}">${badge(L, p.away, "xl")}<b>${esc(corto(L, p.away))}</b>${formHtml(sa.forma)}</button>
      </div>
      <div class="hero-p">${bar3(p.pH, p.pD, p.pA)}<div class="nums"><span><b>${pct(p.pH)}</b> local</span><span>${pct(p.pD)} empate</span><span>visita <b>${pct(p.pA)}</b></span></div><small class="psrc">${p.calib ? "Probabilidad Ballytics: modelo ajustado a la cuota sin margen" : "Probabilidad del modelo propio (sin cuota disponible)"}</small></div>
      <div class="row hero-cta"><button class="btn" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">Ver análisis</button><button class="btn ghost" data-go="liga" data-liga="${L.id}" data-tab="partidos">Partidos de ${esc(L.nombre)}</button></div>
    </div>`;
  });

  // jugador destacado
  const jug = (P.jugadores || []).map(j => {
    const L = D.ligas[j.liga], p = findMatch(j.liga, j.partido); if (!L || !p) return "";
    const rival = p.home === j.equipo ? p.away : p.home;
    return `<div class="fp cardlink" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
      <div class="fp-head">${face(L, j.equipo, j.jid, j.jugador, "lg")}<div><b class="fp-name">${esc(j.jugador)}</b><span class="muted">${esc(corto(L, j.equipo))} · ${esc(L.nombre)}</span></div></div>
      <div class="fp-big"><span class="lbl">Probabilidad de marcar</span><span class="v num">${pct(j.p)}</span><span class="muted">vs ${esc(corto(L, rival))} · ${esc(cuando(p.kickoff))}</span></div>
      <div class="fp-stats"><span><b class="num">${j.goles}</b> goles en la temporada</span><span class="l5">${(j.ult5 || []).map(g => `<i class="${g ? "on" : ""}">${g || "·"}</i>`).join("")}<small>últimos 5</small></span></div>
      <button class="btn ghost sm" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">Ver partido</button></div>`;
  }).filter(Boolean);

  // equipo en forma
  const eqs = (P.equipos || []).map(e => {
    const L = D.ligas[e.liga]; if (!L || L.lite) return "";
    const s = rowOf(L, e.equipo), st = statOf(L, e.equipo);
    return `<div class="fp cardlink" data-go="equipo" data-liga="${L.id}" data-team="${esc(e.equipo)}">
      <div class="fp-head">${badge(L, e.equipo, "lg")}<div><b class="fp-name">${esc(corto(L, e.equipo))}</b><span class="muted">${esc(L.nombre)}${s.pos ? ` · ${s.pos}º con ${s.pts} pts` : ""}</span></div></div>
      <div class="row" style="justify-content:space-between"><span class="lbl">Últimos 5</span>${formHtml(s.forma)}</div>
      <div class="sgrid">
        <div><span class="lbl">Goles/PJ</span><b class="num">${dec(st.gf)}</b></div><div><span class="lbl">Recibe/PJ</span><b class="num">${dec(st.gc)}</b></div>
        <div><span class="lbl">Tiros al arco</span><b class="num">${dec(st.tiros_arco, 1)}</b></div><div><span class="lbl">Córners</span><b class="num">${dec(st.corners, 1)}</b></div>
        <div><span class="lbl">Posesión</span><b class="num">${st.posesion != null ? dec(st.posesion, 0) + "%" : "—"}</b></div><div><span class="lbl">Tarjetas</span><b class="num">${dec(st.tarjetas, 1)}</b></div>
      </div>
      <button class="btn ghost sm" data-go="equipo" data-liga="${L.id}" data-team="${esc(e.equipo)}">Ver equipo</button></div>`;
  }).filter(Boolean);

  // proyección: una por cada partido destacado, sincronizada con el carrusel de arriba
  const projOf = fx => {
    const L = fx.L, mk = markets(pmatrix(L, fx).m);
    const ct = fx.ch != null ? fx.ch + fx.ca : null, tt = fx.th != null ? fx.th + fx.ta : null;
    return `<div class="proj cardlink" data-go="partido" data-liga="${L.id}" data-id="${esc(fx.id)}">
      <div class="proj-l"><span class="tag">${esc(L.nombre)}</span></div>
      <div class="proj-t">${badge(L, fx.home)}<b>${esc(corto(L, fx.home))}</b><span class="num xg2">${dec(fx.lh, 1)}</span><span class="faint">–</span><span class="num xg2">${dec(fx.la, 1)}</span><b>${esc(corto(L, fx.away))}</b>${badge(L, fx.away)}</div>
      <div class="p3">${bar3(mk.H, mk.D, mk.A)}</div>
      <div class="oddsrow">${[["1", mk.H], ["X", mk.D], ["2", mk.A]].map(([k, v]) => `<div><span class="lbl">${k}</span><b class="num">${dec(1 / v)}</b><small>${pct(v)}</small></div>`).join("")}</div>
      <div class="oddsrow">${[["+2,5 goles", mk.O25], ["Ambos marcan", mk.B]].map(([k, v]) => `<div><span class="lbl">${k}</span><b class="num">${dec(1 / v)}</b><small>${pct(v)}</small></div>`).join("")}
        ${ct != null ? `<div><span class="lbl">Córners</span><b class="num">${dec(ct, 1)}</b><small>esperados</small></div>` : ""}${tt != null ? `<div><span class="lbl">Tarjetas</span><b class="num">${dec(tt, 1)}</b><small>esperadas</small></div>` : ""}</div>
      <p class="note">Cuota justa = 1 / probabilidad, sin margen de casa. ${help("La cuota justa es la que pagaría una casa sin ganancia: 1 dividido por la probabilidad. Si te ofrecen más que esto, el modelo ve valor.")}</p></div>`;
  };
  const fx = heroMs[0];
  const proy = heroMs.length ? `<div class="car" data-car="proj" data-sync="hero">${heroMs.map((m, i) => `<div class="car-slide" ${i ? "hidden" : ""}>${projOf(m)}</div>`).join("")}</div>` : `<p class="note">Sin partidos próximos.</p>`;

  // ranking de fuerza y tabla (por liga)
  const rk = [...(HL ? HL.tabla : [])].sort((a, b) => b.ataque / b.defensa - a.ataque / a.defensa).slice(0, 7);
  const rank = `<table class="t compact"><thead><tr><th>#</th><th>Equipo</th><th class="n">Atq</th><th class="n">Def</th><th class="n">Global</th></tr></thead><tbody>` +
    rk.map((s, i) => `<tr class="click" data-go="equipo" data-liga="${HL.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(HL, s.equipo)}${esc(corto(HL, s.equipo))}</td><td class="n">${dec(s.ataque)}</td><td class="n">${dec(s.defensa)}</td><td class="n"><b>${sgn(Math.round((s.ataque / s.defensa - 1) * 100))}</b></td></tr>`).join("") + `</tbody></table>`;
  const tabla = `<table class="t compact"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n">DG</th><th class="n">Pts</th></tr></thead><tbody>` +
    (HL ? HL.tabla : []).slice(0, 8).map(s => `<tr class="click" data-go="equipo" data-liga="${HL.id}" data-team="${esc(s.equipo)}"><td>${posTag(HL, s.pos)}</td><td class="team">${badge(HL, s.equipo)}${esc(corto(HL, s.equipo))}</td><td class="n">${s.pj}</td><td class="n">${sgn(s.dg)}</td><td class="n"><b>${s.pts}</b></td></tr>`).join("") + `</tbody></table>`;
  const swItems = llenas.filter(id => D.ligas[id].tabla_ok).map(id => ({ id, L: D.ligas[id], attrs: `data-hl="${id}" data-go="inicio" data-liga="${R.liga || "todas"}" data-keep` }));
  const sw = (key) => swItems.length ? picker(key, hl, swItems) : "";

  // próximos y trío
  const soon = allMatches().filter(p => new Date(p.kickoff).getTime() >= now).sort((a, b) => a.kickoff.localeCompare(b.kickoff)).slice(0, 6);
  const prox = soon.map(p => `<button class="nrow" data-go="partido" data-liga="${p.L.id}" data-id="${esc(p.id)}"><span class="lbl">${esc(p.L.nombre)} · ${esc(cuando(p.kickoff))}</span>
     <span class="tline">${badge(p.L, p.home)}<span class="n">${esc(corto(p.L, p.home))}</span><span class="faint">vs</span><span class="n">${esc(corto(p.L, p.away))}</span>${badge(p.L, p.away)}</span></button>`).join("");
  const wk = allMatches().filter(p => { const t = new Date(p.kickoff).getTime(); return t >= now && t <= now + 7 * DAYMS; })
    .map(p => { const ks = [["H", p.pH, p.home], ["A", p.pA, p.away]].sort((a, b) => b[1] - a[1])[0]; return { p, k: ks[0], pr: ks[1], t: ks[2] }; })
    .sort((a, b) => b.pr - a.pr).slice(0, 3);
  const comb = wk.reduce((s, x) => s * x.pr, 1);
  const trio = wk.length ? wk.map(x => `<button class="leg" data-go="partido" data-liga="${x.p.L.id}" data-id="${esc(x.p.id)}">${badge(x.p.L, x.t)}<span><b>${esc(corto(x.p.L, x.t))}</b> gana<small>${esc(corto(x.p.L, x.p.home))} vs ${esc(corto(x.p.L, x.p.away))} · ${esc(cuando(x.p.kickoff))}</small></span><span class="num pr">${pct(x.pr)}</span></button>`).join("") +
    `<div class="trio-tot"><span>Las tres juntas</span><b class="num">${pct(comb, 1)}</b><span class="muted">cuota justa <b class="num">${dec(1 / comb)}</b></span></div>` : `<p class="note">Sin partidos esta semana.</p>`;

  // modelo propio contra el mercado: mayores diferencias de los próximos días
  const difs = allMatches().filter(p => { const t = new Date(p.kickoff).getTime(); return p.modelo && (p.mercado || p.cuotas) && t >= now && t <= now + 4 * DAYMS; })
    .map(p => { const q = mktOf(p); if (!q) return null; const own = [p.modelo.pH, p.modelo.pD, p.modelo.pA];
      const i = [0, 1, 2].sort((a, b) => Math.abs(own[b] - q.p[b]) - Math.abs(own[a] - q.p[a]))[0]; return { p, i, m: own[i], k: q.p[i], d: own[i] - q.p[i] }; })
    .filter(Boolean).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5);
  const vmc = difs.length ? `<div class="slist">${difs.map(x => { const L = x.p.L, t = x.i === 0 ? x.p.home : x.i === 2 ? x.p.away : null;
      return `<button class="srow" data-go="partido" data-liga="${L.id}" data-id="${esc(x.p.id)}">${t ? badge(L, t) : `<span class="badge" style="background:var(--panel2);color:var(--muted)">X</span>`}<span><b>${t ? esc(corto(L, t)) + " gana" : "Empate"}</b><small>${esc(corto(L, x.p.home))} vs ${esc(corto(L, x.p.away))} · modelo ${pct(x.m)} · mercado ${pct(x.k)}</small></span><span class="sn num vm-pp ${x.d > 0 ? "up" : "dn"}">${x.d > 0 ? "+" : "−"}${Math.round(Math.abs(x.d) * 100)}</span></button>`; }).join("")}</div>
      <p class="note">Puntos de diferencia entre el modelo propio y el mercado sin margen (Pinnacle o promedio de casas; si no, DraftKings). Solo comparación: en el backtest el mercado fue más preciso.</p>` : `<p class="note">Sin cuotas publicadas para los próximos días.</p>`;

  // rachas
  const rach = (P.rachas || []).map(s => { const L = D.ligas[s.liga]; return L ? `<button class="srow" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}">${badge(L, s.equipo)}<span><b>${esc(corto(L, s.equipo))}</b><small>${esc(s.texto)}</small></span><span class="sn num">${s.n}</span></button>` : ""; }).join("") || `<p class="note">Sin rachas destacadas.</p>`;

  // rendimiento del modelo
  const g = D.registro;
  const perf = g && g.n ? `<div class="kpis two cardlink" data-go="registro">${kpi("m", "Acierto 1X2", pct(g.acierto_1x2), `${g.n} partidos`)}${kpi("", "Log-loss", dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)}`)}</div>${spark(g.serie)}`
    : `<p class="note">Cada predicción queda guardada antes del partido y se califica después. El registro se llena con los primeros resultados.</p>`;

  // partidos por día
  const sel = R.liga || "todas";
  const list = dayList(sel);
  // ligas: fila deslizable en el teléfono y columna lateral en el computador (las que sigues primero, con estrella)
  const ligasOrd = [...D.indice.ligas].sort((a, b) => isFavL(b.id) - isFavL(a.id));
  const chips = `<div class="lscroll" role="group" aria-label="Filtrar por liga"><button class="lchip" data-go="inicio" data-liga="todas" data-keep aria-pressed="${sel === "todas"}">Todas</button>` +
    ligasOrd.map(l => `<button class="lchip${isFavL(l.id) ? " fav" : ""}" data-go="inicio" data-liga="${l.id}" data-keep aria-pressed="${sel === l.id}" title="${esc(l.nombre)}">${leagueMark(l, "sm")}<span>${isFavL(l.id) ? "★ " : ""}${esc(l.nombre)}</span></button>`).join("") + `</div>`;
  const side = `<nav class="hside panel flush" aria-label="Ligas"><div class="ph"><h3>Ligas</h3></div>
    <button class="hs-i${sel === "todas" ? " on" : ""}" data-go="inicio" data-liga="todas" data-keep><span class="lmark sm hs-all">★</span><span>Todas las ligas</span></button>
    ${ligasOrd.map(l => `<button class="hs-i${sel === l.id ? " on" : ""}" data-go="inicio" data-liga="${l.id}" data-keep>${leagueMark(l, "sm")}<span>${esc(l.nombre)}<small>${esc(l.pais)}</small></span>${isFavL(l.id) ? `<i class="hs-fav" aria-label="La sigues">★</i>` : ""}</button>`).join("")}
    <div class="hs-links"><button class="link" data-go="competiciones">Todas las competiciones →</button><button class="link" data-go="vivo">Partidos en vivo →</button></div></nav>`;
  const mine = misPartidos();

  return `<section class="view home" aria-labelledby="h-inicio">
    <h1 id="h-inicio" class="sr">Ballytics: probabilidades de fútbol</h1>
    <p class="promise">Probabilidades de fútbol con un <button class="link" data-go="registro">registro público</button> de cada predicción. <button class="ia-cta" data-iaopen><span aria-hidden="true">✦</span> Pregúntale a la IA</button></p>
    <div class="home-grid">
      ${side}
      <div class="hmain">
        ${FAVS.t.length || FAVS.l.length ? mine : ""}
        <div class="hhead" id="partidos"><h2>Partidos</h2><span class="note">Horario local</span></div>
        ${chips}
        ${list}
      </div>
      <aside class="hright" aria-label="Destacados">
        <div class="hero panel">${carousel("hero", hero, "Partidos destacados")}</div>
        ${ppHome()}
        ${FAVS.t.length || FAVS.l.length ? "" : mine}
        ${installBanner()}
      </aside>
    </div>
    <h2 class="sec2" id="mas-analisis">Más análisis</h2>
    <div class="cards">
      ${card("Jugador destacado", carousel("jug", jug, "Jugadores destacados"), `<span class="tag">Goleadores</span>`, "accent")}
      ${card("Equipo en forma", carousel("eq", eqs, "Equipos en forma"), `<span class="tag">Últimos 5</span>`)}
      ${card("Proyección del partido", proy, `<span class="tag">Destacado</span>`)}
      ${HL ? card("Ranking de fuerza", `<div class="scroll">${rank}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="fuerza">Ranking completo →</button>`, sw("rk")) : card("Ranking de fuerza", skelRows(6))}
      ${HL ? card("Tabla", `<div class="scroll">${tabla}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="tabla">Tabla completa →</button>`, sw("tb")) : card("Tabla", skelRows(6))}
      ${card("Próximos partidos", `<div class="nlist">${prox}</div>`)}
      ${card("Trío más probable", `<div class="trio">${trio}</div>`, `<span class="tag">Esta semana</span>`, "dark")}
      ${cupCard()}
      ${card("Modelo vs mercado", vmc, `<span class="tag">Mayores diferencias</span>`)}
      ${card("Rachas activas", `<div class="slist">${rach}</div>`)}
      ${card("Rendimiento del modelo", `${perf}<button class="link" data-go="registro">Ver resultados del modelo →</button>`, `<span class="tag">Público</span>`)}
    </div>
  </section>`;
}
function spark(serie) {
  if (!serie || serie.length < 2) return "";
  const W = 300, H = 70, ys = serie.map(s => s.acierto), y0 = Math.min(...ys) - .03, y1 = Math.max(...ys) + .03;
  const x = i => 4 + i * (W - 8) / (serie.length - 1), y = v => H - 6 - (v - y0) * (H - 12) / (y1 - y0 || 1);
  const pts = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.acierto).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="spark" role="img" aria-label="Acierto acumulado"><polyline points="${pts} ${x(serie.length - 1)},${H} 4,${H}" fill="rgba(61,139,255,.14)" stroke="none"/><polyline points="${pts}" fill="none" stroke="#3d8bff" stroke-width="2"/><circle cx="${x(serie.length - 1)}" cy="${y(ys[ys.length - 1])}" r="3.5" fill="#3d8bff"/></svg><p class="note">Acierto acumulado del resultado más probable.</p>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-hl]"); if (b) homeLiga = b.dataset.hl; }, true);

/* ---------------- LIGA ---------------- */
let sortState = { col: null, dir: -1 };
function vLiga() {
  const L = D.ligas[R.liga] || D.ligas[ligasIds()[0]];
  const tabs = [["resumen", "Resumen"], ["tabla", "Tabla"], ["partidos", "Partidos"], ["estadisticas", "Estadísticas"], ["jugadores", "Jugadores"],
    ["rachas", "Rachas"], ["corners", "Córners y tarjetas"], ["arbitros", "Árbitros"], ["proyeccion", "Proyección"], ["fuerza", "Fuerza"], ["comparar", "Comparar"]]
    .filter(([k]) => L.tabla_ok || k === "comparar" || (k === "tabla" && (L.grupos || []).length) || !["tabla", "proyeccion", "fuerza"].includes(k))
    .filter(([k]) => k !== "arbitros" || (L.arbitros || []).length);
  if (L.copa) tabs.splice(2, 0, ["copa", "Simulación"]);
  if (R.tab === "comparar") { R = { v: "comparar", liga: L.id }; return vComparar(); }
  const tab = tabs.some(t => t[0] === R.tab) ? R.tab : "resumen";
  const body = ({ resumen: lResumen, tabla: lTabla, partidos: lPartidos, estadisticas: lStats, jugadores: lJug, rachas: lRachas, corners: lCorners, arbitros: lArbitros, proyeccion: lProy, fuerza: lFuerza, copa: lCopa }[tab])(L);
  return `<section class="view" aria-labelledby="h-liga">
    <div class="lhead panel">${leagueMark(L, "xl")}<div><h1 id="h-liga">${esc(L.nombre)}</h1><span class="muted">${esc(L.pais)} · datos hasta ${L.datos_hasta ? fecha(L.datos_hasta + "T12:00") : "—"}</span></div><span class="lh-act">${starBtn("l", L.id, "Seguir esta liga")}</span></div>
    <div class="tabs2 wide" role="group" aria-label="Sección">${tabs.map(([k, n]) => `<button data-go="liga" data-liga="${L.id}" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join("")}</div>
    ${body}</section>`;
}
function zonesLegend(L) {
  if (!L.zonas || !L.zonas.length) return "";
  const seen = new Set();
  return `<div class="legend">${L.zonas.filter(z => !seen.has(z.nombre) && seen.add(z.nombre)).map(z => `<span><i class="z-${z.cls}"></i>${esc(z.nombre)}</span>`).join("")}</div>`;
}
function fullTable(L, compact = false) {
  if (!L.tabla_ok) return `<div class="empty">Esta competición se juega por grupos o fases; aquí mostramos partidos, estadísticas y jugadores.</div>`;
  const row = s => `<tr class="click zrow ${zoneOf(L, s.pos) ? "z-" + zoneOf(L, s.pos).cls : ""}" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}">`;
  return `<table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th>${compact ? "" : `<th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n hide-m">GF</th><th class="n hide-m">GC</th>`}<th class="n">DG</th><th class="n">Pts</th>${compact ? "" : `<th class="hide-m">Forma</th>`}</tr></thead><tbody>` +
    L.tabla.map(s => `${row(s)}<td>${posTag(L, s.pos)}</td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${s.pj}</td>${compact ? "" : `<td class="n hide-m">${s.g}</td><td class="n hide-m">${s.e}</td><td class="n hide-m">${s.p}</td><td class="n hide-m">${s.gf}</td><td class="n hide-m">${s.gc}</td>`}<td class="n">${sgn(s.dg)}</td><td class="n"><b>${s.pts}</b></td>${compact ? "" : `<td class="hide-m">${formHtml(s.forma)}</td>`}</tr>`).join("") +
    `</tbody></table>${zonesLegend(L)}`;
}
function groupTables(L, compact = false) {
  const gs = L.grupos || [];
  if (!gs.length) return "";
  const multi = gs.length > 1;
  return gs.map(g => {
    const n = g.filas.length;
    const zcls = pos => { const z = !multi ? zoneOf(L, pos) : null; return z ? "z-" + z.cls : ""; };
    return `<div class="panel flush scroll">${multi || g.nombre ? `<div class="ph"><h3>${esc(g.nombre || L.nombre)}</h3><span class="note">${n} equipos</span></div>` : ""}
      <table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th>${compact ? "" : `<th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n hide-m">GF</th><th class="n hide-m">GC</th>`}<th class="n">DG</th><th class="n">Pts</th></tr></thead><tbody>` +
      g.filas.map(f => `<tr class="click zrow ${zcls(f.pos)}" data-go="equipo" data-liga="${L.id}" data-team="${esc(f.equipo)}"><td><span class="pos ${zcls(f.pos)}">${f.pos}</span></td><td class="team">${badge(L, f.equipo)}${esc(corto(L, f.equipo))}</td><td class="n">${f.pj}</td>${compact ? "" : `<td class="n hide-m">${f.g}</td><td class="n hide-m">${f.e}</td><td class="n hide-m">${f.p}</td><td class="n hide-m">${f.gf}</td><td class="n hide-m">${f.gc}</td>`}<td class="n">${sgn(f.dg)}</td><td class="n"><b>${f.pts}</b></td></tr>`).join("") +
      `</tbody></table>${!multi ? zonesLegend(L) : ""}</div>`;
  }).join("") + `<p class="note">Tabla oficial publicada por ESPN.</p>`;
}
// tabla de local o de visita (como FootyStats), calculada con los resultados de la temporada
function splitTable(L, side) {
  const T = {};
  L.tabla.forEach(s => T[s.equipo] = { equipo: s.equipo, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, f: [] });
  [...L.resultados].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).forEach(x => {
    const t = side === "local" ? x.home : x.away, r = T[t]; if (!r) return;
    const gf = side === "local" ? x.hg : x.ag, gc = side === "local" ? x.ag : x.hg;
    r.pj++; r.gf += gf; r.gc += gc; if (gf > gc) { r.g++; r.pts += 3; r.f.push("G"); } else if (gf === gc) { r.e++; r.pts++; r.f.push("E"); } else { r.p++; r.f.push("P"); }
  });
  return Object.values(T).map(r => ({ ...r, dg: r.gf - r.gc, forma: r.f.slice(-5) })).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf).map((r, i) => ({ ...r, pos: i + 1 }));
}
function lTabla(L) {
  if (!L.tabla_ok) return groupTables(L) || `<div class="panel empty">Sin tabla publicada para esta competición.</div>`;
  const sp = ["local", "visita"].includes(VV.tsplit) ? VV.tsplit : "total";
  const sw = `<div class="tabs2 tsplit" role="group" aria-label="Partidos">${[["total", "Total"], ["local", "De local"], ["visita", "De visita"]].map(([k, n]) => `<button data-tsplit="${k}" aria-pressed="${k === sp}">${n}</button>`).join("")}</div>`;
  if (sp === "total") return `${sw}<div class="panel flush scroll">${fullTable(L)}</div>`;
  const rows = splitTable(L, sp);
  return `${sw}<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n">GF</th><th class="n">GC</th><th class="n">DG</th><th class="n">Pts</th><th class="n hide-m">Pts/PJ</th><th class="hide-m">Forma</th></tr></thead><tbody>${rows.map(s => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${s.pos}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${s.pj}</td><td class="n hide-m">${s.g}</td><td class="n hide-m">${s.e}</td><td class="n hide-m">${s.p}</td><td class="n">${s.gf}</td><td class="n">${s.gc}</td><td class="n">${sgn(s.dg)}</td><td class="n"><b>${s.pts}</b></td><td class="n hide-m">${s.pj ? dec(s.pts / s.pj) : "—"}</td><td class="hide-m">${formHtml(s.forma)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">Solo los partidos jugados ${sp === "local" ? "en casa" : "fuera de casa"} esta temporada. Sirve para ver cuánto cambia un equipo según dónde juega.</p>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-tsplit]"); if (!b) return; VV.tsplit = b.dataset.tsplit; go({ ...R, keepScroll: true }, false); });
function weeks(L) {
  const w = {};
  L.resultados.forEach(x => (w[weekStart(x.kickoff)] ||= { res: [], fx: [] }).res.push(x));
  L.partidos.forEach(p => (w[weekStart(p.kickoff)] ||= { res: [], fx: [] }).fx.push(p));
  return w;
}
function weekWidget(L, sel) {
  const W = weeks(L), keys = Object.keys(W).sort();
  if (!keys.length) return `<div class="empty">Sin partidos.</div>`;
  const cur = weekStart(new Date().toISOString());
  let k = sel && W[sel] ? sel : (keys.find(x => x >= cur) || keys[keys.length - 1]);
  const i = keys.indexOf(k), wkd = W[k];
  const [y, m, d] = k.split("-").map(Number), end = new Date(y, m - 1, d + 6);
  const lab = `${new Date(y, m - 1, d).toLocaleDateString("es-CL", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`;
  const nav = (j, t) => j >= 0 && j < keys.length ? `<button class="wbtn" data-go="liga" data-liga="${L.id}" data-tab="${R.tab || "partidos"}" data-wk="${keys[j]}" data-keep aria-label="${t}">${t === "Semana anterior" ? "‹" : "›"}</button>` : `<span class="wbtn off" aria-hidden="true">·</span>`;
  const res = [...wkd.res].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).map(x => resultRow(L, x)).join("");
  const fx = wkd.fx.map(p => matchRow(p, false)).join("");
  return `<div class="wnav">${nav(i - 1, "Semana anterior")}<b>Semana del ${esc(lab)}</b>${nav(i + 1, "Semana siguiente")}</div>${res ? `<div class="rlist">${res}</div>` : ""}${fx}`;
}
function lPartidos(L) { return `<div class="panel flush">${weekWidget(L, R.wk)}</div>`; }
function scorersTable(L, n = 25, team = null, mini = false) {
  const gs = (L.goleadores || []).filter(g => !team || g.equipo === team).slice(0, n);
  if (!gs.length) return `<div class="empty">Sin goles registrados todavía.</div>`;
  // mini: versión angosta para la columna lateral (solo puesto, jugador y goles)
  return `<table class="t${mini ? " mini" : ""}"><thead><tr><th>#</th><th>Jugador</th><th class="n">Goles</th>${mini ? "" : `<th class="n hide-m">Penales</th><th>Últimos 5</th>`}</tr></thead><tbody>` +
    gs.map((g, i) => `<tr class="click" data-go="jugador" data-liga="${L.id}" data-id="${esc(g.jid)}"><td><span class="pos">${i + 1}</span></td><td class="team">${face(L, g.equipo, g.jid, g.jugador)}<span>${esc(g.jugador)}${team ? "" : `<small class="faint" style="display:block;font-weight:500">${esc(corto(L, g.equipo))}</small>`}</span></td><td class="n"><b>${g.goles}</b>${mini && g.penales ? `<small class="faint"> (${g.penales} pen.)</small>` : ""}</td>${mini ? "" : `<td class="n hide-m">${g.penales}</td><td><span class="l5">${(g.ult5 || []).map(v => `<i class="${v ? "on" : ""}">${v || "·"}</i>`).join("")}</span></td>`}</tr>`).join("") + `</tbody></table>`;
}
function cardsTable(L, n = 20) {
  const ts = (L.amonestados || []).slice(0, n);
  if (!ts.length) return `<div class="empty">Sin tarjetas registradas.</div>`;
  return `<table class="t"><thead><tr><th>#</th><th>Jugador</th><th class="n">Amarillas</th><th class="n">Rojas</th></tr></thead><tbody>` +
    ts.map((g, i) => `<tr><td><span class="pos">${i + 1}</span></td><td class="team">${face(L, g.equipo, g.jid, g.jugador)}<span>${esc(g.jugador)}<small class="faint" style="display:block;font-weight:500">${esc(corto(L, g.equipo))}</small></span></td><td class="n"><span class="ycard"></span> ${g.amarillas}</td><td class="n">${g.rojas ? `<span class="rcard"></span> ${g.rojas}` : "—"}</td></tr>`).join("") + `</tbody></table>`;
}
function lJug(L) {
  return `<div class="grid2"><div class="panel flush"><div class="ph"><h3>Goleadores</h3></div><div class="scroll">${scorersTable(L)}</div></div>
    <div class="panel flush"><div class="ph"><h3>Más amonestados</h3></div><div class="scroll">${cardsTable(L)}</div></div></div>
    <p class="note">Goles y tarjetas según el detalle de cada partido publicado por ESPN. No incluye autogoles.</p>`;
}
const STAT_COLS = [["pj", "PJ", 0], ["gf", "Goles", 2], ["gc", "Recibe", 2], ["tiros", "Tiros", 1], ["tiros_arco", "Al arco", 1], ["corners", "Córners", 1],
  ["posesion", "Posesión", 0], ["faltas", "Faltas", 1], ["tarjetas", "Tarjetas", 1], ["ambos", "Ambos marcan", -1], ["over25", "+2,5 goles", -1], ["vallas", "Vallas inv.", 0]];
function lStats(L) {
  const col = R.sort && STAT_COLS.some(c => c[0] === R.sort) ? R.sort : "gf";
  const rows = [...(L.stats || [])].filter(s => s.pj).sort((a, b) => (b[col] ?? -1) - (a[col] ?? -1));
  const fmt = (v, d) => v == null ? "—" : d === -1 ? pct(v) : dec(v, d);
  return `<div class="panel flush scroll"><table class="t sortable"><thead><tr><th>Equipo</th>${STAT_COLS.map(([k, n]) => `<th class="n"><button class="sbtn" data-go="liga" data-liga="${L.id}" data-tab="estadisticas" data-sort="${k}" data-keep aria-pressed="${k === col}">${n}${k === col ? " ↓" : ""}</button></th>`).join("")}</tr></thead><tbody>` +
    rows.map(s => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td>${STAT_COLS.map(([k, , d]) => `<td class="n ${k === col ? "hl" : ""}">${fmt(s[k], d)}</td>`).join("")}</tr>`).join("") +
    `</tbody></table></div><p class="note">Promedios por partido en la temporada actual. Toca una columna para ordenar.</p>`;
}
function rachasList(L, rs) {
  if (!rs.length) return `<div class="empty">Ninguna racha de 3 o más partidos.</div>`;
  return `<div class="slist">${rs.map(s => `<button class="srow" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}">${badge(L, s.equipo)}<span><b>${esc(corto(L, s.equipo))}</b><small>${esc(s.texto)}</small></span><span class="sn num">${s.n}</span></button>`).join("")}</div>`;
}
function lRachas(L) {
  const by = {}; (L.rachas || []).forEach(s => (by[s.texto] ||= []).push(s));
  const keys = Object.keys(by);
  if (!keys.length) return `<div class="panel empty">Ninguna racha de 3 o más partidos.</div>`;
  return `<div class="cards">${keys.map(k => card(k[0].toUpperCase() + k.slice(1), rachasList(L, by[k].slice(0, 8)))).join("")}</div>`;
}
function lCorners(L) {
  const up = L.partidos.filter(p => p.ch != null || p.th != null).slice(0, 12);
  const st = [...(L.stats || [])].filter(s => s.pj).sort((a, b) => (b.corners ?? 0) - (a.corners ?? 0));
  const rows = up.map(p => {
    const c = p.ch != null ? p.ch + p.ca : null, t = p.th != null ? p.th + p.ta : null;
    return `<tr class="click" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}"><td class="num muted">${fecha(p.kickoff)}</td><td>${esc(corto(L, p.home))} – ${esc(corto(L, p.away))}</td>
      <td class="n">${dec(c, 1)}</td><td class="n">${c != null ? pct(poisOver(9.5, c)) : "—"}</td><td class="n">${dec(t, 1)}</td><td class="n">${t != null ? pct(poisOver(4.5, t)) : "—"}</td></tr>`;
  }).join("");
  return `<div class="panel flush scroll"><div class="ph"><h3>Próximos partidos</h3></div><table class="t"><thead><tr><th>Fecha</th><th>Partido</th><th class="n">Córners esp.</th><th class="n">+9,5 córners</th><th class="n">Tarjetas esp.</th><th class="n">+4,5 tarjetas</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">Sin datos de córners o tarjetas para esta liga.</td></tr>`}</tbody></table></div>
    <div class="panel flush scroll"><div class="ph"><h3>Promedios por equipo</h3></div><table class="t"><thead><tr><th>Equipo</th><th class="n">Córners a favor</th><th class="n">Córners en contra</th><th class="n">Tarjetas</th><th class="n">Faltas</th></tr></thead><tbody>` +
    st.map(s => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${dec(s.corners, 1)}</td><td class="n">${dec(s.corners_rival, 1)}</td><td class="n">${dec(s.tarjetas, 1)}</td><td class="n">${dec(s.faltas, 1)}</td></tr>`).join("") +
    `</tbody></table></div><p class="note">Córners y tarjetas usan el mismo modelo de ataque y defensa que los goles. No consideran al árbitro, que influye mucho en las tarjetas.</p>`;
}
function lProy(L) {
  const t = [...L.tabla].sort((a, b) => (b.pts_esp ?? 0) - (a.pts_esp ?? 0));
  const zs = []; (L.zonas || []).forEach(z => { if (!zs.some(x => x.cls === z.cls)) zs.push(z); });
  const pb = (v, cls = "") => `<div class="pbar ${cls}"><span class="tr"><i style="width:${100 * (v || 0)}%"></i></span><span class="num">${!v || v < 0.005 ? "<1 %" : pct(v)}</span></div>`;
  const zname = z => z.cls === "desc" ? "Descenso" : z.nombre.replace("(fase de grupos)", "(grupos)");
  return `<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n hide-m">Pts hoy</th><th class="n">Pts finales ${help(TIPS.proy)}</th><th class="n">Campeón</th>${zs.map(z => `<th class="n hide-m">${esc(zname(z))}</th>`).join("")}</tr></thead><tbody>` +
    t.map((s, i) => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n hide-m">${s.pts}</td><td class="n"><b>${dec(s.pts_esp, 1)}</b></td><td>${pb(s.p_campeon, "gold")}</td>${zs.map(z => `<td class="hide-m">${pb((s.zonas || {})[z.cls], z.cls === "desc" ? "bad" : "")}</td>`).join("")}</tr>`).join("") +
    `</tbody></table></div><p class="note">10.000 simulaciones del resto de la temporada con el modelo actual.</p>`;
}
function lFuerza(L) {
  const sc = scatterAD(L);
  return (sc ? `<div class="panel stack"><h3>Ataque contra defensa</h3>${sc}</div>` : "") + lFuerzaTabla(L);
}
function lFuerzaTabla(L) {
  const t = [...L.tabla].sort((a, b) => (b.ataque / b.defensa) - (a.ataque / a.defensa));
  const mx = Math.max(...t.map(s => s.ataque / s.defensa));
  return `<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">Ataque ${help(TIPS.atq)}</th><th class="n">Defensa ${help(TIPS.def)}</th><th>Fuerza global</th></tr></thead><tbody>` +
    t.map((s, i) => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${dec(s.ataque)}</td><td class="n">${dec(s.defensa)}</td><td style="width:35%"><div class="pbar" style="justify-content:flex-start"><span class="tr" style="width:100%"><i style="width:${(100 * (s.ataque / s.defensa) / mx).toFixed(1)}%"></i></span></div></td></tr>`).join("") +
    `</tbody></table></div><p class="note">Ataque: goles que marca frente a una defensa promedio (1,00 = promedio de la liga). Defensa: goles que recibe; menos es mejor.</p>`;
}
function lResumen(L) {
  return `<div class="layout">
    <div class="stack">
      <div class="panel flush">${weekWidget(L, R.wk)}</div>
      ${L.tabla_ok ? `<div class="panel flush scroll"><div class="ph"><h3>Tabla</h3><button class="link" data-go="liga" data-liga="${L.id}" data-tab="tabla">Completa →</button></div>${fullTable(L, true)}</div>` : groupTables(L, true)}
    </div>
    <aside class="stack">
      <div class="panel flush"><div class="ph"><h3>Goleadores</h3><button class="link" data-go="liga" data-liga="${L.id}" data-tab="jugadores">Todos →</button></div><div class="scroll">${scorersTable(L, 6, null, true)}</div></div>
      <div class="panel stack"><div class="row" style="justify-content:space-between"><h3>Rachas</h3><button class="link" data-go="liga" data-liga="${L.id}" data-tab="rachas">Todas →</button></div>${rachasList(L, (L.rachas || []).slice(0, 6))}</div>
    </aside></div>`;
}

/* ---------------- PARTIDO ---------------- */
function vPartido() {
  const L = D.ligas[R.liga], p = findMatch(R.liga, R.id);
  if (!L || !p) {
    const reg = D.registro && (D.registro.filas || []).find(f => String(f.id) === String(R.id));
    if (reg) return `<section class="view narrow"><button class="back" data-go="registro">← Resultados del modelo</button>${regMatch(reg)}<p class="note">Este partido ya se jugó. Arriba está lo que predijo Ballytics y cómo le fue.</p></section>`;
    return vNoEncontrado("Este partido ya no está en el calendario");
  }
  const { m, lh, la } = pmatrix(L, p), k = markets(m);
  const sh = rowOf(L, p.home), sa = rowOf(L, p.away), H = corto(L, p.home), A = corto(L, p.away);
  const N = 6; let mx = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) mx = Math.max(mx, m[i][j]);
  let heat = `<tr><th></th>${[...Array(N).keys()].map(j => `<th>${j}</th>`).join("")}</tr>`;
  for (let i = 0; i < N; i++) { heat += `<tr><th>${i}</th>`; for (let j = 0; j < N; j++) { const al = (m[i][j] / mx) * .92 + .03;
    heat += `<td style="background:rgba(var(--heat),${al.toFixed(3)});color:${al > .5 ? "var(--heat-ink)" : "var(--ink)"}">${(100 * m[i][j]).toFixed(1).replace(".", ",")}</td>`; } heat += "</tr>"; }
  const ct = p.ch != null ? p.ch + p.ca : null, tt = p.th != null ? p.th + p.ta : null;
  const groups = [
    ["Resultado (1X2)", [["H", `Gana ${H}`, k.H], ["D", "Empate", k.D], ["A", `Gana ${A}`, k.A]]],
    ["Doble oportunidad", [["1X", `${H} o empate`, k.H + k.D], ["X2", `Empate o ${A}`, k.D + k.A], ["12", "Sin empate", k.H + k.A]]],
    ["Goles", [["O15", "Más de 1,5", k.O15], ["U15", "Menos de 1,5", 1 - k.O15], ["O25", "Más de 2,5", k.O25], ["U25", "Menos de 2,5", 1 - k.O25], ["O35", "Más de 3,5", k.O35], ["U35", "Menos de 3,5", 1 - k.O35]]],
    ["Ambos marcan", [["BY", "Sí", k.B], ["BN", "No", 1 - k.B]]],
  ];
  if (ct != null) groups.push(["Córners (total)", [8.5, 9.5, 10.5].flatMap(l => [[`CO${l}`, `Más de ${String(l).replace(".", ",")}`, poisOver(l, ct)], [`CU${l}`, `Menos de ${String(l).replace(".", ",")}`, 1 - poisOver(l, ct)]])]);
  if (tt != null) groups.push(["Tarjetas (total)", [3.5, 4.5].flatMap(l => [[`TO${l}`, `Más de ${String(l).replace(".", ",")}`, poisOver(l, tt)], [`TU${l}`, `Menos de ${String(l).replace(".", ",")}`, 1 - poisOver(l, tt)]])]);
  (p.tarjetas_jug || []).filter(c => c.p).forEach((c, i) => { if (i === 0) groups.push(["Recibe amarilla", []]); groups[groups.length - 1][1].push([`Y${c.jid}`, `${c.jugador} (${c.lado === "h" ? H : A})`, c.p]); });
  (p.goleadores || []).filter(g => g.p).forEach((g, i) => { if (i === 0) groups.push(["Marca en cualquier momento", []]); groups[groups.length - 1][1].push([`G${g.jid}`, `${g.jugador} (${g.lado === "h" ? H : A})`, g.p]); });
  const st = ODDS[p.id] || (ODDS[p.id] = {});
  const cq = p.cuotas;
  if (cq && !st._pre) {
    st._pre = true; st.H = cq.h; st.D = cq.d; st.A = cq.a;
    if (cq.linea === 2.5 && cq.over && cq.under) { st.O25 = cq.over; st.U25 = cq.under; }
  }
  const mkt = vsMercado(L, p, k);
  const mk = `<tr><th>Mercado</th><th style="text-align:right">Prob.</th><th style="text-align:right">Justa ${help(TIPS.justa)}</th><th style="text-align:right">Tu cuota</th><th style="text-align:right">EV ${help(TIPS.ev)}</th><th><span class="sr">Combinada</span></th></tr>` +
    groups.map(([g, rows]) => `<tr class="grp"><td colspan="6">${g}</td></tr>` + rows.map(([key, n, pr]) => `<tr><td>${esc(n)}</td><td class="n">${pct(pr, 1)}</td><td class="n">${dec(1 / pr)}</td>
      <td class="n"><input class="odd" inputmode="decimal" aria-label="Cuota ${esc(n)}" data-k="${esc(key)}" data-p="${pr}" value="${st[key] ? String(st[key]).replace(".", ",") : ""}" placeholder="—"></td><td class="n" data-ev="${esc(key)}"></td>
      <td class="n"><button class="addsel" data-sel="${esc(key)}" data-label="${esc(selLabel(g, n))}" data-jug="${key[0] === "G" ? esc(n.replace(/ \(.*\)$/, "")) : ""}" data-liga="${L.id}" data-mid="${esc(p.id)}" aria-pressed="${inCombo(p.id, key)}" title="Agregar a la combinada">+</button></td></tr>`).join("")).join("");
  const reg = D.registro && D.registro.filas && D.registro.filas.find(f => String(f.id) === String(p.id));
  // calculadora rápida: el usuario escribe la cuota de su casa y ve al tiro si tiene valor según Ballytics
  const quick = [["H", `Gana ${H}`, k.H], ["D", "Empate", k.D], ["A", `Gana ${A}`, k.A], ["O25", "Más de 2,5 goles", k.O25], ["BY", "Ambos marcan", k.B]];
  const evCalc = `<div class="panel stack evcalc"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>¿Tu cuota tiene valor? ${help(TIPS.ev)}</h3><button class="link" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}" data-tab="mercados" data-keep>Todos los mercados →</button></div>
    <div class="evq">${quick.map(([key, n, pr]) => `<label class="evi"><span class="lbl">${esc(n)}</span><span class="evp num">${pct(pr, 0)} · justa ${dec(1 / pr)}</span><input class="odd" inputmode="decimal" aria-label="Tu cuota para ${esc(n)}" data-k="${key}" data-p="${pr}" value="${st[key] ? String(st[key]).replace(".", ",") : ""}" placeholder="Tu cuota"><span class="evr" data-ev="${key}"></span></label>`).join("")}</div>
    <p class="note">Escribe la cuota que te ofrece tu casa. Si es mayor que la cuota justa, el valor esperado (EV) sale positivo según Ballytics. Ojo: en el backtest, apostar solo por valor del modelo perdió plata; es una referencia, no una recomendación.</p></div>`;
  const side = (s, t, cls) => `<div class="side ${cls}">${badge(L, t, "lg")}<button class="tn" data-go="equipo" data-liga="${L.id}" data-team="${esc(t)}">${esc(corto(L, t))}</button>
      <span class="xgv">${dec(cls === "l" ? lh : la)}</span><span class="lbl">goles previstos ${cls === "l" ? help(TIPS.xg) : ""}</span>
      <span class="row" style="gap:8px;${cls === "r" ? "justify-content:flex-end" : ""}">${s.pos ? `<span class="muted num" style="font-size:12px">${s.pos}º · ${s.pts} pts</span>` : ""}${formHtml(s.forma)}</span></div>`;
  const cmp = seasonCmp(L, p.home, p.away);
  const scorers = (p.goleadores || []).length ? (p.goleadores || []).map(g => `<div class="srow" data-go="jugador" data-liga="${L.id}" data-id="${esc(g.jid)}">${face(L, g.lado === "h" ? p.home : p.away, g.jid, g.jugador)}<span><b>${esc(g.jugador)}</b><small>${g.goles} goles en la temporada</small></span><span class="sn num">${pct(g.p)}</span></div>`).join("") : `<p class="note">Sin goleadores registrados todavía.</p>`;
  const h2h = (p.h2h || []).length ? p.h2h.map(x => resultRow(L, x)).join("") : `<p class="note">No se enfrentaron en las últimas temporadas.</p>`;
  const tabs = [["resumen", "Resumen"], ["mercados", "Mercados"], ["alineaciones", "Alineaciones"], ["historial", "Historial"]];
  const tab = tabs.some(t => t[0] === R.tab) ? R.tab : "resumen";
  const tabBar = `<div class="mtabs" role="tablist">${tabs.map(([key, n]) => `<button role="tab" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}" data-tab="${key}" data-keep aria-selected="${key === tab}">${n}</button>`).join("")}</div>`;
  const bar = `<div class="mbar"><div class="mbar-in">
      <span class="mb-t">${badge(L, p.home)}<b>${esc(H)}</b></span>
      <span class="mb-c"><span class="mb-live" data-live-mini="${esc(p.id)}">${pct(k.H)} · ${pct(k.D)} · ${pct(k.A)}</span><small>${esc(cuando(p.kickoff))}</small></span>
      <span class="mb-t r"><b>${esc(A)}</b>${badge(L, p.away)}</span></div>${tabBar}</div>`;
  const recent = t => L.resultados.filter(x => x.home === t || x.away === t).slice(0, 5);
  let body = "";
  const cerca = Math.abs(new Date(p.kickoff).getTime() - Date.now()) < 3 * 3600 * 1000;
  if (tab === "resumen") body = `
    ${cerca ? `<div id="xi-adj"></div>` : ""}
    ${bajasPanel(L, p)}
    ${arbPanel(L, p)}
    <div class="panel stack previa"><h3>Previa</h3>${previa(L, p, k, ct, tt)}</div>
    ${evCalc}
    ${iaTeaser(p)}
    <div class="grid2">
      <div class="panel stack"><h3>Marcador exacto</h3><div class="scroll"><table class="heat">${heat}</table></div><p class="note">Filas: goles de ${esc(H)}. Columnas: goles de ${esc(A)}.</p></div>
      ${cmp ? `<div class="panel stack"><h3>Comparación de la temporada</h3><div class="cmph"><span>${badge(L, p.home)} ${esc(H)}</span><span>${esc(A)} ${badge(L, p.away)}</span></div>${cmp}</div>` : ""}
    </div>
    <div class="grid2">
      <div class="panel stack"><h3>Goles totales</h3>${goalsDist(m)}</div>
      <div class="panel stack"><h3>Cómo cambió la probabilidad</h3>${histChart(L, p)}</div>
    </div>
    ${voteBox(p.id, p.kickoff, H, A, [k.H, k.D, k.A])}
    ${(p.tarjetas_jug || []).length ? `<div class="panel stack"><h3>Probabilidad de amarilla ${help("Ritmo de amarillas de cada jugador en la temporada, ajustado por las tarjetas que el modelo espera para su equipo en este partido. Supone que juega el partido completo.")}</h3><div class="slist">${p.tarjetas_jug.map(c => `<div class="srow" data-go="ficha" data-id="${esc(c.jid)}">${face(L, c.lado === "h" ? p.home : p.away, c.jid, c.jugador)}<span><b>${esc(c.jugador)}</b><small>${c.amarillas} amarillas en la temporada</small></span><span class="sn num ycol">${pct(c.p)}</span></div>`).join("")}</div></div>` : ""}
    <div class="panel stack"><h3>Goleadores probables</h3><div class="slist">${scorers}</div><p class="note">Probabilidad de marcar según sus goles en la temporada y los goles esperados de su equipo.</p></div>`;
  if (tab === "mercados") body = `
    <div class="panel stack"><h3>Mercados y valor</h3>
      ${mkt}
      <p class="note">${cq ? `Cuotas precargadas de ${esc(cq.casa || "ESPN")} (vía ESPN); puedes cambiarlas por las de tu casa. EV es el valor esperado por cada $1.` : "Escribe la cuota de tu casa de apuestas para ver el valor esperado (EV) por cada $1."} En el backtest, apostar solo por "valor" del modelo perdió plata.</p>
      <div class="scroll"><table class="mk">${mk}</table></div>
      <p class="note">Toca <b>+</b> para armar una combinada con varios mercados o partidos y ver su probabilidad real.</p></div>`;
  if (tab === "alineaciones") body = `${bajasPanel(L, p)}<div class="panel stack" id="lineups"><h3>Alineaciones</h3><p class="note">Buscando alineaciones…</p></div>`;
  if (tab === "historial") body = `
    <div class="panel stack"><h3>Últimos enfrentamientos</h3><div class="rlist">${h2h}</div></div>
    <div class="grid2">
      <div class="panel flush"><div class="ph"><h3>Últimos partidos de ${esc(H)}</h3>${formHtml(sh.forma)}</div><div class="rlist">${recent(p.home).map(x => resultRow(L, x)).join("") || `<div class="empty">Sin partidos.</div>`}</div></div>
      <div class="panel flush"><div class="ph"><h3>Últimos partidos de ${esc(A)}</h3>${formHtml(sa.forma)}</div><div class="rlist">${recent(p.away).map(x => resultRow(L, x)).join("") || `<div class="empty">Sin partidos.</div>`}</div></div>
    </div>`;
  return `<section class="view" aria-labelledby="h-p">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="partidos">← ${esc(L.nombre)}</button>
    <h1 id="h-p" class="sr">${esc(H)} vs ${esc(A)}</h1>
    <div class="panel match">
      <div class="livebox" data-live-box="${esc(p.id)}" hidden></div>
      <div class="meta">${leagueMark(L, "sm")}<span>${esc(L.nombre)}</span><span>·</span><span>${new Date(p.kickoff).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} ${hhmm(p.kickoff)}</span><span class="cdown" data-cd="${esc(p.kickoff)}"></span></div>
      <div class="mact"><button class="btn ghost sm" data-sharelink>Compartir enlace</button><button class="btn ghost sm" data-share data-liga="${L.id}" data-mid="${esc(p.id)}">Compartir imagen</button><button class="btn ghost sm" data-share data-fmt="story" data-liga="${L.id}" data-mid="${esc(p.id)}" title="Formato vertical 9:16 para historias de Instagram o WhatsApp">Imagen para historias</button><button class="btn ghost sm" data-ics="match" data-liga="${L.id}" data-mid="${esc(p.id)}">Agregar al calendario</button></div>
      <div class="face">${side(sh, p.home, "l")}<span class="vs">VS</span>${side(sa, p.away, "r")}</div>
      <div class="probs">
        <div class="pt h"><span class="lbl">${esc(H)}</span><span class="v">${pct(k.H, 1)}</span><div class="tr"><i style="width:${100 * k.H}%"></i></div></div>
        <div class="pt d"><span class="lbl">Empate</span><span class="v">${pct(k.D, 1)}</span><div class="tr"><i style="width:${100 * k.D}%"></i></div></div>
        <div class="pt a"><span class="lbl">${esc(A)}</span><span class="v">${pct(k.A, 1)}</span><div class="tr"><i style="width:${100 * k.A}%"></i></div></div>
      </div>
      <div class="kpis mini">${kpi("", "Más de 2,5 goles", pct(k.O25), "")}${kpi("", "Ambos marcan", pct(k.B), "")}${ct != null ? kpi("", "Córners esperados", dec(ct, 1), `${dec(p.ch, 1)} – ${dec(p.ca, 1)}`) : ""}${tt != null ? kpi("", "Tarjetas esperadas", dec(tt, 1), `${dec(p.th, 1)} – ${dec(p.ta, 1)}`) : ""}</div>
      ${tab !== "mercados" ? mkt : ""}
      ${reg ? `<p class="note" style="margin-top:14px">Predicción guardada en el registro público el ${fecha(reg.predicho)}; se califica al terminar el partido.</p>` : ""}
    </div>
    ${bar}
    ${body}
  </section>`;
}
function bindOdds() {
  const st = ODDS[R.id] || {};
  const upd = () => document.querySelectorAll("[data-ev]").forEach(td => {
    const inp = [...document.querySelectorAll("input.odd")].find(i => i.dataset.k === td.dataset.ev), o = st[td.dataset.ev], pr = +inp.dataset.p;
    if (!o) { td.innerHTML = `<span class="faint">—</span>`; return; }
    const ev = pr * o - 1;
    td.innerHTML = `<span class="num ${ev > 0 ? "good" : "bad"}">${ev > 0 ? "+" : "−"}${pct(Math.abs(ev), 1)}</span>${ev > 0.05 ? ` <span class="val" title="Kelly ¼: ${pct(Math.max(0, ev / (o - 1)) / 4, 1)} del bankroll">valor</span>` : ""}`;
  });
  document.querySelectorAll("input.odd").forEach(inp => inp.addEventListener("input", () => { const v = parseFloat(inp.value.replace(",", ".")); st[inp.dataset.k] = v > 1 ? v : undefined; upd(); }));
  upd();
}

/* ---------------- EQUIPO ---------------- */
function vEquipo() {
  const L = D.ligas[R.liga]; const t = R.team;
  if (!L || !(L.equipos[t] || rowOf(L, t).equipo)) return `<section class="view"><button class="back" data-go="inicio">← Inicio</button><div class="panel empty">No encontré ese equipo.</div></section>`;
  const s = rowOf(L, t), st = statOf(L, t);
  const prox = L.partidos.filter(p => p.home === t || p.away === t).slice(0, 6);
  const res = L.resultados.filter(x => x.home === t || x.away === t).slice(0, 8);
  const rs = (L.rachas || []).filter(x => x.equipo === t);
  const zs = s.zonas ? Object.entries(s.zonas).map(([cls, v]) => { const z = (L.zonas || []).find(z => z.cls === cls); return z ? kpi(cls === "desc" ? "" : "", cls === "desc" ? "Descenso" : z.nombre.replace("(fase de grupos)", "(grupos)"), pct(v, 1), "") : ""; }).join("") : "";
  return `<section class="view" aria-labelledby="h-e">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="resumen">← ${esc(L.nombre)}</button>
    <div class="lhead panel">${badge(L, t, "xl")}<div><h1 id="h-e">${esc(corto(L, t))}</h1><span class="row" style="gap:8px;margin-top:6px">${starBtn("t", L.id + "|" + t, "Seguir este equipo")}<button class="btn ghost sm cmp-btn" data-go="comparar" data-liga="${L.id}" data-team="${esc(t)}">Comparar</button><button class="btn ghost sm" data-ics="team" data-liga="${L.id}" data-team="${esc(t)}">Partidos al calendario</button></span><span class="muted">${esc(L.nombre)}${s.pos ? ` · ${s.pos}º con ${s.pts} pts en ${s.pj} partidos` : ""}</span></div><span style="margin-left:auto">${formHtml(s.forma)}</span></div>
    <div class="kpis">${s.ataque ? kpi("m", "Ataque", dec(s.ataque), "1,00 = promedio liga") + kpi("", "Defensa", dec(s.defensa), "menos es mejor") : ""}${s.pts_esp != null ? kpi("", "Pts finales", dec(s.pts_esp, 1), "proyección") + kpi("k", "Campeón", pct(s.p_campeon, 1), "") : ""}${zs}</div>
    ${st.pj ? `<div class="panel stack"><h3>Estadísticas de la temporada</h3><div class="sgrid wide">
      ${[["Goles/PJ", dec(st.gf)], ["Recibe/PJ", dec(st.gc)], ["Tiros/PJ", dec(st.tiros, 1)], ["Al arco/PJ", dec(st.tiros_arco, 1)], ["Córners/PJ", dec(st.corners, 1)], ["Posesión", st.posesion != null ? dec(st.posesion, 0) + "%" : "—"],
         ["Tarjetas/PJ", dec(st.tarjetas, 1)], ["Faltas/PJ", dec(st.faltas, 1)], ["Ambos marcan", pct(st.ambos)], ["+2,5 goles", pct(st.over25)], ["Vallas invictas", st.vallas], ["Sin marcar", st.sin_marcar]]
        .map(([n, v]) => `<div><span class="lbl">${n}</span><b class="num">${v}</b></div>`).join("")}</div></div>` : ""}
    <div class="grid2">
      ${L.tabla_ok ? `<div class="panel stack"><h3>Posición en la tabla</h3>${posChart(L, t)}</div>` : ""}
      <div class="panel stack"><h3>Goles por partido</h3>${goalsChart(L, t)}</div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="panel flush"><div class="ph"><h3>Próximos partidos</h3></div>${prox.map(p => matchRow(p, false, false, true)).join("") || `<div class="empty">Sin partidos programados.</div>`}</div>
        <div class="panel flush"><div class="ph"><h3>Goleadores del equipo</h3></div><div class="scroll">${scorersTable(L, 10, t)}</div></div>
      </div>
      <div class="stack">
        <div class="panel flush"><div class="ph"><h3>Últimos resultados</h3></div><div class="rlist">${res.map(x => resultRow(L, x) + (x.goles && x.goles.length ? `<div class="gl">${x.goles.map(g => `<span>${g.min ? g.min + "' " : ""}${esc(g.jug || "")}${g.pen ? " (p)" : ""}${g.og ? " (ag)" : ""}</span>`).join("")}</div>` : "")).join("") || `<div class="empty">Sin partidos jugados.</div>`}</div></div>
        ${rs.length ? `<div class="panel stack"><h3>Rachas activas</h3>${rachasList(L, rs)}</div>` : ""}
      </div>
    </div></section>`;
}

/* ---------------- REGISTRO y MÉTODO ---------------- */
function calChart(pts) {
  if (!pts || !pts.length) return `<p class="note">Aún no hay suficientes partidos calificados.</p>`;
  const W = 320, H = 250, pad = 34, sx = x => pad + x * (W - pad - 10), sy = y => H - pad - y * (H - pad - 10);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Gráfico de calibración">`;
  for (const v of [0, .2, .4, .6, .8, 1]) s += `<line x1="${sx(v)}" y1="${sy(0)}" x2="${sx(v)}" y2="${sy(1)}" stroke="rgba(148,163,184,.14)"/><line x1="${sx(0)}" y1="${sy(v)}" x2="${sx(1)}" y2="${sy(v)}" stroke="rgba(148,163,184,.14)"/><text x="${sx(v)}" y="${H - pad + 16}" text-anchor="middle">${v * 100}</text><text x="${pad - 6}" y="${sy(v) + 4}" text-anchor="end">${v * 100}</text>`;
  s += `<line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="#8792a6" stroke-dasharray="4 4"/>`;
  const mx = Math.max(...pts.map(p => p.n));
  s += `<polyline fill="none" stroke="#3d8bff" stroke-width="2" points="${pts.map(p => `${sx(p.pred)},${sy(p.real)}`).join(" ")}"/>`;
  pts.forEach(p => s += `<circle cx="${sx(p.pred)}" cy="${sy(p.real)}" r="${(3 + 5 * Math.sqrt(p.n / mx)).toFixed(1)}" fill="#3d8bff" stroke="#0e131e" stroke-width="1.5"><title>Predijo ${pct(p.pred)} · ocurrió ${pct(p.real)} · ${p.n} casos</title></circle>`);
  return s + `<text x="${(W + pad) / 2}" y="${H - 2}" text-anchor="middle">probabilidad predicha (%)</text></svg>`;
}
/* ---------- picks públicos: dos listas diarias con regla fija, calificadas gane o pierda ---------- */
const PP_EST = { seguro: { n: "Seguros", c: "#3d8bff", d: "El resultado más probable, si es de 60 % o más" }, valor: { n: "Valor", c: "#ffb020", d: "Donde el modelo propio ve más que la casa" } };
const ppLado = (L, f) => f.lado === "D" ? "Empate" : `Gana ${corto(L, f.lado === "H" ? f.home : f.away)}`;
const ppU = u => u == null ? "—" : `${u > 0 ? "+" : u < 0 ? "−" : ""}${dec(Math.abs(u), 2)} u`;
const ppPlata = u => `${u > 0 ? "+" : u < 0 ? "−" : ""}$${Math.round(Math.abs(u) * 1000).toLocaleString("es-CL")}`;
function ppFila(f, corta) {
  const L = D.ligas[f.liga] || { equipos: {}, nombre: (D.meta && D.meta[f.liga] || {}).nombre || "" };
  const t = f.lado === "H" ? f.home : f.lado === "A" ? f.away : null, g = f.res === "G" ? f.cuota - 1 : f.res === "P" ? -1 : 0;
  const st = f.res == null ? `<span class="pp-r pend">${new Date(f.kickoff).getTime() > Date.now() ? hhmm(f.kickoff) : "en juego"}</span>` : f.res === "N" ? `<span class="pp-r nulo">nulo</span>` : `<span class="pp-r ${f.res === "G" ? "ok" : "ko"}">${f.res === "G" ? "✓" : "✗"} ${ppU(g)}</span>`;
  return `<button class="pp-f" data-go="${D.ligas[f.liga] ? "partido" : "registro"}" data-liga="${esc(f.liga)}" data-id="${esc(f.id)}">
    ${t ? badge(L, t) : `<span class="badge" style="background:var(--panel2);color:var(--muted)">X</span>`}
    <span class="pp-m"><b>${esc(ppLado(L, f))}</b><small>${esc(corto(L, f.home))} vs ${esc(corto(L, f.away))}${f.hg != null ? ` · ${f.hg}–${f.ag}` : ""}${corta ? "" : ` · ${esc(L.nombre || "")}`}</small></span>
    <span class="pp-n num"><b>${dec(f.cuota)}</b><small>${pct(f.prob)}</small></span>${corta ? "" : `<span class="pp-e" style="--c:${PP_EST[f.est].c}">${PP_EST[f.est].n}</span>`}${st}</button>`;
}
function ppCurva(R_) {
  const S = Object.entries(PP_EST).map(([k, e]) => ({ e, s: (R_[k] || {}).serie || [] })).filter(x => x.s.length);
  if (!S.length) return "";
  const dias = [...new Set(S.flatMap(x => x.s.map(p => p.dia)))].sort(), all = S.flatMap(x => x.s.map(p => p.u));
  // el ancho del dibujo sigue a la pantalla, para que el texto quede siempre del mismo tamaño
  const y0 = Math.min(0, ...all), y1 = Math.max(0, ...all), W = Math.round(Math.min(760, Math.max(300, window.innerWidth - 90))), H = 210, pl = 44, n = Math.max(dias.length, 2);
  const cx = d => pl + dias.indexOf(d) * (W - pl - 12) / (n - 1), cy = v => 12 + (y1 - v) * (H - 40) / ((y1 - y0) || 1);
  const raw = (y1 - y0) / 4 || 1, p10 = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map(m => m * p10).find(s => s >= raw);
  let c = `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto" role="img" aria-label="Ganancia acumulada de los picks públicos">`;
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) c += `<line x1="${pl}" x2="${W - 12}" y1="${cy(v)}" y2="${cy(v)}" stroke="${Math.abs(v) < 1e-9 ? "#8792a6" : "rgba(148,163,184,.14)"}"/><text x="${pl - 6}" y="${cy(v) + 4}" text-anchor="end">${v > 0 ? "+" : ""}${dec(v, step < 1 ? 1 : 0)}</text>`;
  S.forEach(({ e, s }) => { c += `<polyline fill="none" stroke="${e.c}" stroke-width="2.2" stroke-linejoin="round" points="${s.map(p => `${cx(p.dia)},${cy(p.u)}`).join(" ")}"/>`; const l = s[s.length - 1]; c += `<circle cx="${cx(l.dia)}" cy="${cy(l.u)}" r="4" fill="${e.c}"><title>${e.n}: ${ppU(l.u)}</title></circle>`; });
  c += `<text x="${pl}" y="${H - 4}">${esc(fecha(dias[0] + "T12:00"))}</text><text x="${W - 12}" y="${H - 4}" text-anchor="end">${esc(fecha(dias[dias.length - 1] + "T12:00"))}</text>`;
  return c + `</svg><div class="row note">${S.map(({ e, s }) => `<span><span style="display:inline-block;width:12px;height:3px;background:${e.c};vertical-align:middle"></span> ${e.n}: <b class="num">${ppU(s[s.length - 1].u)}</b></span>`).join("")}</div>`;
}
function ppKpis(k, x) {
  const e = PP_EST[k];
  if (!x || !x.n) return `<div class="panel pp-k" style="--c:${e.c}"><span class="pp-kh">${e.n}</span><small class="muted">${e.d}</small><p class="note">${x && x.pendientes ? `${x.pendientes} picks esperando resultado.` : "Todavía sin picks calificados."}</p></div>`;
  return `<div class="panel pp-k" style="--c:${e.c}"><span class="pp-kh">${e.n}</span><small class="muted">${e.d}</small>
    <b class="pp-big num ${x.unidades > 0 ? "good" : x.unidades < 0 ? "bad" : ""}">${ppU(x.unidades)}</b>
    <span class="muted">ROI <b class="num">${x.roi > 0 ? "+" : ""}${pct(x.roi, 1)}</b> · ${x.ganados} de ${x.n} acertados (${pct(x.acierto, 0)}; se esperaba ${pct(x.esperado, 0)}) · cuota media ${dec(x.cuota_media)}</span>
    <span class="faint">Con $1.000 por pick: ${ppPlata(x.unidades)} en ${x.n} picks${x.pendientes ? ` · ${x.pendientes} por jugarse` : ""}</span></div>`;
}
function vPicks() {
  const P = D.picksPub;
  if (!P) {
    if (D.picksPubErr) return `<section class="view narrow"><h1>Picks públicos</h1><div class="panel empty stack"><b>La primera lista se publica con la próxima actualización.</b><span class="muted">Dos listas por día con regla fija, calificadas gane o pierda. Vuelve en un rato.</span></div></section>`;
    getJSON("data/picks_publicos.json").then(x => { D.picksPub = x; }).catch(() => { D.picksPubErr = 1; }).then(() => { if (R.v === "picks") render(); });
    return `<section class="view">${skeleton()}</section>`; }
  const Rs = P.resumen || {}, T = Rs.todos || {}, hoyK = isoDay(new Date()), dias = P.dias || [];
  const prox = dias.filter(d => d.dia >= hoyK).sort((a, b) => a.dia.localeCompare(b.dia)), hist = dias.filter(d => d.dia < hoyK);
  const lista = d => `<div class="panel flush pp-dia"><div class="ph"><h3>${esc(dayLabel(d.dia))}</h3><span class="note">Fijada ${esc(fecha(d.fijado))} ${esc(hhmm(d.fijado))}${d.tarde ? " (el mismo día, con los partidos que faltaban)" : ""}</span></div>
    ${d.picks.length ? Object.keys(PP_EST).map(k => { const fs = d.picks.filter(f => f.est === k); return fs.length ? `<div class="pp-g"><span class="lbl" style="color:${PP_EST[k].c}">${PP_EST[k].n}</span>${fs.map(f => ppFila(f, true)).join("")}</div>` : ""; }).join("") : `<p class="empty">Ningún partido cumplió la regla ese día. Eso también cuenta: no se fuerza un pick.</p>`}</div>`;
  const pocos = (T.n || 0) < 100;
  const lim = VV.ppLim || 10;
  return `<section class="view" aria-labelledby="h-pp">
    <h1 id="h-pp">Picks públicos</h1>
    <p class="muted">Dos listas por día con una regla fija. Se publican antes de los partidos y se califican todas, ganen o pierdan, con la cuota real que pagaba la casa. Así se ve con números, y no con un caso suelto, cómo le iría a quien sigue a Ballytics.</p>
    ${pocos ? `<div class="panel note-panel"><b>${T.n ? `Muestra chica (${T.n} picks calificados).` : `Empezó el ${esc(fecha((P.reglas || {}).desde + "T12:00"))}.`}</b> Con menos de 100 picks una buena o mala racha es casi pura suerte: con cuotas cercanas a 1,30, perder 2 de 6 ya deja el día en negativo. Mira la curva cuando pasen algunas semanas.</div>` : ""}
    <div class="grid2">${Object.keys(PP_EST).map(k => ppKpis(k, Rs[k])).join("")}</div>
    ${T.n ? `<div class="panel stack"><h3>Ganancia acumulada</h3><p class="note">1 unidad por pick. Si la línea sube, la regla ganó plata con las cuotas que había.</p>${ppCurva(Rs)}${T.clv != null ? `<p class="note">Cuota al fijar contra la de cierre: <b class="num">${T.clv > 0 ? "+" : ""}${pct(T.clv, 1)}</b> ${help("Si la cuota de cierre (la última antes del partido) quedó más baja que la que se tomó al fijar la lista, el mercado se movió a favor del pick. Ganarle a la cuota de cierre de forma sostenida es la mejor señal de que hay valor real, más que el resultado de unos pocos partidos.")}</p>` : ""}</div>` : ""}
    <h2>Próximas listas</h2>
    ${prox.length ? prox.map(lista).join("") : ""}
    ${P.proxima && !prox.some(d => d.dia === P.proxima.dia) ? `<div class="panel note-panel">La lista de ${esc(dayLabel(P.proxima.dia).toLowerCase())} se fija ${esc(dayLabel(dayKey(P.proxima.hora)).toLowerCase())} a las ${esc(hhmm(P.proxima.hora))} (hora local).</div>` : ""}
    ${hist.length ? `<h2>Historial</h2>${hist.slice(0, lim).map(lista).join("")}${hist.length > lim ? `<button class="vmore" id="pp-more">Ver más días (${hist.length - lim} restantes)</button>` : ""}` : ""}
    <div class="panel stack"><h3>Las reglas</h3><ul class="pp-rules">
      <li><b>Seguros.</b> ${esc((P.reglas || {}).seguro || "")}</li><li><b>Valor.</b> ${esc((P.reglas || {}).valor || "")}</li>
      <li>${esc((P.reglas || {}).fijado || "")}</li><li>${esc((P.reglas || {}).monto || "")} Ganado suma la cuota menos 1; perdido resta 1; suspendido queda nulo.</li></ul>
      <p class="note">Cada lista queda guardada en el <a class="link" href="https://github.com/Ballyticsia/laboratorio-dc/commits/main/data/picks_publicos.json" target="_blank" rel="noopener">historial público del repositorio</a> con su hora, antes de que empiecen los partidos: nadie puede borrar los que se pierden.</p></div>
    <div class="panel note-panel"><b>No es un consejo de apuesta.</b> Las casas cobran un margen y la mayoría de las personas que apuestan pierden plata en el tiempo. Si apuestas, que sea poco, con un límite fijo y nunca para recuperar lo perdido. <button class="link" data-go="responsable">Juego responsable</button> · +18</div>
  </section>`;
}
document.addEventListener("click", e => { if (e.target.id === "pp-more") { VV.ppLim = (VV.ppLim || 10) + 10; go({ v: "picks", keepScroll: true }); } });
function ppHome() {
  const P = D.picksPub; if (!P) return "";
  const hoyK = isoDay(new Date()), d = (P.dias || []).filter(x => x.dia >= hoyK && x.picks.length).sort((a, b) => a.dia.localeCompare(b.dia))[0], T = (P.resumen || {}).todos || {};
  if (!d && !T.n) return "";
  return `<div class="panel pp-home"><div class="ph"><h3><span class="tag">Picks públicos</span> ${d ? esc(dayLabel(d.dia)) : "Récord"}</h3><button class="link" data-go="picks">Ver todo →</button></div>
    ${d ? `<div class="pp-hl">${d.picks.filter(f => f.est === "seguro").concat(d.picks.filter(f => f.est === "valor")).slice(0, 4).map(f => ppFila(f, true)).join("")}</div>` : ""}
    <p class="note">${T.n ? `Récord: <b class="num ${T.unidades > 0 ? "good" : T.unidades < 0 ? "bad" : ""}">${ppU(T.unidades)}</b> en ${T.n} picks (${T.ganados} acertados, ROI ${T.roi > 0 ? "+" : ""}${pct(T.roi, 1)}).` : "Regla fija, cuota real y todos se califican, ganen o pierdan."} No es un consejo de apuesta.</p></div>`;
}

/* ---------- registro público ---------- */
const poisOverJ = (line, lam) => { let t = Math.exp(-lam), c = t; for (let i = 1; i <= Math.floor(line); i++) { t *= lam / i; c += t; } return 1 - c; };
function regPicks(f) {
  // todo lo que Ballytics predijo para el partido y, si ya se jugó, si acertó
  const done = f.hg != null, tg = done ? f.hg + f.ag : null, out = [];
  const P = f.fH != null ? [f.fH, f.fD, f.fA] : [f.pH, f.pD, f.pA], k = P.indexOf(Math.max(...P)), L = D.ligas[f.liga] || { equipos: {} };
  const lab1 = [corto(L, f.home), "Empate", corto(L, f.away)][k];
  out.push({ m: "Ganador", pick: lab1, p: P[k], ok: done ? ["H", "D", "A"][k] === (f.hg > f.ag ? "H" : f.hg === f.ag ? "D" : "A") : null });
  const o = f.fO25 ?? f.pO25;
  if (o != null) out.push({ m: "Goles", pick: o > .5 ? "Más de 2,5" : "Menos de 2,5", p: Math.max(o, 1 - o), ok: done ? (o > .5) === (tg > 2.5) : null });
  const bt = f.fBTTS ?? f.pBTTS;
  if (bt != null) out.push({ m: "Ambos marcan", pick: bt > .5 ? "Sí" : "No", p: Math.max(bt, 1 - bt), ok: done ? (bt > .5) === (f.hg > 0 && f.ag > 0) : null });
  const top = f.ftop || f.top;
  if (top) out.push({ m: "Marcador", pick: top.replace("-", "–"), p: null, ok: done ? top === `${f.hg}-${f.ag}` : null, largo: 1 });
  if (f.cE != null) { const q = poisOverJ(9.5, f.cE); out.push({ m: "Córners", pick: `${q > .5 ? "Más" : "Menos"} de 9,5`, p: Math.max(q, 1 - q), sub: `${dec(f.cE, 1)} esperados${f.cR != null ? ` · hubo ${f.cR}` : ""}`, ok: f.cR != null ? (q > .5) === (f.cR > 9.5) : null }); }
  if (f.tE != null) { const q = poisOverJ(4.5, f.tE); out.push({ m: "Tarjetas", pick: `${q > .5 ? "Más" : "Menos"} de 4,5`, p: Math.max(q, 1 - q), sub: `${dec(f.tE, 1)} esperadas${f.tR != null ? ` · hubo ${f.tR}` : ""}`, ok: f.tR != null ? (q > .5) === (f.tR > 4.5) : null }); }
  if (f.gol) out.push({ m: "Goleador", pick: f.gol[0].split(" ").slice(-1)[0] || f.gol[0], full: f.gol[0], p: f.gol[1], ok: f.gol[2], largo: 1 });
  if (f.ama) out.push({ m: "Amarilla", pick: f.ama[0].split(" ").slice(-1)[0] || f.ama[0], full: f.ama[0], p: f.ama[1], ok: f.ama[2], largo: 1 });
  return out;
}
const wilson = (p, n, z = 1.96) => { if (!n) return [0, 1]; const d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
function regMatch(f) {
  const L = D.ligas[f.liga] || { equipos: {}, nombre: (D.meta && D.meta[f.liga] ? D.meta[f.liga].nombre : "") }, picks = regPicks(f), done = f.hg != null;
  const graded = picks.filter(x => x.ok != null && !x.largo), nOk = graded.filter(x => x.ok).length;
  const chip = x => `<span class="rp ${x.ok == null ? "pend" : x.ok ? "ok" : "ko"}${x.largo ? " largo" : ""}" title="${esc(x.full || x.pick)}${x.sub ? " · " + esc(x.sub) : ""}"><small>${x.m}</small><b>${esc(x.pick)}</b>${x.p != null ? `<i class="num">${pct(x.p)}</i>` : ""}${x.ok == null ? "" : `<em>${x.ok ? "✓" : "✗"}</em>`}${x.sub ? `<u>${esc(x.sub)}</u>` : ""}</span>`;
  return `<div class="rmatch${done ? "" : " pend"}"><div class="rm-h"><span class="rm-l">${D.ligas[f.liga] ? leagueMark(L) : ""}<span class="faint">${esc(L.nombre || "")} · ${fecha(f.kickoff)}</span></span>
      <button class="rm-t link" data-go="partido" data-liga="${esc(f.liga)}" data-id="${esc(f.id)}">${badge(L, f.home)}<b>${esc(corto(L, f.home))}</b><span class="rm-s num">${done ? `${f.hg} – ${f.ag}` : "vs"}</span><b>${esc(corto(L, f.away))}</b>${badge(L, f.away)}</button>
      <span class="rm-src" title="${f.mH != null ? "Probabilidad Ballytics ajustada a la cuota sin margen de una casa de apuestas" : "Sin cuota disponible: probabilidad del modelo propio"}">${f.mH != null ? "con cuota" : "modelo propio"}</span>
      ${done && graded.length ? `<span class="rm-k num ${nOk / graded.length >= .6 ? "good" : nOk / graded.length < .4 ? "bad" : ""}">${nOk}/${graded.length}</span>` : `<span class="rm-k faint">pendiente</span>`}</div>
    <div class="rm-p">${picks.map(chip).join("")}</div></div>`;
}
function vRegistro() {
  const g = D.registro;
  if (g === undefined) return `<section class="view"><h1>Resultados del modelo</h1>${skeleton()}</section>`;
  if (!g) return `<section class="view"><h1>Registro</h1><div class="panel empty">Todavía no hay registro.</div></section>`;
  const tab = R.tab === "pendientes" ? "pendientes" : "calificados";
  const ligaSel = VV.regLiga || "";
  let filas = (g.filas || []).filter(f => (tab === "pendientes" ? f.hg == null : f.hg != null) && (!ligaSel || f.liga === ligaSel));
  if (tab === "pendientes") filas.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const lim = VV.regLim || 30, ligas = [...new Set((g.filas || []).map(f => f.liga))].filter(id => D.ligas[id]);
  const G = g.global;
  const hero = G && G.n ? `<div class="panel rhero"><div class="rh-main"><span class="lbl">Predicciones acertadas</span><b class="num">${pct(G.aciertos / G.n, 1)}</b><span class="muted">${G.aciertos.toLocaleString("es-CL")} de ${G.n.toLocaleString("es-CL")} predicciones de sí o no, en ${g.n} partidos (varias preguntas por partido; no son ${G.n} partidos) ${help("Cuenta cada predicción de sí o no que hace Ballytics en un partido (ganador, más o menos de 2,5 goles, ambos marcan, córners y tarjetas), tomando el lado que el modelo da como más probable. El marcador exacto, el goleador y la amarilla son apuestas largas y se miden aparte.")}</span></div>
      <div class="rh-bars">${G.por.map(x => `<div class="rh-b"><span>${esc(x.mercado)}</span><span class="rh-t"><i style="width:${100 * x.acierto}%"></i></span><b class="num">${pct(x.acierto, 0)}</b><small class="faint">${x.n}</small></div>`).join("")}</div></div>` : "";
  return `<section class="view" aria-labelledby="h-r">
    <h1 id="h-r">Resultados del modelo</h1>
    <p class="muted">Para cada partido se guarda la última predicción publicada antes del inicio (el robot actualiza cada 2 horas) y, al terminar, se califica con el resultado real: ganador, goles, ambos marcan, marcador, córners, tarjetas, goleador y amarilla. Las filas calificadas no se recalculan y el historial completo, con cada cambio, queda en el <a class="link" href="https://github.com/Ballyticsia/laboratorio-dc/commits/main/data/registro.csv" target="_blank" rel="noopener">repositorio público</a>.${g.desde ? ` Registro desde el ${fecha(g.desde + "T12:00")}.` : ""}</p>
    <button class="panel pp-link" data-go="picks"><span><b>Picks públicos</b><small class="muted" style="display:block">Dos listas por día con regla fija y cuota real, calificadas gane o pierda</small></span><span aria-hidden="true">→</span></button>
    ${g.n && g.n < 100 ? `<div class="panel note-panel"><b>Muestra todavía pequeña (${g.n} partidos).</b> Con menos de 100 partidos el acierto cambia mucho por azar: el del ganador (${pct(g.acierto_1x2, 0)}) podría estar en realidad entre ${pct(wilson(g.acierto_1x2, g.n)[0], 0)} y ${pct(wilson(g.acierto_1x2, g.n)[1], 0)} (intervalo de 95 %). Sirve para revisar, no para sacar conclusiones.</div>` : ""}
    ${hero}
    <div class="kpis">${kpi("m", "Partidos calificados", g.n || 0, `${(g.filas || []).filter(f => f.hg == null).length} por jugarse`)}${kpi("", "Acierto del ganador", pct(g.acierto_1x2, 1), g.n ? `entre ${pct(wilson(g.acierto_1x2, g.n)[0], 0)} y ${pct(wilson(g.acierto_1x2, g.n)[1], 0)} con 95 % de confianza` : "el resultado más probable")}${kpi("k", `Log-loss ${help(TIPS.logloss)}`, dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)} · menos es mejor`)}${kpi("", "Marcador exacto", pct(g.marcador_exacto, 1), "el más probable")}</div>
    <div class="panel flush rlist"><div class="ph rl-h"><h3>Partido por partido</h3>
      <div class="row" style="gap:8px;flex-wrap:wrap"><select class="rsel" id="reg-liga" aria-label="Liga"><option value="">Todas las ligas</option>${ligas.map(id => `<option value="${esc(id)}"${id === ligaSel ? " selected" : ""}>${esc(D.ligas[id].nombre)}</option>`).join("")}</select>
      <div class="tabs2" role="group" aria-label="Filtro">${[["calificados", "Calificados"], ["pendientes", "Por jugarse"]].map(([k, n]) => `<button data-go="registro" data-tab="${k}" data-keep aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div></div>
      <div class="rl-leg"><span class="rp ok mini"><em>✓</em></span> acertó <span class="rp ko mini"><em>✗</em></span> falló <span class="rp pend mini"></span> por jugarse <span class="faint">· el porcentaje es la probabilidad que dio Ballytics</span></div>
      ${filas.length ? filas.slice(0, lim).map(regMatch).join("") : `<div class="empty">${tab === "pendientes" ? "No hay predicciones esperando partido." : "Todavía no hay partidos calificados."}</div>`}
      ${filas.length > lim ? `<button class="vmore" id="reg-more">Ver ${Math.min(30, filas.length - lim)} partidos más (${filas.length - lim} restantes)</button>` : ""}</div>
    ${regMercados(g.mercados)}
    ${g.vs_mercado ? `<div class="panel stack"><h3>Ballytics, modelo propio y mercado</h3><div class="kpis">${kpi("m", "Log-loss Ballytics", dec(g.vs_mercado.ballytics, 3), g.vs_mercado.acierto_ballytics != null ? `acierto ${pct(g.vs_mercado.acierto_ballytics, 1)}` : "")}${kpi("", "Log-loss modelo propio", dec(g.vs_mercado.modelo, 3), g.vs_mercado.acierto_modelo != null ? `acierto ${pct(g.vs_mercado.acierto_modelo, 1)}` : "")}${kpi("k", "Log-loss mercado", dec(g.vs_mercado.mercado, 3), g.vs_mercado.acierto_mercado != null ? `acierto ${pct(g.vs_mercado.acierto_mercado, 1)}` : "")}${kpi("", "Partidos con cuota", g.vs_mercado.n, "")}</div><p class="note">Solo partidos en que ESPN publicó cuotas antes del inicio. Menos es mejor.</p></div>` : ""}
    ${clvPanel(g.clv)}
    <div class="panel stack"><h3>La gente contra Ballytics</h3>${g.gente && g.gente.n ? `<div class="kpis">${kpi("m", "Acierto Ballytics", pct(g.gente.acierto_ballytics, 1), `log-loss ${dec(g.gente.logloss_ballytics, 3)}`)}${kpi(g.gente.acierto_gente > g.gente.acierto_ballytics ? "k" : "", "Acierto de la gente", pct(g.gente.acierto_gente, 1), `log-loss ${dec(g.gente.logloss_gente, 3)}`)}${kpi("", "Partidos con votos", g.gente.n, `${g.gente.votos} votos`)}</div>` : ""}<p class="note">${g.gente && g.gente.n ? "Partidos con al menos 3 votos en “¿Quién gana?”. El voto más repetido cuenta como el pronóstico de la gente." : "Se llena cuando la gente vote en “¿Quién gana?” y se jueguen esos partidos (mínimo 3 votos por partido)."}</p></div>
    ${arbMedida(g.mercados && g.mercados.arbitro, g.arbitro_bt)}
    <div class="panel stack"><h3>¿Sirve el ajuste por bajas?</h3>${g.bajas && g.bajas.n ? `<div class="kpis">${kpi("m", "Log-loss modelo propio", dec(g.bajas.modelo, 3), "")}${kpi(g.bajas.con_bajas <= g.bajas.modelo ? "k" : "", "Log-loss con bajas", dec(g.bajas.con_bajas, 3), g.bajas.con_bajas <= g.bajas.modelo ? "mejora" : "no mejora")}${kpi("", "Partidos con bajas", g.bajas.n, "")}</div>` : ""}<p class="note">${g.bajas && g.bajas.n ? "Solo partidos en que faltó algún goleador. Menos es mejor." : "Se llena cuando se jueguen partidos en que faltó algún goleador por lesión o suspensión."}</p></div>
    ${g.n ? `<div class="grid2">
      <div class="panel flush scroll"><div class="ph"><h3>Por liga</h3></div><table class="t"><thead><tr><th>Liga</th><th class="n">Partidos</th><th class="n">Acierto</th><th class="n">Log-loss</th></tr></thead><tbody>${(g.por_liga || []).map(x => `<tr><td class="team">${D.ligas[x.liga] ? leagueMark(D.ligas[x.liga]) + esc(D.ligas[x.liga].nombre) : esc(x.liga)}</td><td class="n">${x.n}</td><td class="n">${pct(x.acierto, 1)}</td><td class="n">${dec(x.logloss, 3)}</td></tr>`).join("")}</tbody></table></div>
      <div class="panel flush scroll"><div class="ph"><h3>Según la confianza del modelo</h3></div><table class="t"><thead><tr><th>Probabilidad del favorito</th><th class="n">Partidos</th><th class="n">Esperado</th><th class="n">Real</th></tr></thead><tbody>${(g.confianza || []).map(x => `<tr><td>${esc(x.rango)}</td><td class="n">${x.n}</td><td class="n">${pct(x.prob, 1)}</td><td class="n ${x.acierto >= x.prob ? "good" : "bad"}">${pct(x.acierto, 1)}</td></tr>`).join("")}</tbody></table><p class="note" style="padding:0 16px 12px">Si "Real" se parece a "Esperado", las probabilidades están bien medidas.</p></div>
    </div>` : ""}
    <div class="panel stack"><h3>Calibración ${help(TIPS.cal)}</h3><p class="note">Si el modelo dice 40 %, ¿pasa el 40 % de las veces?</p>${calChart(g.calibracion)}${spark(g.serie)}</div>
  </section>`;
}
document.addEventListener("change", e => { if (e.target.id === "reg-liga") { VV.regLiga = e.target.value; VV.regLim = 30; go({ v: "registro", tab: R.tab, keepScroll: true }); } });
document.addEventListener("click", e => { if (e.target.id === "reg-more") { VV.regLim = (VV.regLim || 30) + 30; go({ v: "registro", tab: R.tab, keepScroll: true }); } });
/* ---------- registro: ¿sirve ajustar las tarjetas por el árbitro? ---------- */
function arbMedida(x, bt) {
  const B = bt && bt.promedio, M = bt && bt.modelo;
  const btTxt = B ? `<p class="note"><b>Backtest de la temporada (${B.n.toLocaleString("es-CL")} partidos con árbitro y tarjetas):</b> el factor de cada árbitro, calculado con sus otros partidos, ${B.error_con < B.error_sin ? "baja" : "no baja"} el error de ${dec(B.error_sin, 2)} a ${dec(B.error_con, 2)} tarjetas por partido frente al promedio de la liga (log-loss de más de 4,5: ${dec(B.logloss_sin, 3)} → ${dec(B.logloss_con, 3)}).${M && M.n ? ` Sobre las tarjetas que esperaba el modelo (${M.n} partidos del registro): ${dec(M.error_sin, 2)} sin árbitro y ${dec(M.error_con, 2)} con árbitro.` : ""} ${B.error_con < B.error_sin && (!M || M.n < 300 || M.error_con < M.error_sin) ? "La señal existe pero es chica; falta confirmarla con el modelo antes de usarla." : "Por ahora no conviene usarlo."}</p>` : "";
  const tit = `<h3>¿Sirve ajustar las tarjetas por el árbitro? ${help("Para cada partido con árbitro designado se guardan, antes del inicio, las tarjetas esperadas del modelo (sin árbitro) y las ajustadas por lo que saca ese árbitro comparado con su liga. Al terminar se comparan con las tarjetas reales. El ajuste entra al modelo solo si mejora con una muestra suficiente.")}</h3>`;
  if (!x || !x.n) return `<div class="panel stack">${tit}${btTxt}<p class="note">La medición en vivo empezó el 28 de octubre de 2026 y se llena a medida que se jueguen partidos con árbitro designado. Hasta que muestre que ayuda, el árbitro se muestra pero no cambia las probabilidades.</p></div>`;
  const mejor = x.con.logloss < x.sin.logloss && x.error_con < x.error_sin;
  return `<div class="panel stack">${tit}
    <div class="kpis">${kpi("m", "Error sin árbitro", dec(x.error_sin, 2), `tarjetas por partido · log-loss ${dec(x.sin.logloss, 3)}`)}${kpi(mejor ? "k" : "", "Error con árbitro", dec(x.error_con, 2), `tarjetas por partido · log-loss ${dec(x.con.logloss, 3)}`)}${kpi("", "Partidos medidos", x.n, `promedio real ${dec(x.real, 1)} tarjetas`)}</div>
    <p class="note">${x.n < 100 ? `Muestra chica (${x.n} partidos): todavía no alcanza para decidir. ` : ""}${mejor ? "Por ahora el ajuste por árbitro predice mejor las tarjetas." : "Por ahora el ajuste por árbitro no mejora la predicción."} Menos es mejor. El árbitro todavía no cambia las probabilidades del modelo.</p>${btTxt}</div>`;
}
/* ---------- registro: ¿el modelo se adelanta al mercado? (CLV) ---------- */
function clvPanel(c) {
  if (!c) return "";
  const tip = help("CLV (valor contra la cuota de cierre). Para cada partido se guarda la cuota la primera vez que aparece y la última antes del inicio (ESPN, misma casa). Si el modelo propio veía al menos 2 puntos más que esa primera cuota en un resultado, se mira si después el mercado se movió hacia ese lado. Que el mercado se mueva hacia el modelo seguido es la mejor señal temprana de que el modelo encuentra algo que la casa todavía no veía.");
  if (!c.n) return `<div class="panel stack"><h3>¿El modelo se adelanta al mercado? (CLV) ${tip}</h3>
    <p class="note">${c.desde ? `Se mide desde el ${fecha(c.desde + "T12:00")}.` : "Empieza a medirse con la próxima actualización."} ${c.midiendo ? `Hay ${c.midiendo} partidos con su primera cuota guardada esperando su cuota de cierre.` : ""} Los resultados aparecen cuando empiecen esos partidos.</p></div>`;
  const pocos = c.n < 50;
  return `<div class="panel stack"><h3>¿El modelo se adelanta al mercado? (CLV) ${tip}</h3>
    <div class="kpis">${kpi("m", "Señales del modelo", c.n, `partidos donde veía ≥ 2 puntos más que la cuota`)}${kpi(c.a_favor >= .5 ? "k" : "", "El mercado fue hacia el modelo", pct(c.a_favor, 0), `en contra ${pct(c.en_contra, 0)}`)}${kpi("", "Movimiento medio", `${c.mov_pts > 0 ? "+" : ""}${dec(c.mov_pts, 1)} pts`, "de la probabilidad del mercado en ese lado")}${kpi("", "CLV de cuota", `${c.clv_cuota > 0 ? "+" : "−"}${pct(Math.abs(c.clv_cuota), 1)}`, "cuota temprana contra la de cierre")}</div>
    ${pocos ? `<div class="note-panel"><b>Muestra chica (${c.n} señales).</b> Con menos de 50 señales el resultado cambia mucho por azar; sirve para seguirlo, no para concluir.</div>` : ""}
    ${(c.por_liga || []).length ? `<div class="scroll"><table class="t"><thead><tr><th>Liga</th><th class="n">Señales</th><th class="n">A favor</th><th class="n">Movimiento</th></tr></thead><tbody>${c.por_liga.map(x => `<tr><td class="team">${D.ligas[x.liga] ? leagueMark(D.ligas[x.liga]) + esc(D.ligas[x.liga].nombre) : esc(x.liga)}</td><td class="n">${x.n}</td><td class="n ${x.a_favor >= .5 ? "good" : "bad"}">${pct(x.a_favor, 0)}</td><td class="n">${x.mov_pts > 0 ? "+" : ""}${dec(x.mov_pts, 1)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${(c.ultimos || []).length ? `<div class="scroll"><table class="t"><thead><tr><th>Partido</th><th>Lado</th><th class="n">Modelo</th><th class="n">Cuota temprana</th><th class="n">Cierre</th></tr></thead><tbody>${c.ultimos.map(x => { const L = D.ligas[x.liga] || { equipos: {} };
      return `<tr><td><b>${esc(corto(L, x.home))} vs ${esc(corto(L, x.away))}</b><small class="faint" style="display:block">${esc(fecha(x.kickoff))}</small></td><td>${esc(x.lado)}</td><td class="n">${pct(x.modelo)}</td><td class="n">${pct(x.temprana)}</td><td class="n ${x.cierre > x.temprana ? "good" : x.cierre < x.temprana ? "bad" : ""}">${pct(x.cierre)}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
    <p class="note">Cuotas de ESPN (DraftKings) sin margen, guardadas cada 2 horas. Medido desde el ${c.desde ? esc(fecha(c.desde + "T12:00")) : "—"}${c.midiendo ? ` · ${c.midiendo} partidos esperando su cuota de cierre` : ""}.</p></div>`;
}
/* ---------- registro: todos los mercados ---------- */
function regMercados(M) {
  if (!M || !Object.keys(M).length) return "";
  const fila = (nombre, x, extra) => x ? `<tr><td>${nombre}</td><td class="n">${x.n.toLocaleString("es-CL")}</td><td class="n">${pct(x.acierto, 1)}</td><td class="n"><b class="${x.logloss <= x.ingenuo ? "good" : "bad"}">${dec(x.logloss, 3)}</b></td><td class="n hide-m">${dec(x.ingenuo, 3)}</td><td class="n hide-m">${extra || `${pct(x.prob, 0)} / ${pct(x.real, 0)}`}</td></tr>` : "";
  const c = M.corners, t = M.tarjetas;
  const tabla = `<div class="panel flush scroll"><div class="ph"><h3>Todos los mercados ${help("Cada probabilidad que muestra Ballytics se califica con el resultado real. Log-loss en verde: Ballytics le gana a la respuesta ingenua (decir siempre la frecuencia observada). Esperado / real: el promedio de la probabilidad contra lo que pasó.")}</h3></div>
    <table class="t"><thead><tr><th>Mercado</th><th class="n">Calificados</th><th class="n">Acierto</th><th class="n">Log-loss</th><th class="n hide-m">Ingenuo</th><th class="n hide-m">Esperado / real</th></tr></thead><tbody>
      ${fila("Más de 2,5 goles", M.o25)}${fila("Ambos marcan", M.btts)}
      ${fila("Más de 9,5 córners", c, c ? `${dec(c.esperado, 1)} / ${dec(c.promedio_real, 1)} córners` : "")}${fila("Más de 4,5 tarjetas", t, t ? `${dec(t.esperado, 1)} / ${dec(t.promedio_real, 1)} tarjetas` : "")}
      ${fila("Goleadores (marca en el partido)", M.goleadores, M.goleadores ? `${dec(M.goleadores.esperados, 0)} / ${M.goleadores.reales} goleadores` : "")}${fila("Recibe amarilla", M.amarillas, M.amarillas ? `${dec(M.amarillas.esperados, 0)} / ${M.amarillas.reales} amonestados` : "")}
    </tbody></table></div>`;
  const props = (tit, x, verbo) => x ? `<div class="panel flush scroll"><div class="ph"><h3>${tit}</h3><span class="note">${x.partidos} partidos · el más probable ${verbo} el ${pct(x.favorito, 0)} de las veces</span></div>
    <table class="t"><thead><tr><th>Probabilidad dada</th><th class="n">Jugadores</th><th class="n">Esperado</th><th class="n">Real</th></tr></thead><tbody>${x.tramos.map(z => `<tr><td>${esc(z.rango)}</td><td class="n">${z.n}</td><td class="n">${pct(z.prob, 1)}</td><td class="n ${Math.abs(z.real - z.prob) <= .05 ? "good" : ""}">${pct(z.real, 1)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const pp = props("Goleadores", M.goleadores, "marcó") + props("Amarillas por jugador", M.amarillas, "fue amonestado");
  return tabla + (pp ? `<div class="grid2">${pp}</div>` : "") + (!M.goleadores || !M.amarillas || !c ? `<p class="note">Los córners, las tarjetas, los goleadores y las amarillas se califican desde el 24 de octubre de 2026; aparecen a medida que se juegan los partidos predichos.</p>` : "");
}
function btMercado() {
  const B = D.indice && D.indice.backtest_mercado; if (!B || !B.modelo) return "";
  const row = (n, a, b, c, fmt = v => dec(v, 4)) => `<tr><td>${n}</td><td class="n">${a != null ? fmt(a) : "—"}</td><td class="n">${b != null ? fmt(b) : "—"}</td><td class="n"><b>${c != null ? fmt(c) : "—"}</b></td></tr>`;
  const m = B.modelo, k = B.mercado || {}, b = B.ballytics;
  return `<h2>Modelo propio, mercado y Ballytics</h2>
    <p class="muted">Backtest de la temporada ${esc(B.temporada)} en ${esc(B.ligas)} (${B.n.toLocaleString("es-CL")} partidos). Cada semana se reajustó el modelo solo con partidos anteriores y se comparó con las cuotas de cierre.</p>
    <div class="panel flush scroll"><table class="t"><thead><tr><th>Log-loss (menos es mejor)</th><th class="n">Modelo propio</th><th class="n">Mercado</th><th class="n">Ballytics</th></tr></thead><tbody>
      ${row("Resultado 1X2", m.ll_1x2, k.ll_1x2, b.ll_1x2)}${row("Más/menos 2,5", m.ll_o25, k.ll_o25, b.ll_o25)}${row("Ambos marcan", m.ll_btts, null, b.ll_btts)}${row("Marcador exacto", m.ll_marcador, null, b.ll_marcador)}
      ${row("Acierto 1X2", m.acierto_1x2, k.acierto_1x2, b.acierto_1x2, v => pct(v, 1))}${row("Acierto marcador exacto", m.acierto_marcador, null, b.acierto_marcador, v => pct(v, 1))}
    </tbody></table></div>
    <div class="panel verdict">La cuota de cierre fue más precisa que el modelo propio en el resultado, y mezclar ambos no mejoró. Pero usar los goles que implica la cuota mejoró el marcador exacto y "ambos marcan", mercados donde la casa no siempre publica cuota. Por eso Ballytics parte de la cuota cuando existe y usa el modelo propio cuando no.</div>`;
}
function vMetodo() {
  const B = D.metodo;
  const curve = () => {
    if (!B || !B.curva) return "";
    const C = B.curva, all = Object.values(C).flat().map(p => p.u), y0 = Math.min(0, ...all), y1 = Math.max(0, ...all), n = Math.max(...Object.values(C).map(a => a.length));
    const W = 360, H = 250, pl = 42, cx = i => pl + i * (W - pl - 12) / (n - 1), cy = v => 14 + (y1 - v) * (H - 48) / (y1 - y0 || 1);
    const raw = (y1 - y0) / 5, p10 = Math.pow(10, Math.floor(Math.log10(raw || 1))), step = [1, 2, 5, 10].map(m => m * p10).find(s => s >= raw);
    let c = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ganancia acumulada">`;
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) c += `<line x1="${pl}" x2="${W - 12}" y1="${cy(v)}" y2="${cy(v)}" stroke="${v === 0 ? "#8792a6" : "rgba(148,163,184,.14)"}"/><text x="${pl - 6}" y="${cy(v) + 4}" text-anchor="end">${v > 0 ? "+" : ""}${v}</text>`;
    const cols = { "Bet365": "#ffb020", "Mejor cuota": "#3d8bff" };
    Object.entries(C).forEach(([k, a]) => { c += `<polyline fill="none" stroke="${cols[k]}" stroke-width="2.2" points="${a.map((p, i) => `${cx(i)},${cy(p.u)}`).join(" ")}"/><circle cx="${cx(a.length - 1)}" cy="${cy(a[a.length - 1].u)}" r="4" fill="${cols[k]}"/>`; });
    return c + `</svg><div class="row note">${Object.entries(C).map(([k, a]) => `<span><span style="display:inline-block;width:12px;height:3px;background:${cols[k]};vertical-align:middle"></span> ${k}: <b class="num">${dec(a[a.length - 1].u, 1)} u</b></span>`).join("")}</div>`;
  };
  return `<section class="view" aria-labelledby="h-m">
    <h1 id="h-m">Cómo funciona</h1>
    <div class="panel stack" style="font-size:15px">
      <p><b>Goles.</b> Cada equipo tiene una fuerza de ataque y una de defensa. Con eso se calcula cuántos goles se espera que marque cada uno, y la probabilidad de cada marcador sale de una distribución de Poisson con la corrección de Dixon y Coles (1997) para los resultados bajos.</p>
      <p><b>Datos.</b> Resultados de las últimas tres temporadas, incluida la segunda división cuando existe, para medir bien a los recién ascendidos. Los partidos recientes pesan más (vida media de unos 231 días) y se mezcla un 30 % de tiros al arco con los goles, porque los tiros tienen menos ruido. Se reajusta cada 2 horas.</p>
      <p><b>Córners y tarjetas.</b> El mismo modelo de ataque y defensa, ajustado sobre córners ganados y tarjetas recibidas. No conoce al árbitro.</p>
      <p><b>Goleadores.</b> La probabilidad de que un jugador marque sale de su parte de los goles de su equipo en la temporada y de los goles esperados de su equipo en ese partido.</p>
      <p><b>Proyecciones.</b> El resto de la temporada se simula 10.000 veces para estimar puntos finales y opciones de título, copas o descenso.</p>
      <p><b>Probabilidad Ballytics.</b> Cuando hay cuotas (Pinnacle o el promedio de varias casas vía The Odds API; si no, DraftKings vía ESPN), se buscan los goles esperados que reproducen esa cuota sin margen (1X2 y más/menos) y con ellos se arma la tabla de marcadores. De ahí salen el marcador exacto, ambos marcan, los goleadores y la combinada. Cuando no hay cuota, se usa el modelo propio con las bajas informadas.</p>
      <p class="muted">Lo que el modelo propio no sabe: alineaciones, fichajes, rotaciones ni motivación. Por eso las casas de apuestas, que sí incorporan esa información, predicen mejor el resultado, y por eso la probabilidad Ballytics parte de la cuota.</p>
    </div>
    ${btMercado()}
    ${B ? `<h2>¿Le gana al mercado?</h2>
    <p class="muted">Backtest de la temporada 2025-26 en las cinco grandes ligas: cada semana se reajustó el modelo solo con partidos anteriores y se comparó con las cuotas de Bet365 (${(B.n_test || 0).toLocaleString("es-CL")} partidos).</p>
    <div class="kpis">${kpi("m", "Log-loss modelo", dec(B.logloss.modelo, 4), "menos es mejor")}${kpi("k", "Log-loss mercado", dec(B.logloss.mercado, 4), "cuotas sin margen")}${kpi("", "Log-loss ingenuo", dec(B.logloss.ingenuo, 4), "% histórico L/E/V")}</div>
    <div class="panel verdict">${B.veredicto}</div>
    <div class="grid2"><div class="panel stack"><h3>Calibración (backtest)</h3>${calChart(B.calibracion)}</div>
      <div class="panel stack"><h3>Apostar al "valor" (EV &gt; 5 %)</h3><p class="note">1 unidad por apuesta en 1X2, temporada 2025-26.</p>${curve()}</div></div>` : ""}
    <p class="note">Fuente de datos: marcadores públicos de ESPN. El código es abierto y el sitio se actualiza solo con GitHub Actions.</p></section>`;
}




/* ---------------- AYUDA ---------------- */
function help(text) { return `<button class="hlp" data-tip="${esc(text)}" aria-label="Qué significa">?</button>`; }
const TIPS = {
  xg: "Goles previstos: el promedio de goles que el modelo espera de cada equipo antes del partido, según su ataque, la defensa del rival y la localía (ajustado a la cuota si la hay). No es el xG, que mide la calidad de los tiros ya ocurridos.",
  justa: "Cuota justa: 1 dividido por la probabilidad. Es lo que pagaría una casa sin margen. Si te ofrecen más, el modelo ve valor.",
  ev: "Valor esperado (EV): cuánto ganarías o perderías en promedio por cada $1 si la probabilidad del modelo fuera correcta. Positivo = el modelo ve valor.",
  logloss: "Log-loss: mide qué tan buenas son las probabilidades. Castiga mucho estar muy seguro y equivocarse. Menos es mejor; adivinar al azar da cerca de 1,10.",
  atq: "Ataque: goles que marca frente a una defensa promedio, comparado con el promedio de la liga (1,00). Más es mejor.",
  def: "Defensa: goles que recibe frente a un ataque promedio, comparado con el promedio de la liga (1,00). Menos es mejor.",
  cal: "Calibración: si el modelo dice 40 %, eso debería pasar cerca del 40 % de las veces. Puntos sobre la diagonal = bien calibrado.",
  ballytics: "Probabilidad Ballytics: cuando hay cuota de una casa de apuestas, los goles esperados se ajustan a esa cuota (1X2 y más/menos, sin margen) y de ahí salen todos los mercados. Cuando no hay cuota, es el modelo propio. En el backtest fue más precisa que el modelo solo.",
  pick: "Pick: el resultado más probable según el modelo (1 local, X empate, 2 visita) y el marcador exacto más probable.",
  proy: "Proyección: se simula 10.000 veces el resto de la temporada con las probabilidades del modelo y se cuenta en cuántas simulaciones pasa cada cosa.",
};
let tipEl = null;
function closeTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener("click", e => {
  const b = e.target.closest(".hlp");
  if (!b) { if (!e.target.closest(".tipbox")) closeTip(); return; }
  e.stopPropagation(); e.preventDefault();
  if (tipEl && tipEl._src === b) { closeTip(); return; }
  closeTip();
  tipEl = document.createElement("div"); tipEl.className = "tipbox"; tipEl.role = "tooltip"; tipEl._src = b; tipEl.textContent = b.dataset.tip;
  document.body.appendChild(tipEl); tipY = window.scrollY;
  const r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
  tipEl.style.width = w + "px";
  tipEl.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
  const top = r.bottom + 8 + window.scrollY;
  tipEl.style.top = top + "px";
}, true);
let tipY = 0;
window.addEventListener("scroll", () => { if (tipEl && Math.abs(window.scrollY - tipY) > 60) closeTip(); }, { passive: true });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTip(); });

/* ---------------- GRÁFICOS ---------------- */
function niceTicks(lo, hi, n = 4) {
  const raw = (hi - lo) / n || 1, p10 = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(m => m * p10).find(x => x >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
}
// evolución de la posición de un equipo partido a partido
function positionSeries(L, team) {
  const res = [...L.resultados].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const teams = new Set(L.tabla.map(s => s.equipo));
  const pts = {}, gd = {}, gf = {}; teams.forEach(t => { pts[t] = 0; gd[t] = 0; gf[t] = 0; });
  const out = [];
  res.forEach(x => {
    [[x.home, x.hg, x.ag], [x.away, x.ag, x.hg]].forEach(([t, a, b]) => { if (!(t in pts)) return; pts[t] += a > b ? 3 : a === b ? 1 : 0; gd[t] += a - b; gf[t] += a; });
    if (x.home === team || x.away === team) {
      const order = [...teams].sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a] || gf[b] - gf[a] || a.localeCompare(b));
      out.push({ pos: order.indexOf(team) + 1, k: x.kickoff, rival: x.home === team ? x.away : x.home, gf: x.home === team ? x.hg : x.ag, gc: x.home === team ? x.ag : x.hg });
    }
  });
  return { serie: out, n: teams.size };
}
function posChart(L, team) {
  const { serie, n } = positionSeries(L, team);
  if (serie.length < 2) return `<p class="note">Faltan partidos para dibujar la evolución.</p>`;
  const W = 560, H = 200, pl = 34, pr = 12, pt = 12, pb = 26;
  const x = i => pl + i * (W - pl - pr) / (serie.length - 1), y = v => pt + (v - 1) * (H - pt - pb) / Math.max(n - 1, 1);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Posición en la tabla por partido">`;
  (L.zonas || []).forEach(z => { g += `<rect x="${pl}" y="${y(z.desde) - 3}" width="${W - pl - pr}" height="${Math.max(y(z.hasta) - y(z.desde) + 6, 4)}" class="zband z-${z.cls}"/>`; });
  [1, Math.ceil(n / 2), n].forEach(v => g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}º</text>`);
  g += `<polyline fill="none" class="ln" points="${serie.map((s, i) => `${x(i)},${y(s.pos)}`).join(" ")}"/>`;
  serie.forEach((s, i) => g += `<circle cx="${x(i)}" cy="${y(s.pos)}" r="${i === serie.length - 1 ? 5 : 3}" class="${s.gf > s.gc ? "pw" : s.gf === s.gc ? "pd" : "pl"}"><title>${fecha(s.k)} vs ${corto(L, s.rival)} ${s.gf}–${s.gc} · ${s.pos}º</title></circle>`);
  g += `<text x="${pl}" y="${H - 6}">${fecha(serie[0].k)}</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${fecha(serie[serie.length - 1].k)}</text></svg>`;
  return g + `<p class="note">Cada punto es un partido: verde ganó, gris empató, rojo perdió. Las franjas marcan las zonas de la tabla.</p>`;
}
// goles a favor y en contra de los últimos partidos
function goalsChart(L, team) {
  const ms = L.resultados.filter(x => x.home === team || x.away === team).slice(0, 12).reverse();
  if (!ms.length) return `<p class="note">Sin partidos jugados.</p>`;
  const W = 560, H = 190, pl = 8, pr = 8, mid = 92, u = 18, bw = Math.min(26, (W - pl - pr) / ms.length - 6);
  const mx = Math.max(3, ...ms.map(x => Math.max(x.hg, x.ag)));
  const sc = v => v * Math.min(u, 74 / mx);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Goles a favor y en contra">`;
  g += `<line x1="${pl}" x2="${W - pr}" y1="${mid}" y2="${mid}" class="axis"/>`;
  ms.forEach((x, i) => {
    const home = x.home === team, f = home ? x.hg : x.ag, c = home ? x.ag : x.hg, cx = pl + 4 + i * (W - pl - pr) / ms.length;
    g += `<rect x="${cx}" y="${mid - sc(f)}" width="${bw}" height="${sc(f)}" rx="3" class="gfbar"><title>${fecha(x.kickoff)} vs ${corto(L, home ? x.away : x.home)} ${f}–${c}</title></rect>`;
    g += `<rect x="${cx}" y="${mid}" width="${bw}" height="${sc(c)}" rx="3" class="gcbar"/>`;
    g += `<text x="${cx + bw / 2}" y="${H - 6}" text-anchor="middle">${esc((info(L, home ? x.away : x.home).abr || "").slice(0, 3))}</text>`;
  });
  return g + `</svg><div class="row note"><span><i class="lg-dot lh"></i>Goles a favor (arriba)</span><span><i class="lg-dot la"></i>Goles en contra (abajo)</span></div>`;
}
// distribución de goles totales del partido
function goalsDist(m) {
  const tot = Array(8).fill(0);
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) tot[Math.min(i + j, 7)] += m[i][j];
  const W = 420, H = 170, pb = 24, pt = 18, bw = (W - 20) / 8 - 8, mx = Math.max(...tot);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Probabilidad de goles totales">`;
  tot.forEach((v, k) => { const h = (H - pb - pt) * v / mx, x = 10 + k * ((W - 20) / 8) + 4;
    g += `<rect x="${x}" y="${H - pb - h}" width="${bw}" height="${h}" rx="4" class="${k >= 3 ? "gfbar" : "gdbar"}"/><text x="${x + bw / 2}" y="${H - pb - h - 5}" text-anchor="middle">${Math.round(100 * v)}%</text><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${k === 7 ? "7+" : k}</text>`; });
  return g + `</svg><p class="note">Goles totales del partido. En azul, los resultados con más de 2,5 goles.</p>`;
}
// cómo cambió la probabilidad desde que el modelo empezó a seguir el partido
function histChart(L, p) {
  const h = p.hist || [];
  if (h.length < 2) return `<p class="note">El modelo se reajusta cada 2 horas. Cuando cambien las probabilidades de este partido verás aquí cómo se movieron.</p>`;
  const W = 420, H = 170, pl = 34, pr = 10, pt = 10, pb = 22;
  const t0 = new Date(h[0][0]).getTime(), t1 = new Date(h[h.length - 1][0]).getTime() || t0 + 1;
  const all = h.flatMap(r => [r[1], r[2], r[3]]), lo = Math.max(0, Math.min(...all) - .04), hi = Math.min(1, Math.max(...all) + .04);
  const x = t => pl + (new Date(t).getTime() - t0) * (W - pl - pr) / ((t1 - t0) || 1), y = v => pt + (hi - v) * (H - pt - pb) / (hi - lo);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cambio de probabilidades">`;
  niceTicks(lo, hi, 3).forEach(v => g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 5}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`);
  [[1, "lh"], [2, "ld"], [3, "la"]].forEach(([k, cls]) => g += `<polyline fill="none" class="${cls}" points="${h.map(r => `${x(r[0])},${y(r[k])}`).join(" ")}"/>`);
  g += `<text x="${pl}" y="${H - 5}">${fecha(h[0][0])}</text><text x="${W - pr}" y="${H - 5}" text-anchor="end">${fecha(h[h.length - 1][0])}</text></svg>`;
  return g + `<div class="row note"><span><i class="lg-dot lh"></i>${esc(corto(L, p.home))}</span><span><i class="lg-dot ld"></i>Empate</span><span><i class="lg-dot la"></i>${esc(corto(L, p.away))}</span></div>`;
}
// mapa de ataque vs defensa de la liga
function scatterAD(L) {
  const t = L.tabla.filter(s => s.ataque && s.defensa);
  if (t.length < 3) return "";
  const W = 960, H = 440, pl = 44, pr = 16, pt = 18, pb = 36;
  const xs = t.map(s => s.ataque), ys = t.map(s => s.defensa);
  const x0 = Math.min(...xs) - .05, x1 = Math.max(...xs) + .05, y0 = Math.min(...ys) - .05, y1 = Math.max(...ys) + .05;
  const X = v => pl + (v - x0) * (W - pl - pr) / (x1 - x0), Y = v => pt + (v - y0) * (H - pt - pb) / (y1 - y0);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ataque contra defensa">`;
  g += `<rect x="${X(1)}" y="${pt}" width="${W - pr - X(1)}" height="${Y(1) - pt}" class="quad"/>`;
  g += `<line x1="${X(1)}" x2="${X(1)}" y1="${pt}" y2="${H - pb}" class="axis"/><line x1="${pl}" x2="${W - pr}" y1="${Y(1)}" y2="${Y(1)}" class="axis"/>`;
  niceTicks(x0, x1, 4).forEach(v => g += `<text x="${X(v)}" y="${H - pb + 16}" text-anchor="middle">${dec(v, 1)}</text>`);
  niceTicks(y0, y1, 4).forEach(v => g += `<text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${dec(v, 1)}</text>`);
  t.forEach(s => { const ab = esc((info(L, s.equipo).abr || s.equipo.slice(0, 3)).toUpperCase());
    g += `<g class="dotg" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><circle cx="${X(s.ataque)}" cy="${Y(s.defensa)}" r="5" class="pt"/><text x="${X(s.ataque)}" y="${Y(s.defensa) - 8}" text-anchor="middle" class="ptl">${ab}</text><title>${esc(corto(L, s.equipo))}: ataque ${dec(s.ataque)}, defensa ${dec(s.defensa)}</title></g>`; });
  g += `<text x="${W - pr}" y="${H - 4}" text-anchor="end">más ataque →</text><text x="${pl}" y="${pt + 10}" class="ptl">↑ mejor defensa</text>`;
  g += `<text x="${W - pr - 6}" y="${pt + 14}" text-anchor="end" class="qlab">Fuertes en todo</text></svg>`;
  return g + `<p class="note">Ataque: goles que marca frente a una defensa promedio. Defensa: goles que recibe (más arriba, recibe menos). Toca un equipo para ver su página.</p>`;
}

/* ---------------- EN VIVO (directo desde ESPN en el navegador) ---------------- */
const LIVE = {};
let liveOK = true;
async function pollLive() {
  if (!liveOK || document.hidden) return;
  const now = Date.now(), slugs = new Set();
  ligasIds().forEach(id => {
    const L = D.ligas[id];
    if (L.slug && L.partidos.some(p => { const t = new Date(p.kickoff).getTime(); return t <= now + 20 * 60e3 && t >= now - 3 * 3600e3; })) slugs.add(L.slug);
  });
  for (const slug of slugs) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`);
      if (!r.ok) continue;
      const j = await r.json();
      (j.events || []).forEach(ev => {
        const c = (ev.competitions || [])[0] || {}, st = (ev.status || c.status || {}), ty = st.type || {};
        const cs = c.competitors || [], h = cs.find(x => x.homeAway === "home") || {}, a = cs.find(x => x.homeAway === "away") || {};
        const pens = /pen|shootout/i.test((ty.shortDetail || "") + (ty.name || ""));
        LIVE[String(ev.id)] = { state: ty.state, clock: pens && ty.state === "in" ? "Penales" : st.displayClock || "", hg: h.score, ag: a.score, sh: h.shootoutScore, sa: a.shootoutScore };
      });
    } catch (e) { liveOK = false; return; }
  }
  paintLive();
}
function paintLive() {
  document.querySelectorAll("[data-live-t]").forEach(el => {
    const L = LIVE[el.dataset.liveT]; if (!L || L.state === "pre") return;
    const lg = el.querySelector(".lg");
    el.innerHTML = (L.state === "in" ? `<span class="livetag">${esc(L.clock || "EN VIVO")}</span>` : `<span class="fttag">Final</span>`) + (lg ? lg.outerHTML : "");
  });
  document.querySelectorAll("[data-live-s]").forEach(el => {
    const L = LIVE[el.dataset.liveS]; if (!L || L.state === "pre") return;
    el.innerHTML = `<span class="s live-score ${L.state === "in" ? "on" : ""}">${esc(L.hg)}–${esc(L.ag)}</span><span class="l">${L.sh != null ? `pen. ${esc(L.sh)}-${esc(L.sa)}` : L.state === "in" ? "en vivo" : "final"}</span>`;
  });
  document.querySelectorAll("[data-live-mini]").forEach(el => {
    const L = LIVE[el.dataset.liveMini]; if (!L || L.state === "pre") return;
    el.innerHTML = `<span class="${L.state === "in" ? "livetag" : "fttag"}">${L.state === "in" ? esc(L.clock) : "Final"}</span> <b class="num">${esc(L.hg)} – ${esc(L.ag)}</b>${L.sh != null ? ` <small class="num">(pen. ${esc(L.sh)}-${esc(L.sa)})</small>` : ""}`;
  });
  document.querySelectorAll("[data-live-box]").forEach(el => {
    const L = LIVE[el.dataset.liveBox];
    if (!L || L.state === "pre") { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="${L.state === "in" ? "livetag" : "fttag"}">${L.state === "in" ? "EN VIVO · " + esc(L.clock) : "FINAL"}</span><b class="num">${esc(L.hg)} – ${esc(L.ag)}</b>`;
  });
}

/* ---------------- alineaciones, estadio y árbitro ---------------- */
async function loadSummary() {
  const L = D.ligas[R.liga], p = findMatch(R.liga, R.id), want = R.id;
  const box = document.getElementById("lineups"), mini = document.getElementById("xi-adj");
  if ((!box && !mini) || !L || !p || !L.slug) return;
  const fail = `<h3>Alineaciones</h3><p class="note">Aún no publicadas. Las alineaciones suelen salir cerca de una hora antes del partido.</p>`;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${L.slug}/summary?event=${encodeURIComponent(p.id)}`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (R.v !== "partido" || R.id !== want) return;
    const ros = (j.rosters || []).filter(t => (t.roster || []).some(x => x.starter));
    const gi = j.gameInfo || {}, ref = (gi.officials || [])[0], venue = (gi.venue || {}).fullName;
    let html = ros.length ? `<div class="lineups">${ros.map(t => {
      const side = t.homeAway === "home" ? p.home : p.away;
      const st = (t.roster || []).filter(x => x.starter), sub = (t.roster || []).filter(x => !x.starter);
      return `<div class="lu"><div class="lu-h">${badge(L, side)}<b>${esc(corto(L, side))}</b>${t.formation ? `<span class="tag">${esc(t.formation)}</span>` : ""}</div>
        <ol>${st.map(x => `<li><span class="num jn">${esc(x.jersey || "")}</span>${face(L, side, (x.athlete || {}).id, (x.athlete || {}).displayName, "sm")}<span>${esc((x.athlete || {}).displayName || "")}</span><small>${esc((x.position || {}).abbreviation || "")}</small></li>`).join("")}</ol>
        ${sub.length ? `<p class="note">Suplentes: ${sub.map(x => esc((x.athlete || {}).displayName || "")).join(", ")}</p>` : ""}</div>`;
    }).join("")}</div>` : `<p class="note">Aún no publicadas. Las alineaciones suelen salir cerca de una hora antes del partido.</p>`;
    const meta = [venue ? `Estadio: <b>${esc(venue)}</b>` : "", ref ? `Árbitro: <b>${esc(ref.displayName || ref.fullName || "")}</b>` : ""].filter(Boolean).join(" · ");
    const adj = ros.length ? lineupAdj(L, p, ros) : "";
    const HH = modelH(L, p);
    if (box && (ros.length || p.xi_prob)) {
      const render = ros.length ? () => vPitch({ rosters: ros, keyEvents: j.keyEvents || [] }, HH, null).replace(/^<div class="panel stack">/, "").replace(/<\/div>$/, "")
        : () => vPitch({ rosters: xiRosters(p.xi_prob), keyEvents: [] }, HH, null).replace("<h3>Alineaciones", "<h3>Alineación probable").replace(/^<div class="panel stack">/, "").replace(/<\/div>$/, "") + xiProbNote(p.xi_prob, p.bajas, k => corto(L, k === "h" ? p.home : p.away));
      box.innerHTML = adj + `<div id="lu-pitch">${render()}</div>` + (meta ? `<p class="note">${meta}</p>` : "");
      VV.lastPitch = { box: "lu-pitch", render };
    } else if (box) box.innerHTML = `<h3>Alineaciones</h3>${adj}${html}${meta ? `<p class="note">${meta}</p>` : ""}`;
    if (mini && adj) { mini.innerHTML = `<div class="panel stack">${adj}</div>`; }
  } catch (e) { if (box && R.v === "partido" && R.id === want) box.innerHTML = fail; }
}


/* ---------------- alineaciones confirmadas: goleadores que no son titulares ---------------- */
function lineupAdj(L, p, ros) {
  const titular = {}, citado = {};
  ros.forEach(t => { const lado = t.homeAway === "home" ? "h" : "a";
    (t.roster || []).forEach(x => { const id = String((x.athlete || {}).id || ""); if (!id) return; citado[id] = lado; if (x.starter) titular[id] = true; }); });
  const out = { h: [], a: [] }, share = { h: 0, a: 0 };
  [["h", p.home], ["a", p.away]].forEach(([lado, team]) => {
    const mine = (L.goleadores || []).filter(g => g.equipo === team);
    const gf = Math.max(rowOf(L, team).gf || 0, mine.reduce((s, g) => s + g.goles, 0), 1);
    mine.filter(g => g.goles >= 2 && /^\d+$/.test(String(g.jid)) && !titular[String(g.jid)]).forEach(g => {
      const banca = citado[String(g.jid)] === lado, pg = (p.goleadores || []).find(x => String(x.jid) === String(g.jid));
      out[lado].push({ g, banca, p0: pg ? pg.p : null });
      share[lado] += g.goles * (banca ? 0.6 : 1) / gf;
    });
    share[lado] = Math.min(share[lado], 0.6);
  });
  // amonestados más probables que no son titulares: un suplente juega poco (se deja un 25 %); sin citar, 0
  const cards = (p.tarjetas_jug || []).slice(0, 8).filter(c => /^\d+$/.test(String(c.jid)) && !titular[String(c.jid)]).map(c => ({ c, banca: citado[String(c.jid)] === c.lado }));
  const cardRows = cards.map(({ c, banca }) => { const t = c.lado === "h" ? p.home : p.away;
    return `<div class="bj-row"><span class="bt ${banca ? "dud" : "out"}">${banca ? "Suplente" : "No citado"}</span>${face(L, t, c.jid, c.jugador, "sm")}<span class="bj-n"><b>${esc(c.jugador)}</b><small>${esc(corto(L, t))} · ${c.amarillas} amarillas · recibir amarilla: ${pct(c.p)} → ${pct(banca ? c.p * 0.25 : 0)}</small></span></div>`; }).join("");
  const cardBlock = cardRows ? `<p class="lbl" style="margin-top:8px">Tarjetas</p>${cardRows}` : "";
  if (!out.h.length && !out.a.length) return `<div class="xi ok"><h3>Con las alineaciones confirmadas</h3><p class="note">Los goleadores principales de ambos equipos son titulares: el resultado y los goles no cambian.</p>${cardBlock}</div>`;
  const lh = p.lh * (1 - 0.4 * share.h), la = p.la * (1 - 0.4 * share.a);
  const k0 = markets(pmatrix(L, p).m), k1 = markets(matrixLam(lh, la, L.modelo.rho).m);
  const rows = ["h", "a"].flatMap(lado => out[lado].map(x => { const t = lado === "h" ? p.home : p.away;
    const p1 = x.p0 == null ? null : x.banca ? x.p0 * 0.3 : 0;
    return `<div class="bj-row"><span class="bt ${x.banca ? "dud" : "out"}">${x.banca ? "Suplente" : "No citado"}</span>${face(L, t, x.g.jid, x.g.jugador, "sm")}<span class="bj-n"><b>${esc(x.g.jugador)}</b><small>${esc(corto(L, t))} · ${x.g.goles} goles en la temporada${x.p0 != null ? ` · marcar: ${pct(x.p0)} → ${pct(p1)}` : ""}</small></span></div>`; })).join("");
  return `<div class="xi"><h3>Con las alineaciones confirmadas ${help("Si un goleador importante empieza en la banca o no está citado, se descuenta parte de sus goles a los goles esperados de su equipo (un suplente puede entrar, así que cuenta menos). Es un ajuste estimado, hecho en tu navegador.")}</h3>
    <div class="mktrow adj"><span class="lbl">Con las alineaciones</span><span class="num">${pct(k1.H)} · ${pct(k1.D)} · ${pct(k1.A)}</span><span class="lbl">Antes</span><span class="num">${pct(k0.H)} · ${pct(k0.D)} · ${pct(k0.A)}</span></div>
    ${rows}<p class="note">Goles esperados con las alineaciones: ${dec(lh, 2)} – ${dec(la, 2)} (antes ${dec(p.lh, 2)} – ${dec(p.la, 2)}).</p>${cardBlock}</div>`;
}

/* ---------------- BAJAS (API-Football) ---------------- */
/* ---------------- Ballytics, modelo propio y mercado ---------------- */
function vsMercado(L, p, k) {
  const H = corto(L, p.home), A = corto(L, p.away), q = mktOf(p);
  const own = p.calib && p.modelo ? p.modelo : { pH: k.H, pD: k.D, pA: k.A, pO25: k.O25 };
  const rows = [];
  if (p.calib) rows.push(["b", `Ballytics ${help(TIPS.ballytics)}`, [k.H, k.D, k.A], k.O25]);
  rows.push(["m", p.calib ? "Modelo propio" : `Modelo propio ${help(TIPS.ballytics)}`, [own.pH, own.pD, own.pA], own.pO25]);
  if (p.ajuste) rows.push(["j", `Modelo con bajas ${help("El modelo propio descontando a los goleadores lesionados o suspendidos. La cuota de la casa ya considera las bajas conocidas.")}`, [p.ajuste.pH, p.ajuste.pD, p.ajuste.pA], p.ajuste.pO25]);
  if (q) rows.push(["k", `Mercado <small>${esc(q.casa)}, sin margen</small>`, q.p, q.o]);
  if (rows.length < 2) return "";
  const head = `<tr><th></th><th class="n"><span class="lg">${esc(H)}</span><span class="sh">1</span></th><th class="n"><span class="lg">Empate</span><span class="sh">X</span></th><th class="n"><span class="lg">${esc(A)}</span><span class="sh">2</span></th><th class="n hide-m">+2,5</th></tr>`;
  const body = rows.map(([c, n, P, o]) => `<tr class="vm-${c}"><td>${n}</td>${P.map(v => `<td class="n">${pct(v)}</td>`).join("")}<td class="n hide-m">${o != null ? pct(o) : "—"}</td></tr>`).join("");
  let msg = "";
  if (q) {
    const names = [H, "el empate", A], d = [0, 1, 2].map(i => [i, own[["pH", "pD", "pA"][i]] - q.p[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    const pp = Math.round(Math.abs(d[1]) * 100);
    msg = pp >= 5 ? `<p class="vm-diff"><b>Diferencia grande:</b> el modelo propio le da a ${esc(names[d[0]])} <b>${pp} puntos ${d[1] > 0 ? "más" : "menos"}</b> que ${/^promedio/.test(q.casa) ? "el " : ""}${esc(q.casa)} (${pct(own[["pH", "pD", "pA"][d[0]]])} contra ${pct(q.p[d[0]])}).</p>`
      : `<p class="vm-diff ok">Modelo propio y mercado coinciden: la mayor diferencia es de ${pp} ${pp === 1 ? "punto" : "puntos"}.</p>`;
  }
  return `<div class="vm"><div class="scroll"><table class="t vm-t">${head}${body}</table></div>${msg}
    <p class="note">${p.calib ? "La probabilidad Ballytics ajusta los goles esperados a la cuota, porque en el backtest la cuota fue más precisa que el modelo solo." : q ? "No se pudo ajustar a la cuota; se muestra el modelo propio." : "Sin cuota publicada para este partido: la probabilidad es la del modelo propio."} Una diferencia no es una recomendación de apuesta.</p></div>`;
}
function bajasPanel(L, p) {
  const b = p.bajas;
  if (!b) return D.indice && D.indice.api_football && D.indice.api_football.activa && new Date(p.kickoff).getTime() - Date.now() < 3 * DAYMS
    ? `<div class="panel stack"><h3>Bajas</h3><p class="note">Sin lesionados ni suspendidos informados para este partido.</p></div>` : "";
  const tipo = t => t === "Missing Fixture" ? `<span class="bt out">Baja</span>` : `<span class="bt dud">Duda</span>`;
  const motivo = m => ({ "Injury": "Lesión", "Knee Injury": "Lesión de rodilla", "Muscle Injury": "Lesión muscular", "Hamstring Injury": "Isquiotibiales", "Ankle Injury": "Lesión de tobillo",
    "Suspended": "Suspendido", "Red Card": "Tarjeta roja", "Yellow Cards": "Acumulación de amarillas", "Illness": "Enfermedad", "Calf Injury": "Gemelo", "Groin Injury": "Ingle",
    "Back Injury": "Espalda", "Foot Injury": "Pie", "Thigh Injury": "Muslo", "Shoulder Injury": "Hombro", "Hip Injury": "Cadera", "Broken Leg": "Fractura de pierna",
    "Concussion": "Conmoción", "Inactive": "Inactivo", "Coach's decision": "Decisión técnica", "International duty": "Selección", "Knock": "Golpe" }[m] || m || "");
  const col = (lado, t) => `<div class="bj-col"><div class="lu-h">${badge(L, t)}<b>${esc(corto(L, t))}</b></div>${(b[lado] || []).length ? b[lado].map(x =>
      `<div class="bj-row">${tipo(x.tipo)}${face(L, t, x.jid, x.jug, "sm", x.foto)}<span class="bj-n"><b>${esc(x.jug)}</b><small>${esc(motivo(x.motivo))}${x.goles ? ` · ${x.goles} ${x.goles === 1 ? "gol" : "goles"} en la temporada` : ""}</small></span></div>`).join("")
    : `<p class="note">Sin bajas informadas por la fuente (API-Football). Eso no garantiza que el equipo no tenga bajas.</p>`}</div>`;
  return `<div class="panel stack"><h3>Bajas ${help("Lesionados y suspendidos informados por API-Football. «Baja» = no juega; «Duda» = puede no jugar. Si falta un goleador, el modelo ajusta sus goles esperados.")}</h3>
    <div class="lineups">${col("h", p.home)}${col("a", p.away)}</div>
    ${p.ajuste ? `<p class="note">Por los goleadores ausentes, el modelo ajusta los goles esperados a <b>${dec(p.ajuste.lh, 2)} – ${dec(p.ajuste.la, 2)}</b>.</p>` : ""}</div>`;
}

/* ---------------- árbitro (API-Football) ---------------- */
/* ---------------- árbitro: perfil, historial con los equipos y ficha ---------------- */
const ARB_PERFIL = { muchas: ["Saca muchas tarjetas", "warn"], pocas: ["Saca pocas tarjetas", "calm"], normal: ["Tarjetas normales", ""], deja: ["Deja jugar", "calm"],
  cobra: ["Cobra muchas faltas", "warn"], faltas_normal: ["Faltas normales", ""], rojas: ["Expulsa seguido", "warn"] };
const ARB_TIP = "Árbitro designado según API-Football, cruzado con los partidos de ESPN de las últimas 3 temporadas de esta liga. El perfil compara sus tarjetas y faltas por partido con el promedio de la liga, mezclado con ese promedio según cuántos partidos dirigió para no exagerar con pocos.";
const ARB_NOTA = "“Lo normal” es lo que hace ese equipo con los demás árbitros, de local o de visita según corresponda. Una diferencia se marca “llamativa” solo si sigue siendo improbable por azar después de tener en cuenta que en la liga se comparan cientos de pares de árbitro y equipo (corrección de Benjamini-Hochberg). Aun así no prueba que el árbitro favorezca o perjudique a nadie: también influyen el rival, la importancia del partido y el estilo del equipo.";
// ¿se parece al azar? lo que muestran todos los pares árbitro-equipo de la liga
function arbAzar(az, liga) {
  if (!az || !az.p) return "";
  const p = az.p, t = az.t, f = x => pct(x, 0);
  const txtP = `En <b>resultados</b>, ${p.llamativos ? `${p.llamativos} ${p.llamativos === 1 ? "par sale llamativo" : "pares salen llamativos"}` : "ningún árbitro muestra una diferencia que no pueda explicar la suerte"}: el ${f(p.sobre2)} de los pares se aleja mucho de lo normal, y el puro azar daría cerca del 5 %.`;
  const txtT = t ? ` En <b>tarjetas</b>, ${t.llamativos ? `${t.llamativos} ${t.llamativos === 1 ? "par sale llamativo" : "pares salen llamativos"}` : "ningún par sale llamativo"} (${f(t.sobre2)} se aleja mucho; el azar daría 5 %).` : "";
  return `<div class="arb-azar"><b>¿Es azar?</b> Comparando ${p.pares} pares de árbitro y equipo de ${esc(liga)} con 4 partidos o más. ${txtP}${txtT}</div>`;
}
const arbChips = pf => { pf = (pf || []).filter(k => ARB_PERFIL[k]); if (pf.length && pf.every(k => /normal/.test(k))) return `<span class="arb-chip">Perfil promedio: ${pf.length > 1 ? "tarjetas y faltas" : pf[0] === "normal" ? "tarjetas" : "faltas"} como la liga</span>`;
  return pf.filter(k => !/normal/.test(k)).map(k => `<span class="arb-chip ${ARB_PERFIL[k][1]}">${ARB_PERFIL[k][0]}</span>`).join(""); };
const arbCmp = (v, base, fmt, umbral = .12) => v == null ? "—" : `${fmt(v)}${base != null ? ` <small class="faint">${Math.abs(v - base) / (base || 1) > umbral ? (v > base ? "▲ " : "▼ ") : ""}liga ${fmt(base)}</small>` : ""}`;
const arbTemps = (t, etq) => Object.entries(t || {}).map(([k, n]) => `${(etq || {})[k] || k}: ${n}`).join(" · ");
function arbVer(v, tipo) {
  const M = tipo === "p" ? { mejor: ["▲ Llamativo: le fue mejor", "up"], peor: ["▼ Llamativo: le fue peor", "dn"] } : { mas: ["▲ Llamativo: más tarjetas", "dn"], menos: ["▼ Llamativo: menos tarjetas", "up"] };
  if (M[v]) return `<span class="arb-v ${M[v][1]}">${M[v][0]}</span>`;
  return v === "pocos" ? `<span class="arb-v">Pocos partidos para comparar</span>` : v === "normal" ? `<span class="arb-v">Dentro de lo normal</span>` : "";
}
function arbUlt(L, rows, team) {
  if (!(rows || []).length) return "";
  return `<details class="arb-ult"><summary>${rows.length === 1 ? "El partido" : `Los últimos ${rows.length} partidos`} con este árbitro</summary><ul>${rows.map(r => { const [d, h, a, hg, ag, th, ta, rh, ra] = r, res = team ? (team === h ? (hg > ag ? "G" : hg === ag ? "E" : "P") : (ag > hg ? "G" : ag === hg ? "E" : "P")) : "";
    return `<li>${res ? `<i class="arb-r ${res}">${res}</i>` : ""}<span class="faint num">${esc(fecha(d + "T12:00"))}</span> <span>${esc(corto(L, h))} <b class="num">${hg}–${ag}</b> ${esc(corto(L, a))}</span>${th != null ? `<span class="faint num arb-tc">${YC} ${th}–${ta}${(rh || ra) ? ` · ${RC} ${rh}–${ra}` : ""}</span>` : ""}</li>`; }).join("")}</ul></details>`;
}
function arbEquipo(L, e, team, datos) {
  if (!e || !e.pj) return `<div class="arb-eq"><div class="arb-eqh">${badge(L, team)}<b>${esc(corto(L, team))}</b><span class="faint">No lo ha dirigido en estas temporadas</span></div></div>`;
  const fila = (lab, v, esp, ver, fmt = x => dec(x, 2)) => v == null ? "" : `<div class="arb-k"><span class="lbl">${lab}</span><b class="num">${fmt(v)}</b>${esp != null ? `<small class="faint">lo normal ${fmt(esp)}</small>` : ""}${ver || ""}</div>`;
  return `<div class="arb-eq"><div class="arb-eqh">${badge(L, team)}<b>${esc(corto(L, team))}</b><span class="num">${e.pj} PJ · ${e.g}-${e.e}-${e.p}</span></div>
    <div class="arb-ks">${fila("Puntos por partido", e.ppg, e.ppg_esp, arbVer(e.v_p, "p"))}${datos.tarjetas ? fila("Tarjetas recibidas", e.tr, e.tr_esp, arbVer(e.v_t, "t"), x => dec(x, 1)) + fila("Tarjetas al rival", e.to, e.to_esp, "", x => dec(x, 1)) : ""}
      ${datos.penales || datos.tarjetas ? `<div class="arb-k"><span class="lbl">${datos.penales ? "Goles de penal a favor / en contra" : "Rojas recibidas"}</span><b class="num">${datos.penales ? `${e.pf} / ${e.pc}` : e.rr}</b>${datos.penales && e.rr != null ? `<small class="faint">rojas recibidas ${e.rr}</small>` : ""}</div>` : ""}</div>
    ${arbUlt(L, e.ultimos, team)}</div>`;
}
function arbPanel(L, p) {
  const a = p.arbitro; if (!a || !a.n) return "";
  const lg = L.arbitros_liga || {}, H3 = a.h3;
  const link = a.slug ? `<button class="link arb-n" data-go="arbitro" data-liga="${L.id}" data-id="${esc(a.slug)}">${esc(a.n)} →</button>` : `<b class="arb-n">${esc(a.n)}</b>`;
  const head = `<div class="row" style="justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px"><h3>Árbitro ${help(ARB_TIP)}</h3>${link}</div>`;
  if (!H3) {   // sin historial (liga sin datos de temporadas pasadas): lo de esta temporada
    if (!a.pj) return `<div class="panel stack arbp">${head}<p class="note">Todavía no dirige partidos de ${esc(L.nombre)} en las temporadas con datos.</p></div>`;
    return `<div class="panel stack arbp">${head}<div class="kpis">${kpi("m", "Partidos esta temporada", a.pj, L.nombre)}${kpi("", "Tarjetas por partido", arbCmp(a.tpp, lg.tpp, v => dec(v, 1)), "")}${kpi("", "Gana el local", arbCmp(a.local, lg.local, v => pct(v, 0)), "")}</div></div>`;
  }
  const B = H3.liga || {}, dt = H3.datos || {}, nT = Object.keys(H3.temps || {}).length;
  const ks = [kpi("m", nT > 1 ? `Partidos en ${nT} temporadas` : "Partidos dirigidos", H3.pj, arbTemps(H3.temps, H3.etq))];
  if (dt.tarjetas) ks.push(kpi("", "Tarjetas por partido", arbCmp(H3.tpp, B.tpp, v => dec(v, 1)), H3.rpp != null ? `rojas ${dec(H3.rpp, 2)} (liga ${dec(B.rpp, 2)})` : ""));
  if (dt.faltas) ks.push(kpi("", "Faltas cobradas por partido", arbCmp(H3.fpp, B.fpp, v => dec(v, 1), .08), "menos faltas = deja jugar más"));
  if (dt.penales) ks.push(kpi("", "Goles de penal por partido", arbCmp(H3.penpp, B.penpp, v => dec(v, 2), .25), ""));
  ks.push(kpi("", "Gana el local", arbCmp(H3.local, B.local, v => pct(v, 0), .1), `empate ${pct(H3.empate, 0)}`));
  return `<div class="panel stack arbp">${head}
    ${(H3.perfil || []).length ? `<div class="arb-chips">${arbChips(H3.perfil)}</div>` : `<p class="note">Con ${H3.pj} partidos todavía no alcanza para un perfil confiable.</p>`}
    <div class="kpis">${ks.join("")}</div>
    <h4 class="arb-sub">Con estos equipos</h4>
    <div class="arb-eqs">${arbEquipo(L, (a.eq3 || {}).h, p.home, dt)}${arbEquipo(L, (a.eq3 || {}).a, p.away, dt)}</div>
    ${arbAzar(H3.azar, L.nombre)}
    ${a.tarjetas_aj != null && p.th != null ? `<p class="note">Tarjetas esperadas del modelo: <b>${dec(p.th + p.ta, 1)}</b>. Ajustadas por este árbitro: <b>${dec(a.tarjetas_aj, 1)}</b>. ${help("El ajuste usa sus tarjetas de esta temporada mezcladas con el promedio de la liga. Se mide en el registro antes de usarlo en el modelo.")}</p>` : ""}
    <p class="note">${ARB_NOTA}</p>
    ${a.slug ? `<button class="btn ghost sm" data-go="arbitro" data-liga="${L.id}" data-id="${esc(a.slug)}">Ficha completa de ${esc(a.n)}</button>` : ""}</div>`;
}
function lArbitros(L) {
  const todos = L.arbitros || [], lg = L.arbitros_liga || {}, A = todos.filter(a => a.pj >= 3), resto = todos.length - A.length;
  if (!todos.length) return `<div class="panel empty">Sin árbitros registrados para esta liga todavía.</div>`;
  const fl = (v, b) => v == null || b == null || Math.abs(v - b) / (b || 1) <= .15 ? "" : `<small class="faint"> ${v > b ? "▲" : "▼"}</small>`;
  return `<div class="panel flush scroll"><div class="ph"><h3>Árbitros de la temporada</h3><span class="note">Promedio de la liga: ${lg.tpp != null ? `${dec(lg.tpp, 1)} tarjetas · ` : ""}${lg.penpp != null ? `${dec(lg.penpp, 2)} goles de penal · ` : ""}local gana ${pct(lg.local, 0)}${lg.tpp == null ? " · ESPN no publica las tarjetas de esta liga" : ""}</span></div>
    <table class="t"><thead><tr><th>Árbitro</th><th class="n">Partidos</th><th class="n">Tarjetas/PJ</th><th class="n hide-m">Penales/PJ</th><th class="n hide-m">Gana el local</th></tr></thead><tbody>${A.map(a => `<tr${a.slug ? ` class="click" data-go="arbitro" data-liga="${L.id}" data-id="${esc(a.slug)}"` : ""}><td><b>${esc(a.n)}</b>${(a.perfil || []).filter(k => !/normal/.test(k)).length ? `<div class="arb-chips sm">${arbChips(a.perfil.filter(k => !/normal/.test(k)))}</div>` : ""}</td><td class="n">${a.pj}${a.pj3 && a.pj3 > a.pj ? `<small class="faint" style="display:block">${a.pj3} en 3 temp.</small>` : ""}</td>
      <td class="n">${dec(a.tpp, 1)}${fl(a.tpp, lg.tpp)}</td><td class="n hide-m">${dec(a.penpp, 2)}${fl(a.penpp, lg.penpp)}</td><td class="n hide-m">${pct(a.local, 0)}</td></tr>`).join("")}</tbody></table>
    <p class="note" style="padding:0 16px 14px">Árbitros con 3 partidos o más esta temporada${resto ? ` (otros ${resto} dirigieron menos)` : ""}. Toca uno para ver su ficha: perfil, historial con cada equipo y sus últimos partidos. ▲ / ▼: más de 15 % sobre o bajo el promedio de la liga. Son estadísticas, no juicios sobre los árbitros.</p></div>`;
}
// ficha del árbitro: #/arbitro/<liga>/<slug>
D.arbH = D.arbH || {};
function vArbitro() {
  const L = D.ligas[R.liga], H = D.arbH[R.liga];
  if (!L) return vNoEncontrado("Esta liga no está en Ballytics");
  if (H === undefined) { D.arbH[R.liga] = null; getJSON(`data/arbitros/${R.liga}.json`).then(x => { D.arbH[R.liga] = x; }).catch(() => { D.arbH[R.liga] = false; }).then(() => { if (R.v === "arbitro") render(); }); }
  if (!H) return H === false ? vNoEncontrado("No hay historial de árbitros para esta liga") : `<section class="view">${skeleton()}</section>`;
  const r = (H.refs || {})[R.id]; if (!r) return vNoEncontrado("No encontramos a este árbitro");
  const B = H.base || {}, dt = H.datos || {}, etq = H.etiquetas || {};
  const ks = [kpi("m", "Partidos dirigidos", r.pj, arbTemps(r.temps, etq))];
  if (dt.tarjetas) ks.push(kpi("", "Tarjetas por partido", arbCmp(r.tpp, B.tpp, v => dec(v, 1)), `amarillas ${dec(r.ypp, 1)} · rojas ${dec(r.rpp, 2)} (liga ${dec(B.rpp, 2)})`));
  if (dt.faltas) ks.push(kpi("", "Faltas cobradas por partido", arbCmp(r.fpp, B.fpp, v => dec(v, 1), .08), "menos faltas = deja jugar más"));
  if (dt.penales) ks.push(kpi("", "Goles de penal por partido", arbCmp(r.penpp, B.penpp, v => dec(v, 2), .25), ""));
  ks.push(kpi("", "Gana el local", arbCmp(r.local, B.local, v => pct(v, 0), .1), `empate ${pct(r.empate, 0)}`));
  const llam = r.equipos.filter(e => /mejor|peor|mas|menos/.test((e.v_p || "") + (e.v_t || "")));
  const tabla = `<table class="t arb-t"><thead><tr><th>Equipo</th><th class="n">PJ</th><th class="n hide-m">G-E-P</th><th class="n">Pts/PJ</th>${dt.tarjetas ? `<th class="n">Tarj./PJ</th>` : ""}${dt.penales ? `<th class="n hide-m">Penal +/−</th>` : ""}</tr></thead><tbody>${r.equipos.map(e => {
    const cls = v => v === "mejor" || v === "menos" ? "good" : v === "peor" || v === "mas" ? "bad" : "";
    const celda = (v, esp, ver, d, mas, menos) => `<td class="n ${cls(ver)}"><b>${dec(v, d)}${ver === mas ? " ▲" : ver === menos ? " ▼" : ""}</b><small class="faint">normal ${dec(esp, d)}</small></td>`;
    return `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(e.t)}"><td class="team">${badge(L, e.t)}${esc(corto(L, e.t))}</td><td class="n">${e.pj}</td><td class="n hide-m">${e.g}-${e.e}-${e.p}</td>
      ${celda(e.ppg, e.ppg_esp, e.v_p, 2, "mejor", "peor")}${dt.tarjetas ? (e.tr != null ? celda(e.tr, e.tr_esp, e.v_t, 1, "mas", "menos") : `<td class="n">—</td>`) : ""}${dt.penales ? `<td class="n hide-m">${e.pf} / ${e.pc}</td>` : ""}</tr>`; }).join("")}</tbody></table>`;
  const lim = VV.arbLim || 15;
  const ult = r.partidos.slice(0, lim).map(([d, h, a, hg, ag, th, ta, rh, ra, fh, fa]) => `<div class="arb-pm"><span class="faint num">${esc(fecha(d + "T12:00"))}</span><span class="arb-pt">${badge(L, h)}<span>${esc(corto(L, h))}</span><b class="num">${hg}–${ag}</b><span>${esc(corto(L, a))}</span>${badge(L, a)}</span><span class="faint num">${th != null ? `${YC} ${th}–${ta}${rh || ra ? ` ${RC} ${rh}–${ra}` : ""}` : ""}${fh != null ? ` · ${fh + fa} faltas` : ""}</span></div>`).join("");
  return `<section class="view" aria-labelledby="h-arb">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="arbitros">← Árbitros de ${esc(L.nombre)}</button>
    <div class="panel stack arbp"><span class="lbl">Árbitro · ${esc(L.nombre)}</span><h1 id="h-arb">${esc(r.n)}</h1>
      ${(r.perfil || []).length ? `<div class="arb-chips">${arbChips(r.perfil)}</div>` : `<p class="note">Con ${r.pj} partidos todavía no alcanza para un perfil confiable.</p>`}
      <div class="kpis">${ks.join("")}</div>
      <p class="note">${Object.keys(etq).length > 1 ? `Últimas ${Object.keys(etq).length} temporadas de ${esc(L.nombre)} (${Object.values(etq).join(", ")})` : `Temporada ${Object.values(etq).join("")} de ${esc(L.nombre)}`}. Promedio de la liga en el mismo período: ${dt.tarjetas ? `${dec(B.tpp, 1)} tarjetas, ` : ""}${dt.faltas ? `${dec(B.fpp, 1)} faltas, ` : ""}local gana ${pct(B.local, 0)}.${!dt.tarjetas ? " ESPN no publica las tarjetas de esta liga." : ""}</p></div>
    ${H.azar && H.azar.p ? `<div class="panel stack">${arbAzar(H.azar, L.nombre)}</div>` : ""}
    <div class="panel flush scroll"><div class="ph"><h3>Con cada equipo ${help(ARB_NOTA)}</h3><span class="note">${llam.length ? `${llam.length} ${llam.length === 1 ? "diferencia llamativa" : "diferencias llamativas"} (▲ ▼)` : "Ninguna diferencia llamativa"}</span></div>${tabla}
      <p class="note" style="padding:0 16px 14px">Lo normal: lo que hace el equipo con los demás árbitros, de local o de visita según corresponda. ▲ ▼ marca solo las diferencias que siguen siendo improbables por azar después de corregir por comparar cientos de pares (con al menos 4 partidos). No prueba que el árbitro favorezca o perjudique a nadie.</p></div>
    <div class="panel flush"><div class="ph"><h3>Sus partidos</h3><span class="note">${r.partidos.length} en total</span></div>${ult}
      ${r.partidos.length > lim ? `<button class="vmore" id="arb-more">Ver más partidos (${r.partidos.length - lim} restantes)</button>` : ""}</div>
    <p class="note">Árbitro según API-Football; resultados, tarjetas, faltas y goles de penal según ESPN. Actualizado ${esc(fecha(H.actualizado))}.</p>
  </section>`;
}
document.addEventListener("click", e => { if (e.target.id === "arb-more") { VV.arbLim = (VV.arbLim || 15) + 30; go({ v: "arbitro", liga: R.liga, id: R.id, keepScroll: true }); } });

/* ---------------- previa automática ---------------- */
function previa(L, p, k, ct, tt) {
  const H = corto(L, p.home), A = corto(L, p.away), sh = rowOf(L, p.home), sa = rowOf(L, p.away), s1 = statOf(L, p.home), s2 = statOf(L, p.away);
  const out = [];
  const fav = k.H > k.A ? [H, k.H] : [A, k.A];
  out.push(Math.abs(k.H - k.A) < 0.08
    ? `Partido muy parejo: el modelo da ${pct(k.H)} a ${H}, ${pct(k.D)} al empate y ${pct(k.A)} a ${A}.`
    : `${fav[0]} llega como favorito, con ${pct(fav[1])} de probabilidad de ganar. El empate está en ${pct(k.D)}.`);
  const fs = (f, n) => { if (!f || !f.length) return ""; const w = f.filter(x => x === "G").length, l = f.filter(x => x === "P").length;
    return `${n} suma ${w} ${w === 1 ? "victoria" : "victorias"} y ${l} ${l === 1 ? "derrota" : "derrotas"} en sus últimos ${f.length} partidos`; };
  const f1 = fs(sh.forma, H), f2 = fs(sa.forma, A);
  if (f1 && f2) out.push(`${f1}; ${f2}.`);
  if (s1.gf != null && s2.gf != null) out.push(`En la temporada, ${H} marca ${dec(s1.gf, 1)} goles por partido y recibe ${dec(s1.gc, 1)}; ${A} marca ${dec(s2.gf, 1)} y recibe ${dec(s2.gc, 1)}.`);
  out.push(k.O25 > 0.55 ? `Se esperan goles: ${pct(k.O25)} de que haya más de 2,5 y ${pct(k.B)} de que marquen ambos.`
    : k.O25 < 0.45 ? `Apunta a un partido cerrado: solo ${pct(k.O25)} de que haya más de 2,5 goles.`
    : `Más de 2,5 goles tiene ${pct(k.O25)} y que marquen ambos, ${pct(k.B)}.`);
  const g = [...(p.goleadores || [])].filter(x => x.p).sort((a, b) => b.p - a.p)[0];
  if (g) out.push(`El jugador con más opciones de marcar es ${g.jugador} (${pct(g.p)}), con ${g.goles} goles en la temporada.`);
  const imp = ["h", "a"].flatMap(l => ((p.bajas || {})[l] || []).filter(x => x.tipo === "Missing Fixture" && x.goles >= 2).map(x => `${x.jug} (${l === "h" ? H : A}, ${x.goles} goles)`));
  if (imp.length) out.push(`Bajas importantes: ${imp.join(", ")}.`);
  if ((p.h2h || []).length) { const x = p.h2h[0]; out.push(`El último cruce terminó ${corto(L, x.home)} ${x.hg}–${x.ag} ${corto(L, x.away)}.`); }
  if (ct != null) out.push(`Córners esperados: ${dec(ct, 1)}${tt != null ? `. Tarjetas esperadas: ${dec(tt, 1)}` : ""}.`);
  return `<p class="previa-t">${out.map(esc).join(" ")}</p><p class="note">Texto generado automáticamente con los números del modelo. ${p.bajas ? "Incluye las bajas informadas; no considera alineaciones ni rotaciones." : "No considera lesiones, suspensiones ni alineaciones."}</p>`;
}

/* ---------------- aviso de datos viejos ---------------- */
function staleBanner() {
  const h = (Date.now() - new Date(D.indice.actualizado).getTime()) / 3600e3;
  return h > 8 ? `<div class="warn stale"><p>Los datos se actualizaron hace ${Math.round(h)} horas. Puede que falten los resultados más recientes.</p></div>` : "";
}

/* ---------------- JUGADOR ---------------- */
function findPlayer(L, jid) {
  const g = (L.goleadores || []).find(x => String(x.jid) === String(jid)), t = (L.amonestados || []).find(x => String(x.jid) === String(jid));
  if (!g && !t) return null;
  return { jid, jugador: (g || t).jugador, equipo: (g || t).equipo, goles: g ? g.goles : 0, penales: g ? g.penales : 0, ult5: g ? g.ult5 : [], amarillas: t ? t.amarillas : 0, rojas: t ? t.rojas : 0 };
}
function vJugador() {
  const L = D.ligas[R.liga], pl = L && findPlayer(L, R.id);
  if (!pl) return `<section class="view"><button class="back" data-go="inicio">← Inicio</button><div class="panel empty">No encontré a ese jugador. Solo tenemos jugadores con goles o tarjetas esta temporada.</div></section>`;
  const st = rowOf(L, pl.equipo), pj = (statOf(L, pl.equipo).pj) || st.pj || 0;
  const goles = L.resultados.filter(x => (x.home === pl.equipo || x.away === pl.equipo) && (x.goles || []).some(g => g.jug === pl.jugador && !g.og))
    .map(x => ({ x, mins: x.goles.filter(g => g.jug === pl.jugador && !g.og).map(g => (g.min ? g.min + "'" : "") + (g.pen ? " (p)" : "")) }));
  const next = L.partidos.find(p => p.home === pl.equipo || p.away === pl.equipo);
  const np = next && (next.goleadores || []).find(g => String(g.jid) === String(pl.jid));
  const otras = ligasIds().filter(id => id !== L.id).map(id => ({ L: D.ligas[id], p: findPlayer(D.ligas[id], pl.jid) })).filter(x => x.p);
  return `<section class="view" aria-labelledby="h-j">
    <button class="back" data-go="equipo" data-liga="${L.id}" data-team="${esc(pl.equipo)}">← ${esc(corto(L, pl.equipo))}</button>
    <div class="lhead panel">${face(L, pl.equipo, pl.jid, pl.jugador, "xl")}<div><h1 id="h-j">${esc(pl.jugador)}</h1><span class="muted">${esc(corto(L, pl.equipo))} · ${esc(L.nombre)}</span></div>${/^\d+$/.test(String(pl.jid)) ? `<button class="btn ghost sm" style="margin-left:auto" data-go="ficha" data-id="${esc(pl.jid)}">Ficha completa →</button>` : ""}</div>
    <div class="kpis">${kpi("k", "Goles", pl.goles, pj ? `${dec(pl.goles / pj, 2)} por partido del equipo` : "")}${kpi("", "Penales", pl.penales, "")}${kpi("", "Amarillas", pl.amarillas, "")}${kpi("", "Rojas", pl.rojas, "")}
      ${np ? kpi("m", "Marca en el próximo", pct(np.p), `vs ${esc(corto(L, next.home === pl.equipo ? next.away : next.home))}`) : ""}</div>
    ${pl.ult5 && pl.ult5.length ? `<div class="panel row" style="justify-content:space-between"><h3>Goles en los últimos 5 partidos del equipo</h3><span class="l5">${pl.ult5.map(v => `<i class="${v ? "on" : ""}">${v || "·"}</i>`).join("")}</span></div>` : ""}
    <div class="grid2">
      <div class="panel flush"><div class="ph"><h3>Sus goles esta temporada</h3></div><div class="rlist">${goles.map(({ x, mins }) => resultRow(L, x) + `<div class="gl"><span>${esc(mins.join(", "))}</span></div>`).join("") || `<div class="empty">Sin goles registrados.</div>`}</div></div>
      <div class="stack">
        ${next ? `<div class="panel flush"><div class="ph"><h3>Próximo partido</h3></div>${matchRow(next, false)}</div>` : ""}
        ${otras.length ? `<div class="panel stack"><h3>En otras competiciones</h3>${otras.map(o => `<button class="srow" data-go="jugador" data-liga="${o.L.id}" data-id="${esc(pl.jid)}">${leagueMark(o.L)}<span><b>${esc(o.L.nombre)}</b><small>${o.p.goles} goles · ${o.p.amarillas} amarillas</small></span><span class="sn num">${o.p.goles}</span></button>`).join("")}</div>` : ""}
      </div>
    </div>
    <p class="note">Datos de goles y tarjetas del detalle de cada partido publicado por ESPN.</p></section>`;
}

/* ---------------- COMPARADOR ---------------- */
function vComparar() {
  const L = D.ligas[R.liga] || D.ligas[ligasIds().find(id => !D.ligas[id].lite)];
  const teams = (L.tabla.length ? L.tabla.map(s => s.equipo) : Object.keys(L.equipos)).slice().sort((x, y) => corto(L, x).localeCompare(corto(L, y)));
  const a = teams.includes(R.team) ? R.team : ((L.tabla[0] || {}).equipo || teams[0]);
  let b = teams.includes(R.id) && R.id !== a ? R.id : ((L.tabla[1] || {}).equipo || teams[1]);
  if (b === a) b = teams.find(t => t !== a);
  const opt = sel => teams.map(t => `<option value="${esc(t)}" ${t === sel ? "selected" : ""}>${esc(corto(L, t))}</option>`).join("");
  const ra = rowOf(L, a), rb = rowOf(L, b), sa = statOf(L, a), sb = statOf(L, b);
  const k1 = markets(matrix(L.modelo, a, b).m), k2 = markets(matrix(L.modelo, b, a).m);
  const rows = [["Posición", ra.pos, rb.pos, 0, true], ["Puntos", ra.pts, rb.pts, 0], ["Ataque (modelo)", ra.ataque, rb.ataque, 2], ["Defensa (modelo)", ra.defensa, rb.defensa, 2, true],
    ["Goles por partido", sa.gf, sb.gf, 2], ["Goles recibidos", sa.gc, sb.gc, 2, true], ["Tiros al arco", sa.tiros_arco, sb.tiros_arco, 1], ["Córners", sa.corners, sb.corners, 1],
    ["Posesión (%)", sa.posesion, sb.posesion, 0], ["Tarjetas", sa.tarjetas, sb.tarjetas, 1, true], ["Ambos marcan", sa.ambos, sb.ambos, -1], ["Más de 2,5 goles", sa.over25, sb.over25, -1], ["Vallas invictas", sa.vallas, sb.vallas, 0]]
    .filter(r => r[1] != null && r[2] != null);
  const cmp = rows.map(([n, x, y, d, low]) => { const t = (Math.abs(x) + Math.abs(y)) || 1, f = v => d === -1 ? pct(v) : dec(v, d);
    const wx = low ? x < y : x > y, wy = low ? y < x : y > x;
    return `<div class="cmp"><span class="num ${wx ? "win" : ""}">${f(x)}</span><span class="cl"><i style="width:${100 * Math.abs(x) / t}%"></i></span><span class="lbl">${n}</span><span class="cr"><i style="width:${100 * Math.abs(y) / t}%"></i></span><span class="num ${wy ? "win" : ""}">${f(y)}</span></div>`; }).join("");
  const h2h = L.resultados.filter(x => (x.home === a && x.away === b) || (x.home === b && x.away === a));
  const ligaOpts = ligasIds().filter(id => !D.ligas[id].lite).map(id => `<option value="${id}" ${id === L.id ? "selected" : ""}>${esc(D.ligas[id].nombre)}</option>`).join("");
  const side = (t, r) => `<div class="cmp-team">${badge(L, t, "xl")}<b>${esc(corto(L, t))}</b>${r.pos ? `<span class="muted">${r.pos}º · ${r.pts} pts</span>` : ""}${formHtml(r.forma)}</div>`;
  const pr = (k, h, aw) => `<div class="pr3"><span class="lbl">${esc(corto(L, h))} de local</span>${bar3(k.H, k.D, k.A)}<div class="nums"><span><b>${pct(k.H)}</b> ${esc(corto(L, h))}</span><span>${pct(k.D)} empate</span><span>${esc(corto(L, aw))} <b>${pct(k.A)}</b></span></div></div>`;
  return `<section class="view" aria-labelledby="h-c">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="resumen">← ${esc(L.nombre)}</button>
    <h1 id="h-c">Comparar equipos</h1>
    <div class="panel cmp-pick">
      <label class="f"><span class="lbl">Liga</span><select id="cmp-l">${ligaOpts}</select></label>
      <label class="f"><span class="lbl">Equipo 1</span><select id="cmp-a">${opt(a)}</select></label>
      <label class="f"><span class="lbl">Equipo 2</span><select id="cmp-b">${opt(b)}</select></label>
    </div>
    <div class="panel"><div class="cmp-head">${side(a, ra)}<span class="vs">VS</span>${side(b, rb)}</div></div>
    <div class="grid2">
      <div class="panel stack"><h3>Números de la temporada</h3>${cmp || `<p class="note">Sin datos suficientes.</p>`}<p class="note">En verde, el mejor de los dos en cada fila.</p></div>
      <div class="stack">
        <div class="panel stack"><h3>Si se enfrentaran</h3>${pr(k1, a, b)}${pr(k2, b, a)}<p class="note">Probabilidades del modelo para un partido entre ambos, según quién sea local.</p></div>
        <div class="panel flush"><div class="ph"><h3>Enfrentamientos esta temporada</h3></div><div class="rlist">${h2h.map(x => resultRow(L, x)).join("") || `<div class="empty">No se han enfrentado esta temporada.</div>`}</div></div>
      </div>
    </div></section>`;
}
function bindCompare() {
  const l = document.getElementById("cmp-l"), a = document.getElementById("cmp-a"), b = document.getElementById("cmp-b");
  if (!l) return;
  l.onchange = () => go({ v: "comparar", liga: l.value, keepScroll: true });
  const upd = () => go({ v: "comparar", liga: l.value, team: a.value, id: b.value, keepScroll: true });
  a.onchange = upd; b.onchange = upd;
}

/* ---------------- SOBRE y JUEGO RESPONSABLE ---------------- */
function vSobre() {
  return `<section class="view narrow" aria-labelledby="h-s">
    <h1 id="h-s">Sobre Ballytics</h1>
    <div class="panel stack prose">
      <p><b>Ballytics</b> es un proyecto personal de análisis de fútbol con modelos estadísticos. Calcula probabilidades para cada partido de ${D.indice ? D.indice.ligas.length : ""} competiciones y las publica junto con un registro de cómo le va a cada predicción.</p>
      <p><b>Qué es.</b> Una herramienta para entender partidos: quién llega mejor, cuántos goles se esperan, qué tan probable es cada resultado y cuánto debería pagar una cuota para ser justa.</p>
      <p><b>Qué no es.</b> No es un servicio de pronósticos pagados ni una casa de apuestas, y no promete ganancias. En las pruebas con temporadas anteriores, las cuotas del mercado predijeron mejor que el modelo.</p>
      <p><b>Cómo se mantiene honesto.</b> Cada predicción queda guardada antes del partido en el <button class="link" data-go="registro">registro público</button> y se califica sola cuando termina. Nada se borra.</p>
      <p><b>Datos.</b> Resultados, estadísticas y calendario de los marcadores públicos de ESPN. El modelo, los datos procesados y este sitio se actualizan automáticamente cada dos horas.</p>
      <p><b>Método.</b> El detalle está en <button class="link" data-go="metodo">Cómo funciona</button>.</p>
    </div></section>`;
}
/* ---------- privacidad ---------- */
function vPrivacidad() {
  return `<section class="view narrow" aria-labelledby="h-pv"><h1 id="h-pv">Privacidad</h1>
    <p class="muted">Qué datos usa Ballytics, para qué, cuánto tiempo y cómo borrarlos. Actualizado el 28 de octubre de 2026. Ver también los <button class="link" data-go="terminos">términos de uso</button>.</p>
    <div class="panel stack prose">
      <h3>Quién es responsable</h3><p>Ballytics es un proyecto personal sin fines de lucro. Para cualquier consulta sobre tus datos, escribe en <a class="link" href="https://github.com/Ballyticsia/laboratorio-dc/issues" target="_blank" rel="noopener">el repositorio público del proyecto</a>.</p>
      <h3>Lo que queda solo en tu teléfono o computador</h3><p>Equipos y ligas favoritas, tus pronósticos guardados, preferencias de avisos, tema claro u oscuro, prodes a los que entraste y la última lista de partidos. Se guardan en el almacenamiento del navegador y no se envían a ningún servidor.</p>
      <h3>Lo que se guarda en el servidor de Ballytics (Cloudflare)</h3>
      <ul><li><b>Identificador anónimo:</b> un código al azar creado por tu navegador. El servidor guarda solo una versión cifrada, para que votes una vez por partido y para el prode. No incluye tu nombre, correo ni ubicación.</li>
        <li><b>"¿Quién gana?":</b> cuántos votos tiene cada resultado y cuál fue tu voto (asociado al identificador cifrado). Se borra solo a los 60 días.</li>
        <li><b>Prode:</b> el nombre del grupo, el apodo que elijas y tus pronósticos. Los ven los demás participantes del grupo.</li>
        <li><b>Avisos:</b> si activas los avisos, la dirección de suscripción que entrega tu navegador, los partidos que sigues y qué avisos quieres. Se borra sola si no se usa en 60 días.</li>
        <li><b>Ballytics IA:</b> cuántas preguntas hiciste hoy (para el límite diario, asociado al identificador cifrado). Si marcas 👍 o 👎 en una respuesta, se guardan esa pregunta, la respuesta y tu voto durante 60 días para mejorar la IA.</li></ul>
      <h3>Otros servicios</h3><p>La página está alojada en GitHub Pages. Los resultados en vivo, escudos y fotos se piden directamente a ESPN y a API-Football, que reciben tu dirección IP como cualquier sitio que visitas. Las preguntas a la IA, junto con los datos de los partidos, se envían a Google (Gemini) o, si no responde, a los modelos de Cloudflare para generar la respuesta; no se envía tu nombre ni tu identificador. No escribas datos personales en el chat. Ballytics no usa cookies de publicidad ni de seguimiento.</p>
      <h3>Tus derechos</h3><p>Puedes borrar todo con el botón de abajo. Para pedir una copia o corregir algo, escribe en el repositorio. Ballytics se está adaptando a la Ley 21.719 de protección de datos personales, que empieza a regir el 1 de diciembre de 2026.</p>
      <h3>Edad y juego responsable</h3><p>Las probabilidades son de un modelo estadístico y no son consejos de apuesta. Si apuestas, debes ser mayor de 18 años. <button class="link" data-go="responsable">Juego responsable</button></p>
    </div>
    <div class="panel stack" id="pv-box"><h3>Borrar mis datos</h3><p class="note">Borra lo guardado en este navegador, tus avisos y tu participación en los prodes de este dispositivo. Los votos ya contados quedan como números anónimos.</p><button class="btn ghost" id="pv-del">Borrar mis datos</button></div>
  </section>`;
}
function vTerminos() {
  return `<section class="view narrow" aria-labelledby="h-tu"><h1 id="h-tu">Términos de uso</h1>
    <p class="muted">Las reglas para usar Ballytics. Actualizado el 28 de octubre de 2026. Al usar el sitio aceptas estos términos; si no estás de acuerdo, no lo uses.</p>
    <div class="panel stack prose">
      <h3>Qué es Ballytics</h3><p>Una herramienta de estadística de fútbol: probabilidades calculadas por un modelo, datos de partidos y un registro público de cuánto acierta. Ballytics <b>no es una casa de apuestas</b>: no acepta apuestas, no recibe ni paga dinero y no tiene acuerdos con casas de apuestas, ligas ni clubes.</p>
      <h3>No es un consejo de apuesta</h3><p>Las probabilidades, las cuotas justas, los picks públicos y las respuestas de la IA son información estadística y pueden equivocarse. Ningún contenido del sitio es una recomendación personal ni una garantía de resultado. Si decides apostar, la decisión y el riesgo son tuyos. Las casas cobran un margen, y la mayoría de las personas que apuestan pierden dinero con el tiempo.</p>
      <h3>Solo mayores de 18 años</h3><p>El contenido sobre cuotas y apuestas es para mayores de 18 años. Respeta las leyes de tu país sobre apuestas. Si sientes que el juego te está afectando, revisa la página de <button class="link" data-go="responsable">juego responsable</button>.</p>
      <h3>Sin garantías sobre los datos</h3><p>Los resultados, estadísticas, alineaciones, lesiones, árbitros y cuotas vienen de terceros y pueden tener errores, demoras o faltar. Los datos en vivo pueden llegar con retraso. El modelo no conoce todo lo que pasa en un equipo. El sitio se entrega "tal cual", sin garantía de que esté siempre disponible ni libre de errores, y Ballytics no responde por pérdidas que vengan de usar esta información.</p>
      <h3>Ballytics IA</h3><p>Las respuestas las genera un modelo de inteligencia artificial a partir de los datos de Ballytics. Pueden ser incompletas o incorrectas: revisa siempre el partido antes de decidir algo. Hay un límite de preguntas por día. No escribas datos personales en el chat.</p>
      <h3>Picks públicos</h3><p>Son una prueba estadística con regla fija y un monto ficticio de 1 unidad por pick, para medir el modelo de forma honesta. No son una invitación a apostar ni un servicio de pronósticos.</p>
      <h3>Árbitros</h3><p>Las estadísticas de árbitros (tarjetas, penales y resultados de los partidos que dirigieron) son descriptivas. Una diferencia con el promedio puede deberse al tipo de partidos que le tocan y no implica ninguna acusación ni falta de imparcialidad.</p>
      <h3>Fuentes y marcas</h3><p>Datos de ESPN (marcadores, estadísticas y cuotas de DraftKings), API-Football (lesiones, árbitros, fotos y xG) y The Odds API (cuotas de Pinnacle y otras casas). Los nombres, escudos y fotos de ligas, clubes y jugadores pertenecen a sus dueños y se usan solo para identificarlos; su uso no implica relación ni patrocinio.</p>
      <h3>Uso correcto</h3><p>No uses el sitio para extraer datos de forma masiva, sobrecargar el servidor o abusar de la IA, los avisos o los prodes. Los apodos y nombres de grupos ofensivos se pueden borrar sin aviso.</p>
      <h3>Privacidad</h3><p>Qué datos se guardan y cómo borrarlos está en la página de <button class="link" data-go="privacidad">privacidad</button>.</p>
      <h3>Cambios y contacto</h3><p>Estos términos pueden cambiar; la fecha de arriba indica la última versión. El código del sitio es público. Para dudas, errores o pedir que se corrija algo, escribe en <a class="link" href="https://github.com/Ballyticsia/laboratorio-dc/issues" target="_blank" rel="noopener">el repositorio del proyecto</a>.</p>
    </div></section>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("#pv-del, #pv-yes"); if (!b) return;
  const box = document.getElementById("pv-box"); if (!box) return;
  if (b.id === "pv-del") { box.querySelector("p").insertAdjacentHTML("afterend", `<p class="warn">¿Seguro? No se puede deshacer.</p>`); b.outerHTML = `<button class="btn" id="pv-yes">Sí, borrar todo</button>`; return; }
  b.disabled = true; b.textContent = "Borrando…";
  let hecho = [];
  try {
    const url = await pushCfg();
    let endpoint = null;
    try { const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null, sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); } } catch (x) {}
    if (url) { const r = await fetch(url + "/borrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: lsGet("bt_uid", ""), endpoint, prodes: myProdes().map(p => p.code) }) }); hecho = (await r.json()).borrado || []; }
  } catch (x) {}
  try { Object.keys(localStorage).filter(k => k.startsWith("bt_")).forEach(k => localStorage.removeItem(k)); } catch (x) {}
  box.innerHTML = `<h3>Listo</h3><p>Se borraron los datos de este navegador${hecho.length ? ` y en el servidor: ${esc(hecho.join(", "))}` : ""}.</p>`;
});
function vResponsable() {
  return `<section class="view narrow" aria-labelledby="h-jr">
    <h1 id="h-jr">Juego responsable</h1>
    <div class="panel stack prose">
      <p>Las apuestas deportivas son solo para mayores de 18 años. Ningún modelo, tampoco este, puede garantizar ganancias: el margen de las casas hace que la mayoría de los apostadores pierda dinero en el largo plazo.</p>
      <p><b>Algunas señales de alerta:</b> apostar más de lo que puedes perder, intentar recuperar pérdidas con más apuestas, esconder cuánto apuestas, pedir prestado para apostar o sentir ansiedad cuando no apuestas.</p>
      <p><b>Si apuestas:</b> fija un presupuesto que puedas perder sin problemas, no lo aumentes para recuperar, usa los límites de depósito y autoexclusión de tu casa de apuestas y nunca apuestes bajo presión.</p>
    </div>
    <div class="panel stack">
      <h3>Dónde pedir ayuda</h3>
      <div class="help">
        <div><b>Jugadores Anónimos Chile</b><span class="muted">Grupos de apoyo gratuitos en varias regiones.</span><a href="https://jugadoresanonimos.cl/" target="_blank" rel="noopener">jugadoresanonimos.cl</a></div>
        <div><b>Gambling Therapy</b><span class="muted">Apoyo en línea y en español, gratuito y confidencial.</span><a href="https://www.gamblingtherapy.org/es/" target="_blank" rel="noopener">gamblingtherapy.org/es</a></div>
        <div><b>Superintendencia de Casinos de Juego</b><span class="muted">Información oficial sobre juego en Chile.</span><a href="https://www.scj.gob.cl/" target="_blank" rel="noopener">scj.gob.cl</a></div>
      </div>
      <p class="note">Si estás en otro país, busca el servicio de ayuda de juego de tu país o habla con tu centro de salud.</p>
    </div></section>`;
}


/* ---------------- cuenta regresiva ---------------- */
function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0 || ms > 3 * DAYMS) return "";
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  if (h >= 24) return `en ${Math.floor(h / 24)} d ${h % 24} h`;
  return h ? `en ${h} h ${m} min` : `en ${m} min`;
}
function paintCountdown() {
  const narrow = window.innerWidth <= 760;
  document.querySelectorAll("[data-cd]").forEach(el => { let t = countdown(el.dataset.cd);
    if (t && el.classList.contains("sm")) t = t.replace(/^en /, "").replace(" h ", "h ").replace(/ min$/, "m").replace(" d ", "d ").replace(/ h$/, "h");   // "1h 35m": cabe en la columna de la hora
    el.textContent = t; el.hidden = !t; });
}
setInterval(paintCountdown, 30000);


/* ---------------- COMBINADA ---------------- */
const COMBO_KEY = "bt_combo", PICKS_KEY = "bt_picks";
let COMBO = [], PICKS = [];
try { COMBO = JSON.parse(localStorage.getItem(COMBO_KEY) || "[]"); PICKS = JSON.parse(localStorage.getItem(PICKS_KEY) || "[]"); } catch (e) {}
const saveCombo = () => { try { localStorage.setItem(COMBO_KEY, JSON.stringify(COMBO)); } catch (e) {} };
const savePicks = () => { try { localStorage.setItem(PICKS_KEY, JSON.stringify(PICKS)); } catch (e) {} };
const inCombo = (mid, key) => COMBO.some(x => String(x.mid) === String(mid) && x.key === key);
document.addEventListener("click", e => {
  const b = e.target.closest(".addsel"); if (!b) return;
  e.stopPropagation();
  const { sel: key, label, liga, mid, jug } = b.dataset;
  const i = COMBO.findIndex(x => String(x.mid) === String(mid) && x.key === key);
  if (i >= 0) COMBO.splice(i, 1);
  else { const p = findMatch(liga, mid), L = D.ligas[liga];
    COMBO.push({ liga, mid, key, label, home: p.home, away: p.away, kickoff: p.kickoff, jug: key[0] === "G" ? jug : undefined }); }
  b.setAttribute("aria-pressed", String(i < 0));
  saveCombo(); paintComboBar();
});
function selLabel(g, n) {
  const pre = { "Doble oportunidad": "Doble oportunidad", "Goles": "Goles", "Ambos marcan": "Ambos marcan", "Córners (total)": "Córners", "Tarjetas (total)": "Tarjetas", "Marca en cualquier momento": "Marca" }[g];
  return pre ? `${pre}: ${n}` : n;
}
// probabilidad de un mercado definido por el marcador final (i goles local, j visita)
function scorePred(key) {
  const ln = k => parseFloat(k.slice(1)) / 10;
  switch (key) {
    case "H": return (i, j) => i > j; case "D": return (i, j) => i === j; case "A": return (i, j) => i < j;
    case "1X": return (i, j) => i >= j; case "X2": return (i, j) => i <= j; case "12": return (i, j) => i !== j;
    case "BY": return (i, j) => i > 0 && j > 0; case "BN": return (i, j) => !(i > 0 && j > 0);
  }
  if (/^O\d\d$/.test(key)) return (i, j) => i + j > ln(key);
  if (/^U\d\d$/.test(key)) return (i, j) => i + j < ln(key);
  return null;
}
function otherProb(L, p, key) {
  const ct = p.ch != null ? p.ch + p.ca : null, tt = p.th != null ? p.th + p.ta : null;
  let m;
  if ((m = key.match(/^C([OU])([\d.]+)$/)) && ct != null) return m[1] === "O" ? poisOver(+m[2], ct) : 1 - poisOver(+m[2], ct);
  if ((m = key.match(/^T([OU])([\d.]+)$/)) && tt != null) return m[1] === "O" ? poisOver(+m[2], tt) : 1 - poisOver(+m[2], tt);
  if (key[0] === "G") { const g = (p.goleadores || []).find(x => "G" + x.jid === key); return g ? g.p : null; }
  if (key[0] === "Y") { const c = (p.tarjetas_jug || []).find(x => "Y" + x.jid === key); return c ? c.p : null; }
  return null;
}
function comboProb(sels) {
  const groups = {};
  sels.forEach(s => (groups[s.liga + "|" + s.mid] ||= []).push(s));
  let prob = 1, indep = false, missing = false;
  for (const g of Object.values(groups)) {
    const L0 = D.ligas[g[0].liga];
    if (!L0 || L0.lite || !L0._det) { missing = true; if (!VV["cd" + g[0].liga]) { VV["cd" + g[0].liga] = 1; ensureDet(g[0].liga).then(() => { try { paintComboBar(); if (R.v === "combinada") render(); } catch (e) {} }); } continue; }
    const L = L0, p = L && findMatch(g[0].liga, g[0].mid);
    if (!p) { missing = true; continue; }
    const preds = g.map(s => scorePred(s.key)).filter(Boolean), others = g.filter(s => !scorePred(s.key));
    if (preds.length) { const { m } = pmatrix(L, p); let q = 0;
      for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (preds.every(f => f(i, j))) q += m[i][j];
      prob *= q; }
    others.forEach(s => { const q = otherProb(L, p, s.key); if (q == null) missing = true; else prob *= q; });
    if (others.length && (preds.length || others.length > 1)) indep = true;
  }
  return { prob, indep, missing, partidos: Object.keys(groups).length };
}
function paintComboBar() {
  let bar = document.getElementById("combobar");
  if (!bar) { bar = document.createElement("div"); bar.id = "combobar"; document.body.appendChild(bar); }
  document.body.classList.toggle("has-combo", !!COMBO.length && R.v !== "combinada");
  if (!COMBO.length || R.v === "combinada") { bar.hidden = true; return; }
  const c = comboProb(COMBO);
  bar.hidden = false;
  bar.innerHTML = `<button class="cb-in" data-go="combinada"><span class="cb-n">${COMBO.length}</span><span class="cb-t"><b>Combinada</b><small>${c.partidos} ${c.partidos === 1 ? "partido" : "partidos"}</small></span>
    <span class="cb-p"><b class="num">${pct(c.prob, 1)}</b><small>cuota justa ${c.prob > 0 ? dec(1 / c.prob) : "—"}</small></span><span class="cb-go">Ver ›</span></button>`;
}
function selLine(s, extra = "") {
  const L = D.ligas[s.liga] || D.meta[s.liga] || { equipos: {} };
  return `<div class="selrow"><span class="sel-m"><b>${esc(s.label)}</b><small>${esc(corto(L, s.home))} vs ${esc(corto(L, s.away))} · ${esc(fecha(s.kickoff))} ${esc(hhmm(s.kickoff))}</small></span>${extra}</div>`;
}
function vCombinada() {
  if (!COMBO.length) return `<section class="view narrow" aria-labelledby="h-cb"><h1 id="h-cb">Combinada</h1>
    <div class="panel empty">Todavía no agregas mercados. Entra a un partido, abre la pestaña <b>Mercados</b> y toca <b>+</b> en los que quieras combinar.</div></section>`;
  const c = comboProb(COMBO);
  const rows = COMBO.map((s, i) => { const L = D.ligas[s.liga], p = L && findMatch(s.liga, s.mid);
    const r1 = p ? comboProb([s]) : null, one = r1 && !r1.missing ? r1.prob : null;
    return selLine(s, `<span class="num sel-p">${one != null ? pct(one, 1) : "—"}</span><button class="rm" data-rm="${i}" aria-label="Quitar">×</button>`); }).join("");
  return `<section class="view narrow" aria-labelledby="h-cb">
    <h1 id="h-cb">Combinada</h1>
    <div class="panel stack">${rows}</div>
    <div class="panel stack combo-sum">
      <div class="kpis">${kpi("m", "Probabilidad de acertar todo", pct(c.prob, 2), c.indep ? "córners, tarjetas y goleadores se tratan como independientes" : "calculada con el marcador exacto")}${kpi("k", "Cuota justa", c.prob > 0 ? dec(1 / c.prob) : "—", "lo mínimo que debería pagar")}</div>
      <label class="f oddin"><span class="lbl">Cuota que te ofrecen</span><input id="cb-odd" inputmode="decimal" placeholder="Ej: 5,40"></label>
      <p id="cb-ev" class="note">Escribe la cuota para ver el valor esperado.</p>
      <div class="row"><label class="f oddin"><span class="lbl">Monto (opcional)</span><input id="cb-amt" inputmode="numeric" placeholder="Ej: 1000"></label></div>
      <div class="row"><button class="btn" id="cb-save">Guardar en Mis pronósticos</button><button class="btn ghost" id="cb-clear">Vaciar</button></div>
      <p class="note">Cuando eliges varios mercados del mismo partido, la probabilidad se calcula con el marcador exacto, así que no se infla. Un modelo no garantiza nada: úsalo para medir, no para apostar más.</p>
    </div></section>`;
}
function bindCombinada() {
  document.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { COMBO.splice(+b.dataset.rm, 1); saveCombo(); go({ v: "combinada", keepScroll: true }); });
  const odd = document.getElementById("cb-odd"), ev = document.getElementById("cb-ev");
  if (!odd) return;
  const c = comboProb(COMBO);
  odd.oninput = () => { const o = parseFloat(odd.value.replace(",", "."));
    ev.innerHTML = o > 1 ? `Valor esperado: <b class="${c.prob * o - 1 > 0 ? "good" : "bad"}">${c.prob * o - 1 > 0 ? "+" : "−"}${pct(Math.abs(c.prob * o - 1), 1)}</b> por cada $1.` : "Escribe la cuota para ver el valor esperado."; };
  document.getElementById("cb-clear").onclick = () => { COMBO = []; saveCombo(); go({ v: "combinada" }); };
  document.getElementById("cb-save").onclick = () => {
    const o = parseFloat(odd.value.replace(",", ".")), amt = parseFloat((document.getElementById("cb-amt").value || "").replace(/\./g, "").replace(",", "."));
    PICKS.unshift({ id: Date.now(), creado: new Date().toISOString(), sels: COMBO.slice(), p: c.prob, cuota: o > 1 ? o : null, monto: amt > 0 ? amt : null });
    savePicks(); COMBO = []; saveCombo(); go({ v: "seguimiento" });
  };
}

/* ---------------- MI SEGUIMIENTO ---------------- */
function gradeSel(s) {
  const L = D.ligas[s.liga]; if (!L) return "pend";
  const x = L.resultados.find(r => String(r.id) === String(s.mid));
  if (!x) return "pend";
  const f = scorePred(s.key);
  if (f) return f(x.hg, x.ag) ? "ok" : "ko";
  let m;
  if ((m = s.key.match(/^C([OU])([\d.]+)$/))) { if (!x.c) return "nv"; const t = x.c[0] + x.c[1]; return (m[1] === "O" ? t > +m[2] : t < +m[2]) ? "ok" : "ko"; }
  if ((m = s.key.match(/^T([OU])([\d.]+)$/))) { if (!x.t) return "nv"; const t = x.t[0] + x.t[1]; return (m[1] === "O" ? t > +m[2] : t < +m[2]) ? "ok" : "ko"; }
  if (s.key[0] === "G") return (x.goles || []).some(g => g.jug === s.jug && !g.og) ? "ok" : "ko";
  return "nv";
}
function gradePick(pk) {
  const g = pk.sels.map(gradeSel);
  if (g.includes("ko")) return "ko";
  if (g.includes("pend")) return "pend";
  if (g.includes("nv")) return "nv";
  return "ok";
}
function vSeguimiento() {
  const all = PICKS.map(pk => ({ pk, st: gradePick(pk) }));
  const done = all.filter(x => x.st === "ok" || x.st === "ko");
  const wins = done.filter(x => x.st === "ok").length;
  const money = done.filter(x => x.pk.cuota && x.pk.monto);
  const staked = money.reduce((a, x) => a + x.pk.monto, 0);
  const ret = money.reduce((a, x) => a + (x.st === "ok" ? x.pk.monto * x.pk.cuota : 0), 0);
  const expect = done.reduce((a, x) => a + x.pk.p, 0);
  const lab = { ok: ["Acertado", "good"], ko: ["Fallado", "bad"], pend: ["Pendiente", "faint"], nv: ["Sin verificar", "faint"] };
  const rows = all.map(({ pk, st }, i) => `<div class="panel stack pick-c ${st}">
      <div class="row" style="justify-content:space-between"><span class="lbl">${esc(new Date(pk.creado).toLocaleDateString("es-CL"))} · ${pk.sels.length === 1 ? "simple" : pk.sels.length + " selecciones"}</span>
        <span class="row" style="gap:8px"><span class="${lab[st][1]}" style="font-weight:700">${lab[st][0]}</span><button class="rm" data-rmp="${i}" aria-label="Borrar">×</button></span></div>
      ${pk.sels.map(s => selLine(s, `<span class="gs ${gradeSel(s)}">${{ ok: "✓", ko: "✗", pend: "·", nv: "?" }[gradeSel(s)]}</span>`)).join("")}
      <div class="row note" style="gap:14px"><span>Probabilidad del modelo: <b>${pct(pk.p, 1)}</b></span>${pk.cuota ? `<span>Cuota: <b>${dec(pk.cuota)}</b></span>` : ""}${pk.monto ? `<span>Monto: <b>${Math.round(pk.monto).toLocaleString("es-CL")}</b></span>` : ""}</div>
    </div>`).join("");
  return `<section class="view narrow" aria-labelledby="h-sg">
    <h1 id="h-sg">Mis pronósticos</h1>
    <p class="muted">Tus pronósticos guardados en este navegador. Se califican solos cuando terminan los partidos. Sirve para medirte con datos reales.</p>
    <div class="kpis">${kpi("m", "Pronósticos", PICKS.length, `${done.length} terminados`)}${kpi("", "Acierto", done.length ? pct(wins / done.length, 1) : "—", done.length ? `el modelo esperaba ${pct(expect / done.length, 1)}` : "")}
      ${kpi("k", "Resultado", money.length ? `${ret - staked >= 0 ? "+" : "−"}${Math.round(Math.abs(ret - staked)).toLocaleString("es-CL")}` : "—", money.length ? `ROI ${pct((ret - staked) / staked, 1)} sobre ${Math.round(staked).toLocaleString("es-CL")}` : "anota cuota y monto para verlo")}</div>
    ${rows || `<div class="panel empty">Aún no guardas pronósticos. Arma una combinada (o una sola selección) desde la pestaña Mercados de un partido y toca <b>Guardar en Mis pronósticos</b>.</div>`}
    <div class="panel stack backup"><h3>Respaldo</h3><p class="note">Tus pronósticos, equipos seguidos y prodes se guardan solo en este navegador. Descarga un respaldo para pasarlos a otro teléfono o computador, o por si borras los datos del navegador.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-backup="out">Descargar respaldo</button><label class="btn ghost sm" style="cursor:pointer">Cargar respaldo<input type="file" accept="application/json,.json" data-backup="in" hidden></label></div></div>
    <p class="note">Si apuestas, hazlo con un presupuesto que puedas perder. <button class="link" data-go="responsable">Juego responsable</button></p>
  </section>`;
}
/* respaldo: todo lo que Ballytics guarda en este navegador (menos la caché de partidos) */
const BK_SKIP = ["bt_dia"];
document.addEventListener("click", e => {
  if (!e.target.closest('[data-backup="out"]')) return;
  const data = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("bt_") && !BK_SKIP.includes(k)) data[k] = localStorage.getItem(k); } } catch (x) {}
  const blob = new Blob([JSON.stringify({ app: "ballytics", v: 1, fecha: new Date().toISOString(), datos: data }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ballytics-respaldo-${ymd(new Date())}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast("Respaldo descargado. Ábrelo en el otro dispositivo con «Cargar respaldo».");
});
document.addEventListener("change", async e => {
  const inp = e.target.closest('[data-backup="in"]'); if (!inp || !inp.files[0]) return;
  try {
    const j = JSON.parse(await inp.files[0].text());
    if (!j || j.app !== "ballytics" || typeof j.datos !== "object") throw new Error("formato");
    const ks = Object.keys(j.datos).filter(k => /^bt_[a-z0-9_]+$/i.test(k) && !BK_SKIP.includes(k) && typeof j.datos[k] === "string" && j.datos[k].length < 500000);
    ks.forEach(k => localStorage.setItem(k, j.datos[k]));
    toast(`Respaldo cargado (${ks.length} datos). Recargando…`); setTimeout(() => location.reload(), 900);
  } catch (x) { toast("Ese archivo no es un respaldo de Ballytics."); }
  inp.value = "";
});
function bindSeguimiento() {
  document.querySelectorAll("[data-rmp]").forEach(b => b.onclick = () => { PICKS.splice(+b.dataset.rmp, 1); savePicks(); go({ v: "seguimiento", keepScroll: true }); });
}

/* ---------------- CALENDARIO (.ics) ---------------- */
function icsDate(iso) { return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function downloadIcs(ms, name) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ballytics//ES", "CALSCALE:GREGORIAN"];
  ms.forEach(({ p, L }) => {
    const end = new Date(new Date(p.kickoff).getTime() + 2 * 3600e3).toISOString();
    lines.push("BEGIN:VEVENT", `UID:${p.id}@ballytics`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(p.kickoff)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${corto(L, p.home)} vs ${corto(L, p.away)} (${L.nombre})`.replace(/[,;]/g, " "),
      `DESCRIPTION:Ballytics: ${corto(L, p.home)} ${pct(p.pH)} · empate ${pct(p.pD)} · ${corto(L, p.away)} ${pct(p.pA)}`.replace(/[,;]/g, " "), "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ics]"); if (!b) return;
  const L = D.ligas[b.dataset.liga]; if (!L) return;
  if (b.dataset.ics === "match") { const p = findMatch(L.id, b.dataset.mid); if (p) downloadIcs([{ p, L }], `${corto(L, p.home)}-${corto(L, p.away)}.ics`.replace(/\s+/g, "_")); }
  else { const t = b.dataset.team; downloadIcs(L.partidos.filter(p => p.home === t || p.away === t).map(p => ({ p, L })), `${corto(L, t)}-partidos.ics`.replace(/\s+/g, "_")); }
});

/* ---------------- COMPARTIR (imagen) ---------------- */
async function shareImage(L, p, fmt) {
  const story = fmt === "story", W = 1080, H = story ? 1920 : 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  try { await document.fonts.ready; } catch (e) {}
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f1a36"); g.addColorStop(.55, "#0a0f1e"); g.addColorStop(1, "#160f2e");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, col) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, H); };
  glow(160, 120, 560, "rgba(61,139,255,.35)"); glow(960, 1250, 600, "rgba(177,140,255,.28)");
  const D1 = "'Chakra Petch', 'Arial Narrow', sans-serif", D2 = "'Manrope', system-ui, sans-serif", D3 = "'JetBrains Mono', monospace";
  x.fillStyle = "#3d8bff"; x.beginPath(); x.roundRect(70, 70, 64, 64, 16); x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 7; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath(); x.moveTo(84, 118); x.lineTo(98, 98); x.lineTo(110, 106); x.lineTo(122, 86); x.stroke();
  x.fillStyle = "#e8edf7"; x.font = `700 44px ${D1}`; x.textBaseline = "middle"; x.fillText("BALLYTICS", 156, 104);
  x.fillStyle = "#8792a6"; x.font = `600 30px ${D1}`; x.textAlign = "right"; x.fillText(L.nombre.toUpperCase(), W - 70, 104); x.textAlign = "left";
  // formato historia (9:16): el contenido baja y se agregan córners y tarjetas esperados
  const oy = story ? 250 : 0; x.save(); x.translate(0, oy);
  x.fillStyle = "#c8d3ea"; x.font = `500 32px ${D2}`; x.textAlign = "center";
  x.fillText(new Date(p.kickoff).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }) + " · " + hhmm(p.kickoff), W / 2, 230);
  const crest = (cx, t) => { const i = info(L, t), col = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? "#" + i.color : "#3d8bff";
    x.fillStyle = col; x.beginPath(); x.roundRect(cx - 95, 300, 190, 190, 44); x.fill();
    x.fillStyle = i.color && lum(i.color) > .62 ? "#07090f" : "#fff"; x.font = `700 64px ${D1}`; x.fillText((i.abr || t.slice(0, 3)).toUpperCase(), cx, 397);
    x.fillStyle = "#e8edf7"; x.font = `700 46px ${D1}`; const n = corto(L, t).toUpperCase(); x.fillText(n.length > 16 ? n.slice(0, 15) + "…" : n, cx, 545); };
  crest(270, p.home); crest(810, p.away);
  x.fillStyle = "#8792a6"; x.font = `600 34px ${D1}`; x.fillText("VS", W / 2, 397);
  x.font = `700 120px ${D1}`; x.fillStyle = "#3d8bff"; x.fillText(dec(p.lh, 1), 270, 670); x.fillStyle = "#b18cff"; x.fillText(dec(p.la, 1), 810, 670);
  x.fillStyle = "#8792a6"; x.font = `600 26px ${D1}`; x.fillText("GOLES ESPERADOS", W / 2, 670);
  const bx = 90, bw = W - 180, by = 790, bh = 34; let off = bx;
  [[p.pH, "#3d8bff"], [p.pD, "#56627a"], [p.pA, "#b18cff"]].forEach(([v, col]) => { x.fillStyle = col; x.beginPath(); x.roundRect(off, by, bw * v - 6, bh, 10); x.fill(); off += bw * v; });
  x.font = `600 40px ${D3}`; x.fillStyle = "#fff";
  x.textAlign = "left"; x.fillText(pct(p.pH), bx, by + 90); x.textAlign = "center"; x.fillText(pct(p.pD), W / 2, by + 90); x.textAlign = "right"; x.fillText(pct(p.pA), W - bx, by + 90);
  x.font = `500 28px ${D2}`; x.fillStyle = "#8792a6";
  x.textAlign = "left"; x.fillText("Local", bx, by + 140); x.textAlign = "center"; x.fillText("Empate", W / 2, by + 140); x.textAlign = "right"; x.fillText("Visita", W - bx, by + 140);
  const boxes = [["MÁS DE 2,5", pct(p.pO25)], ["AMBOS MARCAN", pct(p.pBTTS)], ["MARCADOR", p.top]];
  boxes.forEach(([l, v], i) => { const w = (W - 180 - 40) / 3, xx = 90 + i * (w + 20);
    x.fillStyle = "rgba(255,255,255,.05)"; x.strokeStyle = "rgba(148,163,184,.25)"; x.lineWidth = 2; x.beginPath(); x.roundRect(xx, 1030, w, 150, 22); x.fill(); x.stroke();
    x.textAlign = "center"; x.fillStyle = "#8792a6"; x.font = `600 24px ${D1}`; x.fillText(l, xx + w / 2, 1075); x.fillStyle = "#ffb020"; x.font = `700 50px ${D1}`; x.fillText(v, xx + w / 2, 1135); });
  if (story) {
    const extra = [p.ch != null ? ["CÓRNERS ESPERADOS", dec(p.ch + p.ca, 1)] : null, p.th != null ? ["TARJETAS ESPERADAS", dec(p.th + p.ta, 1)] : null].filter(Boolean);
    extra.forEach(([l, v], i) => { const w = (W - 180 - 20 * (extra.length - 1)) / extra.length, xx = 90 + i * (w + 20);
      x.fillStyle = "rgba(255,255,255,.05)"; x.strokeStyle = "rgba(148,163,184,.25)"; x.lineWidth = 2; x.beginPath(); x.roundRect(xx, 1210, w, 150, 22); x.fill(); x.stroke();
      x.textAlign = "center"; x.fillStyle = "#8792a6"; x.font = `600 24px ${D1}`; x.fillText(l, xx + w / 2, 1255); x.fillStyle = "#e8edf7"; x.font = `700 50px ${D1}`; x.fillText(v, xx + w / 2, 1315); });
  }
  x.restore();
  x.fillStyle = "#5d677a"; x.font = `500 24px ${D2}`; x.textAlign = "center";
  x.fillText("Probabilidades de un modelo estadístico. No son consejos de apuesta. +18", W / 2, H - 95);
  x.fillStyle = "#8792a6"; x.font = `600 26px ${D3}`; x.fillText(new URL(BASE_URL).host + BASE.replace(/\/$/, ""), W / 2, H - 55);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const fname = `ballytics-${corto(L, p.home)}-${corto(L, p.away)}${story ? "-historia" : ""}.png`.replace(/\s+/g, "_");
  const file = new File([blob], fname, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${corto(L, p.home)} vs ${corto(L, p.away)}`, text: "Probabilidades en Ballytics", url: cleanUrl(R) }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-share]"); if (!b) return;
  const L = D.ligas[b.dataset.liga], p = L && findMatch(L.id, b.dataset.mid); if (!p) return;
  b.disabled = true; shareImage(L, p, b.dataset.fmt).finally(() => { b.disabled = false; });
});


/* ---------------- MODO CLARO ---------------- */
(function () {
  const b = document.getElementById("themebtn"); if (!b) return;
  const sync = () => { const light = document.documentElement.dataset.theme === "light"; b.setAttribute("aria-label", light ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = light ? "#f3f6fb" : "#060912"; };
  b.addEventListener("click", () => {
    const light = document.documentElement.dataset.theme !== "light";
    if (light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("bt_theme", light ? "light" : "dark"); } catch (e) {}
    sync();
  });
  sync();
})();

/* ---------------- arranque ---------------- */
/* ================= EN VIVO, COMPETICIONES, EQUIPOS Y NOTICIAS (ESPN, desde el navegador) =================
   - Partidos del día: una sola consulta a ESPN con todos los partidos (soccer/all/scoreboard).
   - 184 competiciones con país y región en assets/competiciones.json; las demás toman el nombre que trae ESPN.
   - Centro del partido para cualquier partido (soccer/all/summary), tabla, calendario de equipos, plantel y noticias. */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_ST = "https://site.api.espn.com/apis/v2/sports/soccer";
const VV = { cache: {}, sum: {}, team: "h", comps: null, byId: {}, bySlug: {}, more: {}, q: "", st: {}, sched: {}, news: {} };
VV.hsort = lsGet("bt_hsort", "hora");
const NCAA = new Set(["5487", "5499"]);   // fútbol universitario de EE.UU.: muchos partidos, poco interés
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const localDay = iso => ymd(new Date(iso));
const fromYmd = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
const vget = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); };
function lsGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const favComps = () => lsGet("bt_vcomp", []);
const followed = () => lsGet("bt_vfollow", {});

async function vComps() {
  if (VV.comps) return VV.comps;
  try { VV.comps = await vget("assets/competiciones.json?v=2"); } catch (e) { VV.comps = []; }
  VV.comps.forEach(c => { VV.byId[c.id] = c; VV.bySlug[c.s] = c; });
  return VV.comps;
}
async function vSel() {
  if (VV.sel) return VV.sel;
  try { VV.sel = await vget("assets/selecciones.json?v=1"); } catch (e) { VV.sel = { conf: {}, orden: [], equipos: [] }; }
  VV.selById = {}; VV.sel.equipos.forEach(t => VV.selById[t.id] = t);
  return VV.sel;
}
const favSel = () => lsGet("bt_vsel", []);
const selImg = (t, cls = "") => t && t.l ? `<img class="cimg flagimg ${cls}"${isrc(t.l, /xl/.test(cls) ? 72 : 28)} alt="" loading="lazy" referrerpolicy="no-referrer" data-n="${esc(t.abr || t.n)}" onerror="bfb(this)">` : `<span class="cflag">🏳️</span>`;
const NAT_SLUGS = ["fifa.friendly", "uefa.nations", "concacaf.nations.league", "fifa.worldq.conmebol", "fifa.worldq.uefa", "fifa.worldq.concacaf", "fifa.worldq.afc", "fifa.worldq.caf", "fifa.worldq.ofc", "conmebol.america", "uefa.euroq", "caf.nations", "afc.asian.cup", "fifa.world"];
function cupCard() {
  const L = D.ligas.champions || D.ligas.libertadores, C = L && L.copa; if (!C) return "";
  const rows = C.tipo === "fase_liga" ? C.equipos.slice().sort((a, b) => b.p_campeon - a.p_campeon).slice(0, 6).map(r => [r.equipo, r.p_campeon]) : (C.campeon || []).slice(0, 6).map(r => [r.equipo, r.p]);
  if (!rows.length) return "";
  const mx = rows[0][1] || 1;
  return card(`Favoritos: ${esc(L.nombre)}`, `<div class="slist">${rows.map(([t, p]) => `<button class="srow" data-go="liga" data-liga="${L.id}" data-tab="copa">${badge(L, t)}<span><b>${esc(corto(L, t))}</b><span class="pbar gold" style="display:block;margin-top:5px"><i style="width:${100 * p / mx}%"></i></span></span><span class="sn num">${pct(p)}</span></button>`).join("")}</div><p class="note">Probabilidad de salir campeón según ${C.tipo === "fase_liga" ? C.sims.toLocaleString("es-CL") + " simulaciones" : "las llaves que quedan"}.</p>`, `<span class="tag">Simulación</span>`, "accent");
}
function vSelecciones() {
  setTimeout(vFillSel, 0);
  return `<section class="view" aria-labelledby="h-sel"><h1 id="h-sel">Selecciones</h1>${vHub("selecciones")}
    <div class="vbar"><div class="vsearch wide"><input id="vs-q" type="search" placeholder="Buscar selección" autocomplete="off"></div></div>
    <div id="vs-next"></div><div id="vs-list">${skelRows(5)}</div></section>`;
}
async function vFillSel() {
  const S = await vSel(), box = document.getElementById("vs-list"); if (!box) return;
  const q = ((document.getElementById("vs-q") || {}).value || "").trim().toLowerCase(), fav = favSel();
  const L = S.equipos.filter(t => !q || (t.n + " " + t.en).toLowerCase().includes(q));
  const item = t => `<div class="vci"><button class="vcib" data-go="club" data-liga="sel" data-id="${esc(t.id)}">${selImg(t)}<span><b>${esc(t.n)}</b><small>${esc((S.conf[t.cf] || "").split(" (")[0])}</small></span></button><button class="vstar${fav.includes(t.id) ? " on" : ""}" data-fsel="${esc(t.id)}" aria-label="Seguir">${fav.includes(t.id) ? "★" : "☆"}</button></div>`;
  let html = "";
  const favs = S.equipos.filter(t => fav.includes(t.id));
  if (!q && favs.length) html += `<div class="panel stack"><h3>Mis selecciones</h3><div class="vcgrid">${favs.map(item).join("")}</div></div>`;
  if (!q) html += `<div class="panel stack"><h3>Destacadas</h3><div class="vcgrid">${S.equipos.filter(t => t.top < 99).sort((a, b) => a.top - b.top).map(item).join("")}</div></div>`;
  S.orden.forEach(c => { const g = L.filter(t => t.cf === c); if (g.length) html += `<details class="panel stack vconf"${q || c === "conmebol" ? " open" : ""}><summary><h3>${esc(S.conf[c] || "Otras")}</h3><small>${g.length}</small></summary><div class="vcgrid">${g.map(item).join("")}</div></details>`; });
  box.innerHTML = html || `<div class="panel empty">Sin resultados.</div>`;
  if (!q) vFillNatNext();
}
/* próximos partidos de selecciones (fechas FIFA) */
async function vFillNatNext() {
  const box = document.getElementById("vs-next"); if (!box) return;
  if (!VV.natNext || Date.now() - VV.natNext.t > 600000) {
    const now = new Date(), months = [0, 1, 2].map(i => { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; });
    await Promise.all([vComps(), vSel()]);
    const res = await Promise.all(NAT_SLUGS.flatMap(s => months.map(m => vget(`${ESPN}/${s}/scoreboard?dates=${m}&limit=1000`).catch(() => null))));
    const map = new Map(); res.filter(Boolean).forEach(j => (j.events || []).forEach(e => { const x = vParse(e); if (!map.has(x.id)) map.set(x.id, x); }));
    VV.natNext = { t: Date.now(), evs: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }
  const fav = favSel(), now = Date.now();
  let evs = VV.natNext.evs.filter(e => e.state !== "post" && new Date(e.date).getTime() > now - 3 * 3600e3);
  const mine = evs.filter(e => fav.includes(e.h.id) || fav.includes(e.a.id));
  const top = new Set(((VV.sel || {}).equipos || []).filter(t => t.top < 99).map(t => t.id));
  const show = (mine.length ? mine : evs.filter(e => top.has(e.h.id) || top.has(e.a.id))).slice(0, 12);
  if (!document.getElementById("vs-next")) return;
  box.innerHTML = show.length ? `<div class="panel flush vcomp"><div class="vch"><b>${mine.length ? "Próximos partidos de mis selecciones" : "Próximos partidos de selecciones"}</b><small class="faint" style="margin-left:auto">${evs.length} en los próximos meses</small></div>${show.map(e => `<div class="vday sm"><span class="lbl">${esc(new Date(e.date).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }))} · ${esc(e.comp)}</span></div>${vRow(e)}`).join("")}</div>`
    : `<div class="panel empty">No hay partidos de selecciones programados en los próximos meses.</div>`;
}
const compImg = (c, cls = "") => c && c.l ? `<img class="cimg ${cls}"${isrc(c.l, /xl/.test(cls) ? 72 : 28)} alt="" data-f="${esc(c.f || "⚽")}" loading="lazy" referrerpolicy="no-referrer" onerror="if(!imgErr(this))this.replaceWith(Object.assign(document.createElement('span'),{className:'cflag',textContent:this.dataset.f}))">` : `<span class="cflag">${esc((c && c.f) || "⚽")}</span>`;
function modelBySlug(slug) { return Object.values(D.ligas || {}).find(L => L.slug === slug) || (D.indice ? D.indice.ligas.find(l => l.slug === slug) : null); }

/* ---------- partidos del día ---------- */
// ESPN entrega las selecciones con nombre en inglés: se traducen con assets/selecciones.json
function esNat(o) { const t = o && VV.selById && VV.selById[o.id]; if (t) { o.name = t.n; o.full = t.n; if (t.abr) o.abr = t.abr; } return o; }
// cuotas de ESPN (formato americano → decimal), solo antes del partido
const amer = v => { v = Number(v); return !v || isNaN(v) ? null : Math.round((1 + (v > 0 ? v / 100 : 100 / -v)) * 1000) / 1000; };
function espnOdds(c) {
  for (const o of c.odds || []) { if (!o || typeof o !== "object") continue;
    const ml = o.moneyline || {}, pick = k => { const x = ml[k] || {}; return amer((x.close || {}).odds) || amer((x.open || {}).odds); };
    const h = pick("home") || amer((o.homeTeamOdds || {}).moneyLine), a = pick("away") || amer((o.awayTeamOdds || {}).moneyLine), d = pick("draw") || amer((o.drawOdds || {}).moneyLine);
    if (h && a && d) return { h, d, a, casa: (o.provider || {}).displayName || (o.provider || {}).name || "" }; }
  return null;
}
function vParse(e) {
  const c = (e.competitions || [])[0] || {}, st = c.status || e.status || {}, t = st.type || {};
  const lid = String(e.uid || "").split("~l:")[1]?.split("~")[0] || "";
  const note = c.altGameNote || "", known = VV.byId[lid];
  const side = k => { const x = (c.competitors || []).find(y => y.homeAway === k) || {}, tm = x.team || {};
    return { id: String(tm.id || ""), name: tm.shortDisplayName || tm.displayName || "", full: tm.displayName || "", abr: tm.abbreviation, logo: tm.logo, color: tm.color, score: x.score, so: x.shootoutScore, winner: x.winner }; };
  return { id: String(e.id), lid, comp: known ? known.n : (note.split(",")[0] || "Otras competiciones"), slug: known ? known.s : null,
    ronda: note.includes(",") ? note.split(",").slice(1).join(",").trim() : "", date: e.date, state: t.state, detail: t.shortDetail || t.detail || "",
    clock: st.displayClock, period: st.period, h: esNat(side("home")), a: esNat(side("away")), o: t.state === "pre" ? espnOdds(c) : null };
}
/* evento en formato corto (servidor de Ballytics) → mismo formato que vParse */
function vParseC(x) {
  const lid = String(x.uid || "").split("~l:")[1]?.split("~")[0] || "", known = VV.byId[lid], note = x.note || "";
  return { id: x.id, lid, comp: known ? known.n : (note.split(",")[0] || "Otras competiciones"), slug: known ? known.s : null,
    ronda: note.includes(",") ? note.split(",").slice(1).join(",").trim() : "", date: x.date, state: x.state, detail: x.detail || "", clock: x.clock, period: x.period, h: esNat({ ...x.h }), a: esNat({ ...x.a }), o: x.o || null };
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tiempo")), ms))]);
function vDayLocal(key) { const c = lsGet("bt_dia", null); return c && c.k === key ? c : null; }
async function vFetchDay(key, onlyKey) {
  const c = VV.cache[key];
  if (c && Date.now() - c.t < 20000) return c.evs;
  await Promise.all([vComps(), vSel()]);
  const d2 = fromYmd(key); d2.setDate(d2.getDate() + 1);
  const dates = [key, ymd(d2)];
  let evs = null;
  // 1) servidor de Ballytics: lista corta y con caché (mucho más liviana que la de ESPN)
  try {
    const url = await withTimeout(pushCfg(), 2500);
    if (url) { const j = await withTimeout(vget(`${url}/dia?d=${dates.join(",")}`), 6000); if (j && j.ok) evs = j.events.map(vParseC); }
  } catch (e) { evs = null; }
  // 2) directo a ESPN si el servidor no responde
  if (!evs) {
    const res = await Promise.all((onlyKey && c ? [key] : dates).map(ds => vget(`${ESPN}/all/scoreboard?dates=${ds}&limit=1000`).catch(() => null)));
    evs = []; res.filter(Boolean).forEach(j => (j.events || []).forEach(e => evs.push(vParse(e))));
  }
  const map = new Map(c ? c.evs.map(e => [e.id, e]) : []);
  evs.forEach(x => { if (!NCAA.has(x.lid) && localDay(x.date) === key) map.set(x.id, x); });
  const out = [...map.values()];
  VV.cache[key] = { t: Date.now(), evs: out };
  if (key === ymd(new Date())) lsSet("bt_dia", { k: key, t: Date.now(), evs: out });
  return out;
}
function vModel(id) {
  for (const L of Object.values(D.ligas || {})) { const p = (L.partidos || []).find(x => String(x.id) === String(id)); if (p) return { L, p }; }
  return null;
}
const isLive = e => e.state === "in";
const enPenales = e => /pens|penal|shootout/i.test(e.detail || "") || e.period >= 5;
const vClock = e => enPenales(e) ? "Penales" : /half|HT|Entretiempo/i.test(e.detail) ? "ET" : (e.clock && e.clock !== "0'" ? e.clock : e.detail);
function vTeam(e, k, cls) {
  const t = e[k], ya = t.logo && LOK.has(IMG(t.logo, 26));
  const img = t.logo ? `<img${isrc(t.logo, 26)}${ya ? ` class="ok"` : ""} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-n="${esc(t.short || t.name)}" onload="this.classList.add('ok');window.__lok.add(this.getAttribute('src'))" onerror="bfb(this)">` : fbSpan(t.name, t.abr);
  return `<span class="vt ${cls}${e.state === "post" && t.winner ? " win" : ""}"><span class="vtn">${esc(t.name)}</span><span class="vlogo">${img}</span></span>`;
}
function vRow(e) {
  const m = vModel(e.id), f = followed()[e.id];
  const so = e.h.so != null && e.a.so != null && (e.h.so || e.a.so || enPenales(e)) ? `<small class="vpen">pen. ${esc(e.h.so)}-${esc(e.a.so)}</small>` : "";
  const sc = e.state === "pre" ? `<span class="vtime">${hhmm(e.date)}</span>` : `<span class="vsc num"><b>${esc(e.h.score ?? "")}</b><i>-</i><b>${esc(e.a.score ?? "")}</b>${so}</span>`;
  const st = isLive(e) ? `<span class="vmin live">${esc(vClock(e))}</span>` : e.state === "post" ? `<span class="vmin">${esc(/pen/i.test(e.detail) ? "Penales" : /AET|ET/i.test(e.detail) && e.detail !== "FT" ? "Alargue" : "Final")}</span>` : /postp|cancel|susp|delay/i.test(e.detail) ? `<span class="vmin warn">${esc(e.detail)}</span>` : `<span class="vmin vpre">${hhmm(e.date)}</span>`;
  return `<div class="vrow ${e.state}" data-go="envivo" data-id="${esc(e.id)}" role="link" tabindex="0">
    ${st}<span class="vmid">${vTeam(e, "h", "l")}${sc}${vTeam(e, "a", "r")}</span>
    <span class="vside">${m && e.state !== "post" ? `<span class="vmodel" title="Probabilidad Ballytics">${pct(m.p.pH)} · ${pct(m.p.pD)} · ${pct(m.p.pA)}</span>` : ""}${e.state !== "post" ? `<button class="vbell${f ? " on" : ""}" data-follow="${esc(e.id)}" title="${f ? "Dejar de seguir" : "Avisarme de goles"}" aria-label="Avisarme de goles">${f ? ICO.bell : ICO.belloff}</button>` : ""}</span></div>`;
}
function vHub(active) {
  return `<div class="vhub" role="tablist">${[["vivo", "Partidos"], ["competiciones", "Competiciones"], ["selecciones", "Selecciones"], ["prode", "Prode"], ["noticias", "Noticias"]].map(([v, n]) => `<button role="tab" data-go="${v}" aria-selected="${v === active}">${n}</button>`).join("")}</div>`;
}
function vVivo() {
  const today = ymd(new Date()), key = /^\d{8}$/.test(R.tab || "") ? R.tab : today, solo = R.id === "envivo";
  const days = [-3, -2, -1, 0, 1, 2, 3].map(i => { const d = fromYmd(today); d.setDate(d.getDate() + i); return d; });
  const lab = d => { const k = ymd(d), diff = Math.round((fromYmd(k) - fromYmd(today)) / DAYMS); return diff === 0 ? "Hoy" : diff === -1 ? "Ayer" : diff === 1 ? "Mañana" : d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric" }); };
  setTimeout(() => vFillList(key, solo), 0);
  if (key === today) timers.push(setInterval(() => { if (R.v === "vivo" && !document.hidden) vFillList(key, solo, true); }, 30000));
  return `<section class="view" aria-labelledby="h-vivo">
    <div class="row" style="justify-content:space-between;align-items:flex-end"><h1 id="h-vivo">En vivo</h1><span class="note" id="vv-upd"></span></div>
    ${vHub("vivo")}
    <div class="vdays" role="group" aria-label="Día">${days.map(d => `<button data-go="vivo" data-tab="${ymd(d)}" data-id="${solo ? "envivo" : ""}" data-keep aria-pressed="${ymd(d) === key}">${esc(lab(d))}</button>`).join("")}
      <label class="vcal" title="Elegir fecha"><span class="sr">Elegir fecha</span><input type="date" id="vv-date" value="${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}"></label></div>
    <div class="vbar">
      <button class="vlivebtn prefsb" data-prefs title="Elegir qué avisos recibir">${ICO.bell} Avisos</button>
      <button class="vlivebtn" data-go="vivo" data-tab="${key}" data-id="${solo ? "" : "envivo"}" data-keep aria-pressed="${solo}"><span class="dot"></span>En vivo <b id="vv-n"></b></button>
      <div class="vsearch"><input id="vv-q" type="search" placeholder="Filtrar por equipo o competición" value="${esc(VV.q)}" autocomplete="off"></div>
    </div>
    <div id="vv-list">${skelRows(9)}</div>
    <p class="note">Marcadores y estadísticas en vivo de ESPN. Se actualiza solo cada 30 segundos. Toca la campana de un partido para recibir un aviso cuando haya gol (mientras tengas la página abierta).</p></section>`;
}
async function vFillList(key, solo, refresh, evsIn) {
  const box = document.getElementById("vv-list"); if (!box) return;
  if (!D.allLoaded && !VV.allHook) { VV.allHook = 1; loadAll().then(() => { VV.allHook = 0; if (R.v === "vivo" && VV.cache[key]) vFillList(key, solo, false, VV.cache[key].evs); }); }
  if (!evsIn && !refresh && !VV.cache[key]) { const lc = vDayLocal(key); if (lc && Date.now() - lc.t < 6 * 3600e3) { await vComps(); vFillList(key, solo, false, lc.evs); } }
  let evs = evsIn;
  if (!evs) { try { evs = await vFetchDay(key, refresh); } catch (e) { evs = []; } }
  if (R.v !== "vivo" || !document.getElementById("vv-list")) return;
  const nLive = evs.filter(isLive).length, n = document.getElementById("vv-n"); if (n) n.textContent = nLive ? `(${nLive})` : "";
  const q = VV.q.trim().toLowerCase(), fav = favComps();
  const pass = e => (!solo || isLive(e)) && (!q || [e.h.full, e.a.full, e.comp].some(s => (s || "").toLowerCase().includes(q)));
  const groups = new Map();
  evs.filter(pass).forEach(e => { const k = e.lid || e.comp; if (!groups.has(k)) groups.set(k, { lid: e.lid, comp: e.comp, slug: e.slug, c: VV.byId[e.lid], evs: [] }); groups.get(k).evs.push(e); });
  const G = [...groups.values()].map(g => (g.evs.sort((a, b) => (isLive(b) - isLive(a)) || a.date.localeCompare(b.date)), g))
    .sort((a, b) => ((fav.includes(b.slug)) - (fav.includes(a.slug))) || ((a.c ? a.c.o : 160) - (b.c ? b.c.o : 160)) || (b.evs.some(isLive) - a.evs.some(isLive)) || a.comp.localeCompare(b.comp));
  const MAX = 8;
  box.innerHTML = G.length ? G.map(g => {
    const k = g.lid || g.comp, open = VV.more[k] || q || solo, lv = g.evs.filter(isLive).length, star = g.slug && fav.includes(g.slug);
    const rows = (open ? g.evs : g.evs.slice(0, MAX)).map(vRow).join("");
    return `<div class="panel flush vcomp"><div class="vch">${compImg(g.c)}<span class="vchn">${g.slug ? `<button class="link" data-go="comp" data-liga="${esc(g.slug)}">${esc(g.comp)}</button>` : `<b>${esc(g.comp)}</b>`}<small>${esc(g.c ? g.c.p : "")}</small></span>
      <span class="vcount">${lv ? `<span class="dot"></span>${lv} en vivo · ` : ""}${g.evs.length}</span>${g.slug ? `<button class="vstar${star ? " on" : ""}" data-fcomp="${esc(g.slug)}" aria-label="Seguir competición" title="Seguir competición">${star ? "★" : "☆"}</button>` : ""}</div>
      ${rows}${!open && g.evs.length > MAX ? `<button class="vmore" data-more="${esc(k)}">Ver los ${g.evs.length} partidos</button>` : ""}</div>`;
  }).join("") : `<div class="panel empty">${solo ? "No hay partidos en vivo en este momento." : q ? "Ningún partido coincide con el filtro." : "No hay partidos este día."}</div>`;
  const u = document.getElementById("vv-upd"); if (u) u.textContent = `${evs.length} partidos · actualizado ${hhmm(new Date().toISOString())}`;
}

/* ---------- competiciones ---------- */
function vCompeticiones() {
  setTimeout(vFillComps, 0);
  return `<section class="view" aria-labelledby="h-comps"><h1 id="h-comps">Competiciones</h1>${vHub("competiciones")}
    <div class="vbar"><div class="vsearch wide"><input id="vc-q" type="search" placeholder="Buscar liga, copa o país" autocomplete="off"></div></div>
    <div id="vc-list">${skelRows(5)}</div></section>`;
}
async function vFillComps() {
  const all = await vComps(), box = document.getElementById("vc-list"); if (!box) return;
  const q = ((document.getElementById("vc-q") || {}).value || "").trim().toLowerCase(), fav = favComps();
  const L = all.filter(c => !q || (c.n + " " + c.p).toLowerCase().includes(q));
  const item = c => `<div class="vci"><button class="vcib" data-go="comp" data-liga="${esc(c.s)}">${compImg(c)}<span><b>${esc(c.n)}${modelBySlug(c.s) ? ` <span class="tagm" title="Esta competición tiene probabilidades del modelo de Ballytics">Pronósticos</span>` : ""}</b><small>${esc(c.p)}${c.t.includes("fem") ? " · femenino" : ""}${c.t.includes("juv") ? " · juvenil" : ""}</small></span></button><button class="vstar${fav.includes(c.s) ? " on" : ""}" data-fcomp="${esc(c.s)}" aria-label="Seguir">${fav.includes(c.s) ? "★" : "☆"}</button></div>`;
  const favs = all.filter(c => fav.includes(c.s)), top = L.filter(c => c.o < 40);
  const regs = ["Selecciones", "Copas internacionales", "Sudamérica", "Europa", "Norteamérica", "Asia", "África"];
  let html = "";
  if (!q && favs.length) html += `<div class="panel stack"><h3>Mis competiciones</h3><div class="vcgrid">${favs.map(item).join("")}</div></div>`;
  if (!q) html += `<div class="panel stack"><h3>Populares</h3><div class="vcgrid">${top.map(item).join("")}</div></div>`;
  regs.forEach(r => {
    const rc = L.filter(c => c.r === r); if (!rc.length) return;
    const byP = {}; rc.forEach(c => (byP[c.p] ||= []).push(c));
    html += `<div class="panel stack"><h3>${esc(r)}</h3>${Object.keys(byP).sort((a, b) => a.localeCompare(b, "es")).map(p => `<details class="vcountry"${q ? " open" : ""}><summary><span class="cflag">${esc(byP[p][0].f)}</span>${esc(p)} <small>${byP[p].length}</small></summary><div class="vcgrid">${byP[p].map(item).join("")}</div></details>`).join("")}</div>`;
  });
  box.innerHTML = html || `<div class="panel empty">Sin resultados.</div>`;
}
document.addEventListener("input", e => {
  if (e.target.id === "vc-q") vFillComps();
  if (e.target.id === "vs-q") vFillSel();
  if (e.target.id === "vv-q") { VV.q = e.target.value; vFillList(/^\d{8}$/.test(R.tab || "") ? R.tab : ymd(new Date()), R.id === "envivo"); }
});
document.addEventListener("change", e => { if (e.target.id === "vv-date" && e.target.value) go({ v: "vivo", tab: e.target.value.replace(/-/g, ""), id: R.id, keepScroll: true }); });
document.addEventListener("click", e => {
  const s = e.target.closest("[data-fcomp]");
  if (s) { e.stopPropagation(); e.preventDefault(); const f = favComps(), k = s.dataset.fcomp, i = f.indexOf(k); if (i >= 0) f.splice(i, 1); else f.push(k); lsSet("bt_vcomp", f);
    s.classList.toggle("on", i < 0); s.textContent = i < 0 ? "★" : "☆"; return; }
  const ss = e.target.closest("[data-fsel]");
  if (ss) { e.stopPropagation(); e.preventDefault(); const f = favSel(), k = ss.dataset.fsel, i = f.indexOf(k); if (i >= 0) f.splice(i, 1); else f.push(k); lsSet("bt_vsel", f);
    ss.classList.toggle("on", i < 0); ss.textContent = i < 0 ? "★" : "☆"; return; }
  const m = e.target.closest("[data-more]");
  if (m) { VV.more[m.dataset.more] = true; vFillList(/^\d{8}$/.test(R.tab || "") ? R.tab : ymd(new Date()), R.id === "envivo"); return; }
  const b = e.target.closest("[data-follow]");
  if (b) { e.stopPropagation(); e.preventDefault(); vToggleFollow(b.dataset.follow, b); }
}, true);
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList && e.target.classList.contains("vrow")) e.target.click(); });

/* ---------- página de competición ---------- */
function vComp() {
  const slug = R.liga, tabs = [["partidos", "Partidos"], ["tabla", "Tabla"], ["noticias", "Noticias"]], tab = tabs.some(t => t[0] === R.tab) ? R.tab : "partidos";
  setTimeout(() => vFillComp(slug, tab), 0);
  return `<section class="view"><button class="back" data-go="competiciones">← Competiciones</button>
    <div class="panel lhead" id="cp-head">${skelHead()}</div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="comp" data-liga="${esc(slug)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="cp-body">${skelRows(5)}</div></section>`;
}
async function vSched(slug) {
  const c = VV.sched[slug]; if (c && Date.now() - c.t < 60000) return c.evs;
  const now = new Date(), months = [-1, 0, 1].map(i => { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const res = await Promise.all(months.map(m => vget(`${ESPN}/${slug}/scoreboard?dates=${m}&limit=1000`).catch(() => null)));
  const map = new Map(); let lg = null;
  res.filter(Boolean).forEach(j => { lg = lg || (j.leagues || [])[0]; (j.events || []).forEach(e => { const x = vParse(e); x.slug = slug; map.set(x.id, x); }); });
  const evs = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  VV.sched[slug] = { t: Date.now(), evs, lg }; return evs;
}
async function vStandings(slug) {
  if (VV.st[slug] && Date.now() - VV.st[slug].t < 300000) return VV.st[slug].j;
  const j = await vget(`${ESPN_ST}/${slug}/standings`); VV.st[slug] = { t: Date.now(), j }; return j;
}
function stTable(groups, hi = [], slug = "") {
  const val = (e, k) => { const s = (e.stats || []).find(x => x.name === k); return s ? (s.displayValue ?? s.value) : ""; };
  return groups.map(g => {
    const E = (g.standings || {}).entries || [];
    if (!E.length) return "";
    const notes = new Map(); E.forEach(e => { if (e.note && e.note.description) notes.set(e.note.color, e.note.description); });
    return `<div class="panel flush scroll">${g.name && groups.length > 1 ? `<div class="ph"><h3>${esc(g.name)}</h3></div>` : ""}<table class="t vstt"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n hide-m">GF</th><th class="n hide-m">GC</th><th class="n">DG</th><th class="n">Pts</th></tr></thead><tbody>${E.map((e, i) => {
      const t = typeof e.team === "string" ? { displayName: e.team, id: e.id } : (e.team || {}), logo = ((t.logos || [])[0] || {}).href, id = String(t.id || e.id || "");
      const col = e.note && e.note.color ? `style="box-shadow:inset 3px 0 0 ${esc(e.note.color)}"` : "";
      return `<tr class="${hi.includes(id) ? "hl" : ""}"><td ${col}><span class="pos">${esc(val(e, "rank") || i + 1)}</span></td><td class="vtm">${slug && id ? `<button class="link tlink" data-go="club" data-liga="${esc(slug)}" data-id="${esc(id)}">` : "<span>"}${logo ? `<img class="tlogo"${isrc(logo, 24)} alt="" loading="lazy" referrerpolicy="no-referrer" data-n="${esc(t.shortDisplayName || t.displayName || "")}" onerror="bfb(this)">` : ""}${esc(t.shortDisplayName || t.displayName || "")}${slug && id ? "</button>" : "</span>"}</td>
        <td class="n">${esc(val(e, "gamesPlayed"))}</td><td class="n hide-m">${esc(val(e, "wins"))}</td><td class="n hide-m">${esc(val(e, "ties"))}</td><td class="n hide-m">${esc(val(e, "losses"))}</td><td class="n hide-m">${esc(val(e, "pointsFor"))}</td><td class="n hide-m">${esc(val(e, "pointsAgainst"))}</td><td class="n">${esc(val(e, "pointDifferential"))}</td><td class="n"><b>${esc(val(e, "points"))}</b></td></tr>`;
    }).join("")}</tbody></table>${notes.size ? `<div class="vleg">${[...notes].map(([c, d]) => `<span><i style="background:${esc(c)}"></i>${esc(d)}</span>`).join("")}</div>` : ""}</div>`;
  }).join("");
}
const safeHref = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "#";
function newsCards(arts) {
  return arts.length ? `<div class="vnews">${arts.map(a => { const img = ((a.images || [])[0] || {}).url, href = ((a.links || {}).web || {}).href;
    return `<a class="vnc panel flush" href="${esc(safeHref(href))}" target="_blank" rel="noopener noreferrer">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="vnt">${a._lg ? `<small class="tag">${esc(a._lg)}</small>` : ""}<b>${esc(a.headline || "")}</b>${a.description ? `<span class="muted">${esc(a.description)}</span>` : ""}<small class="faint">${a.published ? esc(cuando(a.published)) : ""} · ESPN</small></span></a>`; }).join("")}</div>`
    : `<div class="panel empty">No hay noticias para esta competición.</div>`;
}
async function vNews(slug) {
  if (VV.news[slug] && Date.now() - VV.news[slug].t < 600000) return VV.news[slug].a;
  let a = [];
  try { a = (await vget(`${ESPN}/${slug}/news?limit=20&lang=es&region=ar`)).articles || []; } catch (e) {}
  if (!a.length) try { a = (await vget(`${ESPN}/${slug}/news?limit=20`)).articles || []; } catch (e) {}
  VV.news[slug] = { t: Date.now(), a }; return a;
}
function dayGroups(evs) {
  const by = {}; evs.forEach(e => (by[localDay(e.date)] ||= []).push(e));
  return Object.keys(by).map(k => `<div class="vday"><span class="lbl">${esc(fromYmd(k).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))}</span></div>${by[k].map(vRow).join("")}`).join("");
}
async function vFillComp(slug, tab) {
  await vComps();
  const c = VV.bySlug[slug], head = document.getElementById("cp-head"), body = document.getElementById("cp-body"); if (!head) return;
  const fav = favComps().includes(slug), M = modelBySlug(slug);
  let evs = [];
  try { evs = await vSched(slug); } catch (e) {}
  const lg = (VV.sched[slug] || {}).lg || {}, name = c ? c.n : lg.name || slug, logo = c && c.l ? c.l : ((lg.logos || [])[0] || {}).href;
  if (R.v !== "comp" || R.liga !== slug) return;
  head.innerHTML = `${logo ? `<img class="cimg xl"${isrc(logo, 72)} alt="" referrerpolicy="no-referrer" data-n="${esc(name)}" onerror="bfb(this)">` : `<span class="cflag xl">${esc((c && c.f) || "⚽")}</span>`}<div><h1>${esc(name)}</h1><span class="muted">${esc(c ? c.p : "")}${lg.season && lg.season.displayName ? " · " + esc(lg.season.displayName) : ""}</span></div>
    <div class="row" style="margin-left:auto;gap:8px">${M ? `<button class="btn sm" data-go="liga" data-liga="${M.id}">Probabilidades Ballytics</button>` : ""}<button class="vstar big${fav ? " on" : ""}" data-fcomp="${esc(slug)}" aria-label="Seguir">${fav ? "★" : "☆"}</button></div>`;
  if (tab === "partidos") {
    const now = Date.now(), live = evs.filter(isLive), next = evs.filter(e => e.state === "pre" && new Date(e.date).getTime() >= now - 3 * 3600e3).slice(0, 20), done = evs.filter(e => e.state === "post").slice(-20).reverse();
    body.innerHTML = (live.length ? `<div class="panel flush vcomp"><div class="vch"><span class="dot"></span><b>En vivo</b></div>${live.map(vRow).join("")}</div>` : "")
      + `<div class="grid2"><div class="panel flush vcomp"><div class="vch"><b>Próximos partidos</b></div>${next.length ? dayGroups(next) : `<div class="empty">Sin partidos programados en las próximas semanas.</div>`}</div>
         <div class="panel flush vcomp"><div class="vch"><b>Resultados</b></div>${done.length ? dayGroups(done) : `<div class="empty">Sin resultados recientes.</div>`}</div></div>`;
  }
  if (tab === "tabla") {
    let j = null; try { j = await vStandings(slug); } catch (e) {}
    if (R.v !== "comp" || R.liga !== slug) return;
    const groups = j ? (j.children && j.children.length ? j.children : [j]) : [];
    const lives = (VV.sched[slug] ? VV.sched[slug].evs : []).filter(isLive).map(e => ({ hId: e.h.id, aId: e.a.id, hs: +e.h.score || 0, as: +e.a.score || 0 }));
    const t = lives.length ? liveTableHtml(groups, lives, slug) : stTable(groups, [], slug);
    body.innerHTML = t || `<div class="panel empty">Esta competición no tiene tabla de posiciones (o aún no empieza).</div>`;
  }
  if (tab === "noticias") { const a = await vNews(slug); if (R.v === "comp" && R.liga === slug) body.innerHTML = newsCards(a.slice(0, 18)); }
}

/* ---------- página de equipo (cualquier club o selección) ---------- */
function vClub() {
  const slug = R.liga, id = R.id, tabs = [["partidos", "Partidos"], ["plantel", "Plantel"]], tab = tabs.some(t => t[0] === R.tab) ? R.tab : "partidos";
  setTimeout(() => vFillClub(slug, id, tab), 0);
  return `<section class="view">${slug === "sel" ? `<button class="back" data-go="selecciones">← Selecciones</button>` : `<button class="back" data-go="comp" data-liga="${esc(slug)}">← Competición</button>`}
    <div class="panel lhead" id="cl-head">${skelHead()}</div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="club" data-liga="${esc(slug)}" data-id="${esc(id)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="cl-body">${skelRows(5)}</div></section>`;
}
function schedRow(e, teamId) {
  const c = (e.competitions || [])[0] || {}, cs = c.competitors || [], h = cs.find(x => x.homeAway === "home") || {}, a = cs.find(x => x.homeAway === "away") || {};
  const st = ((c.status || e.status || {}).type || {}), sc = x => x.score && typeof x.score === "object" ? x.score.displayValue : x.score;
  const lid = String(e.uid || "").split("~l:")[1]?.split("~")[0] || "", lgName = (e.league && (e.league.shortName || e.league.name)) || (VV.byId[lid] || {}).n || "";
  const me = String((h.team || {}).id) === String(teamId) ? h : a, res = st.state === "post" ? (me.winner ? "G" : (cs.some(x => x.winner) ? "P" : "E")) : "";
  const x = { id: String(e.id), date: e.date, state: st.state, detail: st.shortDetail || "", clock: (c.status || {}).displayClock,
    h: { name: (h.team || {}).shortDisplayName || (h.team || {}).displayName, logo: ((h.team || {}).logos || [{}])[0].href || (h.team || {}).logo, score: sc(h), winner: h.winner },
    a: { name: (a.team || {}).shortDisplayName || (a.team || {}).displayName, logo: ((a.team || {}).logos || [{}])[0].href || (a.team || {}).logo, score: sc(a), winner: a.winner } };
  return `<div class="vday sm"><span class="lbl">${esc(new Date(e.date).toLocaleDateString("es-CL", { day: "numeric", month: "short" }))} · ${esc(lgName)}</span>${res ? `<span class="form"><i class="${res}">${res}</i></span>` : ""}</div>${vRow(x)}`;
}
async function vFillClub(slug, id, tab) {
  const head = document.getElementById("cl-head"), body = document.getElementById("cl-body"); if (!head) return;
  let past = null, fut = null, ros = null;
  // "all" trae los partidos de todas las competiciones del equipo (liga, copas, torneos internacionales)
  try { [past, fut] = await Promise.all([vget(`${ESPN}/all/teams/${id}/schedule`).catch(() => null), vget(`${ESPN}/all/teams/${id}/schedule?fixture=true`).catch(() => null)]); } catch (e) {}
  if (R.v !== "club" || R.id !== id) return;
  const nat = slug === "sel", st = nat ? (await vSel(), VV.selById[id]) : null;
  const t = (past || fut || {}).team || {}, logo = ((t.logos || [])[0] || {}).href || t.logo || (st && st.l);
  const fav = nat && favSel().includes(id);
  head.innerHTML = `${logo ? `<img class="cimg xl${nat ? " flagimg" : ""}"${isrc(logo, 72)} alt="" referrerpolicy="no-referrer" data-n="${esc(st ? st.abr || st.n : t.displayName || "")}" onerror="bfb(this)">` : ""}<div><h1>${esc(st ? st.n : t.displayName || "Equipo")}</h1><span class="muted">${esc(nat ? "Selección · " + ((VV.sel.conf[st && st.cf] || "").split(" (")[0]) : t.standingSummary || (VV.bySlug[slug] || {}).n || "")}</span></div>
    ${nat ? `<button class="vstar big${fav ? " on" : ""}" data-fsel="${esc(id)}" aria-label="Seguir" style="margin-left:auto">${fav ? "★" : "☆"}</button>` : ""}`;
  if (tab === "partidos") {
    const pe = ((past || {}).events || []).filter(e => (((e.competitions || [])[0] || {}).status || {}).type?.state === "post").slice(-12).reverse();
    const fe = ((fut || {}).events || []).slice(0, 12);
    body.innerHTML = `<div class="grid2"><div class="panel flush vcomp"><div class="vch"><b>Próximos partidos</b></div>${fe.length ? fe.map(e => schedRow(e, id)).join("") : `<div class="empty">Sin partidos programados.</div>`}</div>
      <div class="panel flush vcomp"><div class="vch"><b>Últimos resultados</b></div>${pe.length ? pe.map(e => schedRow(e, id)).join("") : `<div class="empty">Sin resultados.</div>`}</div></div>`;
  }
  if (tab === "plantel") {
    try { ros = await vget(`${ESPN}/${slug === "sel" ? "fifa.friendly" : slug}/teams/${id}/roster`); } catch (e) {}
    if (R.v !== "club" || R.id !== id) return;
    const A = (ros && ros.athletes) || [], ord = { G: 0, D: 1, M: 2, F: 3 }, grp = { G: "Arqueros", D: "Defensas", M: "Mediocampistas", F: "Delanteros" };
    const by = {}; A.forEach(a => { const p = ((a.position || {}).abbreviation || "M")[0]; (by[p in ord ? p : "M"] ||= []).push(a); });
    const Lf = { equipos: { [t.displayName]: { color: t.color, logo } } };
    body.innerHTML = A.length ? Object.keys(by).sort((a, b) => ord[a] - ord[b]).map(p => `<div class="panel stack"><h3>${grp[p]}</h3><div class="vsquad">${by[p].map(a => `<button class="vsq" data-go="ficha" data-id="${esc(a.id)}">${face(Lf, t.displayName, a.id, a.displayName, "")}<span><b>${esc(a.displayName)}</b><small>${a.jersey ? "#" + esc(a.jersey) + " · " : ""}${a.age ? esc(a.age) + " años" : ""}${a.citizenship ? " · " + esc(a.citizenship) : ""}</small></span></button>`).join("")}</div></div>`).join("")
      + (ros.coach && ros.coach[0] ? `<p class="note">Entrenador: <b>${esc([ros.coach[0].firstName, ros.coach[0].lastName].filter(Boolean).join(" "))}</b></p>` : "")
      : `<div class="panel empty">Plantel no disponible.</div>`;
  }
}

/* ---------- noticias ---------- */
function vNoticias() {
  setTimeout(vFillNoticias, 0);
  return `<section class="view" aria-labelledby="h-news"><h1 id="h-news">Noticias</h1>${vHub("noticias")}<div id="vn-list">${skelRows(4)}</div>
    <p class="note">Noticias de ESPN Deportes. Se abren en ESPN. Agrega competiciones a "Mis competiciones" para ver primero sus noticias.</p></section>`;
}
async function vFillNoticias() {
  await vComps();
  const slugs = [...new Set([...favComps(), "uefa.champions", "esp.1", "eng.1", "conmebol.libertadores", "ita.1", "arg.1"])].slice(0, 8);
  const all = (await Promise.all(slugs.map(async s => (await vNews(s)).slice(0, 8).map(a => ({ ...a, _lg: (VV.bySlug[s] || {}).n || s }))))).flat();
  const seen = new Set(), arts = all.filter(a => { const k = a.headline; if (!k || seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  const box = document.getElementById("vn-list"); if (box && R.v === "noticias") box.innerHTML = newsCards(arts.slice(0, 36));
}

/* ---------- avisos de gol (mientras la página está abierta) ---------- */
/* avisos con la app cerrada: suscripción Web Push al servidor de avisos (Cloudflare) */
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function pushCfg() {
  if (VV.pushUrl !== undefined) return VV.pushUrl;
  try { VV.pushUrl = (await vget("avisos.json?t=" + Date.now())).url || null; } catch (e) { VV.pushUrl = null; }
  return VV.pushUrl;
}
async function pushSub() {
  const url = await pushCfg();
  if (!url || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || Notification.permission !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) { const { publicKey } = await vget(url + "/vapid"); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) }); }
  return { url, sub };
}
async function vToggleFollow(id, btn) {
  const f = followed();
  if (f[id]) {
    delete f[id]; lsSet("bt_vfollow", f); if (btn) { btn.classList.remove("on"); btn.innerHTML = btn.classList.contains("vbell2") ? `${ICO.belloff} Avisarme de goles` : ICO.belloff; }
    try { const p = await pushSub(); if (p) await fetch(p.url + "/unfollow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: p.sub.endpoint, id }) }); } catch (e) {}
    return;
  }
  // el permiso se pide primero, todavía dentro del toque (Safari lo exige)
  if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} }
  const ev = Object.values(VV.cache).flatMap(c => c.evs).find(e => e.id === id) || (VV.sum[id] && (() => { const H = vHeader(VV.sum[id].j); return { h: { score: H.h.score, name: H.h.short }, a: { score: H.a.score, name: H.a.short }, date: H.date, state: H.state, slug: H.slug }; })());
  f[id] = { s: ev ? `${ev.h.score ?? 0}-${ev.a.score ?? 0}` : "", n: ev ? `${ev.h.name} vs ${ev.a.name}` : "", d: ev ? ev.date : "" };
  lsSet("bt_vfollow", f);
  if (btn) { btn.classList.add("on"); btn.innerHTML = btn.classList.contains("vbell2") ? `${ICO.bell} Siguiendo` : ICO.bell; }
  let remoto = false;
  try {
    const p = await pushSub();
    if (p) {
      const r = await fetch(p.url + "/follow", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: p.sub.toJSON(), prefs: myPrefs(), id, slug: (ev && ev.slug) || "all", name: f[id].n, s: f[id].s, st: (ev && ev.state) || "", date: f[id].d }) });
      remoto = r.ok;
      if (remoto) { const g = followed(); if (g[id]) { g[id].r = true; lsSet("bt_vfollow", g); } }
    }
  } catch (e) {}
  if (remoto) toast("Listo: te aviso de cada gol y del final, aunque cierres Ballytics.");
  else if (isIOS() && !isStandalone()) toast("Te aviso mientras tengas la página abierta. Para recibir avisos con Ballytics cerrado, instálala: Compartir → Agregar a inicio.");
  else if (!("Notification" in window) || Notification.permission !== "granted") toast("Te aviso aquí mientras tengas la página abierta. Para avisos del sistema, permite las notificaciones.");
  else toast("Listo: te aviso cuando haya gol en este partido (con la página abierta).");
}

/* ---------- instalar la app ---------- */
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; document.querySelectorAll(".pwa-ban").forEach(x => x.hidden = false); });
function installBanner() {
  if (isStandalone() || lsGet("bt_pwa_x", false)) return "";
  return `<div class="pwa-ban panel" ${!isIOS() && !deferredInstall ? "hidden" : ""}><img src="assets/icon-192.png" alt=""><div><b>Instala Ballytics</b><small>Ábrela desde tu pantalla de inicio, más rápida y con avisos de gol aunque esté cerrada.</small><button class="btn sm" data-install>Instalar</button></div><button class="x" data-install-x aria-label="Cerrar">×</button></div>`;
}
function iosHowTo() {
  const m = document.createElement("div"); m.className = "vmodal";
  m.innerHTML = `<div role="dialog" aria-label="Instalar Ballytics"><h3>Instalar en iPhone o iPad</h3><ol><li>Abre Ballytics en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba).</li><li>Elige <b>Agregar a inicio</b> y luego <b>Agregar</b>.</li><li>Abre Ballytics desde el ícono nuevo y activa la campana 🔔 en los partidos que quieras seguir.</li></ol><button class="btn" data-modal-x>Entendido</button></div>`;
  m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-modal-x]")) m.remove(); });
  document.body.appendChild(m);
}
document.addEventListener("click", async e => {
  if (e.target.closest("[data-install-x]")) { lsSet("bt_pwa_x", true); e.target.closest(".pwa-ban").remove(); return; }
  if (!e.target.closest("[data-install]")) return;
  if (deferredInstall) { deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (x) {} deferredInstall = null; document.querySelectorAll(".pwa-ban").forEach(x => x.remove()); }
  else iosHowTo();
});
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
function toast(msg) { const t = document.createElement("div"); t.className = "vtoast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
async function vWatch() {
  const f = followed(), ids = Object.keys(f); if (!ids.length || document.hidden) return;
  const old = Date.now() - 3 * DAYMS; ids.forEach(i => { if (f[i].d && new Date(f[i].d).getTime() < old) delete f[i]; });
  const key = ymd(new Date()); let evs = [];
  try { delete VV.cache[key]; evs = await vFetchDay(key); } catch (e) { return; }
  evs.forEach(e => { const w = f[e.id]; if (!w) return; const s = `${e.h.score ?? 0}-${e.a.score ?? 0}`;
    if (w.s && s !== w.s && e.state !== "pre") { const msg = `${e.h.name} ${e.h.score} – ${e.a.score} ${e.a.name}`;
      if (!w.r && "Notification" in window && Notification.permission === "granted") { try { new Notification("¡Gol!", { body: msg, tag: e.id }); } catch (x) {} }   // si hay aviso remoto, lo manda el servidor
      toast("⚽ ¡Gol! " + msg); }
    w.s = s; if (e.state === "post") delete f[e.id]; });
  lsSet("bt_vfollow", f);
}
setInterval(vWatch, 30000);

/* ---------- centro del partido ---------- */
const STATS = [["possessionPct", "Posesión", "%"], ["totalShots", "Remates"], ["shotsOnTarget", "Remates al arco"], ["blockedShots", "Remates bloqueados"],
  ["wonCorners", "Saques de esquina"], ["offsides", "Fueras de juego"], ["foulsCommitted", "Faltas"], ["yellowCards", "Tarjetas amarillas"], ["redCards", "Tarjetas rojas"],
  ["saves", "Atajadas"], ["accuratePasses", "Pases completados"], ["totalPasses", "Pases"], ["passPct", "Precisión de pases", "%"], ["totalCrosses", "Centros"],
  ["totalLongBalls", "Balones largos"], ["totalTackles", "Entradas"], ["interceptions", "Intercepciones"], ["totalClearance", "Despejes"]];
const KEY = ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "foulsCommitted", "offsides"];

function vEnVivo() {
  const tabs = [["resumen", "Resumen"], ["alineaciones", "Alineaciones"], ["estadisticas", "Estadísticas"], ["previa", "Previa"], ["tabla", "Tabla"], ["minuto", "Relato"]];
  const tab = tabs.some(t => t[0] === R.tab) ? R.tab : "resumen";
  setTimeout(() => vFillMatch(), 0);
  timers.push(setInterval(() => { if (R.v === "envivo" && !document.hidden && VV.state === "in") vFillMatch(true); }, 30000));
  return `<section class="view vcenter">
    <button class="back" data-go="vivo">← En vivo</button>
    <div class="panel vhead" id="vc-head">${skelHead()}</div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="envivo" data-id="${esc(R.id)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="vc-body"></div></section>`;
}
async function vSummary(id, force) {
  const c = VV.sum[id];
  if (c && !force && Date.now() - c.t < 20000) return c.j;
  VV.sumP = VV.sumP || {};
  if (!force && VV.sumP[id]) return VV.sumP[id];
  const pr = vget(`${ESPN}/all/summary?event=${encodeURIComponent(id)}`).then(j => { VV.sum[id] = { t: Date.now(), j }; return j; }).finally(() => { delete VV.sumP[id]; });
  VV.sumP[id] = pr; return pr;
}
// al tocar un partido de la lista se empieza a bajar antes de que se abra
document.addEventListener("pointerdown", e => { const r = e.target.closest && e.target.closest(".vrow[data-id]"); if (r) vSummary(r.dataset.id).catch(() => {}); }, { passive: true });
function vHeader(j) {
  const c = ((j.header || {}).competitions || [])[0] || {}, st = c.status || {}, t = st.type || {}, lg = (j.header || {}).league || {};
  const side = k => { const x = (c.competitors || []).find(y => y.homeAway === k) || {}, tm = x.team || {};
    return { id: String(tm.id || ""), name: tm.displayName || tm.name || "", short: tm.shortDisplayName || tm.displayName || "", logo: tm.logo || ((tm.logos || [])[0] || {}).href, color: tm.color, score: x.score, so: x.shootoutScore, rec: (x.record || [])[0] }; };
  return { state: t.state, detail: t.shortDetail || t.detail || "", clock: st.displayClock, period: st.period, date: c.date, h: side("home"), a: side("away"),
    league: lg.name || "", slug: lg.slug || "", lid: String(lg.id || ""), note: (c.notes || [])[0] ? c.notes[0].headline : "" };
}
// "FT-Pens", "AET", "FT"… en español
const finalEs = d => { d = String(d || ""); return /pen/i.test(d) ? "Final · penales" : /aet|extra/i.test(d) ? "Final · alargue" : /postp/i.test(d) ? "Aplazado" : /canc|abd|abandon/i.test(d) ? "Suspendido" : !d || /^(ft|final|full ?time)$/i.test(d) ? "Final" : d; };
const minOf = H => { if (H.state === "post") return 90; if (H.state !== "in") return 0; const m = parseInt(String(H.clock || "0"), 10) || 0; return /half|HT|Entretiempo/i.test(H.detail) ? 45 : Math.min(m, 90); };
function vEvents(j, H) {
  // los penales de la tanda no son goles del partido: van en su propio panel
  const tanda = new Set((j.shootout || []).flatMap(t => (t.shots || []).map(x => x.player)));
  const deTanda = e => e.shootout === true || (tanda.size && /penalty/i.test((e.type.text || "") + (e.type.type || "")) && (e.participants || []).some(p => tanda.has((p.athlete || {}).displayName)) && parseInt((e.clock || {}).displayValue || "0", 10) >= 90 && (e.period || {}).number >= 5);
  return (j.keyEvents || []).filter(e => e.type && !deTanda(e) && /goal|card|substitution|penalty/i.test((e.type.type || "") + (e.type.text || ""))).map(e => {
    const ty = (e.type.type || e.type.text || "").toLowerCase(), team = String((e.team || {}).id || ""), lado = team === H.h.id ? "h" : team === H.a.id ? "a" : "";
    const who = (e.participants || []).map(p => (p.athlete || {}).displayName).filter(Boolean);
    const kind = /own/.test(ty) ? "og" : /missed|saved/.test(ty) ? "miss" : /goal|scored/.test(ty) ? "goal" : /red/.test(ty) ? "red" : /yellow/.test(ty) ? "yellow" : /substitution/.test(ty) ? "sub" : "other";
    return { min: (e.clock || {}).displayValue || "", lado, kind, who, text: e.text || "", pen: /penalty/.test(ty) };
  });
}
/* tanda de penales: marcador, lanzamiento por lanzamiento con foto, dónde patearon y arqueros (ESPN: summary.shootout + relato) */
const PSO_LUGAR = { "top left": [.2, .26], "top right": [.8, .26], "bottom left": [.2, .78], "bottom right": [.8, .78], "top centre": [.5, .26], "high centre": [.5, .26],
  "bottom centre": [.5, .8], "centre left": [.2, .52], "centre right": [.8, .52], "centre": [.5, .52], "left": [.2, .55], "right": [.8, .55] };
const PSO_ES = { "top left": "arriba a la izquierda", "top right": "arriba a la derecha", "bottom left": "abajo a la izquierda", "bottom right": "abajo a la derecha", "top centre": "arriba al centro", "high centre": "arriba al centro",
  "bottom centre": "abajo al centro", "centre left": "a media altura a la izquierda", "centre right": "a media altura a la derecha", "centre": "al centro", "left": "a la izquierda", "right": "a la derecha" };
function psoRelato(c) {
  // del relato de ESPN (Opta): qué pasó y dónde fue cada penal de la tanda. En ligas con relato corto ("Penalty - Missed at 122'") solo se sabe si entró
  const t = String(c.text || ""), low = t.toLowerCase(), ty = String((((c.play || {}).type) || {}).text || "").toLowerCase();
  let tipo = /penalty saved|saved in|is saved/.test(low) ? "atajado" : /hits the (left |right )?post|hits the bar|crossbar/.test(low) ? "palo" : /penalty missed|misses|too high|wide|over the bar/.test(low) ? "afuera" : /goal!|converts/.test(low) ? "gol" : null;
  if (!tipo || /penalty - (scored|missed|saved) at/.test(low)) tipo = /saved/.test(ty + low) ? "atajado" : /scored/.test(ty + low) ? "gol" : /missed/.test(ty + low) ? "fallo" : tipo;
  const pie = /left footed/.test(low) ? "zurda" : /right footed/.test(low) ? "derecha" : /header/.test(low) ? "cabeza" : null;
  let lugar = null;
  const m = low.match(/(top|bottom|high|centre)?\s*(left|right|centre)?\s*(?:corner|of the goal)/);
  if (m) { const k = [m[1] === "high" ? "high" : m[1], m[2]].filter(Boolean).join(" ") || "centre"; lugar = PSO_LUGAR[k] ? k : m[2] && PSO_LUGAR[m[2]] ? m[2] : "centre"; }
  let fuera = null;
  if (tipo === "afuera") fuera = /high and wide to the left/.test(low) ? "alto-izq" : /high and wide to the right/.test(low) ? "alto-der" : /wide to the left|misses (to the )?left/.test(low) ? "izq" : /wide to the right|misses (to the )?right/.test(low) ? "der" : "alto";
  if (tipo === "palo") fuera = /left post/.test(low) ? "palo-izq" : /right post/.test(low) ? "palo-der" : "travesaño";
  return { tipo, pie, lugar, fuera };
}
function psoDatos(j, H) {
  const T = j.shootout || [], de = id => T.find(t => String(t.id) === String(id)) || { shots: [] };
  const th = de(H.h.id), ta = de(H.a.id);
  const tiros = [...th.shots.map(x => ({ ...x, lado: "h" })), ...ta.shots.map(x => ({ ...x, lado: "a" }))]
    .sort((a, b) => (+a.id || 0) - (+b.id || 0) || a.shotNumber - b.shotNumber || (a.lado === "h" ? -1 : 1));
  // relato de la tanda en orden; se empareja por orden y se confirma con el resultado (y si no calza, por apellido)
  // los penales de la tanda son los últimos penales del relato (antes puede haber penales en el partido)
  const pens = (j.commentary || []).filter(c => /penalty - (scored|missed|saved)|penalty (saved|missed)|converts the penalty/i.test((((c.play || {}).type || {}).text || "") + " " + (c.text || "")));
  const rel = pens.slice(-tiros.length).map(c => ({ c, r: psoRelato(c) })).filter(x => x.r.tipo);
  const ape = n => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).pop();
  const usados = new Set();
  tiros.forEach((x, i) => { let k = rel[i] && ((rel[i].r.tipo === "gol") === !!x.didScore) && !usados.has(i) && String(rel[i].c.text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(ape(x.player)) ? i : -1;
    if (k < 0) k = rel.findIndex((y, n) => !usados.has(n) && (y.r.tipo === "gol") === !!x.didScore && String(y.c.text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(ape(x.player)));
    if (k >= 0) { usados.add(k); x.rel = rel[k].r; } });
  // marcador acumulado, ronda y penal decisivo
  let sh = 0, sa = 0; const ronda = { h: 0, a: 0 };
  tiros.forEach(x => { ronda[x.lado]++; x.ronda = ronda[x.lado]; if (x.didScore) x.lado === "h" ? sh++ : sa++; x.marca = [sh, sa]; });
  const fin = H.state === "post", gan = fin && H.h.so != null && H.a.so != null && +H.h.so !== +H.a.so ? (+H.h.so > +H.a.so ? "h" : "a") : null;
  if (gan && tiros.length) tiros[tiros.length - 1].decisivo = true;
  // arqueros: el último que estuvo en la cancha de cada equipo
  const arq = lado => { const t = (j.rosters || []).find(r => r.homeAway === (lado === "h" ? "home" : "away")); if (!t) return null;
    const gk = (t.roster || []).filter(x => /^G/i.test(((x.position || {}).abbreviation || "")) && (x.starter || x.subbedIn));
    const x = gk.find(y => y.subbedIn) || gk[0]; return x ? { n: (x.athlete || {}).displayName, id: (x.athlete || {}).id } : null; };
  return { th, ta, tiros, gan, fin, arq: { h: arq("h"), a: arq("a") } };
}
function psoArco(tiros, lado, t) {
  // la portería de cada equipo con sus penales (según el relato de ESPN)
  const W = 300, Hh = 150, x0 = 46, x1 = 254, y0 = 34, y1 = 132, gx = f => x0 + f * (x1 - x0), gy = f => y0 + f * (y1 - y0);
  const ts = tiros.filter(x => x.lado === lado && x.rel && (x.rel.lugar || x.rel.fuera));
  let net = ""; for (let x = x0 + 13; x < x1; x += 13) net += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`; for (let y = y0 + 13; y < y1; y += 13) net += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
  const dots = ts.map((x, i) => { const r = x.rel; let px, py;
    if (r.fuera) { const F = { "alto": [.5, -.22], "alto-izq": [-.12, -.18], "alto-der": [1.12, -.18], "izq": [-.15, .5], "der": [1.15, .5], "palo-izq": [0, .45], "palo-der": [1, .45], "travesaño": [.5, 0] }[r.fuera] || [.5, -.2]; px = gx(F[0]); py = gy(F[1]); }
    else { const P = PSO_LUGAR[r.lugar] || [.5, .5]; px = gx(P[0]); py = gy(P[1]); }
    const dup = ts.slice(0, i).filter(y => y.rel.lugar === r.lugar && y.rel.fuera === r.fuera).length; px += dup * 24 * (px > W / 2 ? -1 : 1);
    const cls = x.didScore ? "ok" : r.tipo === "atajado" ? "sv" : "ko";
    return `<g class="pso-dot ${cls}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="13"/><text x="${px.toFixed(1)}" y="${(py + 4.5).toFixed(1)}" text-anchor="middle">${x.ronda}</text><title>${esc(x.player)}: ${x.didScore ? "gol" : r.tipo === "atajado" ? "atajado" : r.tipo === "palo" ? "al palo" : "afuera"}${r.lugar ? " · " + PSO_ES[r.lugar] : ""}</title></g>`; }).join("");
  return `<figure class="pso-arco"><figcaption>${vLogo(t)}<b>${esc(t.short)}</b></figcaption><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Dónde patearon los penales de ${esc(t.short)}">
    <g class="net">${net}</g><path class="frame" d="M${x0} ${y1 + 8} V${y0} H${x1} V${y1 + 8}"/><line class="grass" x1="8" y1="${y1 + 8}" x2="${W - 8}" y2="${y1 + 8}"/>${dots}</svg></figure>`;
}
VV.psoVisto = VV.psoVisto || new Set();
function vShootout(j, H) {
  if (!(j.shootout || []).length) return "";
  const P = psoDatos(j, H), { th, ta, tiros, gan, fin } = P;
  const so = { h: H.h.so ?? th.shots.filter(x => x.didScore).length, a: H.a.so ?? ta.shots.filter(x => x.didScore).length };
  const tm = { h: H.h, a: H.a }, otro = l => l === "h" ? "a" : "h";
  const rondas = Math.max(5, th.shots.length, ta.shots.length), muerte = Math.max(th.shots.length, ta.shots.length) > 5;
  const sig = !fin && tiros.length ? otro(tiros[tiros.length - 1].lado) : !fin ? "h" : null;
  const sub = gan ? `<b>${esc(tm[gan].short)}</b> gana ${Math.max(so.h, so.a)}–${Math.min(so.h, so.a)} en penales${muerte ? " (muerte súbita)" : ""}`
    : sig ? `Le toca a <b>${esc(tm[sig].short)}</b> · ${(sig === "h" ? th : ta).shots.length >= 5 ? "muerte súbita" : `ronda ${(sig === "h" ? th : ta).shots.length + 1}`}` : "";
  // fila de rondas con los resultados de cada equipo
  const fila = l => `<div class="pso-fila"><span class="pso-ft">${vLogo(tm[l])}<b>${esc(tm[l].short)}</b></span><span class="pso-k">${Array.from({ length: rondas }, (_, i) => { const x = (l === "h" ? th : ta).shots[i];
      const sigue = !fin && sig === l && i === (l === "h" ? th : ta).shots.length;
      return x ? `<span class="pso-d ${x.didScore ? "ok" : "ko"}${tiros.find(y => y.id === x.id && y.decisivo) ? " dec" : ""}" title="${esc(x.player)}: ${x.didScore ? "gol" : "falló"}">${x.didScore ? "✓" : "✕"}</span>` : `<span class="pso-d${sigue ? " next" : ""}"></span>`; }).join("")}</span><b class="pso-t num${gan === l ? " win" : ""}">${esc(so[l])}</b></div>`;
  const nuevos = new Set(tiros.filter(x => !VV.psoVisto.has(String(x.id))).map(x => String(x.id))); tiros.forEach(x => VV.psoVisto.add(String(x.id)));
  const primera = VV.psoVisto.size === nuevos.size;   // al abrir la página no se anima todo
  const qEs = x => !x.rel || x.rel.tipo === "fallo" ? (x.didScore ? "Gol" : "Falló") : x.didScore ? "Gol" : x.rel.tipo === "atajado" ? "Atajado" : x.rel.tipo === "palo" ? (x.rel.fuera === "travesaño" ? "Al travesaño" : "Al palo") : "Afuera";
  const kick = x => { const t = tm[x.lado], r = x.rel || {};
    return `<li class="pso-kick ${x.lado} ${x.didScore ? "ok" : "ko"}${x.decisivo ? " dec" : ""}${nuevos.has(String(x.id)) && !primera ? " nuevo" : ""}">
      <span class="pso-who">${face(null, null, x.playerId, x.player, "sm")}<span><b>${esc(x.player)}</b><small>${esc(t.short)}${r.pie ? ` · ${r.pie === "cabeza" ? "de cabeza" : r.pie}` : ""}${r.lugar && x.didScore ? ` · ${PSO_ES[r.lugar]}` : ""}</small></span></span>
      <span class="pso-res"><i>${x.didScore ? "✓" : "✕"}</i>${qEs(x)}${x.decisivo ? `<em>Decisivo</em>` : ""}</span>
      <span class="pso-mk num">${x.marca[0]}–${x.marca[1]}</span></li>`; };
  const pct_ = l => { const s = (l === "h" ? th : ta).shots; return s.length ? `${s.filter(x => x.didScore).length} de ${s.length}` : "—"; };
  const atajadas = l => tiros.filter(x => x.lado === otro(l) && x.rel && x.rel.tipo === "atajado").length;
  const arqs = ["h", "a"].map(l => { const g = P.arq[l], n = atajadas(l); return g && n ? `<span class="pso-gk">${face(null, null, g.id, g.n, "sm")}<span><b>${esc(g.n)}</b><small>${n === 1 ? "atajó 1 penal" : `atajó ${n} penales`}</small></span>${n >= 2 ? `<em>${ICO.glove} Figura</em>` : ""}</span>` : ""; }).join("");
  const hayLugar = tiros.some(x => x.rel && (x.rel.lugar || x.rel.fuera));
  return `<div class="panel pso${fin ? "" : " live"}">
    <div class="pso-top"><h3>Tanda de penales</h3>${fin ? `<span class="pso-st">Final</span>` : `<span class="pso-st live"><i></i>En curso</span>`}</div>
    <div class="pso-board">
      <div class="pso-tm${gan === "h" ? " win" : gan ? " lose" : ""}">${vLogo(H.h, "xl")}<b>${esc(H.h.short)}</b>${gan === "h" ? `<span class="pso-cup">${ICO.trophy} Clasifica</span>` : ""}</div>
      <div class="pso-sc"><span class="num"><b class="${gan === "h" ? "w" : ""}">${esc(so.h)}</b><i>–</i><b class="${gan === "a" ? "w" : ""}">${esc(so.a)}</b></span><small>${sub}</small></div>
      <div class="pso-tm${gan === "a" ? " win" : gan ? " lose" : ""}">${vLogo(H.a, "xl")}<b>${esc(H.a.short)}</b>${gan === "a" ? `<span class="pso-cup">${ICO.trophy} Clasifica</span>` : ""}</div>
    </div>
    <div class="pso-rondas"><div class="pso-fila pso-hd"><span class="pso-ft"></span><span class="pso-k">${Array.from({ length: rondas }, (_, i) => `<span class="pso-d hd">${i + 1}</span>`).join("")}</span><b class="pso-t"></b></div>${fila("h")}${fila("a")}
      <p class="pso-sum"><span>${esc(H.h.short)}: <b>${pct_("h")}</b></span><span>${esc(H.a.short)}: <b>${pct_("a")}</b></span>${muerte ? `<span class="pso-md">Muerte súbita</span>` : ""}</p></div>
    <div class="pso-body${hayLugar || arqs ? "" : " una"}"><div class="pso-c1">${tiros.length ? `<h4 class="pso-h4">Lanzamiento por lanzamiento</h4><ol class="pso-kicks">${tiros.map(kick).join("")}</ol>` : ""}</div>
    ${hayLugar || arqs ? `<div class="pso-c2">${arqs ? `<h4 class="pso-h4">Arqueros</h4><div class="pso-gks">${arqs}</div>` : ""}
    ${hayLugar ? `<h4 class="pso-h4">Dónde patearon</h4><div class="pso-arcos">${psoArco(tiros, "h", H.h)}${psoArco(tiros, "a", H.a)}</div><p class="note pso-ley"><span class="pso-dot ok"><i></i>Gol</span><span class="pso-dot sv"><i></i>Atajado</span><span class="pso-dot ko"><i></i>Afuera o palo</span><span>El número es la ronda. Según el relato de ESPN.</span></p>` : ""}</div>` : ""}</div>
  </div>`;
}
const ICON = { goal: "⚽", og: "⚽", miss: "✕", yellow: `<i class="ycard"></i>`, red: `<i class="rcard"></i>`, sub: "⇄", other: "•" };
function vLogo(t, cls = "") { const px = /xl/.test(cls) ? 72 : 28, ya = t.logo && LOK.has(IMG(t.logo, px));   // ya cargado: sin fundido (no parpadea al refrescar en vivo)
  return `<span class="vlogo ${cls}">${t.logo ? `<img${isrc(t.logo, px)}${ya ? ` class="ok"` : ""} alt="" decoding="async" referrerpolicy="no-referrer" data-n="${esc(t.short || t.name || "")}" onload="this.classList.add('ok');window.__lok.add(this.getAttribute('src'))" onerror="bfb(this)">` : fbSpan(t.short || t.name, t.abr)}</span>`; }

async function vFillMatch(force) {
  const id = R.id, head = document.getElementById("vc-head"), body = document.getElementById("vc-body");
  if (!head || !body) return;
  let j;
  try { [j] = await Promise.all([vSummary(id, force), vComps(), vSel(), arbDia()]); } catch (e) { head.innerHTML = `<div class="empty">No pude cargar este partido. Prueba de nuevo en un rato.</div>`; return; }
  if (R.v !== "envivo" || R.id !== id) return;
  await vComps();
  const H = vHeader(j), evs = vEvents(j, H), c = VV.byId[H.lid], comp = c ? c.n : H.league, m = vModel(id); VV.state = H.state;
  const goals = l => evs.filter(e => (e.kind === "goal" && e.lado === l) || (e.kind === "og" && e.lado && e.lado !== l)).map(e => `${esc((e.who[0] || "").split(" ").slice(-1)[0])} ${esc(e.min)}${e.kind === "og" ? " (ec)" : e.pen ? " (p)" : ""}`).join(", ");
  const pens = H.h.so != null && H.a.so != null && (H.h.so || H.a.so || /pen/i.test(H.detail) || H.period >= 5);
  const status = H.state === "in" && (/pen|shootout/i.test(H.detail) || H.period >= 5) ? `<span class="vmin live big">Penales</span>` : H.state === "in" ? `<span class="vmin live big">${esc(/half|HT/i.test(H.detail) ? "Entretiempo" : H.clock || H.detail)}</span>` : H.state === "post" ? `<span class="vmin big">${esc(finalEs(H.detail))}</span>` : `<span class="vmin big">${esc(new Date(H.date).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))} · ${hhmm(H.date)}</span>`;
  await vSel();
  const tslug = t => VV.selById[t.id] ? "sel" : H.slug;
  // tras una tanda de penales: el que clasifica se destaca y el otro se atenúa
  const ganP = H.state === "post" && pens && +H.h.so !== +H.a.so ? (+H.h.so > +H.a.so ? "h" : "a") : null;
  const ex = cls => ganP ? (ganP === cls ? " pwin" : " plose") : "";
  const cup = cls => ganP === cls ? `<span class="vh-cup">${ICO.trophy} Clasifica</span>` : "";
  const tl = (t, cls) => tslug(t) && t.id ? `<button class="vhteam tbtn${ex(cls)}" data-go="club" data-liga="${esc(tslug(t))}" data-id="${esc(t.id)}">${vLogo(t, "xl")}<b>${esc(t.short)}</b>${cup(cls)}<small>${goals(cls)}</small></button>` : `<div class="vhteam${ex(cls)}">${vLogo(t, "xl")}<b>${esc(t.short)}</b>${cup(cls)}<small>${goals(cls)}</small></div>`;
  const f = followed()[id];
  head.innerHTML = `<div class="vhcomp">${H.slug ? `<button class="link" data-go="comp" data-liga="${esc(H.slug)}">${esc(comp)}</button>` : esc(comp)}${H.note ? ` · ${esc(H.note)}` : ""}</div>
    <div class="vhrow">${tl(H.h, "h")}
      <div class="vhmid">${H.state === "pre" ? `<span class="vhsc num">vs</span>` : `<span class="vhsc num">${esc(H.h.score ?? 0)} – ${esc(H.a.score ?? 0)}</span>`}${pens ? `<span class="vhpen num">Penales ${esc(H.h.so)} – ${esc(H.a.so)}</span>` : ""}${ganP ? `<span class="vhpen-w">${esc((ganP === "h" ? H.h : H.a).short)} gana en penales</span>` : ""}${status}</div>
      ${tl(H.a, "a")}</div>
    <div class="row" style="justify-content:center;margin-top:10px;gap:8px">${H.state !== "post" ? `<button class="btn ghost sm vbell2${f ? " on" : ""}" data-follow="${esc(id)}">${f ? `${ICO.bell} Siguiendo` : `${ICO.belloff} Avisarme de goles`}</button>` : ""}${m ? `<button class="btn ghost sm" data-go="partido" data-liga="${m.L.id}" data-id="${esc(m.p.id)}">Análisis de Ballytics →</button>` : ""}</div>`;
  const tab = R.tab || "resumen";
  if (tab === "resumen") { body.innerHTML = videosHtml(j) + vShootout(j, H) + (pens && H.state === "in" ? "" : vCurvePanel(j, H, evs, m)) + (H.state !== "post" || true ? voteBox(id, H.date, H.h.short, H.a.short, m ? [m.p.pH, m.p.pD, m.p.pA] : null) : "") + vKeyStats(j, H) + vTimeline(evs, H) + vInfo(j, H, m); hydrateVotes(); }
  const hasXI = (j.rosters || []).some(t => (t.roster || []).some(x => x.starter));
  if (tab === "alineaciones" && !hasXI && m && m.p.xi_prob) { VV.lastPitch = null; body.innerHTML = vPitch({ rosters: xiRosters(m.p.xi_prob), keyEvents: [] }, H, null).replace("<h3>Alineaciones", "<h3>Alineación probable") + `<div class="panel stack">${xiProbNote(m.p.xi_prob, m.p.bajas, k => k === "h" ? H.h.short : H.a.short)}</div>`; }
  else if (tab === "alineaciones") { body.innerHTML = vPitch(j, H, id); loadMatchPlayers(id, H, j).then(ch => { if (ch && R.v === "envivo" && R.id === id && (R.tab || "resumen") === "alineaciones") body.innerHTML = vPitch(j, H, id); }); }
  if (tab === "estadisticas") body.innerHTML = vStats(j, H, m);
  if (tab === "previa") body.innerHTML = vPrevia(j, H, m);
  if (tab === "tabla") { const g = ((j.standings || {}).groups || []).map(x => ({ name: x.header, standings: x.standings }));
    const lives = H.state === "in" ? [{ hId: H.h.id, aId: H.a.id, hs: +H.h.score || 0, as: +H.a.score || 0 }] : [];
    body.innerHTML = !g.length ? `<div class="panel empty">Sin tabla para esta competición.</div>` : lives.length ? liveTableHtml(g, lives, H.slug, [H.h.id, H.a.id]) : stTable(g, [H.h.id, H.a.id], H.slug); }
  if (tab === "minuto") body.innerHTML = vComments(j);
  if (tab === "resumen" || tab === "estadisticas") xgCargar(id, H);
}
const ARB_STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "club", "de", "del", "la", "el", "al", "the", "fk", "sk", "ca", "cr", "u", "sad", "deportivo", "atletico", "sporting", "real", "united", "city", "y"]);
const arbTok = n => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !ARB_STOP.has(w));
const arbIgual = (a, b) => { const A = arbTok(a), B = arbTok(b); return A.some(w => B.some(x => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))); };
async function arbDia() { if (VV.arbDia) return VV.arbDia; try { VV.arbDia = await vget("data/arbitros.json?t=" + Math.floor(Date.now() / 6e5)); } catch (e) { VV.arbDia = {}; } return VV.arbDia; }
// xG en vivo (API-Football vía el servidor de avisos): el id del partido sale de data/arbitros.json
function afIdDeEvento(H) {
  const t = new Date(H.date).getTime(), dias = [-1, 0, 1].map(k => new Date(t + k * DAYMS).toISOString().slice(0, 10));
  for (const d of dias) for (const x of (VV.arbDia || {})[d] || []) if (x[4] && Math.abs(new Date(x[0]).getTime() - t) < 12 * 3600e3 && arbIgual(x[1], H.h.name || H.h.short) && arbIgual(x[2], H.a.name || H.a.short)) return x[4];
  return null;
}
VV.xg = VV.xg || {};
function xgRow(id) {
  const x = VV.xg[id]; if (!x || !x.eq) return "";
  const n = v => v == null || v === "" ? null : parseFloat(String(v).replace("%", ""));
  const rows = [["xg", "xG (goles esperados)", 2], ["area", "Remates dentro del área", 0]].map(([k, lab, d]) => { const a = n(x.eq[0][k]), b = n(x.eq[1][k]); if (a == null || b == null) return "";
    const t = (a + b) || 1; return `<div class="vst xgst"><span class="num ${a > b ? "hi h" : ""}">${dec(a, d)}</span><span class="vsl">${lab}</span><span class="num ${b > a ? "hi a" : ""}">${dec(b, d)}</span>
      <span class="vbars"><span class="vb l"><i style="width:${100 * a / t}%"></i></span><span class="vb r"><i style="width:${100 * b / t}%"></i></span></span></div>`; }).join("");
  return rows ? rows + `<p class="note xgsrc">xG: calidad de las ocasiones según API-Football ${help("Goles esperados (xG): la suma de la probabilidad de gol de cada remate según dónde y cómo fue. Un equipo con más xG creó mejores ocasiones, aunque vaya perdiendo.")}</p>` : "";
}
async function xgCargar(id, H) {
  if (H.state === "pre") return;
  const c = VV.xg[id]; if (c && Date.now() - c.at < (H.state === "in" ? 90e3 : 36e5)) return;
  const f = afIdDeEvento(H), url = f && await pushCfg(); if (!f || !url) return;
  try { const r = await (await fetch(`${url}/xg?f=${f}`)).json(); if (!r.ok || !(r.eq || []).length || r.eq.length < 2) { VV.xg[id] = { at: Date.now() }; return; }
    // el orden de API-Football no siempre es local-visita
    const eq = arbIgual(r.eq[0].team, H.a.name || H.a.short) && !arbIgual(r.eq[0].team, H.h.name || H.h.short) ? [r.eq[1], r.eq[0]] : r.eq;
    VV.xg[id] = { at: Date.now(), eq };
  } catch (e) { VV.xg[id] = { at: Date.now() }; return; }
  if (R.v === "envivo" && R.id === id) document.querySelectorAll(`[data-xg="${CSS.escape(String(id))}"]`).forEach(el => el.innerHTML = xgRow(id));
}
function arbDeEvento(H) {
  const t = new Date(H.date).getTime(), dias = [-1, 0, 1].map(k => new Date(t + k * DAYMS).toISOString().slice(0, 10));
  for (const d of dias) for (const [f, h, a, r] of (VV.arbDia || {})[d] || []) if (Math.abs(new Date(f).getTime() - t) < 12 * 3600e3 && arbIgual(h, H.h.name || H.h.short) && arbIgual(a, H.a.name || H.a.short)) return r;
  return null;
}
function vInfo(j, H, m) {
  const gi = j.gameInfo || {}, v = gi.venue || {}, ref = (gi.officials || [])[0], tv = ((j.broadcasts || [])[0] || {});
  const arb = ref ? (ref.displayName || ref.fullName || "") : (m && m.p.arbitro && m.p.arbitro.n) || (H ? arbDeEvento(H) : null);
  const arbLink = m && m.p.arbitro && m.p.arbitro.pj ? ` <button class="link" data-go="partido" data-liga="${m.L.id}" data-id="${esc(m.p.id)}">ver su análisis →</button>` : "";
  const items = [v.fullName ? `Estadio: <b>${esc(v.fullName)}</b>${v.address && v.address.city ? ` (${esc(v.address.city)})` : ""}` : "", arb ? `Árbitro: <b>${esc(arb)}</b>${arbLink}` : "", gi.attendance ? `Público: <b>${Number(gi.attendance).toLocaleString("es-CL")}</b>` : ""].filter(Boolean);
  return items.length ? `<div class="panel stack"><h3>Información</h3><p class="note" style="font-size:14px">${items.join(" · ")}</p></div>` : "";
}
function vPrevia(j, H, m) {
  const L5 = j.lastFiveGames || [];
  const form = t => { const g = L5.find(x => String((x.team || {}).id) === t.id); const ev = (g && g.events) || [];
    return ev.length ? `<div class="pform">${ev.map(e => { const r = (e.gameResult || "").toUpperCase(), cl = r === "W" ? "G" : r === "L" ? "P" : r === "D" ? "E" : "";
      return `<div class="vfr"><span class="form"><i class="${cl}">${cl || "·"}</i></span><span class="num">${esc(e.score || "")}</span><span>${esc(e.atVs || "")} ${esc((e.opponent || {}).displayName || (e.opponent || {}).abbreviation || "")}</span><small class="faint">${e.gameDate ? esc(new Date(e.gameDate).toLocaleDateString("es-CL", { day: "numeric", month: "short" })) : ""}</small></div>`; }).join("")}</div>` : `<p class="note">Sin datos.</p>`; };
  const pc = (j.pickcenter || [])[0];
  const odds = pc && pc.homeTeamOdds && pc.awayTeamOdds ? `<div class="panel stack"><h3>Cuotas (${esc((pc.provider || {}).name || "")})</h3><p class="note" style="font-size:14px">${esc(H.h.short)}: <b>${esc(pc.homeTeamOdds.moneyLine ?? "")}</b> · Empate: <b>${esc((pc.drawOdds || {}).moneyLine ?? "")}</b> · ${esc(H.a.short)}: <b>${esc(pc.awayTeamOdds.moneyLine ?? "")}</b>${pc.overUnder ? ` · Más/menos ${esc(pc.overUnder)}` : ""}</p><p class="note">Formato americano. Solo informativo.</p></div>` : "";
  return (m ? `<div class="panel stack"><h3>Probabilidad Ballytics</h3><div class="hero-p">${bar3(m.p.pH, m.p.pD, m.p.pA)}</div><div class="nums vpn"><span><b>${pct(m.p.pH)}</b> ${esc(H.h.short)}</span><span>${pct(m.p.pD)} empate</span><span>${esc(H.a.short)} <b>${pct(m.p.pA)}</b></span></div><button class="link" data-go="partido" data-liga="${m.L.id}" data-id="${esc(m.p.id)}">Ver el análisis completo →</button></div>` : "")
    + `<div class="grid2"><div class="panel stack"><h3>Últimos partidos de ${esc(H.h.short)}</h3>${form(H.h)}</div><div class="panel stack"><h3>Últimos partidos de ${esc(H.a.short)}</h3>${form(H.a)}</div></div>` + odds;
}

/* probabilidad en vivo: goles que faltan según el tiempo restante (Poisson) + marcador actual */
function vProbPanel(m, H) {
  const p = m.p, L = m.L, min = minOf(H), hs = +H.h.score || 0, as = +H.a.score || 0;
  if (H.state === "pre") return "";
  const f = H.state === "post" ? 0 : Math.max(0, (92 - min) / 92), lh = (p.lh || 1.3) * f, la = (p.la || 1.1) * f;
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= 10; i++) for (let k = 0; k <= 10; k++) { const q = pois(i, lh) * pois(k, la), x = hs + i, y = as + k; if (x > y) pH += q; else if (x === y) pD += q; else pA += q; }
  const s = pH + pD + pA; pH /= s; pD /= s; pA /= s;
  const H1 = corto(L, p.home), A1 = corto(L, p.away);
  return `<div class="panel stack"><h3>Probabilidad en vivo ${help("Parte de la probabilidad Ballytics antes del partido y considera el marcador actual y los minutos que quedan: los goles que faltan se reparten según los goles esperados de cada equipo. No considera expulsiones ni el dominio del partido.")}</h3>
    <div class="hero-p">${bar3(pH, pD, pA)}</div><div class="nums vpn"><span><b>${pct(pH)}</b> ${esc(H1)}</span><span>${pct(pD)} empate</span><span>${esc(A1)} <b>${pct(pA)}</b></span></div>
    <p class="note">Antes del partido: ${pct(p.pH)} · ${pct(p.pD)} · ${pct(p.pA)}${H.state === "in" ? ` · minuto ${min}` : ""}.</p></div>`;
}

function vStatRows(j, H, only) {
  const T = (j.boxscore || {}).teams || [], th = T.find(t => String((t.team || {}).id) === H.h.id) || T[1] || {}, ta = T.find(t => String((t.team || {}).id) === H.a.id) || T[0] || {};
  const get = (t, k) => { const s = (t.statistics || []).find(x => x.name === k); return s ? s.displayValue : null; };
  return STATS.filter(([k]) => !only || only.includes(k)).map(([k, n, u]) => {
    let a = get(th, k), b = get(ta, k); if (a == null || b == null) return "";
    let va = parseFloat(a), vb = parseFloat(b); if (k === "passPct" && va <= 1 && vb <= 1) { va *= 100; vb *= 100; a = Math.round(va); b = Math.round(vb); }
    const t = (va + vb) || 1, fa = u ? `${a}%` : a, fb = u ? `${b}%` : b;
    return `<div class="vst"><span class="num ${va > vb ? "hi h" : ""}">${esc(fa)}</span><span class="vsl">${n}</span><span class="num ${vb > va ? "hi a" : ""}">${esc(fb)}</span>
      <span class="vbars"><span class="vb l"><i style="width:${100 * va / t}%"></i></span><span class="vb r"><i style="width:${100 * vb / t}%"></i></span></span></div>`;
  }).join("");
}
function vKeyStats(j, H) { const r = vStatRows(j, H, KEY); return r ? `<div class="panel stack"><h3>Estadísticas importantes</h3><div data-xg="${esc(R.id)}">${xgRow(R.id)}</div>${r}<button class="link" data-go="envivo" data-id="${esc(R.id)}" data-tab="estadisticas" data-keep>Todas las estadísticas →</button></div>` : ""; }
function seasonCmp(L, home, away) {
  const s1 = statOf(L, home), s2 = statOf(L, away);
  return [["Goles por partido", "gf", 2], ["Goles recibidos", "gc", 2], ["Tiros al arco", "tiros_arco", 1], ["Córners", "corners", 1], ["Posesión (%)", "posesion", 0], ["Tarjetas", "tarjetas", 1], ["Ambos marcan", "ambos", -1], ["Más de 2,5 goles", "over25", -1]]
    .filter(([, key]) => s1[key] != null && s2[key] != null)
    .map(([n, key, d]) => { const a = s1[key], b = s2[key], t = (a + b) || 1, f = v => d === -1 ? pct(v) : dec(v, d);
      return `<div class="cmp"><span class="num">${f(a)}</span><span class="cl"><i style="width:${100 * a / t}%"></i></span><span class="lbl">${n}</span><span class="cr"><i style="width:${100 * b / t}%"></i></span><span class="num">${f(b)}</span></div>`; }).join("");
}
function vPreStats(j, H, m) {
  // antes del partido: promedios de la temporada (modelo de Ballytics) o, si no, forma y tabla de ESPN
  let out = "";
  if (m) { const c = seasonCmp(m.L, m.p.home, m.p.away); if (c) out += `<div class="panel stack"><h3>Promedios de la temporada</h3><div class="cmph"><span>${vLogo(H.h, "sm")} ${esc(H.h.short)}</span><span>${esc(H.a.short)} ${vLogo(H.a, "sm")}</span></div>${c}<p class="note">Promedios por partido en ${esc(m.L.nombre)}. Las estadísticas del partido aparecen cuando empieza.</p></div>`; }
  const ent = id => { for (const g of ((j.standings || {}).groups || [])) for (const e of ((g.standings || {}).entries || [])) if (String(e.id || (e.team && e.team.id)) === String(id)) return e; return null; };
  const st = (e, k) => { const x = e && (e.stats || []).find(s => s.name === k || s.type === k); return x ? +(x.value ?? x.displayValue) : null; };
  const eh = ent(H.h.id), ea = ent(H.a.id);
  if (!out && eh && ea) {
    const rows = [["Puntos", "points", 0], ["Partidos jugados", "gamesPlayed", 0], ["Diferencia de gol", "pointDifferential", 0]].map(([n, k]) => { const a = st(eh, k), b = st(ea, k); if (a == null || b == null) return ""; const t = Math.abs(a) + Math.abs(b) || 1;
      return `<div class="cmp"><span class="num">${a}</span><span class="cl"><i style="width:${100 * Math.abs(a) / t}%"></i></span><span class="lbl">${n}</span><span class="cr"><i style="width:${100 * Math.abs(b) / t}%"></i></span><span class="num">${b}</span></div>`; }).join("");
    if (rows) out += `<div class="panel stack"><h3>En la tabla</h3><div class="cmph"><span>${vLogo(H.h, "sm")} ${esc(H.h.short)}</span><span>${esc(H.a.short)} ${vLogo(H.a, "sm")}</span></div>${rows}</div>`;
  }
  const l5 = id => ((j.lastFiveGames || []).find(t => String((t.team || {}).id) === String(id)) || {}).events || [];
  const formRow = (t, evs) => evs.length ? `<div class="pform"><span class="pform-t">${vLogo(t, "sm")}<b>${esc(t.short)}</b></span><span class="form">${evs.slice(0, 5).map(e => { const r = (e.gameResult || "").toUpperCase(), c = r === "W" ? "G" : r === "L" ? "P" : r === "D" ? "E" : ""; return `<i class="${c}" title="${esc((e.atVs || "") + " " + ((e.opponent || {}).displayName || "") + " " + (e.score || ""))}">${c || "·"}</i>`; }).join("")}</span></div>` : "";
  const f1 = formRow(H.h, l5(H.h.id)), f2 = formRow(H.a, l5(H.a.id));
  if (f1 || f2) out += `<div class="panel stack"><h3>Últimos 5 partidos</h3>${f1}${f2}</div>`;
  return out || `<div class="panel stack"><h3>Estadísticas</h3><p class="note">Las estadísticas aparecen cuando empieza el partido.</p></div>`;
}
function vStats(j, H, m) { const r = vStatRows(j, H); if (!r && H.state === "pre") return vPreStats(j, H, m); return `<div class="panel stack"><h3>Estadísticas</h3><div data-xg="${esc(R.id)}">${xgRow(R.id)}</div>${r || `<p class="note">Todavía no hay estadísticas de este partido.</p>`}</div>`; }
function vTimeline(evs, H) {
  if (!evs.length) return `<div class="panel stack"><h3>Incidencias</h3><p class="note">${H.state === "pre" ? "El partido aún no empieza." : "Sin goles ni tarjetas por ahora."}</p></div>`;
  return `<div class="panel stack"><h3>Incidencias</h3><div class="vtl">${evs.slice().reverse().map(e => `<div class="vev ${e.lado}"><span class="vem num">${esc(e.min)}</span><span class="vei ${e.kind}">${ICON[e.kind]}</span><span class="vew"><b>${esc(e.who[0] || "")}</b>${e.kind === "sub" && e.who[1] ? `<small>sale ${esc(e.who[1])}</small>` : e.kind === "goal" && e.who[1] ? `<small>asistencia ${esc(e.who[1])}</small>` : e.kind === "og" ? "<small>en contra</small>" : ""}</span></div>`).join("")}</div></div>`;
}
function vComments(j) {
  const c = (j.commentary || []).slice().reverse().slice(0, 120);
  return `<div class="panel stack"><h3>Minuto a minuto</h3>${c.length ? `<div class="vcm">${c.map(x => `<div><span class="num vem">${esc((x.time || {}).displayValue || "")}</span><span>${esc(x.text || "")}</span></div>`).join("")}</div><p class="note">Relato de ESPN (en inglés).</p>` : `<p class="note">Sin relato disponible para este partido.</p>`}</div>`;
}

/* alineación en la cancha según la formación */
function lineRank(ab) { ab = (ab || "").toUpperCase();
  if (ab === "G" || ab === "GK") return 0;
  if (ab === "D" || /^(CD|CB|LB|RB|LWB|RWB|SW)(-|$)/.test(ab)) return 1;
  if (/^(DM|CDM)(-|$)/.test(ab)) return 2;
  if (ab === "M" || /^(CM|LM|RM)(-|$)/.test(ab)) return 3;
  if (/^(AM|CAM|LW|RW|SS)(-|$)/.test(ab)) return 4;
  return 5; }
/* de izquierda a derecha: lateral/extremo izquierdo, centro-izquierda, centro, centro-derecha, lateral/extremo derecho */
const lineSide = ab => { ab = (ab || "").toUpperCase(); return /^(LB|LWB|LM|LW|LF)$/.test(ab) ? 0 : /-L$/.test(ab) ? 1 : /^(RB|RWB|RM|RW|RF)$/.test(ab) ? 4 : /-R$/.test(ab) ? 3 : 2; };
function vPitch(j, H, mid) {
  const PM = (VV.afp && VV.afp[mid] && VV.afp[mid].map) || {};
  const ros = (j.rosters || []).filter(t => (t.roster || []).some(x => x.starter));
  if (!ros.length) return `<div class="panel stack"><h3>Alineaciones</h3><p class="note">Aún no publicadas. Suelen salir cerca de una hora antes del partido.</p></div>`;
  const lado = VV.team === "a" ? "away" : "home", T = ros.find(t => t.homeAway === lado) || ros[0], team = T.homeAway === "home" ? H.h : H.a;
  const Lf = { equipos: { [team.name]: { color: team.color, logo: team.logo } } };
  const st = (T.roster || []).filter(x => x.starter), subs = (T.roster || []).filter(x => !x.starter);
  const gk = st.filter(x => lineRank((x.position || {}).abbreviation) === 0), out = st.filter(x => lineRank((x.position || {}).abbreviation) !== 0)
    .sort((a, b) => lineRank((a.position || {}).abbreviation) - lineRank((b.position || {}).abbreviation) || lineSide((a.position || {}).abbreviation) - lineSide((b.position || {}).abbreviation) || (a.formationPlace || 0) - (b.formationPlace || 0));
  let rowsN = String(T.formation || "").split("-").map(n => parseInt(n, 10)).filter(n => n > 0);
  if (rowsN.reduce((s, n) => s + n, 0) !== out.length) { const g = {}; out.forEach(x => { const r = lineRank((x.position || {}).abbreviation); g[r] = (g[r] || 0) + 1; }); rowsN = Object.keys(g).sort().map(k => g[k]); }
  const rows = [gk.length ? gk : st.slice(0, 1)]; let i = 0; rowsN.forEach(n => { rows.push(out.slice(i, i + n)); i += n; });
  const ev = (j.keyEvents || []);
  const chip = x => { const a = x.athlete || {}, id = String(a.id || ""), nm = a.shortName || a.displayName || "";
    const g = ev.filter(e => /goal|scored/i.test((e.type || {}).type || "") && !/own/i.test((e.type || {}).type || "") && ((e.participants || [])[0] || {}).athlete && String(e.participants[0].athlete.id) === id).length;
    const card = ev.some(e => /red/i.test((e.type || {}).type || "") && ((e.participants || [])[0] || {}).athlete && String(e.participants[0].athlete.id) === id) ? "red" : ev.some(e => /yellow/i.test((e.type || {}).type || "") && ((e.participants || [])[0] || {}).athlete && String(e.participants[0].athlete.id) === id) ? "yellow" : "";
    const af = PM[id];
    return `<button class="vpl" data-pm="${esc(id)}" data-mid="${esc(mid || "")}">${face(Lf, team.name, id, a.displayName, "lg", af && af.foto)}<span class="vjn num">${esc(x.jersey || "")}</span>${af && af.r ? `<span class="vrt" style="background:${rtColor(af.r)}">${af.r.toFixed(1)}</span>` : ""}${g ? `<span class="vgl">${"⚽".repeat(Math.min(g, 3))}</span>` : ""}${card ? `<i class="${card === "red" ? "rcard" : "ycard"} vcd"></i>` : ""}${x.subbedOut ? `<span class="vso">⇄</span>` : ""}<b>${esc(nm.split(" ").slice(-1)[0] || nm)}</b></button>`; };
  const pitch = `<div class="vpitch"><div class="vlines"><i class="c"></i><i class="b t"></i><i class="b bt"></i></div>${rows.slice().reverse().map(r => `<div class="vprow">${r.map(chip).join("")}</div>`).join("")}</div>`;
  return `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>Alineaciones ${T.formation ? `<span class="tag">${esc(T.formation)}</span>` : ""}</h3>
      <div class="tabs2" role="group" aria-label="Equipo">${[["h", H.h], ["a", H.a]].map(([k, t]) => `<button data-vteam="${k}" aria-pressed="${(VV.team === "a" ? "a" : "h") === k}">${esc(t.short)}</button>`).join("")}</div></div>
    ${pitch}
    ${pmNote(mid, H)}
    ${subs.length ? `<h3 style="margin-top:6px">Suplentes</h3><div class="vsubs">${subs.map(x => { const sid = String((x.athlete || {}).id || ""), af = PM[sid]; return `<button class="vsb ${x.subbedIn ? "in" : ""}" data-pm="${esc(sid)}" data-mid="${esc(mid || "")}"><span class="num vjn2">${esc(x.jersey || "")}</span>${face(Lf, team.name, sid, (x.athlete || {}).displayName, "sm", af && af.foto)}<span>${esc((x.athlete || {}).displayName || "")}</span>${x.subbedIn ? `<small>entró</small>` : ""}${af && af.r && af.min ? `<span class="vrt sm" style="background:${rtColor(af.r)}">${af.r.toFixed(1)}</span>` : ""}</button>`; }).join("")}</div>` : ""}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-vteam]"); if (!b) return; VV.team = b.dataset.vteam;
  const lp = VV.lastPitch; if (lp && R.v !== "envivo" && document.getElementById(lp.box)) { document.getElementById(lp.box).innerHTML = lp.render(); return; } vFillMatch(); });
/* alineación probable: los titulares del último partido de cada equipo (lo arma el robot) */
function xiRosters(xp) {
  return ["h", "a"].filter(k => xp && xp[k]).map(k => ({ homeAway: k === "h" ? "home" : "away", formation: xp[k].formacion,
    roster: xp[k].xi.map(x => ({ starter: true, jersey: x.c, athlete: { id: x.id, displayName: x.n, shortName: x.n }, position: { abbreviation: x.pos }, formationPlace: x.fp })) }));
}
function xiProbNote(xp, bajas, nameOf) {
  const d = ["h", "a"].filter(k => xp[k] && xp[k].desde).map(k => `${esc(nameOf(k))}: titulares contra ${esc(xp[k].desde.rival)} (${fecha(xp[k].desde.fecha + "T12:00")})`).join(" · ");
  const ids = new Set(["h", "a"].flatMap(k => xp[k] ? xp[k].xi.map(x => String(x.id)) : []));
  const out = (bajas || []).filter(b => b.jid && ids.has(String(b.jid))).map(b => esc(b.jugador || b.nombre || ""));
  return `<p class="note"><b>Alineación probable</b>, todavía no es la oficial: se toma el once inicial del último partido de cada equipo. ${d}.${out.length ? ` <span class="warn">Ojo: ${out.join(", ")} ${out.length === 1 ? "está" : "están"} en la lista de bajas.</span>` : ""} La oficial sale cerca de una hora antes del partido.</p>`;
}
function modelH(L, p) { const mk = t => { const i = info(L, t); return { id: "", name: t, short: corto(L, t), color: i.color, logo: i.logo }; }; return { h: mk(p.home), a: mk(p.away), state: "pre" }; }

/* ================= v14: probabilidad durante el partido, tabla en vivo, "¿Quién gana?", fichas, videos, prode ================= */
function myUid() { let u = lsGet("bt_uid", null); if (!u) { u = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet("bt_uid", u); } return u; }
const PREFS_DEF = { gol: 1, roja: 1, inicio: 1, final: 1, alin: 1, prev: 1 };
const myPrefs = () => ({ ...PREFS_DEF, ...lsGet("bt_prefs", {}) });

/* ---------- probabilidad minuto a minuto ---------- */
function outcome3(hs, as, lh, la) {
  let H = 0, X = 0, A = 0;
  for (let i = 0; i <= 10; i++) { const pi = pois(i, lh); for (let k = 0; k <= 10; k++) { const q = pi * pois(k, la), x = hs + i, y = as + k; if (x > y) H += q; else if (x === y) X += q; else A += q; } }
  const s = H + X + A || 1; return { H: H / s, D: X / s, A: A / s };
}
const parseMin = s => { const m = String(s || "").match(/(\d+)\s*'?\s*(?:\+\s*(\d+))?/); return m ? +m[1] + (m[2] ? Math.min(+m[2], 15) / 16 : 0) : 0; };
function lambdasFromProbs(pH, pA) {
  let best = [1.45, 1.15], bd = 1e9;
  for (let lh = 0.3; lh <= 3.4; lh += 0.05) for (let la = 0.2; la <= 3.0; la += 0.05) {
    const o = outcome3(0, 0, lh, la), d = (o.H - pH) ** 2 + (o.A - pA) ** 2; if (d < bd) { bd = d; best = [lh, la]; } }
  return best;
}
function preLambdas(j, m) {
  if (m && m.p.lh) return { lh: m.p.lh, la: m.p.la, src: "Ballytics" };
  const pc = (j.pickcenter || [])[0], am = x => { x = +x; return !x ? null : x > 0 ? 1 + x / 100 : 1 + 100 / -x; };
  if (pc && pc.homeTeamOdds && pc.awayTeamOdds) {
    const h = am(pc.homeTeamOdds.moneyLine), a = am(pc.awayTeamOdds.moneyLine), d = am((pc.drawOdds || {}).moneyLine);
    if (h && a && d) { const s = 1 / h + 1 / a + 1 / d, [lh, la] = lambdasFromProbs(1 / h / s, 1 / a / s); return { lh, la, src: `cuota de ${(pc.provider || {}).name || "la casa"}` }; }
  }
  return { lh: 1.45, la: 1.15, src: "promedio de la liga" };
}
function curveData(lh, la, evs, minNow, done) {
  const goals = evs.filter(e => e.kind === "goal" || e.kind === "og").map(e => ({ m: parseMin(e.min), side: e.kind === "og" ? (e.lado === "h" ? "a" : "h") : e.lado, who: e.who[0] || "" })).filter(g => g.side);
  const reds = evs.filter(e => e.kind === "red").map(e => ({ m: parseMin(e.min), side: e.lado, who: e.who[0] || "" })).filter(r => r.side);
  const end = done ? Math.max(90, Math.ceil(minNow)) : Math.max(1, Math.ceil(minNow)), pts = [];
  for (let m = 0; m <= end; m++) {
    const hs = goals.filter(g => g.side === "h" && g.m <= m).length, as = goals.filter(g => g.side === "a" && g.m <= m).length;
    let fh = 1, fa = 1; reds.forEach(r => { if (r.m <= m) { if (r.side === "h") { fh *= 0.72; fa *= 1.18; } else { fa *= 0.72; fh *= 1.18; } } });
    const rem = done && m === end ? 0 : Math.max(0, (93 - m) / 93);
    pts.push({ m, ...outcome3(hs, as, lh * rem * fh, la * rem * fa) });
  }
  return { pts, goals, reds, end };
}
function curveSvg(cd, H1, A1) {
  const sm = matchMedia("(max-width:600px)").matches, W = sm ? 360 : 900, Hh = sm ? 230 : 250, pl = 34, pr = 10, pt = 26, pb = 22, end = Math.max(cd.end, 90);
  const x = m => pl + (m / end) * (W - pl - pr), y = v => pt + (1 - v) * (Hh - pt - pb);
  const P = cd.pts, band = (lo, hi) => `${P.map(p => `${x(p.m).toFixed(1)},${y(hi(p)).toFixed(1)}`).join(" ")} ${P.slice().reverse().map(p => `${x(p.m).toFixed(1)},${y(lo(p)).toFixed(1)}`).join(" ")}`;
  let s = `<svg class="curve" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Probabilidad durante el partido">
    <defs><linearGradient id="gH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pitch)" stop-opacity=".95"/><stop offset="1" stop-color="var(--pitch)" stop-opacity=".55"/></linearGradient>
    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--away)" stop-opacity=".55"/><stop offset="1" stop-color="var(--away)" stop-opacity=".95"/></linearGradient></defs>`;
  [0, .25, .5, .75, 1].forEach(v => { s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="cg"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="ct">${v * 100}%</text>`; });
  [0, 15, 30, 45, 60, 75, 90].filter(m => m <= end).forEach(m => { s += `<text x="${x(m)}" y="${Hh - 6}" text-anchor="middle" class="ct">${m}'</text>`; });
  s += `<line x1="${x(45)}" x2="${x(45)}" y1="${pt}" y2="${Hh - pb}" class="cht"/>`;
  s += `<polygon points="${band(p => 0, p => p.H)}" fill="url(#gH)"/><polygon points="${band(p => p.H, p => p.H + p.D)}" fill="var(--draw)" opacity=".75"/><polygon points="${band(p => p.H + p.D, p => 1)}" fill="url(#gA)"/>`;
  cd.goals.forEach(g => { const gx = x(Math.min(g.m, end)); s += `<line x1="${gx}" x2="${gx}" y1="${pt - 4}" y2="${Hh - pb}" class="cgl"/><g class="cmark ${g.side}"><circle cx="${gx}" cy="${pt - 13}" r="9"/><text x="${gx}" y="${pt - 9.5}" text-anchor="middle">⚽</text><title>${esc(g.who)} ${Math.floor(g.m)}'</title></g>`; });
  cd.reds.forEach(r => { const rx = x(Math.min(r.m, end)); s += `<rect x="${rx - 4}" y="${pt - 19}" width="8" height="11" rx="1.5" class="cred"><title>Roja: ${esc(r.who)} ${Math.floor(r.m)}'</title></rect>`; });
  const last = P[P.length - 1];
  if (last && last.m < end) s += `<line x1="${x(last.m)}" x2="${x(last.m)}" y1="${pt}" y2="${Hh - pb}" class="cnow"/>`;
  return s + `</svg>`;
}
function vCurvePanel(j, H, evs, m) {
  const L0 = preLambdas(j, m), done = H.state === "post", min = done ? 95 : minOf(H);
  const cd = curveData(L0.lh, L0.la, evs, H.state === "pre" ? 0 : min, done), last = cd.pts[cd.pts.length - 1], pre = cd.pts[0];
  const H1 = H.h.short, A1 = H.a.short;
  return `<div class="panel stack cpanel"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>${H.state === "pre" ? "Probabilidad antes del partido" : done ? "Cómo cambió la probabilidad" : "Probabilidad en vivo"} ${help("Se parte de los goles esperados antes del partido y, minuto a minuto, se considera el marcador y el tiempo que queda: los goles que faltan se reparten según los goles esperados de cada equipo. Una tarjeta roja baja los goles esperados de ese equipo y sube los del rival.")}</h3><span class="note">Base: ${esc(L0.src)}</span></div>
    <div class="cnums"><span class="h"><b>${pct(last.H)}</b>${esc(H1)}</span><span class="d"><b>${pct(last.D)}</b>Empate</span><span class="a"><b>${pct(last.A)}</b>${esc(A1)}</span></div>
    ${H.state === "pre" ? "" : curveSvg(cd, H1, A1)}
    ${done && H.h.so != null && H.a.so != null && +H.h.so !== +H.a.so ? `<div class="cpen">El resultado (1X2) se define en el tiempo reglamentario: <b>empate</b>. Clasificó <b>${esc(+H.h.so > +H.a.so ? H1 : A1)}</b>, que ganó ${Math.max(+H.h.so, +H.a.so)}–${Math.min(+H.h.so, +H.a.so)} en los penales.</div>` : ""}
    <p class="note">${H.state === "pre" ? "" : `Antes del partido: ${pct(pre.H)} · ${pct(pre.D)} · ${pct(pre.A)}.`} No considera el dominio ni las ocasiones; solo marcador, minutos y expulsiones.</p></div>`;
}

/* ---------- tabla en vivo ---------- */
function liveEntries(entries, lives) {
  const val = (e, k) => { const s = (e.stats || []).find(x => x.name === k); return s ? +(s.value ?? parseFloat(s.displayValue)) || 0 : 0; };
  const rows = entries.map((e, i) => { const t = typeof e.team === "string" ? { displayName: e.team, id: e.id } : (e.team || {});
    return { e, t, id: String(t.id || e.id || ""), prev: +val(e, "rank") || i + 1, pj: val(e, "gamesPlayed"), g: val(e, "wins"), d: val(e, "ties"), l: val(e, "losses"), gf: val(e, "pointsFor"), gc: val(e, "pointsAgainst"), pts: val(e, "points"), live: null }; });
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  lives.forEach(x => { const a = by[x.hId], b = by[x.aId]; if (!a || !b) return;
    [[a, x.hs, x.as], [b, x.as, x.hs]].forEach(([r, f, c]) => { r.pj++; r.gf += f; r.gc += c; if (f > c) { r.g++; r.pts += 3; } else if (f === c) { r.d++; r.pts += 1; } else r.l++; r.live = `${f}-${c}`; }); });
  rows.sort((p, q) => q.pts - p.pts || (q.gf - q.gc) - (p.gf - p.gc) || q.gf - p.gf || p.prev - q.prev);
  rows.forEach((r, i) => r.pos = i + 1);
  return rows;
}
function liveTableHtml(groups, lives, slug, hi = []) {
  return groups.map(g => {
    const E = (g.standings || {}).entries || []; if (!E.length) return "";
    const R0 = liveEntries(E, lives);
    return `<div class="panel flush scroll">${g.name && groups.length > 1 ? `<div class="ph"><h3>${esc(g.name)}</h3></div>` : ""}<table class="t vstt live"><thead><tr><th>#</th><th></th><th>Equipo</th><th class="n">PJ</th><th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n hide-m">GF</th><th class="n hide-m">GC</th><th class="n">DG</th><th class="n">Pts</th></tr></thead><tbody>${R0.map(r => {
      const mv = r.prev - r.pos, logo = ((r.t.logos || [])[0] || {}).href, col = r.e.note && r.e.note.color ? `style="box-shadow:inset 3px 0 0 ${esc(r.e.note.color)}"` : "";
      return `<tr class="${hi.includes(r.id) ? "hl" : ""}${r.live ? " isl" : ""}"><td ${col}><span class="pos">${r.pos}</span></td><td class="mv">${mv > 0 ? `<span class="up">▲${mv}</span>` : mv < 0 ? `<span class="dn">▼${-mv}</span>` : ""}</td>
        <td class="vtm">${slug && r.id ? `<button class="link tlink" data-go="club" data-liga="${esc(slug)}" data-id="${esc(r.id)}">` : "<span>"}${logo ? `<img class="tlogo"${isrc(logo, 24)} alt="" loading="lazy" referrerpolicy="no-referrer" data-n="${esc(r.t.shortDisplayName || r.t.displayName || "")}" onerror="bfb(this)">` : ""}${esc(r.t.shortDisplayName || r.t.displayName || "")}${slug && r.id ? "</button>" : "</span>"}${r.live ? `<span class="lvb">${r.live}</span>` : ""}</td>
        <td class="n">${r.pj}</td><td class="n hide-m">${r.g}</td><td class="n hide-m">${r.d}</td><td class="n hide-m">${r.l}</td><td class="n hide-m">${r.gf}</td><td class="n hide-m">${r.gc}</td><td class="n">${r.gf - r.gc > 0 ? "+" : ""}${r.gf - r.gc}</td><td class="n"><b>${r.pts}</b></td></tr>`; }).join("")}</tbody></table></div>`;
  }).join("") + `<p class="note"><span class="lvb">1-0</span> marcador en vivo. La tabla se recalcula como si los partidos terminaran ahora.</p>`;
}

/* ---------- ¿Quién gana? ---------- */
const voteBox = (id, k, h, a, mp) => `<div class="vote panel" data-vote="${esc(id)}" data-k="${esc(k || "")}" data-h="${esc(h)}" data-a="${esc(a)}" data-m="${mp ? mp.map(x => (+x).toFixed(4)).join(",") : ""}"><div class="vq"><h3>¿Quién gana?</h3><span class="note">Cargando votos…</span></div></div>`;
async function hydrateVotes() {
  const els = [...document.querySelectorAll("[data-vote]:not([data-ok])")]; if (!els.length) return;
  const url = await pushCfg(); if (!url) { els.forEach(e => e.remove()); return; }
  els.forEach(e => e.dataset.ok = "1");
  let data = {};
  try { data = await vget(`${url}/votos?ids=${els.map(e => e.dataset.vote).join(",")}&uid=${encodeURIComponent(myUid())}`); } catch (e) { els.forEach(x => x.remove()); return; }
  els.forEach(el => paintVote(el, data[el.dataset.vote] || { H: 0, D: 0, A: 0, n: 0 }));
}
function paintVote(el, v) {
  const open = !el.dataset.k || Date.now() < new Date(el.dataset.k).getTime(), mio = v.mio, n = v.n || 0;
  const m = el.dataset.m ? el.dataset.m.split(",").map(Number) : null, lab = { H: el.dataset.h, D: "Empate", A: el.dataset.a };
  const sh = k => n ? v[k] / n : 0;
  const btns = open ? `<div class="vbtns">${["H", "D", "A"].map(k => `<button class="vbtn${mio === k ? " on" : ""}" data-votar="${k}">${esc(lab[k])}</button>`).join("")}</div>` : "";
  const bars = (mio || !open) && n ? `<div class="vres">${["H", "D", "A"].map((k, i) => `<div class="vr"><span class="vl">${esc(lab[k])}</span><div class="vtbs">
      <div class="vtb"><span class="vbarw"><i class="g" style="width:${100 * sh(k)}%"></i></span><b class="num">${pct(sh(k))}</b></div>${m ? `<div class="vtb"><span class="vbarw"><i class="b" style="width:${100 * m[i]}%"></i></span><b class="num bt">${pct(m[i])}</b></div>` : ""}</div></div>`).join("")}
      <div class="vleg"><span><i class="g"></i>La gente (${n} ${n === 1 ? "voto" : "votos"})</span>${m ? `<span><i class="b"></i>Ballytics</span>` : ""}</div></div>` : "";
  el.innerHTML = `<div class="vq"><h3>¿Quién gana?</h3><span class="note">${open ? (mio ? "Tu voto quedó guardado; puedes cambiarlo hasta que empiece." : "Vota y compara con la gente y con Ballytics.") : "Votación cerrada."}</span></div>${btns}${bars || (!n && !open ? `<p class="note">Nadie votó en este partido.</p>` : "")}`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-votar]"); if (!b) return;
  const el = b.closest("[data-vote]"), url = await pushCfg(); if (!el || !url) return;
  e.stopPropagation(); el.querySelectorAll(".vbtn").forEach(x => x.disabled = true);
  try {
    const r = await fetch(url + "/voto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: el.dataset.vote, v: b.dataset.votar, uid: myUid(), k: el.dataset.k }) });
    const j = await r.json(); if (j.ok) paintVote(el, { ...j.votos, n: j.votos.H + j.votos.D + j.votos.A, mio: j.mio }); else toast(j.error || "No se pudo votar.");
  } catch (x) { toast("No se pudo votar. Revisa tu conexión."); el.querySelectorAll(".vbtn").forEach(x => x.disabled = false); }
}, true);

/* ---------- ficha de jugador (cualquier jugador de ESPN) ---------- */
const ESPN_C = "https://site.api.espn.com/apis/common/v3/sports/soccer";
const POS_ES = { Forward: "Delantero", Midfielder: "Mediocampista", Defender: "Defensa", Goalkeeper: "Arquero", "Attacking Midfielder": "Volante ofensivo", "Defensive Midfielder": "Volante defensivo", "Center Back": "Defensa central", "Left Back": "Lateral izquierdo", "Right Back": "Lateral derecho", Striker: "Centrodelantero", Winger: "Extremo" };
const toM = s => { const m = String(s || "").match(/(\d+)'\s*(\d+)/); return m ? ((+m[1] * 12 + +m[2]) * 0.0254).toFixed(2).replace(".", ",") + " m" : s || ""; };
const toKg = s => { const m = String(s || "").match(/(\d+)/); return m ? Math.round(+m[1] * 0.4536) + " kg" : s || ""; };
const ficha = (id, html) => /^\d+$/.test(String(id || "")) ? `<button class="link flink" data-go="ficha" data-id="${esc(id)}">${html}</button>` : html;
function vFicha() {
  setTimeout(() => vFillFicha(R.id), 0);
  return `<section class="view"><button class="back" onclick="history.back()">← Volver</button><div id="fi-box"><div class="panel empty">Cargando jugador…</div></div></section>`;
}
async function vFillFicha(id) {
  const box = document.getElementById("fi-box"); if (!box) return;
  let a, o, g;
  try { [a, o, g] = await Promise.all([vget(`${ESPN_C}/athletes/${id}`), vget(`${ESPN_C}/athletes/${id}/overview`).catch(() => null), vget(`${ESPN_C}/athletes/${id}/gamelog`).catch(() => null)]); }
  catch (e) { box.innerHTML = `<div class="panel empty">No encontré a este jugador.</div>`; return; }
  if (R.v !== "ficha" || R.id !== id) return;
  const A = a.athlete || {}, st = (o && o.statistics) || {}, names = st.names || [], t = A.team || {};
  const splits = (st.splits || []), dom = splits.find(s => s.leagueSlug && !/fifa|uefa\.nations|uefa\.euro|conmebol\.america|friendly|charity/.test(s.leagueSlug));
  const tslug = (dom && dom.leagueSlug) || (t.slug || "").split(".").slice(0, 2).join(".");
  const tlogo = ((t.logos || [])[0] || {}).href || (t.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png` : "");
  const pos = POS_ES[(A.position || {}).displayName] || (A.position || {}).displayName || "";
  const idx = k => names.indexOf(k), gv = (s, k) => idx(k) >= 0 ? s.stats[idx(k)] : "—";
  const sum = k => splits.filter(s => !/charity|friendly/.test(s.leagueSlug || "")).reduce((x, s) => x + (+gv(s, k) || 0), 0);
  const Lf = { equipos: { [t.displayName || ""]: { color: t.color, logo: tlogo } } };
  const facts = [["Edad", A.age ? `${A.age} años` : ""], ["Nacionalidad", A.citizenship ? `${(A.flag || {}).href ? `<img class="fflag" src="${esc(A.flag.href)}" alt="">` : ""}${esc(A.citizenship)}` : ""], ["Posición", esc(pos)],
    ["Camiseta", A.jersey ? "#" + esc(A.jersey) : ""], ["Altura", esc(toM(A.displayHeight))], ["Peso", esc(toKg(A.displayWeight))], ["Nacimiento", esc(A.displayDOB || "")]].filter(f => f[1]);
  const evs = (g && g.events) || {}, lnames = (g && g.names) || [], log = [];
  ((g && g.seasonTypes) || []).forEach(sx => (sx.categories || []).forEach(c => (c.events || []).forEach(e => { const m = evs[e.eventId]; if (m) log.push({ e, m, liga: c.displayName || "" }); })));
  log.sort((x, y) => String(y.m.gameDate).localeCompare(String(x.m.gameDate)));
  const li = k => lnames.indexOf(k);
  const next = o && o.nextGame && o.nextGame.league && (o.nextGame.league.events || [])[0];
  const news = ((o && o.news) || []).slice(0, 4);
  box.innerHTML = `<div class="panel fhero">${face(Lf, t.displayName || "", id, A.displayName, "xl")}
      <div class="fh-txt"><span class="lbl">${esc(pos)}</span><h1>${esc(A.displayName || "")}</h1>
      ${t.id ? `<button class="link fteam" data-go="club" data-liga="${esc(tslug || "all")}" data-id="${esc(t.id)}">${tlogo ? `<img${isrc(tlogo, 32)} alt="" referrerpolicy="no-referrer" data-n="${esc(t.displayName || "")}" onerror="bfb(this)">` : ""}${esc(t.displayName || "")}</button>` : ""}</div>
      <div class="fh-k">${[["Goles", sum("totalGoals")], ["Asist.", sum("goalAssists")], ["Partidos", sum("starts") + sum("subIns") || sum("starts")]].map(([l, v]) => `<div><b class="num">${v}</b><span>${l}</span></div>`).join("")}</div></div>
    <div class="ffacts">${facts.map(([l, v]) => `<div><span class="lbl">${l}</span><b>${v}</b></div>`).join("")}</div>
    ${next ? `<button class="panel fnext" data-go="envivo" data-id="${esc(next.id)}"><span class="lbl">Próximo partido</span><b>${esc((next.name || "").replace(" at ", " vs "))}</b><span class="muted">${esc(new Date(next.date).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))} · ${hhmm(next.date)} · ${esc(o.nextGame.league.shortName || "")}</span></button>` : ""}
    ${splits.length ? `<div class="panel flush scroll"><div class="ph"><h3>Temporada por competición</h3></div><table class="t"><thead><tr><th>Competición</th><th class="n">Tit.</th><th class="n">Goles</th><th class="n">Asist.</th><th class="n hide-m">Remates</th><th class="n hide-m">Al arco</th><th class="n" title="Amarillas">${YC}</th><th class="n" title="Rojas">${RC}</th></tr></thead><tbody>${splits.map(s => `<tr><td>${esc((s.displayName || "").replace(/^\d{4}(-\d{2})?\s*/, ""))}</td><td class="n">${esc(gv(s, "starts"))}</td><td class="n"><b>${esc(gv(s, "totalGoals"))}</b></td><td class="n">${esc(gv(s, "goalAssists"))}</td><td class="n hide-m">${esc(gv(s, "totalShots"))}</td><td class="n hide-m">${esc(gv(s, "shotsOnTarget"))}</td><td class="n">${esc(gv(s, "yellowCards"))}</td><td class="n">${esc(gv(s, "redCards"))}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${log.length ? `<div class="panel flush"><div class="ph"><h3>Últimos partidos</h3></div>${log.slice(0, 10).map(({ e, m, liga }) => { const r = (m.gameResult || "").toUpperCase(), cl = r === "W" ? "G" : r === "L" ? "P" : r === "D" ? "E" : "";
        const sv = k => li(k) >= 0 ? +(e.stats || [])[li(k)] || 0 : 0, gl = sv("totalGoals"), as = sv("goalAssists"), yc = sv("yellowCards"), rc = sv("redCards");
        return `<button class="flog" data-go="envivo" data-id="${esc(m.id || e.eventId)}"><span class="faint num">${esc(new Date(m.gameDate).toLocaleDateString("es-CL", { day: "numeric", month: "short" }))}</span><span class="form"><i class="${cl}">${cl || "·"}</i></span>
          <span class="fop">${(m.opponent || {}).logo ? `<img${isrc(m.opponent.logo, 22)} alt="" referrerpolicy="no-referrer" data-n="${esc((m.opponent || {}).displayName || "")}" onerror="bfb(this)">` : ""}${m.atVs === "@" ? "en " : "vs "}${esc((m.opponent || {}).displayName || "")}</span><span class="num">${esc(m.score || "")}</span>
          <span class="fst">${"⚽".repeat(Math.min(gl, 4))}${as ? ` <small>${as} asist.</small>` : ""}${yc ? " " + YC : ""}${rc ? " " + RC : ""}</span></button>`; }).join("")}</div>` : ""}
    ${news.length ? `<h2>Noticias</h2>${newsCards(news)}` : ""}
    <p class="note">Datos de ESPN.</p>`;
}

/* ---------- videos del partido ---------- */
function videosHtml(j) {
  const V = (j.videos || []).filter(v => v.links && v.headline).slice(0, 6); if (!V.length) return "";
  return `<div class="panel stack"><h3>Videos</h3><div class="vvids">${V.map((v, i) => { const src = ((v.links.source || {}).HD || {}).href || (v.links.source || {}).href || ((v.links.mobile || {}).source || {}).href || "", web = ((v.links.web || {}).href) || "";
    return `<button class="vvid" data-vsrc="${esc(src)}" data-vweb="${esc(web)}" data-vt="${esc(v.headline)}">${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="vplay">▶</span><span class="vvt">${esc(v.headline)}</span>${v.duration ? `<small>${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, "0")}</small>` : ""}</button>`; }).join("")}</div></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-vsrc]"); if (!b) return;
  if (!b.dataset.vsrc) { if (b.dataset.vweb) window.open(b.dataset.vweb, "_blank", "noopener"); return; }
  const m = document.createElement("div"); m.className = "vmodal vplayer";
  m.innerHTML = `<div role="dialog" aria-label="Video"><video src="${esc(b.dataset.vsrc)}" controls autoplay playsinline></video><div class="row" style="justify-content:space-between;margin-top:10px"><b>${esc(b.dataset.vt)}</b><button class="btn ghost sm" data-modal-x>Cerrar</button></div></div>`;
  m.addEventListener("click", ev => { if (ev.target === m || ev.target.closest("[data-modal-x]")) m.remove(); });
  document.body.appendChild(m);
});

/* ---------- preferencias de avisos ---------- */
function prefsModal() {
  const p = myPrefs(), L = [["gol", "⚽ Goles"], ["roja", "🟥 Tarjetas rojas"], ["inicio", "▶️ Inicio del partido"], ["final", "🏁 Resultado final"], ["alin", "📋 Alineaciones confirmadas"], ["prev", "⏰ 15 minutos antes"]];
  const m = document.createElement("div"); m.className = "vmodal";
  m.innerHTML = `<div role="dialog" aria-label="Avisos"><h3>¿De qué te aviso?</h3><p class="note">Vale para todos los partidos que sigues con la campana.</p><div class="prefs">${L.map(([k, n]) => `<label class="pref"><input type="checkbox" data-pref="${k}" ${p[k] ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
    <p class="note">${isIOS() && !isStandalone() ? "En iPhone/iPad, instala Ballytics en la pantalla de inicio para recibir avisos con la app cerrada." : ""}</p><button class="btn" data-modal-x>Listo</button></div>`;
  m.addEventListener("change", async ev => { const k = ev.target.dataset.pref; if (!k) return; const q = myPrefs(); q[k] = ev.target.checked ? 1 : 0; lsSet("bt_prefs", q);
    try { const s = await pushSub(); if (s) await fetch(s.url + "/prefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: s.sub.endpoint, prefs: q }) }); } catch (x) {} });
  m.addEventListener("click", ev => { if (ev.target === m || ev.target.closest("[data-modal-x]")) m.remove(); });
  document.body.appendChild(m);
}
document.addEventListener("click", e => { if (e.target.closest("[data-prefs]")) prefsModal(); });

/* ---------- simulación de copas ---------- */
function lCopa(L) {
  const C = L.copa; if (!C) return `<div class="panel empty">Sin simulación disponible.</div>`;
  const bar = (v, cls = "") => `<span class="pbar ${cls}"><i style="width:${Math.max(0, Math.min(100, 100 * v))}%"></i></span><span class="num">${v >= 0.995 ? ">99 %" : v > 0 && v < 0.005 ? "<1 %" : pct(v)}</span>`;
  if (C.tipo === "fase_liga") return `<div class="panel stack"><h3>Simulación de la copa ${help("Se simulan los partidos que faltan de la fase de liga con las probabilidades del modelo y luego la fase final con un cuadro simplificado por posiciones (sin sorteo). Sirve para dimensionar opciones, no como pronóstico exacto.")}</h3>
      <p class="note">${C.sims.toLocaleString("es-CL")} simulaciones · quedan ${C.quedan} partidos de la fase de liga.</p></div>
    <div class="panel flush scroll"><table class="t copa"><thead><tr><th>#</th><th>Equipo</th><th class="n">Pts</th><th class="n">Pts esp.</th><th>Top 8</th><th class="hide-m">Playoff</th><th class="hide-m">Eliminado</th><th class="hide-m">Final</th><th>Campeón</th></tr></thead><tbody>${C.equipos.map((r, i) => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(r.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, r.equipo)}${esc(corto(L, r.equipo))}</td><td class="n">${r.pts}</td><td class="n"><b>${dec(r.pts_esp, 1)}</b></td>
      <td class="pc">${bar(r.p_directo, "cl")}</td><td class="pc hide-m">${bar(r.p_playoff, "el")}</td><td class="pc hide-m">${bar(r.p_elim, "desc")}</td><td class="pc hide-m">${bar(r.p_final)}</td><td class="pc">${bar(r.p_campeon, "gold")}</td></tr>`).join("")}</tbody></table></div>`;
  const ties = (C.llaves || []).map(t => `<div class="tie panel"><div class="tie-t"><span class="${t.p_a >= .5 ? "fav" : ""}">${badge(L, t.a)}<b>${esc(corto(L, t.a))}</b></span><span class="tie-s num">${t.ida ? `Ida ${esc(t.ida)}` : "Ida —"}<br>${t.vuelta ? `Vuelta ${esc(t.vuelta)}` : "Vuelta —"}</span><span class="r ${t.p_a < .5 ? "fav" : ""}"><b>${esc(corto(L, t.b))}</b>${badge(L, t.b)}</span></div>
      ${t.decidida && (t.p_a === 1 || t.p_a === 0) ? `<p class="tie-d">Avanzó <b>${esc(corto(L, t.p_a === 1 ? t.a : t.b))}</b>${t.penales ? " por penales" : ""}</p>` : `<div class="tie-b"><i style="width:${100 * t.p_a}%"></i></div><div class="tie-n num"><span>${pct(t.p_a)}</span><span>avanza</span><span>${pct(1 - t.p_a)}</span></div>`}</div>`).join("");
  const camp = (C.campeon || []).map(c => `<div class="crow">${badge(L, c.equipo)}<b>${esc(corto(L, c.equipo))}</b>${bar(c.p, "gold")}</div>`).join("");
  return `${C.final ? `<div class="panel stack"><h3>Final</h3><p>${esc(corto(L, C.final.a))} vs ${esc(corto(L, C.final.b))} · ${esc(cuando(C.final.fecha))}</p></div>` : ""}
    ${ties ? `<h2>Llaves de la ronda</h2><div class="ties">${ties}</div>` : ""}
    ${camp ? `<div class="panel stack"><h3>Probabilidad de campeón</h3>${camp}</div>` : ""}
    <p class="note">Probabilidades del modelo para cada llave de ida y vuelta (con el resultado de la ida si ya se jugó). Empate en el global: penales al 50 %.</p>`;
}

/* ---------- prode ---------- */
const myProdes = () => lsGet("bt_prodes", []);
function saveProde(code, nombre) { const l = myProdes().filter(x => x.code !== code); l.unshift({ code, nombre }); lsSet("bt_prodes", l.slice(0, 20)); }
function vProde() {
  const code = (R.id || "").toUpperCase();
  setTimeout(() => code ? vFillProde(code) : null, 0);
  if (code) return `<section class="view"><button class="back" data-go="prode">← Mis prodes</button><div id="pr-box">${skelRows(3)}</div></section>`;
  const L = myProdes(), alias = lsGet("bt_alias", "");
  return `<section class="view" aria-labelledby="h-prode"><h1 id="h-prode">Prode</h1>${vHub("prode")}
    <div class="panel prode-hero"><div><h2>Juega a pronosticar con tus amigos</h2><p class="muted">Crea un prode, comparte el código y pronostiquen los marcadores. <b>3 puntos</b> por marcador exacto y <b>1</b> por acertar el ganador o el empate. Los pronósticos de los demás se ven cuando empieza cada partido.</p><p class="muted"><b>Desafía a Ballytics:</b> el modelo también juega en tu prode con el marcador que ve más probable. ¿Le ganan tus amigos?</p></div></div>
    ${L.length ? `<div class="panel stack"><h3>Mis prodes</h3><div class="slist">${L.map(p => `<button class="srow" data-go="prode" data-id="${esc(p.code)}"><span class="pcode num">${esc(p.code)}</span><span><b>${esc(p.nombre)}</b><small>Toca para pronosticar y ver el ranking</small></span><span class="sn">→</span></button>`).join("")}</div></div>` : ""}
    <div class="grid2"><form class="panel stack" id="pr-new" novalidate><h3>Crear un prode</h3><label class="f"><span class="lbl">Nombre del prode</span><input name="nombre" maxlength="40" placeholder="Los del curso" required></label><label class="f"><span class="lbl">Tu apodo</span><input name="alias" maxlength="24" value="${esc(alias)}" placeholder="Benja" required></label><button class="btn">Crear</button></form>
      <form class="panel stack" id="pr-join" novalidate><h3>Unirme con un código</h3><label class="f"><span class="lbl">Código</span><input name="code" maxlength="6" placeholder="ABC234" style="text-transform:uppercase" required></label><label class="f"><span class="lbl">Tu apodo</span><input name="alias" maxlength="24" value="${esc(alias)}" required></label><button class="btn">Unirme</button></form></div></section>`;
}
document.addEventListener("submit", async e => {
  const f = e.target; if (!["pr-new", "pr-join", "pr-join2"].includes(f.id)) return;
  e.preventDefault();
  const btn = f.querySelector("button"), label = btn.textContent;
  let msg = f.querySelector(".ferr"); if (!msg) { msg = document.createElement("p"); msg.className = "ferr"; msg.setAttribute("role", "alert"); btn.before(msg); }
  const fail = t => { msg.textContent = t; msg.hidden = false; btn.disabled = false; btn.textContent = label; };
  msg.hidden = true;
  const fd = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
  if (f.id === "pr-new" && !fd.nombre) return fail("Escribe un nombre para el prode.");
  if ((f.id === "pr-join") && !/^[A-Z0-9]{4,8}$/i.test(fd.code || "")) return fail("Escribe el código que te compartieron (6 letras o números).");
  if (!fd.alias) return fail("Escribe tu apodo: es el nombre que verán tus amigos en la tabla.");
  btn.disabled = true; btn.textContent = f.id === "pr-new" ? "Creando…" : "Uniéndote…";
  const url = await pushCfg(); if (!url) return fail("El servidor del prode no responde. Prueba de nuevo en unos minutos.");
  lsSet("bt_alias", fd.alias || "");
  const path = f.id === "pr-new" ? "/prode/crear" : "/prode/unirse";
  try {
    const r = await (await fetch(url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fd, code: (fd.code || f.dataset.code || "").toUpperCase(), uid: myUid() }) })).json();
    if (!r.ok) return fail(r.error === "no existe" ? "No existe un prode con ese código. Revisa que esté bien escrito." : (r.error || "No se pudo. Prueba de nuevo."));
    saveProde(r.code, fd.nombre || f.dataset.nombre || r.code);
    toast(f.id === "pr-new" ? `Prode creado. Comparte el código ${r.code} con tus amigos.` : "Listo, ya estás en el prode.");
    go({ v: "prode", id: r.code });
  } catch (x) { fail("No se pudo conectar con el servidor. Revisa tu conexión y prueba de nuevo."); }
});
async function prodeFixtures() {
  await vComps();
  const fav = favComps(), today = new Date(), out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); try { out.push(...(await vFetchDay(ymd(d)))); } catch (e) {} }
  return out.filter(e => e.state === "pre" && new Date(e.date).getTime() > Date.now() && (fav.includes(e.slug) || (VV.byId[e.lid] && VV.byId[e.lid].o < 25)))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 80);
}
async function vFillProde(code) {
  const box = document.getElementById("pr-box"), url = await pushCfg(); if (!box) return;
  if (!url) { box.innerHTML = `<div class="panel empty">El servidor del prode no está disponible.</div>`; return; }
  let g;
  try { g = await vget(`${url}/prode/${code}?uid=${encodeURIComponent(myUid())}&t=${Date.now()}`); } catch (e) { box.innerHTML = `<div class="panel empty">No pude cargar el prode.</div>`; return; }
  if (R.v !== "prode" || (R.id || "").toUpperCase() !== code) return;
  if (!g.ok) { box.innerHTML = `<div class="panel empty">${esc(g.error || "No existe ese prode.")}</div>`; return; }
  saveProde(code, g.nombre);
  const link = `${BASE_URL}#/prode/${code}`;
  if (!g.miembro) { box.innerHTML = `<div class="panel prode-hero"><div><span class="lbl">Te invitaron a</span><h2>${esc(g.nombre)}</h2><p class="muted">${g.tabla.length} participantes.</p></div></div>
    <form class="panel stack" id="pr-join2" data-code="${esc(code)}" data-nombre="${esc(g.nombre)}"><h3>Unirme</h3><label class="f"><span class="lbl">Tu apodo</span><input name="alias" maxlength="24" value="${esc(lsGet("bt_alias", ""))}" required></label><button class="btn">Unirme al prode</button></form>`; return; }
  const tab = ["pronosticar", "ranking", "resultados"].includes(R.tab) ? R.tab : "pronosticar";
  const head = `<div class="panel prode-hero"><div><span class="lbl">Prode</span><h2>${esc(g.nombre)}</h2><p class="muted">Código <b class="num pcode">${esc(code)}</b> · ${g.tabla.length} participantes</p></div><button class="btn ghost sm" data-copy="${esc(link)}">Copiar invitación</button></div>
    <div class="mtabs vtabs" role="tablist">${[["pronosticar", "Pronosticar"], ["ranking", "Ranking"], ["resultados", "Resultados"]].map(([k, n]) => `<button role="tab" data-go="prode" data-id="${esc(code)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>`;
  if (tab === "ranking") {
    const bot = g.tabla.find(r => r.bot), me = g.tabla.find(r => r.yo);
    const duelo = bot && me && bot.jugados ? `<div class="panel note-panel">${me.pts > bot.pts ? `<b>Le vas ganando a Ballytics</b> por ${me.pts - bot.pts} ${me.pts - bot.pts === 1 ? "punto" : "puntos"}.` : me.pts === bot.pts ? `<b>Vas empatado con Ballytics</b> (${me.pts} pts).` : `<b>Ballytics te gana</b> por ${bot.pts - me.pts} ${bot.pts - me.pts === 1 ? "punto" : "puntos"}.`} El modelo juega con el marcador más probable de cada partido que tenga probabilidades.</div>` : "";
    box.innerHTML = head + duelo + `<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Jugador</th><th class="n">Pts</th><th class="n">Exactos</th><th class="n">Aciertos</th><th class="n hide-m">Jugados</th></tr></thead><tbody>${g.tabla.map((r, i) => `<tr class="${r.yo ? "hl" : ""}${r.bot ? " botrow" : ""}"><td><span class="pos ${i === 0 && r.pts ? "gold" : ""}">${i + 1}</span></td><td><b>${esc(r.alias)}</b>${r.yo ? ' <span class="tag">tú</span>' : ""}${r.bot ? ' <span class="tag bot" title="Pronostica el marcador más probable del modelo">IA</span>' : ""}</td><td class="n"><b>${r.pts}</b></td><td class="n">${r.exactos}</td><td class="n">${r.aciertos}</td><td class="n hide-m">${r.jugados}</td></tr>`).join("")}</tbody></table></div>`;
    return;
  }
  if (tab === "resultados") {
    const done = g.eventos.filter(e => e.otros).reverse();
    const pts = (p, r) => { if (!p || !r) return ""; const [a, b] = p.split("-").map(Number), [c, d] = r.split("-").map(Number); return a === c && b === d ? "3" : Math.sign(a - b) === Math.sign(c - d) ? "1" : "0"; };
    box.innerHTML = head + (done.length ? done.map(e => `<div class="panel stack pres"><div class="row" style="justify-content:space-between"><b>${esc(e.h)} ${e.res ? `<span class="num">${esc(e.res)}</span>` : "vs"} ${esc(e.a)}</b><span class="note">${esc(e.comp || "")} · ${esc(cuando(e.k))}</span></div>
      <div class="ppicks">${e.otros.map(o => `<span class="pp p${pts(o.pick, e.res)}${o.bot ? " bot" : ""}"><b>${esc(o.alias)}</b> ${esc(o.pick)}${e.res ? ` · ${pts(o.pick, e.res)} ${pts(o.pick, e.res) === "1" ? "pt" : "pts"}` : ""}</span>`).join("")}</div></div>`).join("") : `<div class="panel empty">Aún no empieza ningún partido pronosticado.</div>`);
    return;
  }
  box.innerHTML = head + `<div id="pr-fx"><div class="panel empty">Buscando partidos de los próximos 7 días…</div></div>`;
  const fx = await prodeFixtures(); if (R.v !== "prode") return;
  const mine = Object.fromEntries(g.eventos.filter(e => e.mio).map(e => [e.id, e.mio]));
  const byDay = {}; fx.forEach(e => (byDay[localDay(e.date)] ||= []).push(e));
  const el = document.getElementById("pr-fx"); if (!el) return;
  el.innerHTML = fx.length ? Object.keys(byDay).map(k => `<div class="panel flush vcomp"><div class="vch"><b>${esc(fromYmd(k).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))}</b></div>${byDay[k].map(e => { const [a, b] = (mine[e.id] || "-").split("-");
      return `<div class="prow" data-pid="${esc(e.id)}" data-k="${esc(e.date)}" data-slug="${esc(e.slug || "all")}" data-h="${esc(e.h.name)}" data-a="${esc(e.a.name)}" data-comp="${esc(e.comp)}"><span class="ptime num">${hhmm(e.date)}</span>
        <span class="pteam r">${esc(e.h.name)}${e.h.logo ? `<img${isrc(e.h.logo, 22)} alt="" loading="lazy" referrerpolicy="no-referrer" data-n="${esc(e.h.name)}" onerror="bfb(this)">` : ""}</span>
        <input class="pin" inputmode="numeric" maxlength="2" value="${esc(a || "")}" aria-label="Goles de ${esc(e.h.name)}"><span class="faint">–</span><input class="pin" inputmode="numeric" maxlength="2" value="${esc(b || "")}" aria-label="Goles de ${esc(e.a.name)}">
        <span class="pteam">${e.a.logo ? `<img${isrc(e.a.logo, 22)} alt="" loading="lazy" referrerpolicy="no-referrer" data-n="${esc(e.a.name)}" onerror="bfb(this)">` : ""}${esc(e.a.name)}</span><span class="pok">${mine[e.id] ? "✓" : ""}</span><small class="pcomp">${esc(e.comp)}</small></div>`; }).join("")}</div>`).join("")
    : `<div class="panel empty">No hay partidos de las competiciones principales en los próximos 7 días. Marca competiciones con ⭐ para incluirlas.</div>`;
}
document.addEventListener("input", e => {
  if (!e.target.classList || !e.target.classList.contains("pin")) return;
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2);
  const row = e.target.closest(".prow"), ins = row.querySelectorAll(".pin");
  if (ins[0].value === "" || ins[1].value === "") return;
  clearTimeout(row._t);
  row._t = setTimeout(async () => {
    const url = await pushCfg(); const ok = row.querySelector(".pok"); ok.textContent = "…";
    try {
      const r = await (await fetch(url + "/prode/pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: (R.id || "").toUpperCase(), uid: myUid(), id: row.dataset.pid, pick: `${+ins[0].value}-${+ins[1].value}`, k: row.dataset.k, slug: row.dataset.slug, h: row.dataset.h, a: row.dataset.a, comp: row.dataset.comp }) })).json();
      ok.textContent = r.ok ? "✓" : "✕"; if (!r.ok) toast(r.error || "No se pudo guardar.");
    } catch (x) { ok.textContent = "✕"; toast("No se pudo guardar. Revisa tu conexión."); }
  }, 500);
});
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const txt = b.dataset.copy;
  try { if (navigator.share && /Mobi|iPad|iPhone|Android/.test(navigator.userAgent)) await navigator.share({ title: "Prode Ballytics", text: "Únete a mi prode en Ballytics", url: txt }); else { await navigator.clipboard.writeText(txt); toast("Invitación copiada. Pégala en WhatsApp."); } }
  catch (x) { try { await navigator.clipboard.writeText(txt); toast("Invitación copiada."); } catch (y) { toast(txt); } }
});

/* ---------- estadísticas de cada jugador dentro del partido ---------- */
function fotoDe(jid) {
  const af = D.fotos && D.fotos[jid]; if (af) return `https://media.api-sports.io/football/players/${af}.png`;
  if (!VV.fotos) VV.fotos = lsGet("bt_fotos", {}); return VV.fotos[jid] || "";
}
function guardarFotos(m) {
  if (!VV.fotos) VV.fotos = lsGet("bt_fotos", {});
  let n = 0; for (const [k, v] of Object.entries(m)) if (v.foto && VV.fotos[k] !== v.foto) { VV.fotos[k] = v.foto; n++; }
  if (!n) return; const ks = Object.keys(VV.fotos); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(k => delete VV.fotos[k]);
  lsSet("bt_fotos", VV.fotos);
}
const rtColor = r => r >= 8 ? "#2e7cf6" : r >= 7 ? "#1fa865" : r >= 6.5 ? "#b9a01f" : r >= 6 ? "#e0832a" : "#dc4a4a";
const nrm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(w => w.length > 1);
function simNombre(a, b) { const A = nrm(a), B = nrm(b); if (!A.length || !B.length) return 0; let n = 0; A.forEach(w => { if (B.some(x => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))) n++; }); return n / Math.min(A.length, B.length) + (A[A.length - 1] === B[B.length - 1] ? 0.5 : 0); }
function afCruce(j, H, data) {
  const map = {}, eqs = data.equipos || [];
  (j.rosters || []).forEach(T => {
    const nm = T.homeAway === "home" ? H.h.name : H.a.name;
    let E = eqs.slice().sort((x, y) => simNombre(y.nombre, nm) - simNombre(x.nombre, nm))[0];
    if (!E || simNombre(E.nombre, nm) < 0.3) E = eqs[T.homeAway === "home" ? 0 : 1];
    if (!E) return;
    const libres = new Set(E.jugadores);
    (T.roster || []).forEach(x => {
      const a = x.athlete || {}, num = parseInt(x.jersey, 10);
      let best = null, bs = 0;
      for (const p of libres) { const sc = simNombre(a.displayName || a.fullName, p.n) + (p.num === num && !isNaN(num) ? 1 : 0); if (sc > bs) { bs = sc; best = p; } }
      if (best && bs >= 1) { map[String(a.id)] = best; libres.delete(best); }
    });
  });
  return map;
}
async function loadMatchPlayers(id, H, j) {
  const c = VV.afp && VV.afp[id], now = Date.now();
  if (c && (c.fin || now - c.t < (H.state === "in" ? 120000 : 600000))) return false;
  if (H.state === "pre") return false;
  const url = await pushCfg(); if (!url) return false;
  VV.afp = VV.afp || {};
  let r;
  try { r = await vget(`${url}/jugadores?id=${encodeURIComponent(id)}&st=${H.state}&k=${encodeURIComponent(H.date || "")}&h=${encodeURIComponent(H.h.name)}&a=${encodeURIComponent(H.a.name)}`); }
  catch (e) { VV.afp[id] = { t: now, map: c ? c.map : {}, motivo: "error" }; return false; }
  if (!r.ok) { VV.afp[id] = { t: r.motivo === "pendiente" ? now - (H.state === "in" ? 60000 : 540000) : now, map: c ? c.map : {}, motivo: r.motivo }; return !c; }
  const map = afCruce(j, H, r); guardarFotos(map);
  VV.afp[id] = { t: now, fin: !!r.fin, map, data: r, pendiente: r.pendiente };
  return true;
}
function pmNote(mid, H) {
  const c = VV.afp && VV.afp[mid];
  if (H.state === "pre") return `<p class="note">Toca un jugador para ver su ficha. Las estadísticas del partido aparecen cuando empieza.</p>`;
  if (!c) return `<p class="note">Cargando notas y estadísticas de cada jugador…</p>`;
  if (Object.keys(c.map || {}).length) return `<p class="note">Toca un jugador para ver sus estadísticas en este partido. Nota de 0 a 10 (API-Football)${c.data && c.data.actualizado && !c.fin ? `, actualizada a las ${hhmm(new Date(c.data.actualizado).toISOString())}` : ""}.</p>`;
  return `<p class="note">Toca un jugador para ver sus estadísticas en este partido.${c.motivo === "pendiente" ? " Las notas, los pases y las fotos se están pidiendo: aparecen en unos minutos." : c.motivo === "sin_cruce" || c.motivo === "sin_datos" ? " Este partido no tiene notas ni pases disponibles; se muestran los datos de ESPN." : ""}</p>`;
}
function pmModal(pid, mid) {
  const j = (VV.sum[mid] || {}).j; if (!j) { go({ v: "ficha", id: pid }); return; }
  const H = vHeader(j); let x = null, T = null;
  (j.rosters || []).forEach(t => (t.roster || []).forEach(y => { if (String((y.athlete || {}).id) === String(pid)) { x = y; T = t; } }));
  if (!x) { go({ v: "ficha", id: pid }); return; }
  const a = x.athlete || {}, team = T.homeAway === "home" ? H.h : H.a, af = ((VV.afp || {})[mid] || {}).map ? VV.afp[mid].map[pid] : null;
  const es = {}; (x.stats || []).forEach(s => { es[s.name] = s.value; });
  const v = (afk, esk) => af && af[afk] != null ? af[afk] : esk && es[esk] != null ? es[esk] : null;
  const isGk = /^G/.test((x.position || {}).abbreviation || "") || (af && af.pos === "G");
  const Lf = { equipos: { [team.name]: { color: team.color, logo: team.logo } } };
  const ev = (j.keyEvents || []).filter(e => ((e.participants || [])[0] || {}).athlete && String(e.participants[0].athlete.id) === String(pid));
  const fmt = (n, d) => n == null ? "—" : d != null && d !== "" ? `${n}<small> / ${d}</small>` : String(n);
  const sec = (t, rows) => { const R0 = rows.filter(r => r[1] !== "—"); return R0.length ? `<div class="pms"><h4>${t}</h4>${R0.map(([l, val]) => `<div class="pmr"><span>${l}</span><b class="num">${val}</b></div>`).join("")}</div>` : ""; };
  const min = af && af.min != null ? af.min : null, pos = POS_ES[(x.position || {}).displayName] || (x.position || {}).displayName || "";
  const body = (isGk ? sec("Arco", [["Atajadas", fmt(v("sv", "saves"))], ["Goles recibidos", fmt(v("gc", "goalsConceded"))]]) : "")
    + sec("Ataque", [["Goles", fmt(v("g", "totalGoals"))], ["Asistencias", fmt(v("as", "goalAssists"))], ["Tiros (al arco)", v("sh", "totalShots") == null ? "—" : `${v("sh", "totalShots")}<small> (${v("sot", "shotsOnTarget") ?? 0})</small>`],
        ["Regates exitosos", af && af.dr != null ? fmt(af.drs ?? 0, af.dr) : "—"], ["Fueras de juego", fmt(v("off", "offsides"))], ["Penales", af && (af.ps || af.pm) ? `${af.ps || 0} convertido${af.ps === 1 ? "" : "s"}${af.pm ? ` · ${af.pm} errado${af.pm === 1 ? "" : "s"}` : ""}` : "—"]])
    + sec("Pases", [["Pases", fmt(af ? af.pas : null)], ["Pases precisos", af && af.acc != null && af.pas ? (af.acc <= af.pas ? `${af.acc}<small> (${Math.round(100 * af.acc / af.pas)}%)</small>` : `${af.acc}%`) : "—"], ["Pases clave", fmt(af ? af.kp : null)]])
    + sec("Defensa", [["Quites", fmt(af ? af.tk : null)], ["Intercepciones", fmt(af ? af.int : null)], ["Tiros bloqueados", fmt(af ? af.blk : null)], ["Duelos ganados", af && af.du ? fmt(af.duw ?? 0, af.du) : "—"]])
    + sec("Faltas y tarjetas", [["Faltas cometidas", fmt(v("fc", "foulsCommitted"))], ["Faltas recibidas", fmt(v("fd", "foulsSuffered"))], ["Amarillas", fmt(v("yc", "yellowCards"))], ["Rojas", fmt(v("rc", "redCards"))]]);
  const m = document.createElement("div"); m.className = "vmodal pmodal";
  m.innerHTML = `<div role="dialog" aria-label="${esc(a.displayName || "")}"><button class="pmx" data-modal-x aria-label="Cerrar">×</button>
    <div class="pmh">${face(Lf, team.name, pid, a.displayName, "xl", af && af.foto)}<div><b>${esc(a.displayName || "")}</b><span class="muted">${vLogo(team, "sm")} ${esc(team.short)}${x.jersey ? ` · #${esc(x.jersey)}` : ""}${pos ? ` · ${esc(pos)}` : ""}</span>
      <span class="faint">${min != null ? `${min}' jugados` : x.starter ? "Titular" : x.subbedIn ? "Entró desde la banca" : "Suplente"}${x.subbedOut ? " · salió" : ""}${ev.length ? " · " + ev.map(e => `${/goal|scored/i.test((e.type || {}).type || "") ? "⚽" : /red/i.test((e.type || {}).type || "") ? RC : /yellow/i.test((e.type || {}).type || "") ? YC : "•"} ${esc((e.clock || {}).displayValue || "")}`).join(" ") : ""}</span></div>
      ${af && af.r ? `<span class="pmrt" style="background:${rtColor(af.r)}">${af.r.toFixed(1)}<small>nota</small></span>` : ""}</div>
    <div class="pmg">${body || `<p class="note">Sin estadísticas de este jugador todavía.</p>`}</div>
    <p class="note">${af ? "Datos del partido de API-Football y ESPN." : "Datos del partido de ESPN. La nota, los pases y los duelos aparecen cuando API-Football los publica para este partido."}</p>
    <button class="btn" data-go="ficha" data-id="${esc(pid)}">Ver ficha completa</button></div>`;
  m.addEventListener("click", ev2 => { if (ev2.target === m || ev2.target.closest("[data-modal-x]") || ev2.target.closest("[data-go]")) m.remove(); });
  document.body.appendChild(m);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-pm]"); if (!b) return; e.preventDefault(); e.stopPropagation(); if (b.dataset.mid) pmModal(b.dataset.pm, b.dataset.mid); else go({ v: "ficha", id: b.dataset.pm }); }, true);

/* ---------- deslizar entre pestañas y días (celular y tablet) ---------- */
(() => {
  let sx = null, sy = 0, st = 0, ok = false;
  const NO = ".car,.vdays,.chips,.tabs2,.mtabs,.days,.vhub,nav,input,textarea,select,.vmodal,.vpitch,.curve,.dd-menu,.sres,.top,.tabbar,#combobar";
  document.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) { sx = null; return; }
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
    ok = !(e.target.closest && e.target.closest(NO));
    // también se descarta si el dedo parte sobre algo que se desplaza de lado
    for (let el = e.target; ok && el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(el).overflowX)) ok = false;
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (sx === null || !ok) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - st > 700) return;
    if (document.querySelector(".vmodal")) return;
    const bars = [...document.querySelectorAll(".mtabs[role=tablist], .tabs2.wide, .vdays")].filter(b => b.offsetParent);
    const bar = bars[bars.length - 1]; if (!bar) return;
    const btns = [...bar.querySelectorAll("button")], cur = btns.findIndex(b => b.getAttribute("aria-selected") === "true" || b.getAttribute("aria-pressed") === "true");
    const nx = btns[cur + (dx < 0 ? 1 : -1)]; if (cur < 0 || !nx) return;
    nx.click(); nx.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, { passive: true });
})();

document.addEventListener("click", e => { const b = e.target.closest("[data-retry]"); if (!b) return; delete LOADERR[b.dataset.retry]; render(); });
load().then(() => { R = fromHash(); render(); pollLive(); setInterval(pollLive, 60000);
  whenAll(() => { if (R.v === "inicio" || R.v === "registro") rerenderKeep(); }); })
  .catch(err => { $app.innerHTML = `<div class="panel empty">No pude cargar los datos (${esc(err.message)}). Si abriste el archivo directo desde tu computador, el navegador bloquea la lectura: usa la versión publicada.</div>`; });
})();
