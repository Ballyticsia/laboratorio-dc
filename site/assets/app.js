/* Laboratorio DC — sitio estático. Lee data/*.json que genera pipeline/generar.py. */
(() => {
"use strict";
const D = { ligas: {} };
const $app = document.getElementById("app");
const MAXG = 10;
const ODDS = {};                       // cuotas que escribe el usuario, por partido
let R = { v: "inicio", liga: "todas" }; // ruta actual

/* ---------------- utilidades ---------------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 0) => x == null ? "—" : (100 * x).toFixed(d).replace(".", ",") + " %";
const dec = (x, d = 2) => x == null ? "—" : Number(x).toFixed(d).replace(".", ",");
const sgn = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x);
const DAYMS = 864e5;
function dayKey(iso) { const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayLabel(key) {
  const t = new Date(); const k0 = dayKey(t.toISOString()), k1 = dayKey(new Date(t.getTime() + DAYMS).toISOString());
  if (key === k0) return "Hoy"; if (key === k1) return "Mañana";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
}
const hhmm = iso => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fecha = iso => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
function hashColor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 38%)`; }
function lum(hex) { const n = parseInt(hex, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

function info(L, t) { return (L.equipos && L.equipos[t]) || {}; }
const corto = (L, t) => info(L, t).corto || t;
function badge(L, t, lg = false) {
  const i = info(L, t), c = i.color && /^[0-9a-f]{6}$/i.test(i.color) ? i.color : null;
  const bg = c ? "#" + c : hashColor(t), fg = c && lum(c) > 0.62 ? "#07090f" : "#fff";
  const ab = (i.abr || t.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 3)).toUpperCase();
  const logo = typeof i.logo === "string" && /^https:\/\//.test(i.logo) ? i.logo : null;
  const img = logo ? `<img class="crest" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('logo');this.remove()">` : "";
  return `<span class="badge${lg ? " lg" : ""}${logo ? " logo" : ""}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(ab)}${img}</span>`;
}

/* ---------------- modelo (igual que en Python) ---------------- */
function pois(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function rates(M, h, a) {
  const [ah, dh] = M.equipos[h] || [0, 0], [aa, da] = M.equipos[a] || [0, 0];
  return [Math.exp(M.mu + M.home + ah - da), Math.exp(M.mu + aa - dh)];
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
  const u = new Date(D.indice.actualizado);
  document.getElementById("foot-upd").innerHTML = `<span class="dot"></span>Actualizado ${u.toLocaleDateString("es-CL")} ${hhmm(D.indice.actualizado)}`;
}
const ligasIds = () => Object.keys(D.ligas);
const allMatches = () => ligasIds().flatMap(id => D.ligas[id].partidos.map(p => ({ ...p, L: D.ligas[id] })));
function findMatch(liga, id) { const L = D.ligas[liga]; return L && L.partidos.find(p => String(p.id) === String(id)); }

/* ---------------- rutas ---------------- */
function toHash(r) {
  if (r.v === "liga") return `#/liga/${r.liga}/${r.tab || "tabla"}`;
  if (r.v === "partido") return `#/partido/${r.liga}/${encodeURIComponent(r.id)}`;
  if (r.v === "equipo") return `#/equipo/${r.liga}/${encodeURIComponent(r.team)}`;
  if (r.v === "inicio") return r.liga && r.liga !== "todas" ? `#/partidos/${r.liga}` : "#/";
  return r.v === "registro" && r.tab ? `#/registro/${r.tab}` : `#/${r.v}`;
}
function fromHash() {
  const p = (location.hash || "#/").slice(2).split("/").map(decodeURIComponent);
  const first = ligasIds()[0];
  switch (p[0]) {
    case "liga": return { v: "liga", liga: D.ligas[p[1]] ? p[1] : first, tab: p[2] || "tabla" };
    case "partido": return { v: "partido", liga: p[1], id: p[2] };
    case "equipo": return { v: "equipo", liga: p[1], team: p[2] };
    case "registro": return { v: "registro", tab: p[1] };
    case "metodo": return { v: "metodo" };
    case "partidos": return { v: "inicio", liga: D.ligas[p[1]] ? p[1] : "todas" };
    default: return { v: "inicio", liga: "todas" };
  }
}
let skipHash = false;
function go(r, push = true) {
  R = r; render();
  if (push) { const h = toHash(r); if (location.hash !== h) { skipHash = true; try { location.hash = h; } catch (e) {} } }
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", () => { if (skipHash) { skipHash = false; return; } R = fromHash(); render(); });
document.addEventListener("click", e => {
  const el = e.target.closest("[data-go]"); if (!el) return;
  const v = el.dataset.go;
  if (v === "liga" && !el.dataset.liga) return go({ v: "liga", liga: R.liga && R.liga !== "todas" && D.ligas[R.liga] ? R.liga : ligasIds()[0], tab: "tabla" });
  go({ v, liga: el.dataset.liga || (v === "inicio" ? "todas" : undefined), id: el.dataset.id, team: el.dataset.team, tab: el.dataset.tab });
});

function render() {
  document.querySelectorAll("nav.main button").forEach(b => b.setAttribute("aria-current", b.dataset.go === ({ partido: "inicio", equipo: "liga" }[R.v] || R.v) ? "page" : "false"));
  const f = { inicio: vInicio, liga: vLiga, partido: vPartido, equipo: vEquipo, registro: vRegistro, metodo: vMetodo }[R.v] || vInicio;
  $app.innerHTML = f();
  if (R.v === "partido") bindOdds();
}

/* ---------------- componentes ---------------- */
function chips(sel, v, extra = true) {
  const ids = ligasIds();
  return `<div class="chips" role="group" aria-label="Liga">${extra ? `<button class="chip-btn" data-go="${v}" data-liga="todas" aria-pressed="${sel === "todas"}">Todas</button>` : ""}` +
    ids.map(id => `<button class="chip-btn" data-go="${v}" data-liga="${id}" data-tab="${R.tab || ""}" aria-pressed="${sel === id}">${esc(D.ligas[id].nombre)}</button>`).join("") + `</div>`;
}
function matchRow(p, showLeague) {
  const L = p.L || D.ligas[p.liga], fav = p.pH >= p.pA ? "h" : "a";
  const pick = p.pH >= p.pD && p.pH >= p.pA ? "1" : p.pA >= p.pD ? "2" : "X";
  return `<button class="mrow" data-go="partido" data-liga="${L.id}" data-id="${esc(p.id)}">
    <span class="t">${p.estado === "en_vivo" ? `<span class="bad" style="font-weight:600">EN VIVO</span>` : hhmm(p.kickoff)}${showLeague ? `<span class="lg">${esc(L.nombre)}</span>` : ""}</span>
    <span class="teams">
      <span class="tline">${badge(L, p.home)}<span class="n ${fav === "h" ? "fav" : "und"}">${esc(corto(L, p.home))}</span></span>
      <span class="tline">${badge(L, p.away)}<span class="n ${fav === "a" ? "fav" : "und"}">${esc(corto(L, p.away))}</span></span>
    </span>
    <span class="p3"><span class="bars"><i style="width:${100 * p.pH}%"></i><i style="width:${100 * p.pD}%"></i><i style="width:${100 * p.pA}%"></i></span>
      <span class="nums"><span><b>${pct(p.pH)}</b></span><span>${pct(p.pD)}</span><span><b>${pct(p.pA)}</b></span></span></span>
    <span class="pick"><span class="s">${esc(p.top)}</span><span class="l">Pick ${pick}</span></span>
  </button>`;
}
function miniTable(L, n = 6) {
  return `<table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n">Pts</th></tr></thead><tbody>` +
    L.tabla.slice(0, n).map(s => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}"><td>${posTag(L, s.pos)}</td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${s.pj}</td><td class="n"><b>${s.pts}</b></td></tr>`).join("") +
    `</tbody></table>`;
}
function posTag(L, pos) { const n = L.tabla.length; return `<span class="pos ${pos <= L.top ? "top" : pos > n - L.desc ? "desc" : ""}">${pos}</span>`; }
const formHtml = f => `<span class="form">${(f || []).map(x => `<i class="${x}">${x}</i>`).join("")}</span>`;
const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="lbl">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;

/* ---------------- vistas ---------------- */
function vInicio() {
  const sel = R.liga || "todas";
  const now = Date.now(), lim = now + 7 * DAYMS;
  const ms = allMatches().filter(p => (sel === "todas" || p.L.id === sel) && new Date(p.kickoff).getTime() <= lim && new Date(p.kickoff).getTime() >= now - 3 * 3600e3)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const groups = {}; ms.forEach(p => (groups[dayKey(p.kickoff)] ||= []).push(p));
  const list = Object.keys(groups).length ? Object.entries(groups).map(([k, arr]) => `<div class="day">${esc(dayLabel(k))}</div>` + arr.map(p => matchRow(p, sel === "todas")).join("")).join("")
    : `<div class="empty">No hay partidos en los próximos 7 días${sel !== "todas" ? " para esta liga" : ""}.</div>`;
  const reg = D.registro;
  const claros = allMatches().filter(p => new Date(p.kickoff).getTime() <= lim && new Date(p.kickoff).getTime() >= now).map(p => ({ p, m: Math.max(p.pH, p.pA) })).sort((a, b) => b.m - a.m).slice(0, 5);
  const Lmini = D.ligas[sel] || D.ligas[ligasIds()[0]];
  return `<section class="view" aria-labelledby="h-inicio">
    <div class="row" style="justify-content:space-between"><h1 id="h-inicio">Partidos de la semana</h1><span class="stamp">Modelo · <b>Dixon-Coles</b></span></div>
    ${chips(sel, "inicio")}
    <div class="layout">
      <div class="panel flush">${list}</div>
      <aside class="stack">
        <div class="panel stack">
          <div class="row" style="justify-content:space-between"><h3>Registro del modelo</h3><button class="back" data-go="registro">Ver todo</button></div>
          ${reg && reg.n ? `<div class="kpis">${kpi("m", "Acierto 1X2", pct(reg.acierto_1x2), `${reg.n} partidos`)}${kpi("", "Log-loss", dec(reg.logloss, 3), `ingenuo ${dec(reg.logloss_ingenuo, 3)}`)}</div>`
            : `<p class="note">Cada predicción se guarda antes del partido y se califica después. El registro empieza a llenarse con los primeros resultados.</p>`}
        </div>
        <div class="panel stack"><h3>Más claros de la semana</h3>
          ${claros.map(({ p, m }) => `<button class="mrow" style="grid-template-columns:minmax(0,1fr) auto;padding:8px 0" data-go="partido" data-liga="${p.L.id}" data-id="${esc(p.id)}">
            <span class="tline">${badge(p.L, p.pH >= p.pA ? p.home : p.away)}<span class="n">${esc(corto(p.L, p.pH >= p.pA ? p.home : p.away))} <span class="faint" style="font-weight:500">vs ${esc(corto(p.L, p.pH >= p.pA ? p.away : p.home))}</span></span></span>
            <span class="num" style="color:var(--card);font-weight:600">${pct(m)}</span></button>`).join("") || `<p class="note">Sin partidos próximos.</p>`}
        </div>
        <div class="panel flush"><div class="ph"><h3>${esc(Lmini.nombre)}</h3><button class="back" data-go="liga" data-liga="${Lmini.id}" data-tab="tabla">Tabla</button></div><div class="scroll">${miniTable(Lmini)}</div></div>
      </aside>
    </div></section>`;
}

function vLiga() {
  const L = D.ligas[R.liga] || D.ligas[ligasIds()[0]], tab = R.tab || "tabla";
  const tabs = [["tabla", "Tabla"], ["proyeccion", "Proyección"], ["fuerza", "Fuerza"], ["calendario", "Calendario"], ["resultados", "Resultados"]];
  let body = "";
  const row = s => `<tr class="click" data-go="equipo" data-liga="${L.id}" data-team="${esc(s.equipo)}">`;
  if (tab === "tabla") body = `<table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n hide-m">G</th><th class="n hide-m">E</th><th class="n hide-m">P</th><th class="n hide-m">GF</th><th class="n hide-m">GC</th><th class="n">DG</th><th class="n">Pts</th><th class="hide-m">Forma</th></tr></thead><tbody>` +
    L.tabla.map(s => `${row(s)}<td>${posTag(L, s.pos)}</td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${s.pj}</td><td class="n hide-m">${s.g}</td><td class="n hide-m">${s.e}</td><td class="n hide-m">${s.p}</td><td class="n hide-m">${s.gf}</td><td class="n hide-m">${s.gc}</td><td class="n">${sgn(s.dg)}</td><td class="n"><b>${s.pts}</b></td><td class="hide-m">${formHtml(s.forma)}</td></tr>`).join("") + `</tbody></table>`;
  if (tab === "proyeccion") {
    const t = [...L.tabla].sort((a, b) => (b.pts_esp ?? 0) - (a.pts_esp ?? 0));
    const pb = (v, cls = "") => `<div class="pbar ${cls}"><span class="tr"><i style="width:${100 * (v || 0)}%"></i></span><span class="num">${v < 0.005 ? "<1 %" : pct(v)}</span></div>`;
    body = `<table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n hide-m">Pts hoy</th><th class="n">Pts finales</th><th class="n">Campeón</th><th class="n hide-m">Top ${L.top}</th><th class="n">Descenso</th></tr></thead><tbody>` +
      t.map((s, i) => `${row(s)}<td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n hide-m">${s.pts}</td><td class="n"><b>${dec(s.pts_esp, 1)}</b></td><td>${pb(s.p_campeon, "gold")}</td><td class="hide-m">${pb(s.p_top)}</td><td>${pb(s.p_desc, "bad")}</td></tr>`).join("") +
      `</tbody></table><p class="note" style="padding:12px 16px">10.000 simulaciones del resto de la temporada con el modelo actual. Descenso = terminar en los últimos ${L.desc}. Los empates en puntos se resuelven al azar.</p>`;
  }
  if (tab === "fuerza") {
    const t = [...L.tabla].sort((a, b) => (b.ataque / b.defensa) - (a.ataque / a.defensa));
    const mx = Math.max(...t.map(s => s.ataque / s.defensa));
    body = `<table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">Ataque</th><th class="n">Defensa</th><th>Fuerza global</th></tr></thead><tbody>` +
      t.map((s, i) => `${row(s)}<td><span class="pos">${i + 1}</span></td><td class="team">${badge(L, s.equipo)}${esc(corto(L, s.equipo))}</td><td class="n">${dec(s.ataque)}</td><td class="n">${dec(s.defensa)}</td><td style="width:35%"><div class="pbar" style="justify-content:flex-start"><span class="tr" style="width:100%"><i style="width:${(100 * (s.ataque / s.defensa) / mx).toFixed(1)}%"></i></span></div></td></tr>`).join("") +
      `</tbody></table><p class="note" style="padding:12px 16px">Ataque: goles que marca frente a una defensa promedio (1,00 = promedio de la liga). Defensa: goles que recibe; menos es mejor.</p>`;
  }
  if (tab === "calendario") {
    const ps = L.partidos.slice(0, 40), g = {};
    ps.forEach(p => (g[dayKey(p.kickoff)] ||= []).push(p));
    body = Object.entries(g).map(([k, a]) => `<div class="day">${esc(dayLabel(k))}</div>` + a.map(p => matchRow(p, false)).join("")).join("") || `<div class="empty">Sin calendario disponible.</div>`;
  }
  if (tab === "resultados") body = resultsTable(L, L.resultados.slice(0, 60));
  return `<section class="view" aria-labelledby="h-liga">
    <div class="row" style="justify-content:space-between"><h1 id="h-liga">${esc(L.nombre)}</h1><span class="stamp">Datos hasta <b>${fecha(L.datos_hasta + "T12:00")}</b></span></div>
    ${chips(L.id, "liga", false)}
    <div class="tabs2" role="group" aria-label="Vista">${tabs.map(([k, n]) => `<button data-go="liga" data-liga="${L.id}" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join("")}</div>
    <div class="panel flush scroll">${body}</div></section>`;
}
function resultsTable(L, rs) {
  if (!rs.length) return `<div class="empty">Todavía no hay resultados esta temporada.</div>`;
  return `<table class="t"><tbody>` + rs.map(x => `<tr><td class="num muted" style="width:70px">${fecha(x.kickoff)}</td>
    <td style="text-align:right;font-weight:${x.hg > x.ag ? 700 : 500}">${esc(corto(L, x.home))}</td>
    <td class="n" style="text-align:center;width:70px"><b>${x.hg} – ${x.ag}</b></td>
    <td style="font-weight:${x.ag > x.hg ? 700 : 500}">${esc(corto(L, x.away))}</td></tr>`).join("") + `</tbody></table>`;
}

function vPartido() {
  const L = D.ligas[R.liga], p = findMatch(R.liga, R.id);
  if (!L || !p) return `<section class="view"><button class="back" data-go="inicio">← Partidos</button><div class="panel empty">Este partido ya no está en el calendario (puede que ya se haya jugado).</div></section>`;
  const { m, lh, la } = matrix(L.modelo, p.home, p.away), k = markets(m);
  const sh = L.tabla.find(s => s.equipo === p.home) || {}, sa = L.tabla.find(s => s.equipo === p.away) || {};
  const N = 6; let mx = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) mx = Math.max(mx, m[i][j]);
  let heat = `<tr><th></th>${[...Array(N).keys()].map(j => `<th>${j}</th>`).join("")}</tr>`;
  for (let i = 0; i < N; i++) { heat += `<tr><th>${i}</th>`; for (let j = 0; j < N; j++) { const al = (m[i][j] / mx) * .92 + .03;
    heat += `<td style="background:rgba(var(--heat),${al.toFixed(3)});color:${al > .5 ? "var(--heat-ink)" : "var(--ink)"}">${(100 * m[i][j]).toFixed(1).replace(".", ",")}</td>`; } heat += "</tr>"; }
  const H = corto(L, p.home), A = corto(L, p.away);
  const groups = [
    ["Resultado (1X2)", [["H", `Gana ${H}`, k.H], ["D", "Empate", k.D], ["A", `Gana ${A}`, k.A]]],
    ["Doble oportunidad", [["1X", `${H} o empate`, k.H + k.D], ["X2", `Empate o ${A}`, k.D + k.A], ["12", "Sin empate", k.H + k.A]]],
    ["Goles", [["O15", "Más de 1,5", k.O15], ["U15", "Menos de 1,5", 1 - k.O15], ["O25", "Más de 2,5", k.O25], ["U25", "Menos de 2,5", 1 - k.O25], ["O35", "Más de 3,5", k.O35], ["U35", "Menos de 3,5", 1 - k.O35]]],
    ["Ambos marcan", [["BY", "Sí", k.B], ["BN", "No", 1 - k.B]]],
  ];
  const st = ODDS[p.id] || (ODDS[p.id] = {});
  const mk = `<tr><th>Mercado</th><th style="text-align:right">Prob.</th><th style="text-align:right">Justa</th><th style="text-align:right">Tu cuota</th><th style="text-align:right">EV</th></tr>` +
    groups.map(([g, rows]) => `<tr class="grp"><td colspan="5">${g}</td></tr>` + rows.map(([key, n, pr]) => `<tr><td>${esc(n)}</td><td class="n">${pct(pr, 1)}</td><td class="n">${dec(1 / pr)}</td>
      <td class="n"><input class="odd" inputmode="decimal" aria-label="Cuota ${esc(n)}" data-k="${key}" data-p="${pr}" value="${st[key] ? String(st[key]).replace(".", ",") : ""}" placeholder="—"></td><td class="n" data-ev="${key}"></td></tr>`).join("")).join("");
  const reg = D.registro && D.registro.filas && D.registro.filas.find(f => String(f.id) === String(p.id));
  const side = (s, t, cls) => `<div class="side ${cls}">${badge(L, t, true)}<button class="tn" data-go="equipo" data-liga="${L.id}" data-team="${esc(t)}">${esc(corto(L, t))}</button>
      <span class="xgv">${dec(cls === "l" ? lh : la)}</span><span class="lbl">goles esperados</span>
      <span class="row" style="gap:8px;${cls === "r" ? "justify-content:flex-end" : ""}">${s.pos ? `<span class="muted num" style="font-size:12px">${s.pos}º · ${s.pts} pts</span>` : ""}${formHtml(s.forma)}</span></div>`;
  return `<section class="view" aria-labelledby="h-p">
    <button class="back" data-go="inicio" data-liga="${L.id}">← Partidos</button>
    <h1 id="h-p" class="sr">${esc(H)} vs ${esc(A)}</h1>
    <div class="panel match">
      <div class="meta"><span>${esc(L.nombre)}</span><span>·</span><span>${new Date(p.kickoff).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} ${hhmm(p.kickoff)}</span>${p.estado === "en_vivo" ? `<span class="bad">EN VIVO</span>` : ""}</div>
      <div class="face">${side(sh, p.home, "l")}<span class="vs">VS</span>${side(sa, p.away, "r")}</div>
      <div class="probs">
        <div class="pt h"><span class="lbl">${esc(H)}</span><span class="v">${pct(k.H, 1)}</span><div class="tr"><i style="width:${100 * k.H}%"></i></div></div>
        <div class="pt d"><span class="lbl">Empate</span><span class="v">${pct(k.D, 1)}</span><div class="tr"><i style="width:${100 * k.D}%"></i></div></div>
        <div class="pt a"><span class="lbl">${esc(A)}</span><span class="v">${pct(k.A, 1)}</span><div class="tr"><i style="width:${100 * k.A}%"></i></div></div>
      </div>
      ${reg ? `<p class="note" style="margin-top:14px">Esta predicción quedó guardada en el registro público el ${fecha(reg.predicho)} y se calificará cuando termine el partido.</p>` : ""}
    </div>
    <div class="grid2">
      <div class="panel stack"><h3>Marcador exacto</h3><div class="scroll"><table class="heat">${heat}</table></div>
        <p class="note">Filas: goles de ${esc(H)}. Columnas: goles de ${esc(A)}. Más brillante, más probable.</p></div>
      <div class="panel stack"><h3>Mercados y valor</h3>
        <p class="note">Escribe la cuota de tu casa de apuestas para ver el valor esperado (EV) por cada $1. Ojo: en el backtest, apostar solo por "valor" del modelo perdió plata.</p>
        <div class="scroll"><table class="mk">${mk}</table></div></div>
    </div></section>`;
}
function bindOdds() {
  const st = ODDS[R.id] || {};
  const upd = () => document.querySelectorAll("[data-ev]").forEach(td => {
    const inp = document.querySelector(`input[data-k="${td.dataset.ev}"]`), o = st[td.dataset.ev], pr = +inp.dataset.p;
    if (!o) { td.innerHTML = `<span class="faint">—</span>`; return; }
    const ev = pr * o - 1;
    td.innerHTML = `<span class="${ev > 0 ? "good" : "bad"}">${ev > 0 ? "+" : "−"}${pct(Math.abs(ev), 1)}</span>${ev > 0.05 ? ` <span class="val" title="Kelly ¼: ${pct(Math.max(0, ev / (o - 1)) / 4, 1)} del bankroll">valor</span>` : ""}`;
  });
  document.querySelectorAll("input.odd").forEach(inp => inp.addEventListener("input", () => { const v = parseFloat(inp.value.replace(",", ".")); st[inp.dataset.k] = v > 1 ? v : undefined; upd(); }));
  upd();
}

function vEquipo() {
  const L = D.ligas[R.liga]; const s = L && L.tabla.find(x => x.equipo === R.team);
  if (!s) return `<section class="view"><button class="back" data-go="liga">← Ligas</button><div class="panel empty">No encontré ese equipo.</div></section>`;
  const prox = L.partidos.filter(p => p.home === s.equipo || p.away === s.equipo).slice(0, 6);
  const res = L.resultados.filter(x => x.home === s.equipo || x.away === s.equipo).slice(0, 10);
  return `<section class="view" aria-labelledby="h-e">
    <button class="back" data-go="liga" data-liga="${L.id}" data-tab="tabla">← ${esc(L.nombre)}</button>
    <div class="thead">${badge(L, s.equipo, true)}<div><h1 id="h-e">${esc(corto(L, s.equipo))}</h1><span class="muted">${esc(L.nombre)} · ${s.pos}º con ${s.pts} pts en ${s.pj} partidos</span></div><span style="margin-left:auto">${formHtml(s.forma)}</span></div>
    <div class="kpis">${kpi("m", "Ataque", dec(s.ataque), "1,00 = promedio liga")}${kpi("", "Defensa", dec(s.defensa), "menos es mejor")}${kpi("", "Pts finales", dec(s.pts_esp, 1), "proyección")}${kpi("k", "Campeón", pct(s.p_campeon, 1), "")}${kpi("", `Top ${L.top}`, pct(s.p_top, 1), "")}${kpi("", "Descenso", pct(s.p_desc, 1), "")}</div>
    <div class="grid2">
      <div class="panel flush"><div class="ph"><h3>Próximos partidos</h3></div>${prox.map(p => matchRow(p, false)).join("") || `<div class="empty">Sin partidos programados.</div>`}</div>
      <div class="panel flush"><div class="ph"><h3>Últimos resultados</h3></div><div class="scroll">${resultsTable(L, res)}</div></div>
    </div></section>`;
}

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
    <div class="grid2">
      <div class="panel stack"><h3>Calibración</h3><p class="note">Si el modelo dice 40 %, ¿pasa el 40 % de las veces?</p>${calChart(g.calibracion)}</div>
      <div class="panel flush"><div class="ph"><h3>Predicciones</h3><div class="tabs2" role="group" aria-label="Filtro">${[["calificados", "Calificadas"], ["pendientes", "Pendientes"]].map(([k, n]) => `<button data-go="registro" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join("")}</div></div><div class="scroll" style="max-height:520px;overflow:auto"><table class="t"><thead><tr><th>Fecha</th><th>Partido</th><th class="n hide-m">1 · X · 2</th><th class="n">Pick</th><th class="n">Resultado</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">${tab === "pendientes" ? "No hay partidos pendientes en el registro." : "Todavía no hay partidos calificados."}</td></tr>`}</tbody></table></div></div>
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
      <p><b>El modelo.</b> Cada equipo tiene una fuerza de ataque y una de defensa. Con eso se calcula cuántos goles se espera que marque cada uno (λ), y la probabilidad de cada marcador sale de una distribución de Poisson con la corrección de Dixon y Coles (1997) para los resultados bajos (0-0, 1-0, 0-1, 1-1).</p>
      <p><b>Los datos.</b> Resultados de 1ª y 2ª división de las últimas tres temporadas. Los partidos recientes pesan más (vida media de unos 231 días) y se mezcla un 30 % de tiros al arco con los goles, porque los tiros tienen menos ruido. Se reajusta todos los días.</p>
      <p><b>Las proyecciones.</b> El resto de la temporada se simula 10.000 veces con estas probabilidades para estimar puntos finales y opciones de título, copas o descenso.</p>
      <p class="muted">Lo que no sabe: lesiones, alineaciones, fichajes, rotaciones ni motivación. Por eso las casas de apuestas, que sí incorporan esa información, predicen mejor.</p>
    </div>
    ${B ? `<h2>¿Le gana al mercado?</h2>
    <p class="muted">Backtest de la temporada 2025-26: cada semana se reajustó el modelo solo con partidos anteriores y se comparó con las cuotas de Bet365 (${(B.n_test || 0).toLocaleString("es-CL")} partidos de las cinco ligas).</p>
    <div class="kpis">${kpi("m", "Log-loss modelo", dec(B.logloss.modelo, 4), "menos es mejor")}${kpi("k", "Log-loss mercado", dec(B.logloss.mercado, 4), "cuotas sin margen")}${kpi("", "Log-loss ingenuo", dec(B.logloss.ingenuo, 4), "% histórico L/E/V")}</div>
    <div class="panel verdict">${B.veredicto}</div>
    <div class="grid2"><div class="panel stack"><h3>Calibración (backtest)</h3>${calChart(B.calibracion)}</div>
      <div class="panel stack"><h3>Apostar al "valor" (EV &gt; 5 %)</h3><p class="note">1 unidad por apuesta en 1X2, temporada 2025-26.</p>${curve()}</div></div>` : ""}
    <p class="note">El código es abierto: modelo, datos y este sitio se actualizan solos con GitHub Actions.</p></section>`;
}

/* ---------------- arranque ---------------- */
load().then(() => { R = fromHash(); render(); })
  .catch(err => { $app.innerHTML = `<div class="panel empty">No pude cargar los datos (${esc(err.message)}). Si abriste el archivo directo desde tu computador, el navegador bloquea la lectura: usa la versión publicada en GitHub Pages.</div>`; });
})();
