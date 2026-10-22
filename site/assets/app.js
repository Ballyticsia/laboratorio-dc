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
function matrix(M, h, a) {
  const [lh, la] = rates(M, h, a), r = M.rho, m = []; let s = 0;
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
async function load() {
  D.indice = await getJSON("data/indice.json");
  const ls = await Promise.all(D.indice.ligas.map(l => getJSON(`data/${l.id}.json`).catch(() => null)));
  ls.forEach(L => { if (L) D.ligas[L.id] = L; });
  [D.registro, D.metodo] = await Promise.all([getJSON("data/registro.json").catch(() => null), getJSON("data/metodologia.json").catch(() => null)]);
  document.getElementById("foot-upd").innerHTML = `<span class="dot"></span>Actualizado ${new Date(D.indice.actualizado).toLocaleDateString("es-CL")} ${hhmm(D.indice.actualizado)}`;
  buildMenu();
}
const ligasIds = () => Object.keys(D.ligas);
const allMatches = () => ligasIds().flatMap(id => D.ligas[id].partidos.map(p => ({ ...p, L: D.ligas[id] })));
const findMatch = (liga, id) => { const L = D.ligas[liga]; return L && L.partidos.find(p => String(p.id) === String(id)); };
const statOf = (L, t) => (L.stats || []).find(s => s.equipo === t) || {};
const rowOf = (L, t) => { const s = (L.tabla || []).find(s => s.equipo === t) || {}; return L.tabla_ok ? s : { ...s, pos: null, pts: s.pts, zonas: null, pts_esp: null }; };
const strength = (L, t) => { const s = rowOf(L, t); return (s.ataque || 1) / (s.defensa || 1); };

/* ---------------- menú y búsqueda ---------------- */
function buildMenu() {
  const groups = {};
  D.indice.ligas.forEach(l => { if (D.ligas[l.id]) (groups[l.region] ||= []).push(D.ligas[l.id]); });
  const m = document.getElementById("dd-menu");
  m.innerHTML = Object.entries(groups).map(([g, ls]) => `<div class="dd-col"><span class="lbl">${esc(g)}</span>` +
    ls.map(L => `<button class="dd-item" data-go="liga" data-liga="${L.id}" data-tab="resumen">${leagueMark(L)}<span>${esc(L.nombre)}<small>${esc(L.pais)}</small></span></button>`).join("") + `</div>`).join("");
  const btns = [...document.querySelectorAll(".dd-toggle")];
  const setOpen = open => { m.hidden = !open; btns.forEach(b => b.setAttribute("aria-expanded", String(open))); document.body.classList.toggle("sheet-open", open); };
  btns.forEach(b => b.addEventListener("click", e => { e.stopPropagation(); setOpen(m.hidden); }));
  document.addEventListener("click", e => { if (!e.target.closest(".dd-menu") && !e.target.closest(".dd-toggle")) setOpen(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { setOpen(false); document.getElementById("sres").hidden = true; } });
  const q = document.getElementById("q"), res = document.getElementById("sres");
  const teams = ligasIds().flatMap(id => D.ligas[id].tabla.map(s => ({ L: D.ligas[id], t: s.equipo })))
    .concat(ligasIds().filter(id => !D.ligas[id].tabla.length).flatMap(id => Object.keys(D.ligas[id].equipos).map(t => ({ L: D.ligas[id], t }))));
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  q.addEventListener("input", () => {
    const v = norm(q.value.trim());
    if (v.length < 2) { res.hidden = true; return; }
    const hits = teams.filter(x => norm(x.t).includes(v) || norm(corto(x.L, x.t)).includes(v)).slice(0, 8);
    res.innerHTML = hits.length ? hits.map(x => `<button class="dd-item" data-go="equipo" data-liga="${x.L.id}" data-team="${esc(x.t)}">${badge(x.L, x.t)}<span>${esc(corto(x.L, x.t))}<small>${esc(x.L.nombre)}</small></span></button>`).join("")
      : `<p class="note" style="padding:10px">Sin resultados.</p>`;
    res.hidden = false;
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) res.hidden = true; });
  res.addEventListener("click", () => { res.hidden = true; q.value = ""; });
  m.addEventListener("click", e => { if (e.target.closest("[data-go]")) setOpen(false); });
}

/* ---------------- rutas ---------------- */
function toHash(r) {
  if (r.v === "liga") return `#/liga/${r.liga}/${r.tab || "resumen"}`;
  if (r.v === "partido") return `#/partido/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "equipo") return `#/equipo/${r.liga}/${encodeURIComponent(r.team)}`;
  if (r.v === "registro" && r.tab) return `#/registro/${r.tab}`;
  if (r.v === "jugador") return `#/jugador/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "comparar") return `#/comparar/${r.liga}/${encodeURIComponent(r.team || "")}/${encodeURIComponent(r.id || "")}`;
  if (r.v === "inicio") return r.liga && r.liga !== "todas" ? `#/partidos/${r.liga}` : "#/";
  return `#/${r.v}`;
}
function fromHash() {
  const p = (location.hash || "#/").slice(2).split("/").map(decodeURIComponent);
  const first = ligasIds()[0];
  switch (p[0]) {
    case "liga": return { v: "liga", liga: D.ligas[p[1]] ? p[1] : first, tab: p[2] || "resumen" };
    case "partido": return { v: "partido", liga: p[1], id: p[2] };
    case "equipo": return { v: "equipo", liga: p[1], team: p[2] };
    case "registro": return { v: "registro", tab: p[1] };
    case "metodo": return { v: "metodo" };
    case "sobre": return { v: "sobre" };
    case "responsable": return { v: "responsable" };
    case "jugador": return { v: "jugador", liga: p[1], id: p[2] };
    case "comparar": return { v: "comparar", liga: D.ligas[p[1]] ? p[1] : first, team: p[2], id: p[3] };
    case "partidos": return { v: "inicio", liga: D.ligas[p[1]] ? p[1] : "todas" };
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
  go({ v, liga: el.dataset.liga || (v === "inicio" ? "todas" : undefined), id: el.dataset.id, team: el.dataset.team, tab: el.dataset.tab,
       wk: el.dataset.wk, sort: el.dataset.sort, keepScroll: el.hasAttribute("data-keep") });
  if (el.classList.contains("lpick")) { const g = document.querySelector(".lgrid"); if (g) window.scrollTo({ top: g.getBoundingClientRect().top + window.scrollY - 90 }); }
});

function render() {
  timers.splice(0).forEach(clearInterval);
  const sec = ({ partido: "inicio", equipo: "liga", jugador: "liga", comparar: "liga", sobre: "metodo", responsable: "metodo" }[R.v] || R.v);
  document.querySelectorAll("[data-nav]").forEach(b => b.setAttribute("aria-current", b.dataset.nav === sec ? "page" : "false"));
  const f = { inicio: vInicio, liga: vLiga, partido: vPartido, equipo: vEquipo, registro: vRegistro, metodo: vMetodo,
    sobre: vSobre, responsable: vResponsable, jugador: vJugador, comparar: vComparar }[R.v] || vInicio;
  $app.innerHTML = staleBanner() + f();
  if (R.v === "partido") { bindOdds(); loadSummary(); }
  if (R.v === "comparar") bindCompare();
  bindCarousels();
  paintLive();
}

/* ---------------- componentes ---------------- */
const formHtml = f => `<span class="form">${(f || []).map(x => `<i class="${x}">${x}</i>`).join("")}</span>`;
const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="lbl">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;
const bar3 = (h, d, a) => `<span class="bars"><i style="width:${100 * h}%"></i><i style="width:${100 * d}%"></i><i style="width:${100 * a}%"></i></span>`;
function zoneOf(L, pos) { return (L.zonas || []).find(z => pos >= z.desde && pos <= z.hasta); }
function posTag(L, pos) { const z = zoneOf(L, pos); return `<span class="pos ${z ? "z-" + z.cls : ""}" ${z ? `title="${esc(z.nombre)}"` : ""}>${pos}</span>`; }

function matchRow(p, showLeague) {
  const L = p.L || D.ligas[p.liga], fav = p.pH >= p.pA ? "h" : "a";
  const pick = p.pH >= p.pD && p.pH >= p.pA ? "1" : p.pA >= p.pD ? "2" : "X";
  return `<button class="mrow" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
    <span class="t" data-live-t="${esc(p.id)}">${p.estado === "en_vivo" ? `<span class="livetag">EN VIVO</span>` : hhmm(p.kickoff)}${showLeague ? `<span class="lg">${esc(L.nombre)}</span>` : ""}</span>
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
    const show = k => { i = (k + slides.length) % slides.length; slides.forEach((s, j) => s.hidden = j !== i); dots.forEach((d, j) => d.setAttribute("aria-pressed", String(j === i))); };
    dots.forEach(d => d.addEventListener("click", e => { e.stopPropagation(); show(+d.dataset.i); paused = true; }));
    c.addEventListener("mouseenter", () => paused = true);
    c.addEventListener("mouseleave", () => paused = false);
    c.addEventListener("focusin", () => paused = true);
    if (!reduce) timers.push(setInterval(() => { if (!paused && !document.hidden) show(i + 1); }, c.dataset.car === "hero" ? 7000 : 9000));
  });
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
      <div class="hero-top">${leagueMark(L, "sm")}<span>${esc(L.nombre)}</span><span class="faint">·</span><span>${esc(cuando(p.kickoff))}</span></div>
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
      <div class="fp-head">${badge(L, j.equipo, "lg")}<div><b class="fp-name">${esc(j.jugador)}</b><span class="muted">${esc(corto(L, j.equipo))} · ${esc(L.nombre)}</span></div></div>
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

  // proyección del partido destacado
  const fx = heroMs[0];
  let proy = `<p class="note">Sin partidos próximos.</p>`;
  if (fx) {
    const L = fx.L, mk = markets(matrix(L.modelo, fx.home, fx.away).m);
    const ct = fx.ch != null ? fx.ch + fx.ca : null, tt = fx.th != null ? fx.th + fx.ta : null;
    proy = `<div class="proj">
      <div class="proj-t">${badge(L, fx.home)}<b>${esc(corto(L, fx.home))}</b><span class="num xg2">${dec(fx.lh, 1)}</span><span class="faint">–</span><span class="num xg2">${dec(fx.la, 1)}</span><b>${esc(corto(L, fx.away))}</b>${badge(L, fx.away)}</div>
      <div class="p3">${bar3(mk.H, mk.D, mk.A)}</div>
      <div class="oddsrow">${[["1", mk.H], ["X", mk.D], ["2", mk.A]].map(([k, v]) => `<div><span class="lbl">${k}</span><b class="num">${dec(1 / v)}</b><small>${pct(v)}</small></div>`).join("")}</div>
      <div class="oddsrow">${[["+2,5 goles", mk.O25], ["Ambos marcan", mk.B]].map(([k, v]) => `<div><span class="lbl">${k}</span><b class="num">${dec(1 / v)}</b><small>${pct(v)}</small></div>`).join("")}
        ${ct != null ? `<div><span class="lbl">Córners</span><b class="num">${dec(ct, 1)}</b><small>esperados</small></div>` : ""}${tt != null ? `<div><span class="lbl">Tarjetas</span><b class="num">${dec(tt, 1)}</b><small>esperadas</small></div>` : ""}</div>
      <p class="note">Cuota justa = 1 / probabilidad, sin margen de casa.</p></div>`;
  }

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

  // rachas
  const rach = (P.rachas || []).map(s => { const L = D.ligas[s.liga]; return L ? `<button class="srow" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}">${badge(L, s.equipo)}<span><b>${esc(corto(L, s.equipo))}</b><small>${esc(s.texto)}</small></span><span class="sn num">${s.n}</span></button>` : ""; }).join("") || `<p class="note">Sin rachas destacadas.</p>`;

  // rendimiento del modelo
  const g = D.registro;
  const perf = g && g.n ? `<div class="kpis two">${kpi("m", "Acierto 1X2", pct(g.acierto_1x2), `${g.n} partidos`)}${kpi("", "Log-loss", dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)}`)}</div>${spark(g.serie)}`
    : `<p class="note">Cada predicción queda guardada antes del partido y se califica después. El registro se llena con los primeros resultados.</p>`;

  // lista de todos los partidos
  const sel = R.liga || "todas", lim = now + 7 * DAYMS;
  const ms = allMatches().filter(p => (sel === "todas" || p.L.id === sel) && new Date(p.kickoff).getTime() <= lim && new Date(p.kickoff).getTime() >= now - 3 * 3600e3).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const groups = {}; ms.forEach(p => (groups[dayKey(p.kickoff)] ||= []).push(p));
  const list = Object.keys(groups).length ? Object.entries(groups).map(([k, arr]) => `<div class="day">${esc(dayLabel(k))}</div>` + arr.map(p => matchRow(p, sel === "todas")).join("")).join("")
    : `<div class="empty">No hay partidos en los próximos 7 días${sel !== "todas" ? " para esta liga" : ""}.</div>`;
  const chips = `<div class="lgrid" role="group" aria-label="Filtrar por liga"><button class="lpick all" data-go="inicio" data-liga="todas" data-keep aria-pressed="${sel === "todas"}" title="Todas las ligas"><span class="lmark">★</span><span>Todas</span></button>` +
    ligasIds().map(id => `<button class="lpick" data-go="inicio" data-liga="${id}" data-keep aria-pressed="${sel === id}" title="${esc(D.ligas[id].nombre)}">${leagueMark(D.ligas[id])}<span>${esc(D.ligas[id].nombre)}</span></button>`).join("") + `</div>`;

  return `<section class="view" aria-labelledby="h-inicio">
    <h1 id="h-inicio" class="sr">Ballytics: probabilidades de fútbol</h1>
    <div class="hero panel">${carousel("hero", hero, "Partidos destacados")}</div>
    <div class="cards">
      ${card("Jugador destacado", carousel("jug", jug, "Jugadores destacados"), `<span class="tag">Goleadores</span>`, "accent")}
      ${card("Equipo en forma", carousel("eq", eqs, "Equipos en forma"), `<span class="tag">Últimos 5</span>`)}
      ${card("Proyección del partido", proy, fx ? `<span class="tag">${esc(fx.L.nombre)}</span>` : "")}
      ${card("Ranking de fuerza", `<div class="scroll">${rank}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="fuerza">Ranking completo →</button>`, sw("rk"))}
      ${card("Tabla", `<div class="scroll">${tabla}</div><button class="link" data-go="liga" data-liga="${hl}" data-tab="tabla">Tabla completa →</button>`, sw("tb"))}
      ${card("Próximos partidos", `<div class="nlist">${prox}</div>`)}
      ${card("Trío más probable", `<div class="trio">${trio}</div>`, `<span class="tag">Esta semana</span>`, "dark")}
      ${card("Rachas activas", `<div class="slist">${rach}</div>`)}
      ${card("Rendimiento del modelo", `${perf}<button class="link" data-go="registro">Ver registro →</button>`, `<span class="tag">Público</span>`)}
    </div>
    <div class="row" style="justify-content:space-between"><h2>Todos los partidos de la semana</h2><span class="note">Elige una liga</span></div>
    ${chips}
    <div class="panel flush">${list}</div>
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
    <div class="lhead panel">${leagueMark(L, "xl")}<div><h1 id="h-liga">${esc(L.nombre)}</h1><span class="muted">${esc(L.pais)} · datos hasta ${L.datos_hasta ? fecha(L.datos_hasta + "T12:00") : "—"}</span></div></div>
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
    gs.map((g, i) => `<tr class="click" data-go="jugador" data-liga="${L.id}" data-id="${esc(g.jid)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, g.equipo)}<span>${esc(g.jugador)}${team ? "" : `<small class="faint" style="display:block;font-weight:500">${esc(corto(L, g.equipo))}</small>`}</span></td><td class="n"><b>${g.goles}</b></td><td class="n hide-m">${g.penales}</td><td><span class="l5">${(g.ult5 || []).map(v => `<i class="${v ? "on" : ""}">${v || "·"}</i>`).join("")}</span></td></tr>`).join("") + `</tbody></table>`;
}
function cardsTable(L, n = 20) {
  const ts = (L.amonestados || []).slice(0, n);
  if (!ts.length) return `<div class="empty">Sin tarjetas registradas.</div>`;
  return `<table class="t"><thead><tr><th>#</th><th>Jugador</th><th class="n">Amarillas</th><th class="n">Rojas</th></tr></thead><tbody>` +
    ts.map((g, i) => `<tr><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, g.equipo)}<span>${esc(g.jugador)}<small class="faint" style="display:block;font-weight:500">${esc(corto(L, g.equipo))}</small></span></td><td class="n"><span class="ycard"></span> ${g.amarillas}</td><td class="n">${g.rojas ? `<span class="rcard"></span> ${g.rojas}` : "—"}</td></tr>`).join("") + `</tbody></table>`;
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
  return `<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n hide-m">Pts hoy</th><th class="n">Pts finales</th><th class="n">Campeón</th>${zs.map(z => `<th class="n hide-m">${esc(zname(z))}</th>`).join("")}</tr></thead><tbody>` +
    t.map((s, i) => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n hide-m">${s.pts}</td><td class="n"><b>${dec(s.pts_esp, 1)}</b></td><td>${pb(s.p_campeon, "gold")}</td>${zs.map(z => `<td class="hide-m">${pb((s.zonas || {})[z.cls], z.cls === "desc" ? "bad" : "")}</td>`).join("")}</tr>`).join("") +
    `</tbody></table></div><p class="note">10.000 simulaciones del resto de la temporada con el modelo actual.</p>`;
}
function lFuerza(L) {
  const t = [...L.tabla].sort((a, b) => (b.ataque / b.defensa) - (a.ataque / a.defensa));
  const mx = Math.max(...t.map(s => s.ataque / s.defensa));
  return `<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">Ataque</th><th class="n">Defensa</th><th>Fuerza global</th></tr></thead><tbody>` +
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
  const { m, lh, la } = matrix(L.modelo, p.home, p.away), k = markets(m);
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
  const mk = `<tr><th>Mercado</th><th style="text-align:right">Prob.</th><th style="text-align:right">Justa</th><th style="text-align:right">Tu cuota</th><th style="text-align:right">EV</th></tr>` +
    groups.map(([g, rows]) => `<tr class="grp"><td colspan="5">${g}</td></tr>` + rows.map(([key, n, pr]) => `<tr><td>${esc(n)}</td><td class="n">${pct(pr, 1)}</td><td class="n">${dec(1 / pr)}</td>
      <td class="n"><input class="odd" inputmode="decimal" aria-label="Cuota ${esc(n)}" data-k="${esc(key)}" data-p="${pr}" value="${st[key] ? String(st[key]).replace(".", ",") : ""}" placeholder="—"></td><td class="n" data-ev="${esc(key)}"></td></tr>`).join("")).join("");
  const reg = D.registro && D.registro.filas && D.registro.filas.find(f => String(f.id) === String(p.id));
  const side = (s, t, cls) => `<div class="side ${cls}">${badge(L, t, "lg")}<button class="tn" data-go="equipo" data-liga="${L.id}" data-team="${esc(t)}">${esc(corto(L, t))}</button>
      <span class="xgv">${dec(cls === "l" ? lh : la)}</span><span class="lbl">goles esperados</span>
      <span class="row" style="gap:8px;${cls === "r" ? "justify-content:flex-end" : ""}">${s.pos ? `<span class="muted num" style="font-size:12px">${s.pos}º · ${s.pts} pts</span>` : ""}${formHtml(s.forma)}</span></div>`;
  const s1 = statOf(L, p.home), s2 = statOf(L, p.away);
  const cmp = [["Goles por partido", "gf", 2], ["Goles recibidos", "gc", 2], ["Tiros al arco", "tiros_arco", 1], ["Córners", "corners", 1], ["Posesión (%)", "posesion", 0], ["Tarjetas", "tarjetas", 1], ["Ambos marcan", "ambos", -1], ["Más de 2,5 goles", "over25", -1]]
    .filter(([, key]) => s1[key] != null && s2[key] != null)
    .map(([n, key, d]) => { const a = s1[key], b = s2[key], t = (a + b) || 1, f = v => d === -1 ? pct(v) : dec(v, d);
      return `<div class="cmp"><span class="num">${f(a)}</span><span class="cl"><i style="width:${100 * a / t}%"></i></span><span class="lbl">${n}</span><span class="cr"><i style="width:${100 * b / t}%"></i></span><span class="num">${f(b)}</span></div>`; }).join("");
  const scorers = (p.goleadores || []).length ? (p.goleadores || []).map(g => `<div class="srow" data-go="jugador" data-liga="${L.id}" data-id="${esc(g.jid)}">${badge(L, g.lado === "h" ? p.home : p.away)}<span><b>${esc(g.jugador)}</b><small>${g.goles} goles en la temporada</small></span><span class="sn num">${pct(g.p)}</span></div>`).join("") : `<p class="note">Sin goleadores registrados todavía.</p>`;
  const h2h = (p.h2h || []).length ? p.h2h.map(x => resultRow(L, x)).join("") : `<p class="note">No se enfrentaron en las últimas temporadas.</p>`;
  return `<section class="view" aria-labelledby="h-p">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="partidos">← ${esc(L.nombre)}</button>
    <h1 id="h-p" class="sr">${esc(H)} vs ${esc(A)}</h1>
    <div class="panel match">
      <div class="livebox" data-live-box="${esc(p.id)}" hidden></div>
      <div class="meta">${leagueMark(L, "sm")}<span>${esc(L.nombre)}</span><span>·</span><span>${new Date(p.kickoff).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} ${hhmm(p.kickoff)}</span>${p.estado === "en_vivo" ? `<span class="bad">EN VIVO</span>` : ""}</div>
      <div class="face">${side(sh, p.home, "l")}<span class="vs">VS</span>${side(sa, p.away, "r")}</div>
      <div class="probs">
        <div class="pt h"><span class="lbl">${esc(H)}</span><span class="v">${pct(k.H, 1)}</span><div class="tr"><i style="width:${100 * k.H}%"></i></div></div>
        <div class="pt d"><span class="lbl">Empate</span><span class="v">${pct(k.D, 1)}</span><div class="tr"><i style="width:${100 * k.D}%"></i></div></div>
        <div class="pt a"><span class="lbl">${esc(A)}</span><span class="v">${pct(k.A, 1)}</span><div class="tr"><i style="width:${100 * k.A}%"></i></div></div>
      </div>
      <div class="kpis mini">${kpi("", "Más de 2,5 goles", pct(k.O25), "")}${kpi("", "Ambos marcan", pct(k.B), "")}${ct != null ? kpi("", "Córners esperados", dec(ct, 1), `${dec(p.ch, 1)} – ${dec(p.ca, 1)}`) : ""}${tt != null ? kpi("", "Tarjetas esperadas", dec(tt, 1), `${dec(p.th, 1)} – ${dec(p.ta, 1)}`) : ""}</div>
      ${reg ? `<p class="note" style="margin-top:14px">Predicción guardada en el registro público el ${fecha(reg.predicho)}; se califica al terminar el partido.</p>` : ""}
    </div>
    <div class="panel stack previa"><h3>Previa</h3>${previa(L, p, k, ct, tt)}</div>
    <div class="grid2">
      <div class="stack">
        <div class="panel stack" id="lineups"><h3>Alineaciones</h3><p class="note">Buscando alineaciones…</p></div>
        <div class="panel stack"><h3>Marcador exacto</h3><div class="scroll"><table class="heat">${heat}</table></div><p class="note">Filas: goles de ${esc(H)}. Columnas: goles de ${esc(A)}.</p></div>
        ${cmp ? `<div class="panel stack"><h3>Comparación de la temporada</h3><div class="cmph"><span>${badge(L, p.home)} ${esc(H)}</span><span>${esc(A)} ${badge(L, p.away)}</span></div>${cmp}</div>` : ""}
        <div class="panel stack"><h3>Goleadores probables</h3><div class="slist">${scorers}</div><p class="note">Probabilidad de marcar según sus goles en la temporada y los goles esperados de su equipo.</p></div>
        <div class="panel stack"><h3>Últimos enfrentamientos</h3><div class="rlist">${h2h}</div></div>
      </div>
      <div class="panel stack"><h3>Mercados y valor</h3>
        <p class="note">Escribe la cuota de tu casa de apuestas para ver el valor esperado (EV) por cada $1. En el backtest, apostar solo por "valor" del modelo perdió plata.</p>
        <div class="scroll"><table class="mk">${mk}</table></div></div>
    </div></section>`;
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
    <div class="lhead panel">${badge(L, t, "xl")}<div><h1 id="h-e">${esc(corto(L, t))}</h1><button class="btn ghost sm cmp-btn" data-go="comparar" data-liga="${L.id}" data-team="${esc(t)}">Comparar con otro equipo</button><span class="muted">${esc(L.nombre)}${s.pos ? ` · ${s.pos}º con ${s.pts} pts en ${s.pj} partidos` : ""}</span></div><span style="margin-left:auto">${formHtml(s.forma)}</span></div>
    <div class="kpis">${s.ataque ? kpi("m", "Ataque", dec(s.ataque), "1,00 = promedio liga") + kpi("", "Defensa", dec(s.defensa), "menos es mejor") : ""}${s.pts_esp != null ? kpi("", "Pts finales", dec(s.pts_esp, 1), "proyección") + kpi("k", "Campeón", pct(s.p_campeon, 1), "") : ""}${zs}</div>
    ${st.pj ? `<div class="panel stack"><h3>Estadísticas de la temporada</h3><div class="sgrid wide">
      ${[["Goles/PJ", dec(st.gf)], ["Recibe/PJ", dec(st.gc)], ["Tiros/PJ", dec(st.tiros, 1)], ["Al arco/PJ", dec(st.tiros_arco, 1)], ["Córners/PJ", dec(st.corners, 1)], ["Posesión", st.posesion != null ? dec(st.posesion, 0) + " %" : "—"],
         ["Tarjetas/PJ", dec(st.tarjetas, 1)], ["Faltas/PJ", dec(st.faltas, 1)], ["Ambos marcan", pct(st.ambos)], ["+2,5 goles", pct(st.over25)], ["Vallas invictas", st.vallas], ["Sin marcar", st.sin_marcar]]
        .map(([n, v]) => `<div><span class="lbl">${n}</span><b class="num">${v}</b></div>`).join("")}</div></div>` : ""}
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
    const L = D.ligas[f.liga] || { equipos: {} }, P = [f.pH, f.pD, f.pA], pick = ["1", "X", "2"][P.indexOf(Math.max(...P))];
    let res = `<span class="faint">pendiente</span>`, ok = "";
    if (f.hg != null) { const r = f.hg > f.ag ? "1" : f.hg === f.ag ? "X" : "2"; res = `<b class="num">${f.hg} – ${f.ag}</b>`; ok = r === pick ? `<span class="good">✓</span>` : `<span class="bad">✗</span>`; }
    return `<tr><td class="num muted">${fecha(f.kickoff)}</td><td>${esc(corto(L, f.home))} – ${esc(corto(L, f.away))}</td><td class="n hide-m">${pct(f.pH)} · ${pct(f.pD)} · ${pct(f.pA)}</td><td class="n">${pick}</td><td class="n">${res}</td><td class="n">${ok}</td></tr>`;
  }).join("");
  return `<section class="view" aria-labelledby="h-r">
    <h1 id="h-r">Registro público</h1>
    <p class="muted">Cada predicción se guarda antes de que empiece el partido y no se puede cambiar después. Así se mide si el modelo sirve, con resultados reales y no con capturas de los aciertos.${g.desde ? ` Registro desde el ${fecha(g.desde + "T12:00")}.` : ""}</p>
    <div class="kpis">${kpi("m", "Partidos calificados", g.n || 0, "")}${kpi("", "Acierto 1X2", pct(g.acierto_1x2, 1), "el resultado más probable")}${kpi("k", "Log-loss", dec(g.logloss, 3), `ingenuo ${dec(g.logloss_ingenuo, 3)} · menos es mejor`)}${kpi("", "Más/Menos 2,5", pct(g.acierto_o25, 1), "acierto")}${kpi("", "Marcador exacto", pct(g.marcador_exacto, 1), "el más probable")}</div>
    ${g.vs_mercado ? `<div class="panel stack"><h3>Modelo contra el mercado</h3><div class="kpis">${kpi("m", "Log-loss modelo", dec(g.vs_mercado.modelo, 3), "")}${kpi("k", "Log-loss mercado", dec(g.vs_mercado.mercado, 3), "")}${kpi("", "Partidos con cuota", g.vs_mercado.n, "")}</div><p class="note">Solo partidos en que ESPN publicó cuotas antes del inicio. Menos es mejor.</p></div>` : ""}
    ${g.n ? `<div class="grid2">
      <div class="panel flush scroll"><div class="ph"><h3>Por liga</h3></div><table class="t"><thead><tr><th>Liga</th><th class="n">Partidos</th><th class="n">Acierto</th><th class="n">Log-loss</th></tr></thead><tbody>${(g.por_liga || []).map(x => `<tr><td class="team">${D.ligas[x.liga] ? leagueMark(D.ligas[x.liga]) + esc(D.ligas[x.liga].nombre) : esc(x.liga)}</td><td class="n">${x.n}</td><td class="n">${pct(x.acierto, 1)}</td><td class="n">${dec(x.logloss, 3)}</td></tr>`).join("")}</tbody></table></div>
      <div class="panel flush scroll"><div class="ph"><h3>Según la confianza del modelo</h3></div><table class="t"><thead><tr><th>Probabilidad del favorito</th><th class="n">Partidos</th><th class="n">Esperado</th><th class="n">Real</th></tr></thead><tbody>${(g.confianza || []).map(x => `<tr><td>${esc(x.rango)}</td><td class="n">${x.n}</td><td class="n">${pct(x.prob, 1)}</td><td class="n ${x.acierto >= x.prob ? "good" : "bad"}">${pct(x.acierto, 1)}</td></tr>`).join("")}</tbody></table><p class="note" style="padding:0 16px 12px">Si "Real" se parece a "Esperado", las probabilidades están bien medidas.</p></div>
    </div>` : ""}
    <div class="grid2">
      <div class="panel stack"><h3>Calibración</h3><p class="note">Si el modelo dice 40 %, ¿pasa el 40 % de las veces?</p>${calChart(g.calibracion)}${spark(g.serie)}</div>
      <div class="panel flush"><div class="ph"><h3>Predicciones</h3><div class="tabs2" role="group" aria-label="Filtro">${[["calificados", "Calificadas"], ["pendientes", "Pendientes"]].map(([k, n]) => `<button data-go="registro" data-tab="${k}" data-keep aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div><div class="scroll" style="max-height:560px;overflow:auto"><table class="t"><thead><tr><th>Fecha</th><th>Partido</th><th class="n hide-m">1 · X · 2</th><th class="n">Pick</th><th class="n">Resultado</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">${tab === "pendientes" ? "No hay partidos pendientes en el registro." : "Todavía no hay partidos calificados."}</td></tr>`}</tbody></table></div></div>
    </div></section>`;
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
      <p class="muted">Lo que no sabe: lesiones, alineaciones, fichajes, rotaciones ni motivación. Por eso las casas de apuestas, que sí incorporan esa información, predicen mejor.</p>
    </div>
    ${B ? `<h2>¿Le gana al mercado?</h2>
    <p class="muted">Backtest de la temporada 2025-26 en las cinco grandes ligas: cada semana se reajustó el modelo solo con partidos anteriores y se comparó con las cuotas de Bet365 (${(B.n_test || 0).toLocaleString("es-CL")} partidos).</p>
    <div class="kpis">${kpi("m", "Log-loss modelo", dec(B.logloss.modelo, 4), "menos es mejor")}${kpi("k", "Log-loss mercado", dec(B.logloss.mercado, 4), "cuotas sin margen")}${kpi("", "Log-loss ingenuo", dec(B.logloss.ingenuo, 4), "% histórico L/E/V")}</div>
    <div class="panel verdict">${B.veredicto}</div>
    <div class="grid2"><div class="panel stack"><h3>Calibración (backtest)</h3>${calChart(B.calibracion)}</div>
      <div class="panel stack"><h3>Apostar al "valor" (EV &gt; 5 %)</h3><p class="note">1 unidad por apuesta en 1X2, temporada 2025-26.</p>${curve()}</div></div>` : ""}
    <p class="note">Fuente de datos: marcadores públicos de ESPN. El código es abierto y el sitio se actualiza solo con GitHub Actions.</p></section>`;
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
  const box = document.getElementById("lineups");
  if (!box || !L || !p || !L.slug) return;
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
        <ol>${st.map(x => `<li><span class="num jn">${esc(x.jersey || "")}</span><span>${esc((x.athlete || {}).displayName || "")}</span><small>${esc((x.position || {}).abbreviation || "")}</small></li>`).join("")}</ol>
        ${sub.length ? `<p class="note">Suplentes: ${sub.map(x => esc((x.athlete || {}).displayName || "")).join(", ")}</p>` : ""}</div>`;
    }).join("")}</div>` : `<p class="note">Aún no publicadas. Las alineaciones suelen salir cerca de una hora antes del partido.</p>`;
    const meta = [venue ? `Estadio: <b>${esc(venue)}</b>` : "", ref ? `Árbitro: <b>${esc(ref.displayName || ref.fullName || "")}</b>` : ""].filter(Boolean).join(" · ");
    box.innerHTML = `<h3>Alineaciones</h3>${html}${meta ? `<p class="note">${meta}</p>` : ""}`;
  } catch (e) { if (R.v === "partido" && R.id === want) box.innerHTML = fail; }
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
  if ((p.h2h || []).length) { const x = p.h2h[0]; out.push(`El último cruce terminó ${corto(L, x.home)} ${x.hg}–${x.ag} ${corto(L, x.away)}.`); }
  if (ct != null) out.push(`Córners esperados: ${dec(ct, 1)}${tt != null ? `. Tarjetas esperadas: ${dec(tt, 1)}` : ""}.`);
  return `<p class="previa-t">${out.map(esc).join(" ")}</p><p class="note">Texto generado automáticamente con los números del modelo. No considera lesiones, suspensiones ni alineaciones.</p>`;
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
    <div class="lhead panel">${badge(L, pl.equipo, "xl")}<div><h1 id="h-j">${esc(pl.jugador)}</h1><span class="muted">${esc(corto(L, pl.equipo))} · ${esc(L.nombre)}</span></div></div>
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

/* ---------------- arranque ---------------- */
load().then(() => { R = fromHash(); render(); pollLive(); setInterval(pollLive, 60000); })
  .catch(err => { $app.innerHTML = `<div class="panel empty">No pude cargar los datos (${esc(err.message)}). Si abriste el archivo directo desde tu computador, el navegador bloquea la lectura: usa la versión publicada.</div>`; });
})();
