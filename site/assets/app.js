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
const pct = (x, d = 0) => x == null || isNaN(x) ? "—" : (100 * x).toFixed(d).replace(".", ",") + " %";
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
function lum(hex) { const n = parseInt(hex, 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
const pts5 = f => (f || []).reduce((s, c) => s + ({ G: 3, E: 1, P: 0 }[c] || 0), 0);

function info(L, t) { return (L && L.equipos && L.equipos[t]) || {}; }
const corto = (L, t) => info(L, t).corto || t;
function badge(L, t, size = "") {
  const i = info(L, t), c = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? i.color : null;
  const bg = c ? "#" + c : hashColor(t), fg = c && lum(c) > 0.62 ? "#07090f" : "#fff";
  const ab = (i.abr || t.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 3)).toUpperCase();
  const logo = typeof i.logo === "string" && /^https:\/\//.test(i.logo) ? i.logo : null;
  const img = logo ? `<img class="crest" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('logo');this.remove()">` : "";
  return `<span class="badge ${size}${logo ? " logo" : ""}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(ab)}${img}</span>`;
}
/* cara del jugador: foto de ESPN (o de API-Football), con iniciales y color del equipo si no hay foto */
function face(L, t, jid, name, size = "", alt = "") {
  const i = info(L, t), c = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? i.color : null;
  const bg = c ? "#" + c : hashColor(t || name || ""), fg = c && lum(c) > 0.62 ? "#07090f" : "#fff";
  const w = String(name || "").replace(/[^A-Za-zÀ-ÿ' -]/g, "").trim().split(/\s+/).filter(Boolean);
  const ini = ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  const espn = /^\d+$/.test(String(jid || "")) ? `https://a.espncdn.com/i/headshots/soccer/players/full/${jid}.png` : "";
  const api = typeof alt === "string" && /^https:\/\/media\.api-sports\.io\//.test(alt) ? alt : "";
  const src = espn || api, alt2 = espn && api ? api : "";
  const img = src ? `<span class="ph"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${alt2 ? ` data-alt="${esc(alt2)}"` : ""} onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else this.parentNode.remove()"></span>` : "";
  const crest = size !== "sm" && t ? `<span class="fb">${badge(L, t, "xs")}</span>` : "";
  return `<span class="pface ${size}" style="--fc:${bg};--ff:${fg}" aria-hidden="true"><i>${esc(ini)}</i>${img}${crest}</span>`;
}
function leagueMark(L, size = "") {
  const logo = L.logo && /^https:\/\//.test(L.logo) ? L.logo : null;
  const ab = L.nombre.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();
  return `<span class="lmark ${size}${logo ? " logo" : ""}" aria-hidden="true">${esc(ab)}${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('logo');this.remove()">` : ""}</span>`;
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
async function getJSON(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }
const PEND = {};
function ensure(id) {
  return PEND[id] || (PEND[id] = getJSON(`data/${id}.json`).then(L => { D.ligas[id] = L; return L; }).catch(() => null));
}
async function load() {
  D.indice = await getJSON("data/indice.json");
  D.meta = {}; D.indice.ligas.forEach(l => D.meta[l.id] = l);
  // primero lo que se ve en pantalla; el resto se carga en segundo plano
  const h = (location.hash || "#/").slice(2).split("/");
  const prio = new Set((D.indice.portada && D.indice.portada.partidos || []).map(x => x.liga));
  (D.indice.portada && D.indice.portada.jugadores || []).slice(0, 2).forEach(x => prio.add(x.liga));
  prio.add(D.indice.ligas[0].id);
  if (["liga", "partido", "equipo", "jugador", "comparar", "partidos"].includes(h[0]) && D.meta[h[1]]) { prio.clear(); prio.add(h[1]); }
  D.indice.ligas.forEach(l => ensure(l.id));
  D.all = Promise.all(D.indice.ligas.map(l => ensure(l.id))).then(() => { D.allLoaded = true; });
  await Promise.all([...prio].map(ensure));
  [D.registro, D.metodo] = await Promise.all([getJSON("data/registro.json").catch(() => null), getJSON("data/metodologia.json").catch(() => null)]);
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
        eq.push({ k: "Equipos", n: corto(L, t), alt: t, sub: L.nombre, html: badge(L, t), go: `data-go="equipo" data-liga="${id}" data-team="${esc(t)}"` }); });
      (L.goleadores || []).forEach(g => { const key = g.jid + "|" + id; if (seenP.has(key)) return; seenP.add(key);
        pl.push({ k: "Jugadores", n: g.jugador, sub: `${corto(L, g.equipo)} · ${L.nombre} · ${g.goles} goles`, html: face(L, g.equipo, g.jid, g.jugador), go: `data-go="jugador" data-liga="${id}" data-id="${esc(g.jid)}"` }); });
    });
    idx = [...ligas, ...eq, ...pl].map(x => ({ ...x, s: norm(x.n + " " + (x.alt || "")) }));
  };
  indexAll(); D.all.then(indexAll);
  let act = -1;
  const items = () => [...res.querySelectorAll(".dd-item")];
  const setAct = i => { const it = items(); if (!it.length) return; act = (i + it.length) % it.length; it.forEach((x, j) => x.classList.toggle("act", j === act)); it[act].scrollIntoView({ block: "nearest" }); };
  q.addEventListener("input", () => {
    const v = norm(q.value.trim()); act = -1;
    if (v.length < 2) { res.hidden = true; return; }
    const sc = x => x.s.startsWith(v) ? 2 : x.s.includes(" " + v) ? 1 : 0;
    const hits = idx.filter(x => x.s.includes(v)).sort((a, b) => sc(b) - sc(a)).slice(0, 14);
    const groups = {}; hits.forEach(h => (groups[h.k] ||= []).push(h));
    res.innerHTML = hits.length ? ["Ligas", "Equipos", "Jugadores"].filter(k => groups[k]).map(k => `<span class="lbl sgrp">${k}</span>` +
      groups[k].slice(0, k === "Jugadores" ? 5 : 6).map(x => `<button class="dd-item" ${x.go}>${x.html}<span>${esc(x.n)}<small>${esc(x.sub)}</small></span></button>`).join("")).join("")
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
  document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); q.focus(); } });
  m.addEventListener("click", e => { if (e.target.closest("[data-go]")) setOpen(false); });
}

/* ---------------- rutas ---------------- */
function toHash(r) {
  if (r.v === "liga") return `#/liga/${r.liga}/${r.tab || "resumen"}`;
  if (r.v === "partido") return `#/partido/${r.liga}/${encodeURIComponent(r.id)}${r.tab && r.tab !== "resumen" ? "/" + r.tab : ""}`;
  if (r.v === "equipo") return `#/equipo/${r.liga}/${encodeURIComponent(r.team)}`;
  if (r.v === "registro" && r.tab) return `#/registro/${r.tab}`;
  if (r.v === "jugador") return `#/jugador/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "comparar") return `#/comparar/${r.liga}/${encodeURIComponent(r.team || "")}/${encodeURIComponent(r.id || "")}`;
  if (r.v === "inicio") return r.liga && r.liga !== "todas" ? `#/partidos/${r.liga}` : "#/";
  if (r.v === "vivo") return `#/vivo${r.tab || r.id === "envivo" ? "/" + (r.tab || "hoy") : ""}${r.id === "envivo" ? "/envivo" : ""}`;
  if (r.v === "envivo") return `#/envivo/${encodeURIComponent(r.id)}${r.tab && r.tab !== "resumen" ? "/" + r.tab : ""}`;
  if (r.v === "comp") return `#/comp/${r.liga}${r.tab && r.tab !== "partidos" ? "/" + r.tab : ""}`;
  if (r.v === "club") return `#/club/${r.liga}/${encodeURIComponent(r.id)}${r.tab && r.tab !== "partidos" ? "/" + r.tab : ""}`;
  return `#/${r.v}`;
}
function fromHash() {
  const p = (location.hash || "#/").slice(2).split("/").map(decodeURIComponent);
  const first = ligasIds()[0];
  switch (p[0]) {
    case "liga": return { v: "liga", liga: D.ligas[p[1]] ? p[1] : first, tab: p[2] || "resumen" };
    case "partido": return { v: "partido", liga: p[1], id: p[2], tab: p[3] || "resumen" };
    case "equipo": return { v: "equipo", liga: p[1], team: p[2] };
    case "registro": return { v: "registro", tab: p[1] };
    case "metodo": return { v: "metodo" };
    case "sobre": return { v: "sobre" };
    case "combinada": return { v: "combinada" };
    case "seguimiento": return { v: "seguimiento" };
    case "responsable": return { v: "responsable" };
    case "jugador": return { v: "jugador", liga: p[1], id: p[2] };
    case "comparar": return { v: "comparar", liga: D.ligas[p[1]] ? p[1] : first, team: p[2], id: p[3] };
    case "partidos": return { v: "inicio", liga: D.ligas[p[1]] ? p[1] : "todas" };
    case "vivo": return { v: "vivo", tab: /^\d{8}$/.test(p[1] || "") ? p[1] : undefined, id: p[2] || (p[1] === "envivo" ? "envivo" : undefined) };
    case "envivo": return /^\d+$/.test(p[1] || "") ? { v: "envivo", id: p[1], tab: p[2] || "resumen" } : { v: "envivo", id: p[2], tab: p[3] || "resumen" };
    case "competiciones": return { v: "competiciones" };
    case "noticias": return { v: "noticias" };
    case "comp": return { v: "comp", liga: p[1], tab: p[2] || "partidos" };
    case "club": return { v: "club", liga: p[1], id: p[2], tab: p[3] || "partidos" };
    default: return { v: "inicio", liga: "todas" };
  }
}
let skipHash = false;
function go(r, push = true) {
  const keep = r.keepScroll;
  R = r; render();
  if (push) { const h = toHash(r); if (location.hash !== h) { skipHash = true; try { location.hash = h; } catch (e) {} } }
  if (!keep) window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => { if (skipHash) { skipHash = false; return; } R = fromHash(); render(); });
document.addEventListener("click", e => {
  const el = e.target.closest("[data-go]"); if (!el) return;
  const v = el.dataset.go;
  go({ v, liga: el.dataset.liga || (v === "inicio" ? (R.v === "inicio" ? R.liga : "todas") || "todas" : undefined), id: el.dataset.id, team: el.dataset.team, tab: el.dataset.tab,
       wk: el.dataset.wk, sort: el.dataset.sort, dia: el.dataset.dia || (v === "inicio" && R.v === "inicio" ? R.dia : undefined), keepScroll: el.hasAttribute("data-keep") });
  if (el.classList.contains("lpick")) { const g = document.querySelector(".lgrid"); if (g) window.scrollTo({ top: g.getBoundingClientRect().top + window.scrollY - 90 }); }
});

function render() {
  timers.splice(0).forEach(clearInterval);
  const need = ["liga", "partido", "equipo", "jugador", "comparar"].includes(R.v) && R.liga && D.meta && D.meta[R.liga] && !D.ligas[R.liga] ? R.liga : null;
  if (need) { $app.innerHTML = skeleton(); ensure(need).then(() => render()); return; }
  const sec = ({ partido: "inicio", equipo: "liga", jugador: "liga", comparar: "liga", sobre: "metodo", responsable: "metodo", combinada: "seguimiento", envivo: "vivo", competiciones: "vivo", comp: "vivo", club: "vivo", noticias: "vivo" }[R.v] || R.v);
  document.querySelectorAll("[data-nav]").forEach(b => b.setAttribute("aria-current", b.dataset.nav === sec ? "page" : "false"));
  const f = { inicio: vInicio, liga: vLiga, partido: vPartido, equipo: vEquipo, registro: vRegistro, metodo: vMetodo,
    sobre: vSobre, responsable: vResponsable, jugador: vJugador, comparar: vComparar, combinada: vCombinada, seguimiento: vSeguimiento,
    vivo: vVivo, envivo: vEnVivo, competiciones: vCompeticiones, comp: vComp, club: vClub, noticias: vNoticias }[R.v] || vInicio;
  $app.innerHTML = staleBanner() + f();
  if (R.v === "partido") { if (R.tab === "mercados") bindOdds(); if (R.tab === "alineaciones" || document.getElementById("xi-adj")) loadSummary(); }
  if (R.v === "comparar") bindCompare();
  if (R.v === "combinada") bindCombinada();
  if (R.v === "seguimiento") bindSeguimiento();
  paintComboBar();
  bindCarousels();
  paintLive();
  paintCountdown();
}

/* ---------------- componentes ---------------- */
const formHtml = f => `<span class="form">${(f || []).map(x => `<i class="${x}">${x}</i>`).join("")}</span>`;
const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="lbl">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;
const bar3 = (h, d, a) => `<span class="bars"><i style="width:${100 * h}%"></i><i style="width:${100 * d}%"></i><i style="width:${100 * a}%"></i></span>`;
function zoneOf(L, pos) { return (L.zonas || []).find(z => pos >= z.desde && pos <= z.hasta); }
function posTag(L, pos) { const z = zoneOf(L, pos); return `<span class="pos ${z ? "z-" + z.cls : ""}" ${z ? `title="${esc(z.nombre)}"` : ""}>${pos}</span>`; }

function matchRow(p, showLeague, isFav) {
  const L = p.L || D.ligas[p.liga], fav = p.pH >= p.pA ? "h" : "a";
  const pick = p.pH >= p.pD && p.pH >= p.pA ? "1" : p.pA >= p.pD ? "2" : "X";
  return `<button class="mrow ${isFav ? "isfav" : ""}" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
    <span class="t" data-live-t="${esc(p.id)}">${p.estado === "en_vivo" ? `<span class="livetag">EN VIVO</span>` : hhmm(p.kickoff)}${new Date(p.kickoff).getTime() - Date.now() < 3 * 3600e3 ? `<span class="cdown sm" data-cd="${esc(p.kickoff)}"></span>` : ""}${showLeague ? `<span class="lg">${esc(L.nombre)}</span>` : ""}</span>
    <span class="teams">
      <span class="tline">${badge(L, p.home)}<span class="n ${fav === "h" ? "fav" : "und"}">${esc(corto(L, p.home))}</span></span>
      <span class="tline">${badge(L, p.away)}<span class="n ${fav === "a" ? "fav" : "und"}">${esc(corto(L, p.away))}</span></span>
    </span>
    <span class="p3">${bar3(p.pH, p.pD, p.pA)}<span class="nums"><span><b>${pct(p.pH)}</b></span><span>${pct(p.pD)}</span><span><b>${pct(p.pA)}</b></span></span></span>
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
    c.addEventListener("mouseenter", () => paused = true);
    c.addEventListener("mouseleave", () => paused = false);
    c.addEventListener("focusin", () => paused = true);
    if (!reduce) timers.push(setInterval(() => { if (!paused && !document.hidden) show(i + 1); }, c.dataset.car === "hero" ? 7000 : 9000));
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
  items.sort((a, b) => (fav(b) - fav(a)) || a.t.localeCompare(b.t));
  const rows = items.map(it => it.r ? resRow(it.x, sel === "todas", fav(it)) : matchRow(it.x, sel === "todas", fav(it))).join("");
  const more = !D.allLoaded ? `<div class="skel-row"><span class="skel" style="width:40%"></span></div>` : "";
  return `${strip}<div class="panel flush daypanel">${rows || `<div class="empty">No hay partidos ${dayLabel(dia) === "Hoy" ? "hoy" : "este día"}${sel !== "todas" ? " en esta liga" : ""}.</div>`}${more}</div>`;
}
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
function skeleton() {
  const line = w => `<span class="skel" style="width:${w}"></span>`;
  return `<section class="view"><div class="panel skel-box" style="height:220px"></div>
    <div class="cards">${[1, 2, 3].map(() => `<div class="panel stack">${line("40%")}${line("90%")}${line("75%")}${line("60%")}</div>`).join("")}</div></section>`;
}

/* ---------------- INICIO ---------------- */
let homeLiga = null;
function vInicio() {
  const P = D.indice.portada || {}, now = Date.now();
  const hl = D.ligas[homeLiga] && D.ligas[homeLiga].tabla_ok ? homeLiga : (ligasIds().find(id => D.ligas[id].tabla_ok) || ligasIds()[0]);
  const HL = D.ligas[hl];

  // hero
  const heroMs = (P.partidos || []).map(x => ({ ...findMatch(x.liga, x.id), L: D.ligas[x.liga] })).filter(p => p.id);
  const hero = heroMs.map(p => {
    const L = p.L, sh = rowOf(L, p.home), sa = rowOf(L, p.away);
    return `<div class="hero-in">
      <div class="hero-top">${leagueMark(L, "sm")}<span>${esc(L.nombre)}</span><span class="faint">·</span><span>${esc(cuando(p.kickoff))}</span><span class="cdown" data-cd="${esc(p.kickoff)}"></span></div>
      <div class="hero-face">
        <button class="ht" data-go="equipo" data-liga="${L.id}" data-team="${esc(p.home)}">${badge(L, p.home, "xl")}<b>${esc(corto(L, p.home))}</b>${formHtml(sh.forma)}</button>
        <div class="hero-mid"><span class="xg num">${dec(p.lh, 1)} <span class="faint">–</span> ${dec(p.la, 1)}</span><span class="lbl">goles esperados</span></div>
        <button class="ht" data-go="equipo" data-liga="${L.id}" data-team="${esc(p.away)}">${badge(L, p.away, "xl")}<b>${esc(corto(L, p.away))}</b>${formHtml(sa.forma)}</button>
      </div>
      <div class="hero-p">${bar3(p.pH, p.pD, p.pA)}<div class="nums"><span><b>${pct(p.pH)}</b> local</span><span>${pct(p.pD)} empate</span><span>visita <b>${pct(p.pA)}</b></span></div></div>
      <div class="row hero-cta"><button class="btn" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">Ver análisis</button><button class="btn ghost" data-go="liga" data-liga="${L.id}" data-tab="partidos">Partidos de ${esc(L.nombre)}</button></div>
    </div>`;
  });

  // jugador destacado
  const jug = (P.jugadores || []).map(j => {
    const L = D.ligas[j.liga], p = findMatch(j.liga, j.partido); if (!L || !p) return "";
    const rival = p.home === j.equipo ? p.away : p.home;
    return `<div class="fp">
      <div class="fp-head">${face(L, j.equipo, j.jid, j.jugador, "lg")}<div><b class="fp-name">${esc(j.jugador)}</b><span class="muted">${esc(corto(L, j.equipo))} · ${esc(L.nombre)}</span></div></div>
      <div class="fp-big"><span class="lbl">Probabilidad de marcar</span><span class="v num">${pct(j.p)}</span><span class="muted">vs ${esc(corto(L, rival))} · ${esc(cuando(p.kickoff))}</span></div>
      <div class="fp-stats"><span><b class="num">${j.goles}</b> goles en la temporada</span><span class="l5">${(j.ult5 || []).map(g => `<i class="${g ? "on" : ""}">${g || "·"}</i>`).join("")}<small>últimos 5</small></span></div>
      <button class="btn ghost sm" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">Ver partido</button></div>`;
  }).filter(Boolean);

  // equipo en forma
  const eqs = (P.equipos || []).map(e => {
    const L = D.ligas[e.liga]; if (!L) return "";
    const s = rowOf(L, e.equipo), st = statOf(L, e.equipo);
    return `<div class="fp">
      <div class="fp-head">${badge(L, e.equipo, "lg")}<div><b class="fp-name">${esc(corto(L, e.equipo))}</b><span class="muted">${esc(L.nombre)}${s.pos ? ` · ${s.pos}º con ${s.pts} pts` : ""}</span></div></div>
      <div class="row" style="justify-content:space-between"><span class="lbl">Últimos 5</span>${formHtml(s.forma)}</div>
      <div class="sgrid">
        <div><span class="lbl">Goles/PJ</span><b class="num">${dec(st.gf)}</b></div><div><span class="lbl">Recibe/PJ</span><b class="num">${dec(st.gc)}</b></div>
        <div><span class="lbl">Tiros al arco</span><b class="num">${dec(st.tiros_arco, 1)}</b></div><div><span class="lbl">Córners</span><b class="num">${dec(st.corners, 1)}</b></div>
        <div><span class="lbl">Posesión</span><b class="num">${st.posesion != null ? dec(st.posesion, 0) + " %" : "—"}</b></div><div><span class="lbl">Tarjetas</span><b class="num">${dec(st.tarjetas, 1)}</b></div>
      </div>
      <button class="btn ghost sm" data-go="equipo" data-liga="${L.id}" data-team="${esc(e.equipo)}">Ver equipo</button></div>`;
  }).filter(Boolean);

  // proyección: una por cada partido destacado, sincronizada con el carrusel de arriba
  const projOf = fx => {
    const L = fx.L, mk = markets(pmatrix(L, fx).m);
    const ct = fx.ch != null ? fx.ch + fx.ca : null, tt = fx.th != null ? fx.th + fx.ta : null;
    return `<div class="proj">
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
  const rk = [...HL.tabla].sort((a, b) => b.ataque / b.defensa - a.ataque / a.defensa).slice(0, 7);
  const rank = `<table class="t compact"><thead><tr><th>#</th><th>Equipo</th><th class="n">Atq</th><th class="n">Def</th><th class="n">Global</th></tr></thead><tbody>` +
    rk.map((s, i) => `<tr class="click" data-go="equipo" data-liga="${HL.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(HL, s.equipo)}${esc(corto(HL, s.equipo))}</td><td class="n">${dec(s.ataque)}</td><td class="n">${dec(s.defensa)}</td><td class="n"><b>${sgn(Math.round((s.ataque / s.defensa - 1) * 100))}</b></td></tr>`).join("") + `</tbody></table>`;
  const tabla = `<table class="t compact"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n">DG</th><th class="n">Pts</th></tr></thead><tbody>` +
    HL.tabla.slice(0, 8).map(s => `<tr class="click" data-go="equipo" data-liga="${HL.id}" data-team="${esc(s.equipo)}"><td>${posTag(HL, s.pos)}</td><td class="team">${badge(HL, s.equipo)}${esc(corto(HL, s.equipo))}</td><td class="n">${s.pj}</td><td class="n">${sgn(s.dg)}</td><td class="n"><b>${s.pts}</b></td></tr>`).join("") + `</tbody></table>`;
  const swItems = ligasIds().filter(id => D.ligas[id].tabla_ok).map(id => ({ id, L: D.ligas[id], attrs: `data-hl="${id}" data-go="inicio" data-liga="${R.liga || "todas"}" data-keep` }));
  const sw = (key) => picker(key, hl, swItems);

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
  const perf = g && g.n ? `<div class="kpis two">${kpi("m", "Acierto 1X2", pct(g.acierto_1x2), `${g.n} partidos`)}${kpi("", "Log-loss", dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)}`)}</div>${spark(g.serie)}`
    : `<p class="note">Cada predicción queda guardada antes del partido y se califica después. El registro se llena con los primeros resultados.</p>`;

  // partidos por día
  const sel = R.liga || "todas";
  const list = dayList(sel);
  const chips = `<div class="lgrid" role="group" aria-label="Filtrar por liga"><button class="lpick all" data-go="inicio" data-liga="todas" data-keep aria-pressed="${sel === "todas"}" title="Todas las ligas"><span class="lmark">★</span><span>Todas</span></button>` +
    D.indice.ligas.map(l => `<button class="lpick" data-go="inicio" data-liga="${l.id}" data-keep aria-pressed="${sel === l.id}" title="${esc(l.nombre)}">${leagueMark(l)}<span>${esc(l.nombre)}</span></button>`).join("") + `</div>`;
  const mine = misPartidos();

  return `<section class="view" aria-labelledby="h-inicio">
    <h1 id="h-inicio" class="sr">Ballytics: probabilidades de fútbol</h1>
    <div class="hero panel">${carousel("hero", hero, "Partidos destacados")}</div>
    ${mine}
    <div class="cards">
      ${card("Jugador destacado", carousel("jug", jug, "Jugadores destacados"), `<span class="tag">Goleadores</span>`, "accent")}
      ${card("Equipo en forma", carousel("eq", eqs, "Equipos en forma"), `<span class="tag">Últimos 5</span>`)}
      ${card("Proyección del partido", proy, `<span class="tag">Destacado</span>`)}
      ${card("Ranking de fuerza", `<div class="scroll">${rank}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="fuerza">Ranking completo →</button>`, sw("rk"))}
      ${card("Tabla", `<div class="scroll">${tabla}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="tabla">Tabla completa →</button>`, sw("tb"))}
      ${card("Próximos partidos", `<div class="nlist">${prox}</div>`)}
      ${card("Trío más probable", `<div class="trio">${trio}</div>`, `<span class="tag">Esta semana</span>`, "dark")}
      ${card("Modelo vs mercado", vmc, `<span class="tag">Mayores diferencias</span>`)}
      ${card("Rachas activas", `<div class="slist">${rach}</div>`)}
      ${card("Rendimiento del modelo", `${perf}<button class="link" data-go="registro">Ver registro →</button>`, `<span class="tag">Público</span>`)}
    </div>
    <div class="row" id="partidos" style="justify-content:space-between"><h2>Partidos</h2><span class="note">Elige el día y la liga</span></div>
    ${list}
    ${chips}
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
    ["rachas", "Rachas"], ["corners", "Córners y tarjetas"], ["proyeccion", "Proyección"], ["fuerza", "Fuerza"], ["comparar", "Comparar"]]
    .filter(([k]) => L.tabla_ok || k === "comparar" || (k === "tabla" && (L.grupos || []).length) || !["tabla", "proyeccion", "fuerza"].includes(k));
  if (R.tab === "comparar") { R = { v: "comparar", liga: L.id }; return vComparar(); }
  const tab = tabs.some(t => t[0] === R.tab) ? R.tab : "resumen";
  const body = ({ resumen: lResumen, tabla: lTabla, partidos: lPartidos, estadisticas: lStats, jugadores: lJug, rachas: lRachas, corners: lCorners, proyeccion: lProy, fuerza: lFuerza }[tab])(L);
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
function lTabla(L) { return L.tabla_ok ? `<div class="panel flush scroll">${fullTable(L)}</div>` : (groupTables(L) || `<div class="panel empty">Sin tabla publicada para esta competición.</div>`); }
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
function scorersTable(L, n = 25, team = null) {
  const gs = (L.goleadores || []).filter(g => !team || g.equipo === team).slice(0, n);
  if (!gs.length) return `<div class="empty">Sin goles registrados todavía.</div>`;
  return `<table class="t"><thead><tr><th>#</th><th>Jugador</th><th class="n">Goles</th><th class="n hide-m">Penales</th><th>Últimos 5</th></tr></thead><tbody>` +
    gs.map((g, i) => `<tr class="click" data-go="jugador" data-liga="${L.id}" data-id="${esc(g.jid)}"><td><span class="pos">${i + 1}</span></td><td class="team">${face(L, g.equipo, g.jid, g.jugador)}<span>${esc(g.jugador)}${team ? "" : `<small class="faint" style="display:block;font-weight:500">${esc(corto(L, g.equipo))}</small>`}</span></td><td class="n"><b>${g.goles}</b></td><td class="n hide-m">${g.penales}</td><td><span class="l5">${(g.ult5 || []).map(v => `<i class="${v ? "on" : ""}">${v || "·"}</i>`).join("")}</span></td></tr>`).join("") + `</tbody></table>`;
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
  const zname = z => z.cls === "desc" ? "Descenso" : z.nombre.replace(" (fase de grupos)", "").replace(" (previa)", "");
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
      <div class="panel flush"><div class="ph"><h3>Goleadores</h3><button class="link" data-go="liga" data-liga="${L.id}" data-tab="jugadores">Todos →</button></div><div class="scroll">${scorersTable(L, 6)}</div></div>
      <div class="panel stack"><div class="row" style="justify-content:space-between"><h3>Rachas</h3><button class="link" data-go="liga" data-liga="${L.id}" data-tab="rachas">Todas →</button></div>${rachasList(L, (L.rachas || []).slice(0, 6))}</div>
    </aside></div>`;
}

/* ---------------- PARTIDO ---------------- */
function vPartido() {
  const L = D.ligas[R.liga], p = findMatch(R.liga, R.id);
  if (!L || !p) return `<section class="view"><button class="back" data-go="inicio">← Inicio</button><div class="panel empty">Este partido ya no está en el calendario (puede que ya se haya jugado).</div></section>`;
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
  const side = (s, t, cls) => `<div class="side ${cls}">${badge(L, t, "lg")}<button class="tn" data-go="equipo" data-liga="${L.id}" data-team="${esc(t)}">${esc(corto(L, t))}</button>
      <span class="xgv">${dec(cls === "l" ? lh : la)}</span><span class="lbl">goles esperados ${cls === "l" ? help(TIPS.xg) : ""}</span>
      <span class="row" style="gap:8px;${cls === "r" ? "justify-content:flex-end" : ""}">${s.pos ? `<span class="muted num" style="font-size:12px">${s.pos}º · ${s.pts} pts</span>` : ""}${formHtml(s.forma)}</span></div>`;
  const s1 = statOf(L, p.home), s2 = statOf(L, p.away);
  const cmp = [["Goles por partido", "gf", 2], ["Goles recibidos", "gc", 2], ["Tiros al arco", "tiros_arco", 1], ["Córners", "corners", 1], ["Posesión (%)", "posesion", 0], ["Tarjetas", "tarjetas", 1], ["Ambos marcan", "ambos", -1], ["Más de 2,5 goles", "over25", -1]]
    .filter(([, key]) => s1[key] != null && s2[key] != null)
    .map(([n, key, d]) => { const a = s1[key], b = s2[key], t = (a + b) || 1, f = v => d === -1 ? pct(v) : dec(v, d);
      return `<div class="cmp"><span class="num">${f(a)}</span><span class="cl"><i style="width:${100 * a / t}%"></i></span><span class="lbl">${n}</span><span class="cr"><i style="width:${100 * b / t}%"></i></span><span class="num">${f(b)}</span></div>`; }).join("");
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
    <div class="panel stack previa"><h3>Previa</h3>${previa(L, p, k, ct, tt)}</div>
    <div class="grid2">
      <div class="panel stack"><h3>Marcador exacto</h3><div class="scroll"><table class="heat">${heat}</table></div><p class="note">Filas: goles de ${esc(H)}. Columnas: goles de ${esc(A)}.</p></div>
      ${cmp ? `<div class="panel stack"><h3>Comparación de la temporada</h3><div class="cmph"><span>${badge(L, p.home)} ${esc(H)}</span><span>${esc(A)} ${badge(L, p.away)}</span></div>${cmp}</div>` : ""}
    </div>
    <div class="grid2">
      <div class="panel stack"><h3>Goles totales</h3>${goalsDist(m)}</div>
      <div class="panel stack"><h3>Cómo cambió la probabilidad</h3>${histChart(L, p)}</div>
    </div>
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
      <div class="mact"><button class="btn ghost sm" data-share data-liga="${L.id}" data-mid="${esc(p.id)}">Compartir imagen</button><button class="btn ghost sm" data-ics="match" data-liga="${L.id}" data-mid="${esc(p.id)}">Agregar al calendario</button></div>
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
  const zs = s.zonas ? Object.entries(s.zonas).map(([cls, v]) => { const z = (L.zonas || []).find(z => z.cls === cls); return z ? kpi(cls === "desc" ? "" : "", cls === "desc" ? "Descenso" : z.nombre.replace(" (fase de grupos)", "").replace(" (previa)", ""), pct(v, 1), "") : ""; }).join("") : "";
  return `<section class="view" aria-labelledby="h-e">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="resumen">← ${esc(L.nombre)}</button>
    <div class="lhead panel">${badge(L, t, "xl")}<div><h1 id="h-e">${esc(corto(L, t))}</h1><span class="row" style="gap:8px;margin-top:6px">${starBtn("t", L.id + "|" + t, "Seguir este equipo")}<button class="btn ghost sm cmp-btn" data-go="comparar" data-liga="${L.id}" data-team="${esc(t)}">Comparar</button><button class="btn ghost sm" data-ics="team" data-liga="${L.id}" data-team="${esc(t)}">Partidos al calendario</button></span><span class="muted">${esc(L.nombre)}${s.pos ? ` · ${s.pos}º con ${s.pts} pts en ${s.pj} partidos` : ""}</span></div><span style="margin-left:auto">${formHtml(s.forma)}</span></div>
    <div class="kpis">${s.ataque ? kpi("m", "Ataque", dec(s.ataque), "1,00 = promedio liga") + kpi("", "Defensa", dec(s.defensa), "menos es mejor") : ""}${s.pts_esp != null ? kpi("", "Pts finales", dec(s.pts_esp, 1), "proyección") + kpi("k", "Campeón", pct(s.p_campeon, 1), "") : ""}${zs}</div>
    ${st.pj ? `<div class="panel stack"><h3>Estadísticas de la temporada</h3><div class="sgrid wide">
      ${[["Goles/PJ", dec(st.gf)], ["Recibe/PJ", dec(st.gc)], ["Tiros/PJ", dec(st.tiros, 1)], ["Al arco/PJ", dec(st.tiros_arco, 1)], ["Córners/PJ", dec(st.corners, 1)], ["Posesión", st.posesion != null ? dec(st.posesion, 0) + " %" : "—"],
         ["Tarjetas/PJ", dec(st.tarjetas, 1)], ["Faltas/PJ", dec(st.faltas, 1)], ["Ambos marcan", pct(st.ambos)], ["+2,5 goles", pct(st.over25)], ["Vallas invictas", st.vallas], ["Sin marcar", st.sin_marcar]]
        .map(([n, v]) => `<div><span class="lbl">${n}</span><b class="num">${v}</b></div>`).join("")}</div></div>` : ""}
    <div class="grid2">
      ${L.tabla_ok ? `<div class="panel stack"><h3>Posición en la tabla</h3>${posChart(L, t)}</div>` : ""}
      <div class="panel stack"><h3>Goles por partido</h3>${goalsChart(L, t)}</div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="panel flush"><div class="ph"><h3>Próximos partidos</h3></div>${prox.map(p => matchRow(p, false)).join("") || `<div class="empty">Sin partidos programados.</div>`}</div>
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
function vRegistro() {
  const g = D.registro;
  if (!g) return `<section class="view"><h1>Registro</h1><div class="panel empty">Todavía no hay registro.</div></section>`;
  const tab = R.tab === "pendientes" ? "pendientes" : "calificados";
  const filas = (g.filas || []).filter(f => tab === "pendientes" ? f.hg == null : f.hg != null);
  if (tab === "pendientes") filas.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const rows = filas.map(f => {
    const L = D.ligas[f.liga] || { equipos: {} }, P = f.fH != null ? [f.fH, f.fD, f.fA] : [f.pH, f.pD, f.pA], pick = ["1", "X", "2"][P.indexOf(Math.max(...P))];
    let res = `<span class="faint">pendiente</span>`, ok = "";
    if (f.hg != null) { const r = f.hg > f.ag ? "1" : f.hg === f.ag ? "X" : "2"; res = `<b class="num">${f.hg} – ${f.ag}</b>`; ok = r === pick ? `<span class="good">✓</span>` : `<span class="bad">✗</span>`; }
    return `<tr><td class="num muted">${fecha(f.kickoff)}</td><td>${esc(corto(L, f.home))} – ${esc(corto(L, f.away))}</td><td class="n hide-m">${pct(P[0])} · ${pct(P[1])} · ${pct(P[2])}</td><td class="n">${pick}</td><td class="n">${res}</td><td class="n">${ok}</td></tr>`;
  }).join("");
  return `<section class="view" aria-labelledby="h-r">
    <h1 id="h-r">Registro público</h1>
    <p class="muted">Cada predicción se guarda antes de que empiece el partido y no se puede cambiar después. Así se mide si el modelo sirve, con resultados reales y no con capturas de los aciertos. Los números de arriba son de la probabilidad Ballytics; también se guardan el modelo propio y la cuota para compararlos.${g.desde ? ` Registro desde el ${fecha(g.desde + "T12:00")}.` : ""}</p>
    <div class="kpis">${kpi("m", "Partidos calificados", g.n || 0, "")}${kpi("", "Acierto 1X2", pct(g.acierto_1x2, 1), "el resultado más probable")}${kpi("k", `Log-loss ${help(TIPS.logloss)}`, dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)} · menos es mejor`)}${kpi("", "Más/Menos 2,5", pct(g.acierto_o25, 1), "acierto")}${kpi("", "Marcador exacto", pct(g.marcador_exacto, 1), "el más probable")}</div>
    ${g.vs_mercado ? `<div class="panel stack"><h3>Ballytics, modelo propio y mercado</h3><div class="kpis">${kpi("m", "Log-loss Ballytics", dec(g.vs_mercado.ballytics, 3), g.vs_mercado.acierto_ballytics != null ? `acierto ${pct(g.vs_mercado.acierto_ballytics, 1)}` : "")}${kpi("", "Log-loss modelo propio", dec(g.vs_mercado.modelo, 3), g.vs_mercado.acierto_modelo != null ? `acierto ${pct(g.vs_mercado.acierto_modelo, 1)}` : "")}${kpi("k", "Log-loss mercado", dec(g.vs_mercado.mercado, 3), g.vs_mercado.acierto_mercado != null ? `acierto ${pct(g.vs_mercado.acierto_mercado, 1)}` : "")}${kpi("", "Partidos con cuota", g.vs_mercado.n, "")}</div><p class="note">Solo partidos en que ESPN publicó cuotas antes del inicio. Menos es mejor.</p></div>` : ""}
    <div class="panel stack"><h3>¿Sirve el ajuste por bajas?</h3>${g.bajas && g.bajas.n ? `<div class="kpis">${kpi("m", "Log-loss modelo propio", dec(g.bajas.modelo, 3), "")}${kpi(g.bajas.con_bajas <= g.bajas.modelo ? "k" : "", "Log-loss con bajas", dec(g.bajas.con_bajas, 3), g.bajas.con_bajas <= g.bajas.modelo ? "mejora" : "no mejora")}${kpi("", "Partidos con bajas", g.bajas.n, "")}</div>` : ""}<p class="note">${g.bajas && g.bajas.n ? "Solo partidos en que faltó algún goleador. Menos es mejor." : "Se llena cuando se jueguen partidos en que faltó algún goleador por lesión o suspensión."}</p></div>
    ${g.n ? `<div class="grid2">
      <div class="panel flush scroll"><div class="ph"><h3>Por liga</h3></div><table class="t"><thead><tr><th>Liga</th><th class="n">Partidos</th><th class="n">Acierto</th><th class="n">Log-loss</th></tr></thead><tbody>${(g.por_liga || []).map(x => `<tr><td class="team">${D.ligas[x.liga] ? leagueMark(D.ligas[x.liga]) + esc(D.ligas[x.liga].nombre) : esc(x.liga)}</td><td class="n">${x.n}</td><td class="n">${pct(x.acierto, 1)}</td><td class="n">${dec(x.logloss, 3)}</td></tr>`).join("")}</tbody></table></div>
      <div class="panel flush scroll"><div class="ph"><h3>Según la confianza del modelo</h3></div><table class="t"><thead><tr><th>Probabilidad del favorito</th><th class="n">Partidos</th><th class="n">Esperado</th><th class="n">Real</th></tr></thead><tbody>${(g.confianza || []).map(x => `<tr><td>${esc(x.rango)}</td><td class="n">${x.n}</td><td class="n">${pct(x.prob, 1)}</td><td class="n ${x.acierto >= x.prob ? "good" : "bad"}">${pct(x.acierto, 1)}</td></tr>`).join("")}</tbody></table><p class="note" style="padding:0 16px 12px">Si "Real" se parece a "Esperado", las probabilidades están bien medidas.</p></div>
    </div>` : ""}
    <div class="grid2">
      <div class="panel stack"><h3>Calibración ${help(TIPS.cal)}</h3><p class="note">Si el modelo dice 40 %, ¿pasa el 40 % de las veces?</p>${calChart(g.calibracion)}${spark(g.serie)}</div>
      <div class="panel flush"><div class="ph"><h3>Predicciones</h3><div class="tabs2" role="group" aria-label="Filtro">${[["calificados", "Calificadas"], ["pendientes", "Pendientes"]].map(([k, n]) => `<button data-go="registro" data-tab="${k}" data-keep aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div><div class="scroll" style="max-height:560px;overflow:auto"><table class="t"><thead><tr><th>Fecha</th><th>Partido</th><th class="n hide-m">1 · X · 2</th><th class="n">Pick</th><th class="n">Resultado</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">${tab === "pendientes" ? "No hay partidos pendientes en el registro." : "Todavía no hay partidos calificados."}</td></tr>`}</tbody></table></div></div>
    </div></section>`;
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
      <p><b>Datos.</b> Resultados de las últimas tres temporadas, incluida la segunda división cuando existe, para medir bien a los recién ascendidos. Los partidos recientes pesan más (vida media de unos 231 días) y se mezcla un 30 % de tiros al arco con los goles, porque los tiros tienen menos ruido. Se reajusta tres veces al día.</p>
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
  xg: "Goles esperados: cuántos goles debería marcar cada equipo según el modelo. Sale de su ataque, la defensa del rival y la localía.",
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
        LIVE[String(ev.id)] = { state: ty.state, clock: st.displayClock || "", hg: h.score, ag: a.score };
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
    el.innerHTML = `<span class="s live-score ${L.state === "in" ? "on" : ""}">${esc(L.hg)}–${esc(L.ag)}</span><span class="l">${L.state === "in" ? "en vivo" : "final"}</span>`;
  });
  document.querySelectorAll("[data-live-mini]").forEach(el => {
    const L = LIVE[el.dataset.liveMini]; if (!L || L.state === "pre") return;
    el.innerHTML = `<span class="${L.state === "in" ? "livetag" : "fttag"}">${L.state === "in" ? esc(L.clock) : "Final"}</span> <b class="num">${esc(L.hg)} – ${esc(L.ag)}</b>`;
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
    if (box) box.innerHTML = `<h3>Alineaciones</h3>${adj}${html}${meta ? `<p class="note">${meta}</p>` : ""}`;
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
  if (!out.h.length && !out.a.length) return `<div class="xi ok"><h3>Con las alineaciones confirmadas</h3><p class="note">Los goleadores principales de ambos equipos son titulares: las probabilidades no cambian.</p></div>`;
  const lh = p.lh * (1 - 0.4 * share.h), la = p.la * (1 - 0.4 * share.a);
  const k0 = markets(pmatrix(L, p).m), k1 = markets(matrixLam(lh, la, L.modelo.rho).m);
  const rows = ["h", "a"].flatMap(lado => out[lado].map(x => { const t = lado === "h" ? p.home : p.away;
    const p1 = x.p0 == null ? null : x.banca ? x.p0 * 0.3 : 0;
    return `<div class="bj-row"><span class="bt ${x.banca ? "dud" : "out"}">${x.banca ? "Suplente" : "No citado"}</span>${face(L, t, x.g.jid, x.g.jugador, "sm")}<span class="bj-n"><b>${esc(x.g.jugador)}</b><small>${esc(corto(L, t))} · ${x.g.goles} goles en la temporada${x.p0 != null ? ` · marcar: ${pct(x.p0)} → ${pct(p1)}` : ""}</small></span></div>`; })).join("");
  return `<div class="xi"><h3>Con las alineaciones confirmadas ${help("Si un goleador importante empieza en la banca o no está citado, se descuenta parte de sus goles a los goles esperados de su equipo (un suplente puede entrar, así que cuenta menos). Es un ajuste estimado, hecho en tu navegador.")}</h3>
    <div class="mktrow adj"><span class="lbl">Con las alineaciones</span><span class="num">${pct(k1.H)} · ${pct(k1.D)} · ${pct(k1.A)}</span><span class="lbl">Antes</span><span class="num">${pct(k0.H)} · ${pct(k0.D)} · ${pct(k0.A)}</span></div>
    ${rows}<p class="note">Goles esperados con las alineaciones: ${dec(lh, 2)} – ${dec(la, 2)} (antes ${dec(p.lh, 2)} – ${dec(p.la, 2)}).</p></div>`;
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
    : `<p class="note">Sin bajas informadas.</p>`}</div>`;
  return `<div class="panel stack"><h3>Bajas ${help("Lesionados y suspendidos informados por API-Football. «Baja» = no juega; «Duda» = puede no jugar. Si falta un goleador, el modelo ajusta sus goles esperados.")}</h3>
    <div class="lineups">${col("h", p.home)}${col("a", p.away)}</div>
    ${p.ajuste ? `<p class="note">Por los goleadores ausentes, el modelo ajusta los goles esperados a <b>${dec(p.ajuste.lh, 2)} – ${dec(p.ajuste.la, 2)}</b>.</p>` : ""}</div>`;
}

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
    <div class="lhead panel">${face(L, pl.equipo, pl.jid, pl.jugador, "xl")}<div><h1 id="h-j">${esc(pl.jugador)}</h1><span class="muted">${esc(corto(L, pl.equipo))} · ${esc(L.nombre)}</span></div></div>
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
  const L = D.ligas[R.liga] || D.ligas[ligasIds()[0]];
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
  const ligaOpts = ligasIds().map(id => `<option value="${id}" ${id === L.id ? "selected" : ""}>${esc(D.ligas[id].nombre)}</option>`).join("");
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
      <p><b>Ballytics</b> es un proyecto personal de análisis de fútbol con modelos estadísticos. Calcula probabilidades para cada partido de 14 competiciones y las publica junto con un registro de cómo le va a cada predicción.</p>
      <p><b>Qué es.</b> Una herramienta para entender partidos: quién llega mejor, cuántos goles se esperan, qué tan probable es cada resultado y cuánto debería pagar una cuota para ser justa.</p>
      <p><b>Qué no es.</b> No es un servicio de pronósticos pagados ni una casa de apuestas, y no promete ganancias. En las pruebas con temporadas anteriores, las cuotas del mercado predijeron mejor que el modelo.</p>
      <p><b>Cómo se mantiene honesto.</b> Cada predicción queda guardada antes del partido en el <button class="link" data-go="registro">registro público</button> y se califica sola cuando termina. Nada se borra.</p>
      <p><b>Datos.</b> Resultados, estadísticas y calendario de los marcadores públicos de ESPN. El modelo, los datos procesados y este sitio se actualizan automáticamente cada dos horas.</p>
      <p><b>Método.</b> El detalle está en <button class="link" data-go="metodo">Cómo funciona</button>.</p>
    </div></section>`;
}
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
  document.querySelectorAll("[data-cd]").forEach(el => { const t = countdown(el.dataset.cd); el.textContent = t; el.hidden = !t; });
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
  return null;
}
function comboProb(sels) {
  const groups = {};
  sels.forEach(s => (groups[s.liga + "|" + s.mid] ||= []).push(s));
  let prob = 1, indep = false, missing = false;
  for (const g of Object.values(groups)) {
    const L = D.ligas[g[0].liga], p = L && findMatch(g[0].liga, g[0].mid);
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
      <div class="row"><button class="btn" id="cb-save">Guardar en Mi seguimiento</button><button class="btn ghost" id="cb-clear">Vaciar</button></div>
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
    <h1 id="h-sg">Mi seguimiento</h1>
    <p class="muted">Tus pronósticos guardados en este navegador. Se califican solos cuando terminan los partidos. Sirve para medirte con datos reales.</p>
    <div class="kpis">${kpi("m", "Pronósticos", PICKS.length, `${done.length} terminados`)}${kpi("", "Acierto", done.length ? pct(wins / done.length, 1) : "—", done.length ? `el modelo esperaba ${pct(expect / done.length, 1)}` : "")}
      ${kpi("k", "Resultado", money.length ? `${ret - staked >= 0 ? "+" : "−"}${Math.round(Math.abs(ret - staked)).toLocaleString("es-CL")}` : "—", money.length ? `ROI ${pct((ret - staked) / staked, 1)} sobre ${Math.round(staked).toLocaleString("es-CL")}` : "anota cuota y monto para verlo")}</div>
    ${rows || `<div class="panel empty">Aún no guardas pronósticos. Arma una combinada (o una sola selección) desde la pestaña Mercados de un partido y toca <b>Guardar en Mi seguimiento</b>.</div>`}
    <p class="note">Se guarda solo en este navegador y dispositivo. Si apuestas, hazlo con un presupuesto que puedas perder. <button class="link" data-go="responsable">Juego responsable</button></p>
  </section>`;
}
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
async function shareImage(L, p) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
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
  x.fillStyle = "#5d677a"; x.font = `500 24px ${D2}`; x.textAlign = "center";
  x.fillText("Probabilidades de un modelo estadístico. No son consejos de apuesta. +18", W / 2, 1255);
  x.fillStyle = "#8792a6"; x.font = `600 26px ${D3}`; x.fillText(location.host + location.pathname.replace(/\/$/, ""), W / 2, 1295);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const fname = `ballytics-${corto(L, p.home)}-${corto(L, p.away)}.png`.replace(/\s+/g, "_");
  const file = new File([blob], fname, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${corto(L, p.home)} vs ${corto(L, p.away)}`, text: "Probabilidades en Ballytics", url: location.href }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-share]"); if (!b) return;
  const L = D.ligas[b.dataset.liga], p = L && findMatch(L.id, b.dataset.mid); if (!p) return;
  b.disabled = true; shareImage(L, p).finally(() => { b.disabled = false; });
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
  try { VV.comps = await vget("assets/competiciones.json?v=1"); } catch (e) { VV.comps = []; }
  VV.comps.forEach(c => { VV.byId[c.id] = c; VV.bySlug[c.s] = c; });
  return VV.comps;
}
const compImg = (c, cls = "") => c && c.l ? `<img class="cimg ${cls}" src="${esc(c.l)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cflag',textContent:'${esc(c.f || "⚽")}'}))">` : `<span class="cflag">${esc((c && c.f) || "⚽")}</span>`;
function modelBySlug(slug) { return Object.values(D.ligas || {}).find(L => L.slug === slug) || (D.indice ? D.indice.ligas.find(l => l.slug === slug) : null); }

/* ---------- partidos del día ---------- */
function vParse(e) {
  const c = (e.competitions || [])[0] || {}, st = c.status || e.status || {}, t = st.type || {};
  const lid = String(e.uid || "").split("~l:")[1]?.split("~")[0] || "";
  const note = c.altGameNote || "", known = VV.byId[lid];
  const side = k => { const x = (c.competitors || []).find(y => y.homeAway === k) || {}, tm = x.team || {};
    return { id: String(tm.id || ""), name: tm.shortDisplayName || tm.displayName || "", full: tm.displayName || "", abr: tm.abbreviation, logo: tm.logo, color: tm.color, score: x.score, winner: x.winner }; };
  return { id: String(e.id), lid, comp: known ? known.n : (note.split(",")[0] || "Otras competiciones"), slug: known ? known.s : null,
    ronda: note.includes(",") ? note.split(",").slice(1).join(",").trim() : "", date: e.date, state: t.state, detail: t.shortDetail || t.detail || "",
    clock: st.displayClock, period: st.period, h: side("home"), a: side("away") };
}
async function vFetchDay(key, onlyKey) {
  const c = VV.cache[key];
  if (c && Date.now() - c.t < 20000) return c.evs;
  await vComps();
  const d2 = fromYmd(key); d2.setDate(d2.getDate() + 1);
  const dates = onlyKey && c ? [key] : [key, ymd(d2)];
  const res = await Promise.all(dates.map(ds => vget(`${ESPN}/all/scoreboard?dates=${ds}&limit=1000`).catch(() => null)));
  const map = new Map(c ? c.evs.map(e => [e.id, e]) : []);
  res.filter(Boolean).forEach(j => (j.events || []).forEach(e => { const x = vParse(e); if (!NCAA.has(x.lid) && localDay(x.date) === key) map.set(x.id, x); }));
  const evs = [...map.values()];
  VV.cache[key] = { t: Date.now(), evs };
  return evs;
}
function vModel(id) {
  for (const L of Object.values(D.ligas || {})) { const p = (L.partidos || []).find(x => String(x.id) === String(id)); if (p) return { L, p }; }
  return null;
}
const isLive = e => e.state === "in";
const vClock = e => /half|HT|Entretiempo/i.test(e.detail) ? "ET" : (e.clock && e.clock !== "0'" ? e.clock : e.detail);
function vTeam(e, k, cls) {
  const t = e[k], img = t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<span class="vt ${cls}${e.state === "post" && t.winner ? " win" : ""}"><span class="vtn">${esc(t.name)}</span><span class="vlogo">${img}</span></span>`;
}
function vRow(e) {
  const m = vModel(e.id), f = followed()[e.id];
  const sc = e.state === "pre" ? `<span class="vtime">${hhmm(e.date)}</span>` : `<span class="vsc num">${esc(e.h.score ?? "")}<i>-</i>${esc(e.a.score ?? "")}</span>`;
  const st = isLive(e) ? `<span class="vmin live">${esc(vClock(e))}</span>` : e.state === "post" ? `<span class="vmin">${/pen|AET|ET/i.test(e.detail) && e.detail !== "FT" ? esc(e.detail) : "Final"}</span>` : /postp|cancel|susp|delay/i.test(e.detail) ? `<span class="vmin warn">${esc(e.detail)}</span>` : `<span class="vmin">&nbsp;</span>`;
  return `<div class="vrow ${e.state}" data-go="envivo" data-id="${esc(e.id)}" role="link" tabindex="0">
    ${st}<span class="vmid">${vTeam(e, "h", "l")}${sc}${vTeam(e, "a", "r")}</span>
    <span class="vside">${m && e.state !== "post" ? `<span class="vmodel" title="Probabilidad Ballytics">${pct(m.p.pH)} · ${pct(m.p.pD)} · ${pct(m.p.pA)}</span>` : ""}${e.state !== "post" ? `<button class="vbell${f ? " on" : ""}" data-follow="${esc(e.id)}" title="${f ? "Dejar de seguir" : "Avisarme de goles"}" aria-label="Avisarme de goles">${f ? "🔔" : "🔕"}</button>` : ""}</span></div>`;
}
function vHub(active) {
  return `<div class="vhub" role="tablist">${[["vivo", "Partidos"], ["competiciones", "Competiciones"], ["noticias", "Noticias"]].map(([v, n]) => `<button role="tab" data-go="${v}" aria-selected="${v === active}">${n}</button>`).join("")}</div>`;
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
      <button class="vlivebtn" data-go="vivo" data-tab="${key}" data-id="${solo ? "" : "envivo"}" data-keep aria-pressed="${solo}"><span class="dot"></span>En vivo <b id="vv-n"></b></button>
      <div class="vsearch"><input id="vv-q" type="search" placeholder="Filtrar por equipo o competición" value="${esc(VV.q)}" autocomplete="off"></div>
    </div>
    <div id="vv-list"><div class="panel empty">Buscando partidos…</div></div>
    <p class="note">Marcadores y estadísticas en vivo de ESPN. Se actualiza solo cada 30 segundos. Toca la campana de un partido para recibir un aviso cuando haya gol (mientras tengas la página abierta).</p></section>`;
}
async function vFillList(key, solo, refresh) {
  if (D.indice) D.indice.ligas.forEach(l => ensure(l.id));
  const box = document.getElementById("vv-list"); if (!box) return;
  let evs;
  try { evs = await vFetchDay(key, refresh); } catch (e) { evs = []; }
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
    <div id="vc-list"><div class="panel empty">Cargando…</div></div></section>`;
}
async function vFillComps() {
  const all = await vComps(), box = document.getElementById("vc-list"); if (!box) return;
  const q = ((document.getElementById("vc-q") || {}).value || "").trim().toLowerCase(), fav = favComps();
  const L = all.filter(c => !q || (c.n + " " + c.p).toLowerCase().includes(q));
  const item = c => `<div class="vci"><button class="vcib" data-go="comp" data-liga="${esc(c.s)}">${compImg(c)}<span><b>${esc(c.n)}${modelBySlug(c.s) ? ` <span class="tagm" title="Con probabilidades de Ballytics">%</span>` : ""}</b><small>${esc(c.p)}${c.t.includes("fem") ? " · femenino" : ""}${c.t.includes("juv") ? " · juvenil" : ""}</small></span></button><button class="vstar${fav.includes(c.s) ? " on" : ""}" data-fcomp="${esc(c.s)}" aria-label="Seguir">${fav.includes(c.s) ? "★" : "☆"}</button></div>`;
  const favs = all.filter(c => fav.includes(c.s)), top = L.filter(c => c.o < 40);
  const regs = ["Internacional", "Sudamérica", "Europa", "Norteamérica", "Asia", "África"];
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
  if (e.target.id === "vv-q") { VV.q = e.target.value; vFillList(/^\d{8}$/.test(R.tab || "") ? R.tab : ymd(new Date()), R.id === "envivo"); }
});
document.addEventListener("change", e => { if (e.target.id === "vv-date" && e.target.value) go({ v: "vivo", tab: e.target.value.replace(/-/g, ""), id: R.id, keepScroll: true }); });
document.addEventListener("click", e => {
  const s = e.target.closest("[data-fcomp]");
  if (s) { e.stopPropagation(); e.preventDefault(); const f = favComps(), k = s.dataset.fcomp, i = f.indexOf(k); if (i >= 0) f.splice(i, 1); else f.push(k); lsSet("bt_vcomp", f);
    s.classList.toggle("on", i < 0); s.textContent = i < 0 ? "★" : "☆"; return; }
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
    <div class="panel lhead" id="cp-head"><div class="empty">Cargando…</div></div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="comp" data-liga="${esc(slug)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="cp-body"><div class="panel empty">Cargando…</div></div></section>`;
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
      return `<tr class="${hi.includes(id) ? "hl" : ""}"><td ${col}><span class="pos">${esc(val(e, "rank") || i + 1)}</span></td><td class="vtm">${slug && id ? `<button class="link tlink" data-go="club" data-liga="${esc(slug)}" data-id="${esc(id)}">` : "<span>"}${logo ? `<img class="tlogo" src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${esc(t.shortDisplayName || t.displayName || "")}${slug && id ? "</button>" : "</span>"}</td>
        <td class="n">${esc(val(e, "gamesPlayed"))}</td><td class="n hide-m">${esc(val(e, "wins"))}</td><td class="n hide-m">${esc(val(e, "ties"))}</td><td class="n hide-m">${esc(val(e, "losses"))}</td><td class="n hide-m">${esc(val(e, "pointsFor"))}</td><td class="n hide-m">${esc(val(e, "pointsAgainst"))}</td><td class="n">${esc(val(e, "pointDifferential"))}</td><td class="n"><b>${esc(val(e, "points"))}</b></td></tr>`;
    }).join("")}</tbody></table>${notes.size ? `<div class="vleg">${[...notes].map(([c, d]) => `<span><i style="background:${esc(c)}"></i>${esc(d)}</span>`).join("")}</div>` : ""}</div>`;
  }).join("");
}
function newsCards(arts) {
  return arts.length ? `<div class="vnews">${arts.map(a => { const img = ((a.images || [])[0] || {}).url, href = ((a.links || {}).web || {}).href;
    return `<a class="vnc panel flush" href="${esc(href || "#")}" target="_blank" rel="noopener noreferrer">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="vnt">${a._lg ? `<small class="tag">${esc(a._lg)}</small>` : ""}<b>${esc(a.headline || "")}</b>${a.description ? `<span class="muted">${esc(a.description)}</span>` : ""}<small class="faint">${a.published ? esc(cuando(a.published)) : ""} · ESPN</small></span></a>`; }).join("")}</div>`
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
  head.innerHTML = `${logo ? `<img class="cimg xl" src="${esc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="cflag xl">${esc((c && c.f) || "⚽")}</span>`}<div><h1>${esc(name)}</h1><span class="muted">${esc(c ? c.p : "")}${lg.season && lg.season.displayName ? " · " + esc(lg.season.displayName) : ""}</span></div>
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
    const t = stTable(groups, [], slug);
    body.innerHTML = t || `<div class="panel empty">Esta competición no tiene tabla de posiciones (o aún no empieza).</div>`;
  }
  if (tab === "noticias") { const a = await vNews(slug); if (R.v === "comp" && R.liga === slug) body.innerHTML = newsCards(a.slice(0, 18)); }
}

/* ---------- página de equipo (cualquier club o selección) ---------- */
function vClub() {
  const slug = R.liga, id = R.id, tabs = [["partidos", "Partidos"], ["plantel", "Plantel"]], tab = tabs.some(t => t[0] === R.tab) ? R.tab : "partidos";
  setTimeout(() => vFillClub(slug, id, tab), 0);
  return `<section class="view"><button class="back" data-go="comp" data-liga="${esc(slug)}">← Competición</button>
    <div class="panel lhead" id="cl-head"><div class="empty">Cargando…</div></div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="club" data-liga="${esc(slug)}" data-id="${esc(id)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="cl-body"><div class="panel empty">Cargando…</div></div></section>`;
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
  try { [past, fut] = await Promise.all([vget(`${ESPN}/${slug}/teams/${id}/schedule`).catch(() => null), vget(`${ESPN}/${slug}/teams/${id}/schedule?fixture=true`).catch(() => null)]); } catch (e) {}
  if (R.v !== "club" || R.id !== id) return;
  const t = (past || fut || {}).team || {}, logo = ((t.logos || [])[0] || {}).href || t.logo;
  head.innerHTML = `${logo ? `<img class="cimg xl" src="${esc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<div><h1>${esc(t.displayName || "Equipo")}</h1><span class="muted">${esc(t.standingSummary || (VV.bySlug[slug] || {}).n || "")}</span></div>`;
  if (tab === "partidos") {
    const pe = ((past || {}).events || []).filter(e => (((e.competitions || [])[0] || {}).status || {}).type?.state === "post").slice(-12).reverse();
    const fe = ((fut || {}).events || []).slice(0, 12);
    body.innerHTML = `<div class="grid2"><div class="panel flush vcomp"><div class="vch"><b>Próximos partidos</b></div>${fe.length ? fe.map(e => schedRow(e, id)).join("") : `<div class="empty">Sin partidos programados.</div>`}</div>
      <div class="panel flush vcomp"><div class="vch"><b>Últimos resultados</b></div>${pe.length ? pe.map(e => schedRow(e, id)).join("") : `<div class="empty">Sin resultados.</div>`}</div></div>`;
  }
  if (tab === "plantel") {
    try { ros = await vget(`${ESPN}/${slug}/teams/${id}/roster`); } catch (e) {}
    if (R.v !== "club" || R.id !== id) return;
    const A = (ros && ros.athletes) || [], ord = { G: 0, D: 1, M: 2, F: 3 }, grp = { G: "Arqueros", D: "Defensas", M: "Mediocampistas", F: "Delanteros" };
    const by = {}; A.forEach(a => { const p = ((a.position || {}).abbreviation || "M")[0]; (by[p in ord ? p : "M"] ||= []).push(a); });
    const Lf = { equipos: { [t.displayName]: { color: t.color, logo } } };
    body.innerHTML = A.length ? Object.keys(by).sort((a, b) => ord[a] - ord[b]).map(p => `<div class="panel stack"><h3>${grp[p]}</h3><div class="vsquad">${by[p].map(a => `<div class="vsq">${face(Lf, t.displayName, a.id, a.displayName, "")}<span><b>${esc(a.displayName)}</b><small>${a.jersey ? "#" + esc(a.jersey) + " · " : ""}${a.age ? esc(a.age) + " años" : ""}${a.citizenship ? " · " + esc(a.citizenship) : ""}</small></span></div>`).join("")}</div></div>`).join("")
      + (ros.coach && ros.coach[0] ? `<p class="note">Entrenador: <b>${esc([ros.coach[0].firstName, ros.coach[0].lastName].filter(Boolean).join(" "))}</b></p>` : "")
      : `<div class="panel empty">Plantel no disponible.</div>`;
  }
}

/* ---------- noticias ---------- */
function vNoticias() {
  setTimeout(vFillNoticias, 0);
  return `<section class="view" aria-labelledby="h-news"><h1 id="h-news">Noticias</h1>${vHub("noticias")}<div id="vn-list"><div class="panel empty">Cargando noticias…</div></div>
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
async function vToggleFollow(id, btn) {
  const f = followed();
  if (f[id]) { delete f[id]; lsSet("bt_vfollow", f); if (btn) { btn.classList.remove("on"); btn.textContent = "🔕"; } return; }
  if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} }
  const ev = Object.values(VV.cache).flatMap(c => c.evs).find(e => e.id === id);
  f[id] = { s: ev ? `${ev.h.score ?? 0}-${ev.a.score ?? 0}` : "", n: ev ? `${ev.h.name} vs ${ev.a.name}` : "", d: ev ? ev.date : "" };
  lsSet("bt_vfollow", f);
  if (btn) { btn.classList.add("on"); btn.textContent = "🔔"; }
  if (!("Notification" in window) || Notification.permission !== "granted") toast("Te avisaré aquí en la página. Para avisos del sistema, permite las notificaciones en tu navegador.");
  else toast("Listo: te aviso cuando haya gol en este partido.");
}
function toast(msg) { const t = document.createElement("div"); t.className = "vtoast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
async function vWatch() {
  const f = followed(), ids = Object.keys(f); if (!ids.length || document.hidden) return;
  const old = Date.now() - 3 * DAYMS; ids.forEach(i => { if (f[i].d && new Date(f[i].d).getTime() < old) delete f[i]; });
  const key = ymd(new Date()); let evs = [];
  try { delete VV.cache[key]; evs = await vFetchDay(key); } catch (e) { return; }
  evs.forEach(e => { const w = f[e.id]; if (!w) return; const s = `${e.h.score ?? 0}-${e.a.score ?? 0}`;
    if (w.s && s !== w.s && e.state !== "pre") { const msg = `${e.h.name} ${e.h.score} – ${e.a.score} ${e.a.name}`;
      if ("Notification" in window && Notification.permission === "granted") { try { new Notification("¡Gol!", { body: msg, tag: e.id }); } catch (x) {} }
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
    <div class="panel vhead" id="vc-head"><div class="empty">Cargando partido…</div></div>
    <div class="mtabs vtabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" data-go="envivo" data-id="${esc(R.id)}" data-tab="${k}" data-keep aria-selected="${k === tab}">${n}</button>`).join("")}</div>
    <div id="vc-body"></div></section>`;
}
async function vSummary(id, force) {
  const c = VV.sum[id];
  if (c && !force && Date.now() - c.t < 20000) return c.j;
  const j = await vget(`${ESPN}/all/summary?event=${encodeURIComponent(id)}`); VV.sum[id] = { t: Date.now(), j }; return j;
}
function vHeader(j) {
  const c = ((j.header || {}).competitions || [])[0] || {}, st = c.status || {}, t = st.type || {}, lg = (j.header || {}).league || {};
  const side = k => { const x = (c.competitors || []).find(y => y.homeAway === k) || {}, tm = x.team || {};
    return { id: String(tm.id || ""), name: tm.displayName || tm.name || "", short: tm.shortDisplayName || tm.displayName || "", logo: tm.logo || ((tm.logos || [])[0] || {}).href, color: tm.color, score: x.score, rec: (x.record || [])[0] }; };
  return { state: t.state, detail: t.shortDetail || t.detail || "", clock: st.displayClock, period: st.period, date: c.date, h: side("home"), a: side("away"),
    league: lg.name || "", slug: lg.slug || "", lid: String(lg.id || ""), note: (c.notes || [])[0] ? c.notes[0].headline : "" };
}
const minOf = H => { if (H.state === "post") return 90; if (H.state !== "in") return 0; const m = parseInt(String(H.clock || "0"), 10) || 0; return /half|HT|Entretiempo/i.test(H.detail) ? 45 : Math.min(m, 90); };
function vEvents(j, H) {
  return (j.keyEvents || []).filter(e => e.type && /goal|card|substitution|penalty/i.test((e.type.type || "") + (e.type.text || ""))).map(e => {
    const ty = (e.type.type || e.type.text || "").toLowerCase(), team = String((e.team || {}).id || ""), lado = team === H.h.id ? "h" : team === H.a.id ? "a" : "";
    const who = (e.participants || []).map(p => (p.athlete || {}).displayName).filter(Boolean);
    const kind = /own/.test(ty) ? "og" : /missed|saved/.test(ty) ? "miss" : /goal|scored/.test(ty) ? "goal" : /red/.test(ty) ? "red" : /yellow/.test(ty) ? "yellow" : /substitution/.test(ty) ? "sub" : "other";
    return { min: (e.clock || {}).displayValue || "", lado, kind, who, text: e.text || "", pen: /penalty/.test(ty) };
  });
}
const ICON = { goal: "⚽", og: "⚽", miss: "✕", yellow: `<i class="ycard"></i>`, red: `<i class="rcard"></i>`, sub: "⇄", other: "•" };
function vLogo(t, cls = "") { return `<span class="vlogo ${cls}">${t.logo ? `<img src="${esc(t.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc((t.short || "?").slice(0, 3))}</span>`; }

async function vFillMatch(force) {
  const id = R.id, head = document.getElementById("vc-head"), body = document.getElementById("vc-body");
  if (!head || !body) return;
  let j;
  try { j = await vSummary(id, force); } catch (e) { head.innerHTML = `<div class="empty">No pude cargar este partido. Prueba de nuevo en un rato.</div>`; return; }
  if (R.v !== "envivo" || R.id !== id) return;
  await vComps();
  const H = vHeader(j), evs = vEvents(j, H), c = VV.byId[H.lid], comp = c ? c.n : H.league, m = vModel(id); VV.state = H.state;
  const goals = l => evs.filter(e => (e.kind === "goal" && e.lado === l) || (e.kind === "og" && e.lado && e.lado !== l)).map(e => `${esc((e.who[0] || "").split(" ").slice(-1)[0])} ${esc(e.min)}${e.kind === "og" ? " (ec)" : e.pen ? " (p)" : ""}`).join(", ");
  const status = H.state === "in" ? `<span class="vmin live big">${esc(/half|HT/i.test(H.detail) ? "Entretiempo" : H.clock || H.detail)}</span>` : H.state === "post" ? `<span class="vmin big">${esc(H.detail && H.detail !== "FT" ? H.detail : "Final")}</span>` : `<span class="vmin big">${esc(new Date(H.date).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))} · ${hhmm(H.date)}</span>`;
  const tl = (t, cls) => H.slug && t.id ? `<button class="vhteam tbtn" data-go="club" data-liga="${esc(H.slug)}" data-id="${esc(t.id)}">${vLogo(t, "xl")}<b>${esc(t.short)}</b><small>${goals(cls)}</small></button>` : `<div class="vhteam">${vLogo(t, "xl")}<b>${esc(t.short)}</b><small>${goals(cls)}</small></div>`;
  const f = followed()[id];
  head.innerHTML = `<div class="vhcomp">${H.slug ? `<button class="link" data-go="comp" data-liga="${esc(H.slug)}">${esc(comp)}</button>` : esc(comp)}${H.note ? ` · ${esc(H.note)}` : ""}</div>
    <div class="vhrow">${tl(H.h, "h")}
      <div class="vhmid">${H.state === "pre" ? `<span class="vhsc num">vs</span>` : `<span class="vhsc num">${esc(H.h.score ?? 0)} – ${esc(H.a.score ?? 0)}</span>`}${status}</div>
      ${tl(H.a, "a")}</div>
    <div class="row" style="justify-content:center;margin-top:10px;gap:8px">${H.state !== "post" ? `<button class="btn ghost sm vbell2${f ? " on" : ""}" data-follow="${esc(id)}">${f ? "🔔 Siguiendo" : "🔕 Avisarme de goles"}</button>` : ""}${m ? `<button class="btn ghost sm" data-go="partido" data-liga="${m.L.id}" data-id="${esc(m.p.id)}">Análisis de Ballytics →</button>` : ""}</div>`;
  const tab = R.tab || "resumen";
  if (tab === "resumen") body.innerHTML = (m ? vProbPanel(m, H) : "") + vKeyStats(j, H) + vTimeline(evs, H) + vInfo(j);
  if (tab === "alineaciones") body.innerHTML = vPitch(j, H);
  if (tab === "estadisticas") body.innerHTML = vStats(j, H);
  if (tab === "previa") body.innerHTML = vPrevia(j, H, m);
  if (tab === "tabla") { const g = ((j.standings || {}).groups || []); body.innerHTML = g.length ? stTable(g.map(x => ({ name: x.header, standings: x.standings })), [H.h.id, H.a.id], H.slug) : `<div class="panel empty">Sin tabla para esta competición.</div>`; }
  if (tab === "minuto") body.innerHTML = vComments(j);
}
function vInfo(j) {
  const gi = j.gameInfo || {}, v = gi.venue || {}, ref = (gi.officials || [])[0], tv = ((j.broadcasts || [])[0] || {});
  const items = [v.fullName ? `Estadio: <b>${esc(v.fullName)}</b>${v.address && v.address.city ? ` (${esc(v.address.city)})` : ""}` : "", ref ? `Árbitro: <b>${esc(ref.displayName || ref.fullName || "")}</b>` : "", gi.attendance ? `Público: <b>${Number(gi.attendance).toLocaleString("es-CL")}</b>` : ""].filter(Boolean);
  return items.length ? `<div class="panel stack"><h3>Información</h3><p class="note" style="font-size:14px">${items.join(" · ")}</p></div>` : "";
}
function vPrevia(j, H, m) {
  const L5 = j.lastFiveGames || [];
  const form = t => { const g = L5.find(x => String((x.team || {}).id) === t.id); const ev = (g && g.events) || [];
    return ev.length ? `<div class="vform">${ev.map(e => { const r = (e.gameResult || "").toUpperCase(), cl = r === "W" ? "G" : r === "L" ? "P" : r === "D" ? "E" : "";
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
function vKeyStats(j, H) { const r = vStatRows(j, H, KEY); return r ? `<div class="panel stack"><h3>Estadísticas importantes</h3>${r}<button class="link" data-go="envivo" data-id="${esc(R.id)}" data-tab="estadisticas" data-keep>Todas las estadísticas →</button></div>` : ""; }
function vStats(j, H) { const r = vStatRows(j, H); return `<div class="panel stack"><h3>Estadísticas</h3>${r || `<p class="note">Las estadísticas aparecen cuando empieza el partido.</p>`}</div>`; }
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
function vPitch(j, H) {
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
    return `<div class="vpl">${face(Lf, team.name, id, a.displayName, "lg")}<span class="vjn num">${esc(x.jersey || "")}</span>${g ? `<span class="vgl">${"⚽".repeat(Math.min(g, 3))}</span>` : ""}${card ? `<i class="${card === "red" ? "rcard" : "ycard"} vcd"></i>` : ""}${x.subbedOut ? `<span class="vso">⇄</span>` : ""}<b>${esc(nm.split(" ").slice(-1)[0] || nm)}</b></div>`; };
  const pitch = `<div class="vpitch"><div class="vlines"><i class="c"></i><i class="b t"></i><i class="b bt"></i></div>${rows.slice().reverse().map(r => `<div class="vprow">${r.map(chip).join("")}</div>`).join("")}</div>`;
  return `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>Alineaciones ${T.formation ? `<span class="tag">${esc(T.formation)}</span>` : ""}</h3>
      <div class="tabs2" role="group" aria-label="Equipo">${[["h", H.h], ["a", H.a]].map(([k, t]) => `<button data-vteam="${k}" aria-pressed="${(VV.team === "a" ? "a" : "h") === k}">${esc(t.short)}</button>`).join("")}</div></div>
    ${pitch}
    ${subs.length ? `<h3 style="margin-top:6px">Suplentes</h3><div class="vsubs">${subs.map(x => `<div class="vsb ${x.subbedIn ? "in" : ""}"><span class="num vjn2">${esc(x.jersey || "")}</span>${face(Lf, team.name, (x.athlete || {}).id, (x.athlete || {}).displayName, "sm")}<span>${esc((x.athlete || {}).displayName || "")}</span>${x.subbedIn ? `<small>entró</small>` : ""}</div>`).join("")}</div>` : ""}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-vteam]"); if (!b) return; VV.team = b.dataset.vteam; vFillMatch(); });

load().then(() => { R = fromHash(); render(); pollLive(); setInterval(pollLive, 60000);
  D.all.then(() => { if (R.v === "inicio" || R.v === "registro") { const y = window.scrollY; render(); window.scrollTo(0, y); } }); })
  .catch(err => { $app.innerHTML = `<div class="panel empty">No pude cargar los datos (${esc(err.message)}). Si abriste el archivo directo desde tu computador, el navegador bloquea la lectura: usa la versión publicada.</div>`; });
})();
