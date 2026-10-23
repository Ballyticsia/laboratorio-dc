/* Ballytics · servidor (Cloudflare Worker, plan gratis).

   1. Avisos: el sitio inscribe el navegador (Web Push) a los partidos que la persona sigue. Cada
      minuto se revisa en ESPN solo lo necesario y, si hay novedad (gol, roja, inicio, final,
      alineaciones, 15 minutos antes), se deja el mensaje en la cola y se manda un push vacío firmado
      con VAPID. El service worker del sitio pide los mensajes a /novedades.
   2. "¿Quién gana?": votos de la gente por partido (uno por navegador, se puede cambiar hasta el inicio).
   3. Fichas de jugadores: intermediario para datos de ESPN que no se pueden leer desde el navegador.
   4. Prode: grupos privados de pronósticos con ranking.
   5. /dia: partidos del día de ESPN en formato corto y con caché (la lista En vivo carga mucho más rápido).
   6. /jugadores: estadísticas por jugador dentro de un partido (nota, pases, tiros, duelos…) y fotos,
      desde API-Football (secreto API_FOOTBALL_KEY). Se guarda en KV para gastar pocas consultas.

   Llaves en KV (binding SUBS):
     vapid, seguidos, sub:<h>, q:<h>                     avisos
     v:<id> -> {H,D,A}   vu:<id>:<h> -> "H"              votos
     p:<CODIGO> -> grupo   res:<id> -> "2-1"              prode
     afd:<fecha> afm:<id> afj:<id> afrem                  API-Football (lista del día, cruce, jugadores, consultas)                                         */

const ORIGINS = ["https://ballyticsia.github.io", "http://localhost:8793", "http://localhost:8000"];
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_WEB = "https://site.api.espn.com/apis/common/v3/sports/soccer";   // site.web.api y core bloquean a Cloudflare
const MAX_SEGUIDOS = 300;
const PREFS_DEF = { gol: 1, roja: 1, inicio: 1, final: 1, alin: 1, prev: 1 };

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();
async function hash(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 24); }
const clean = (s, n = 40) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);

function cors(req, res) {
  const o = req.headers.get("Origin");
  const h = new Headers(res.headers);
  if (o && ORIGINS.includes(o)) { h.set("Access-Control-Allow-Origin", o); h.set("Vary", "Origin"); }
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...extra } });
const espn = async url => { const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Ballytics" } }); if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); };

/* ================= avisos ================= */
async function vapid(env) {
  let v = await env.SUBS.get("vapid", "json");
  if (v) return v;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  v = { pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  await env.SUBS.put("vapid", JSON.stringify(v));
  return v;
}
/* push vacío con autorización VAPID (RFC 8292); sin contenido no hace falta cifrar */
async function push(env, sub) {
  const v = await vapid(env);
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const aud = new URL(sub.endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://ballyticsia.github.io/laboratorio-dc/" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`, TTL: "3600", Urgency: "high", "Content-Length": "0" } });
  return r.status;
}
function prefsOf(p) { const o = { ...PREFS_DEF }; if (p && typeof p === "object") for (const k of Object.keys(o)) if (k in p) o[k] = p[k] ? 1 : 0; return o; }
async function follow(env, b) {
  const sub = b.subscription;
  if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !b.id || !/^\d+$/.test(String(b.id))) return json({ ok: false, error: "datos inválidos" }, 400);
  const h = await hash(sub.endpoint);
  await env.SUBS.put(`sub:${h}`, JSON.stringify({ ...sub, prefs: prefsOf(b.prefs) }), { expirationTtl: 60 * 60 * 24 * 60 });
  const seg = (await env.SUBS.get("seguidos", "json")) || {};
  if (!seg[b.id] && Object.keys(seg).length >= MAX_SEGUIDOS) return json({ ok: false, error: "lleno" }, 429);
  const e = seg[b.id] || { slug: String(b.slug || "all").replace(/[^a-z0-9._]/gi, "") || "all", name: clean(b.name, 80), s: b.s || "", st: String(b.st || ""), d: b.date || "", subs: [] };
  if (!e.subs.includes(h)) e.subs.push(h);
  seg[b.id] = e;
  await env.SUBS.put("seguidos", JSON.stringify(seg));
  return json({ ok: true, siguiendo: Object.keys(seg).filter(id => seg[id].subs.includes(h)) });
}
async function setPrefs(env, b) {
  if (!b.endpoint) return json({ ok: false }, 400);
  const h = await hash(b.endpoint), s = await env.SUBS.get(`sub:${h}`, "json");
  if (s) await env.SUBS.put(`sub:${h}`, JSON.stringify({ ...s, prefs: prefsOf(b.prefs) }), { expirationTtl: 60 * 60 * 24 * 60 });
  return json({ ok: true });
}
async function unfollow(env, b) {
  if (!b.endpoint || !b.id) return json({ ok: false }, 400);
  const h = await hash(b.endpoint);
  const seg = (await env.SUBS.get("seguidos", "json")) || {};
  if (seg[b.id]) { seg[b.id].subs = seg[b.id].subs.filter(x => x !== h); if (!seg[b.id].subs.length) delete seg[b.id]; await env.SUBS.put("seguidos", JSON.stringify(seg)); }
  return json({ ok: true });
}
async function novedades(env, b) {
  if (!b.endpoint) return json({ mensajes: [] });
  const k = `q:${await hash(b.endpoint)}`, q = (await env.SUBS.get(k, "json")) || [];
  if (q.length) await env.SUBS.delete(k);
  return json({ mensajes: q });
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
async function revisar(env) {
  const seg = (await env.SUBS.get("seguidos", "json")) || {};
  const ids = Object.keys(seg);
  if (!ids.length) return { seguidos: 0 };
  const now = new Date(), y = new Date(now.getTime() - 864e5);
  const slugs = [...new Set(ids.map(id => seg[id].slug || "all"))], evs = {};
  for (const slug of slugs) for (const d of [ymd(now), ymd(y)]) {
    try { const j = await espn(`${ESPN}/${slug}/scoreboard?dates=${d}${slug === "all" ? "&limit=1000" : ""}`); for (const e of j.events || []) if (seg[e.id]) evs[e.id] = e; } catch (x) {}
  }
  const colas = {};
  for (const id of ids) {
    const w = seg[id], e = evs[id];
    if (!e) { if (w.d && now - new Date(w.d) > 2 * 864e5) delete seg[id]; continue; }
    const c = (e.competitions || [])[0] || {}, status = c.status || e.status || {}, st = status.type || {};
    const h = (c.competitors || []).find(x => x.homeAway === "home") || {}, a = (c.competitors || []).find(x => x.homeAway === "away") || {};
    const tn = t => (t.team || {}).shortDisplayName || (t.team || {}).displayName || "";
    const hn = tn(h), an = tn(a), s = `${h.score ?? 0}-${a.score ?? 0}`, clock = status.displayClock || "";
    const kick = new Date(e.date || w.d || 0), msgs = [];
    if (w.s && s !== w.s && st.state !== "pre") {
      const [ph, pa] = w.s.split("-").map(Number), [nh, na] = s.split("-").map(Number);
      const quien = nh > ph ? hn : na > pa ? an : "";
      msgs.push({ t: quien ? `⚽ ¡Gol de ${quien}!` : "Cambio en el marcador", b: `${hn} ${h.score} – ${a.score} ${an}${clock ? " · " + clock : ""}`, id, k: s, p: "gol" });
    }
    const reds = (c.details || []).filter(x => x.redCard);
    if (reds.length > (w.r || 0)) {
      const x = reds[reds.length - 1], who = ((x.athletesInvolved || [])[0] || {}).displayName || "", team = String((x.team || {}).id) === String((h.team || {}).id) ? hn : an;
      msgs.push({ t: `🟥 Roja${team ? " para " + team : ""}`, b: `${who ? who + " · " : ""}${(x.clock || {}).displayValue || clock} · ${hn} ${h.score} – ${a.score} ${an}`, id, k: "r" + reds.length, p: "roja" });
    }
    w.r = reds.length;
    if (st.state === "pre" && !w.p15 && kick - now <= 16 * 60e3 && kick - now > 0) { msgs.push({ t: "⏰ Empieza en 15 minutos", b: `${hn} vs ${an}`, id, k: "p15", p: "prev" }); w.p15 = 1; }
    if (st.state === "pre" && !w.al && kick - now <= 75 * 60e3 && kick - now > -5 * 60e3 && (!w.alt || now - w.alt > 5 * 60e3)) {
      w.alt = now.getTime();
      try {
        const sm = await espn(`${ESPN}/all/summary?event=${id}`);
        if ((sm.rosters || []).some(t => (t.roster || []).some(p => p.starter))) { w.al = 1; msgs.push({ t: "📋 Alineaciones confirmadas", b: `${hn} vs ${an}: ya están las titulares`, id, k: "al", p: "alin" }); }
      } catch (x) {}
    }
    if (w.st === "pre" && st.state === "in") msgs.push({ t: "▶️ Empezó el partido", b: `${hn} vs ${an}`, id, k: "ini", p: "inicio" });
    if (st.state === "post" && w.st !== "post") msgs.push({ t: "🏁 Final del partido", b: `${hn} ${h.score} – ${a.score} ${an}`, id, k: "fin", p: "final" });
    w.s = s; w.st = st.state;
    if (msgs.length) for (const sh of w.subs) (colas[sh] ||= []).push(...msgs);
    if (st.state === "post") delete seg[id];
  }
  let enviados = 0;
  for (const [sh, all] of Object.entries(colas)) {
    const sub = await env.SUBS.get(`sub:${sh}`, "json");
    if (!sub) continue;
    const pf = prefsOf(sub.prefs), msgs = all.filter(m => pf[m.p] !== 0);
    if (!msgs.length) continue;
    const k = `q:${sh}`, q = ((await env.SUBS.get(k, "json")) || []).concat(msgs).slice(-10);
    await env.SUBS.put(k, JSON.stringify(q), { expirationTtl: 60 * 60 * 6 });
    try {
      const code = await push(env, sub); enviados++;
      if (code === 404 || code === 410) { await env.SUBS.delete(`sub:${sh}`); for (const id of Object.keys(seg)) seg[id].subs = seg[id].subs.filter(x => x !== sh); }
    } catch (x) {}
  }
  await env.SUBS.put("seguidos", JSON.stringify(seg));
  return { seguidos: ids.length, enviados };
}

/* ================= ¿Quién gana? ================= */
async function votar(env, b) {
  const id = String(b.id || ""), v = String(b.v || ""), uid = String(b.uid || "");
  if (!/^\d+$/.test(id) || !["H", "D", "A"].includes(v) || uid.length < 8 || uid.length > 64) return json({ ok: false, error: "datos inválidos" }, 400);
  if (b.k && Date.now() >= new Date(b.k).getTime()) return json({ ok: false, error: "el partido ya empezó" }, 409);
  const mk = `vu:${id}:${await hash(uid)}`, prev = await env.SUBS.get(mk);
  const c = (await env.SUBS.get(`v:${id}`, "json")) || { H: 0, D: 0, A: 0 };
  if (prev === v) return json({ ok: true, votos: c, mio: v });
  if (prev && c[prev] > 0) c[prev]--;
  c[v]++;
  await env.SUBS.put(`v:${id}`, JSON.stringify(c), { expirationTtl: 60 * 60 * 24 * 120 });
  await env.SUBS.put(mk, v, { expirationTtl: 60 * 60 * 24 * 60 });
  return json({ ok: true, votos: c, mio: v });
}
async function votos(env, ids, uid) {
  const out = {};
  const uh = uid ? await hash(uid) : null;
  for (const id of ids.slice(0, 60)) {
    if (!/^\d+$/.test(id)) continue;
    const c = await env.SUBS.get(`v:${id}`, "json");
    out[id] = c ? { ...c, n: c.H + c.D + c.A } : { H: 0, D: 0, A: 0, n: 0 };
    if (uh) { const m = await env.SUBS.get(`vu:${id}:${uh}`); if (m) out[id].mio = m; }
  }
  return json(out, 200, { "cache-control": uid ? "no-store" : "public, max-age=30" });
}

/* ================= ficha de jugador ================= */
const STAT_ES = { starts: "Titular", appearances: "Partidos", foulsCommitted: "Faltas cometidas", foulsSuffered: "Faltas recibidas", yellowCards: "Amarillas", redCards: "Rojas", totalGoals: "Goles",
  goalAssists: "Asistencias", totalShots: "Remates", shotsOnTarget: "Al arco", offsides: "Fueras de juego", saves: "Atajadas", goalsConceded: "Goles recibidos", cleanSheet: "Valla invicta", subIns: "Entró de cambio" };
async function jugador(env, id, ctx, req) {
  if (!/^\d+$/.test(id)) return json({ error: "id" }, 400);
  const cache = caches.default, ck = new Request(`https://cache.ballytics/jugador/${id}`);
  const hit = await cache.match(ck); if (hit) return new Response(hit.body, hit);
  const [ath, ov, gl] = await Promise.all([espn(`${ESPN_WEB}/athletes/${id}`).catch(() => null), espn(`${ESPN_WEB}/athletes/${id}/overview`).catch(() => null),
    espn(`${ESPN_WEB}/athletes/${id}/gamelog`).catch(() => null)]);
  const core = null;
  if (!ath && !core) return json({ error: "no encontrado" }, 404);
  const A = (ath && ath.athlete) || {}, C = core || {};
  const st = (ov && ov.statistics) || {}, names = st.names || [];
  const splits = (st.splits || []).map(s => ({ comp: s.displayName, liga: s.leagueSlug, equipo: s.teamId, stats: Object.fromEntries(names.map((n, i) => [n, s.stats[i]])) }));
  const teamOpt = ((st.filters || [])[0] || {}).options || [];
  const teamId = (splits.find(s => s.liga && !/fifa|uefa\.nations|uefa\.euro|conmebol\.america|friendly/.test(s.liga)) || splits[0] || {}).equipo || (A.team && A.team.id);
  const team = teamOpt.find(o => String(o.value) === String(teamId));
  const nat = teamOpt.find(o => (splits.find(s => /fifa|uefa\.nations|uefa\.euro|conmebol\.america/.test(s.liga) && String(s.equipo) === String(o.value))));
  // últimos partidos
  let log = [];
  try {
    const evs = (gl && gl.events) || {}, cats = ((gl && gl.seasonTypes) || []).flatMap(s => s.categories || []);
    const lnames = (gl && gl.names) || [];
    for (const cat of cats) for (const e of cat.events || []) {
      const m = evs[e.eventId]; if (!m) continue;
      log.push({ id: e.eventId, fecha: m.gameDate, rival: (m.opponent || {}).displayName, rlogo: (m.opponent || {}).logo, local: m.atVs === "vs", res: m.gameResult, marcador: m.score,
        liga: (m.leagueAbbreviation || m.leagueName || ""), stats: Object.fromEntries(lnames.map((n, i) => [n, (e.stats || [])[i]])) });
    }
    log.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
    log = log.slice(0, 12);
  } catch (x) {}
  const out = {
    id, nombre: A.displayName || C.displayName, corto: A.shortName || C.shortName, camiseta: A.jersey || C.jersey,
    posicion: (A.position || C.position || {}).displayName || (A.position || C.position || {}).name || "", edad: C.age || A.age, nacimiento: C.dateOfBirth || A.displayDOB,
    lugar: C.birthPlace ? [C.birthPlace.city, C.birthPlace.country].filter(Boolean).join(", ") : "", altura: C.displayHeight || A.displayHeight, peso: C.displayWeight || A.displayWeight,
    nacionalidad: C.citizenship || A.citizenship, bandera: (C.flag || A.flag || {}).href, foto: (A.headshot || {}).href || `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`,
    equipo: team ? { id: String(team.value), nombre: team.displayValue, logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${team.value}.png` } : null,
    seleccion: nat ? { id: String(nat.value), nombre: nat.displayValue } : null,
    etiquetas: Object.fromEntries(names.map(n => [n, STAT_ES[n] || n])), temporadas: splits, partidos: log,
    proximo: ov && ov.nextGame ? ov.nextGame : null,
    noticias: ((ov && ov.news) || []).slice(0, 4).map(n => ({ titulo: n.headline, desc: n.description, url: ((n.links || {}).web || {}).href, img: ((n.images || [])[0] || {}).url, fecha: n.lastModified })),
  };
  const res = json(out, 200, { "cache-control": "public, max-age=3600" });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}

/* ================= partidos del día (formato corto) ================= */
function corto(e) {
  const c = (e.competitions || [])[0] || {}, st = c.status || e.status || {}, t = st.type || {};
  const side = k => { const x = (c.competitors || []).find(y => y.homeAway === k) || {}, tm = x.team || {};
    return { id: String(tm.id || ""), name: tm.shortDisplayName || tm.displayName || "", full: tm.displayName || "", abr: tm.abbreviation, logo: tm.logo, color: tm.color, score: x.score, winner: x.winner }; };
  return { id: String(e.id), uid: e.uid, note: c.altGameNote || "", date: e.date, state: t.state, detail: t.shortDetail || t.detail || "", clock: st.displayClock, period: st.period, h: side("home"), a: side("away") };
}
async function dia(ctx, fechas) {
  const ds = fechas.filter(d => /^\d{8}$/.test(d)).slice(0, 3);
  if (!ds.length) return json({ error: "fecha" }, 400);
  const hoy = new Date(), cerca = d => Math.abs(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) - hoy.getTime()) < 2 * 864e5;
  const out = await Promise.all(ds.map(async d => {
    const cache = caches.default, ck = new Request(`https://cache.ballytics/dia/${d}`);
    const hit = await cache.match(ck); if (hit) return hit.json();
    const j = await espn(`${ESPN}/all/scoreboard?dates=${d}&limit=1000`);
    const evs = (j.events || []).map(corto);
    const ttl = evs.some(e => e.state === "in") ? 20 : cerca(d) ? 60 : 900;
    ctx.waitUntil(cache.put(ck, json(evs, 200, { "cache-control": `public, max-age=${ttl}` })));
    return evs;
  }));
  return json({ ok: true, events: out.flat() }, 200, { "cache-control": "public, max-age=15" });
}

/* ================= jugadores dentro del partido (API-Football) ================= */
const AF = "https://v3.football.api-sports.io";
const AF_MIN = 20;   // consultas diarias que se dejan libres para el robot (bajas)
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w && !["fc", "cf", "sc", "ac", "afc", "cd", "club", "de", "al", "the", "fk", "sk", "if", "bk", "united", "city", "deportivo", "atletico", "sporting", "real"].includes(w));
function parecido(a, b) {
  const A = norm(a), B = norm(b); if (!A.length || !B.length) return 0;
  let n = 0; for (const w of A) if (B.some(x => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))) n++;
  return n / Math.max(A.length, B.length);
}
async function afGet(env, path) {
  const hoy = new Date().toISOString().slice(0, 10), rem = (await env.SUBS.get("afrem", "json")) || {};
  if (rem.d === hoy && rem.n != null && rem.n < AF_MIN) throw new Error("limite");
  const r = await fetch(AF + path, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
  const n = parseInt(r.headers.get("x-ratelimit-requests-remaining") || "", 10), pm = r.headers.get("x-ratelimit-remaining");
  const hd = {}; for (const [k2, v2] of r.headers) if (/rate|limit|retry|cf-|server/i.test(k2)) hd[k2] = v2;
  await env.SUBS.put("afrem", JSON.stringify({ d: hoy, n: isNaN(n) ? (rem.d === hoy ? rem.n : null) : n, pm, t: new Date().toISOString(), path: path.split("?")[0], status: r.status, hd }));
  if (!r.ok) throw new Error(`API-Football ${r.status}`);
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) throw new Error(JSON.stringify(j.errors).slice(0, 120));
  return j.response || [];
}
async function afFixture(env, id, k, h, a) {
  const m = await env.SUBS.get(`afm:${id}`); if (m) return m === "0" ? null : +m;
  const d = String(k).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let lista = await env.SUBS.get(`afd:${d}`, "json");
  if (!lista) {
    const r = await afGet(env, `/fixtures?date=${d}`);
    lista = r.map(f => [f.fixture.id, f.fixture.timestamp, f.teams.home.name, f.teams.away.name]);
    await env.SUBS.put(`afd:${d}`, JSON.stringify(lista), { expirationTtl: 3 * 86400 });
  }
  const ts = Date.parse(k) / 1000; let best = null, bs = 0;
  for (const [fid, t, fh, fa] of lista) {
    if (Math.abs(t - ts) > 20 * 60) continue;
    const sc = parecido(h, fh) + parecido(a, fa);
    if (sc > bs) { bs = sc; best = fid; }
  }
  const ok = best && bs >= 0.6 ? best : null;
  await env.SUBS.put(`afm:${id}`, String(ok || 0), { expirationTtl: ok ? 30 * 86400 : 6 * 3600 });
  return ok;
}
async function jugadoresPartido(env, q) {
  const id = q.get("id") || "", st = q.get("st") || "", k = q.get("k") || "";
  if (!/^\d+$/.test(id)) return json({ ok: false, error: "id" }, 400);
  if (!env.API_FOOTBALL_KEY) return json({ ok: false, motivo: "sin_clave" });
  if (st === "pre") return json({ ok: false, motivo: "pre" });
  const c = await env.SUBS.get(`afj:${id}`, "json");
  if (c && (c.fin || Date.now() - c.t < (st === "in" ? 6 : 30) * 60000)) return json({ ok: true, ...c.data, cache: true });
  try {
    const fid = await afFixture(env, id, k, q.get("h"), q.get("a"));
    if (!fid) return json({ ok: false, motivo: "sin_cruce" });
    const r = await afGet(env, `/fixtures/players?fixture=${fid}`);
    const n0 = v => v == null ? null : +v;
    const data = { fixture: fid, equipos: r.map(t => ({ nombre: t.team.name, logo: t.team.logo, jugadores: (t.players || []).map(p => {
      const s = (p.statistics || [])[0] || {}, g = s.games || {};
      return { id: p.player.id, n: p.player.name, foto: p.player.photo, num: n0(g.number), pos: g.position, min: n0(g.minutes), r: g.rating ? +(+g.rating).toFixed(1) : null, cap: !!g.captain, sup: !!g.substitute,
        sh: n0((s.shots || {}).total), sot: n0((s.shots || {}).on), g: n0((s.goals || {}).total), as: n0((s.goals || {}).assists), sv: n0((s.goals || {}).saves), gc: n0((s.goals || {}).conceded),
        pas: n0((s.passes || {}).total), kp: n0((s.passes || {}).key), acc: (s.passes || {}).accuracy != null ? parseInt((s.passes || {}).accuracy, 10) : null,
        tk: n0((s.tackles || {}).total), blk: n0((s.tackles || {}).blocks), int: n0((s.tackles || {}).interceptions), du: n0((s.duels || {}).total), duw: n0((s.duels || {}).won),
        dr: n0((s.dribbles || {}).attempts), drs: n0((s.dribbles || {}).success), fd: n0((s.fouls || {}).drawn), fc: n0((s.fouls || {}).committed),
        yc: n0((s.cards || {}).yellow), rc: n0((s.cards || {}).red), off: n0(s.offsides), pw: n0((s.penalty || {}).won), ps: n0((s.penalty || {}).scored), pm: n0((s.penalty || {}).missed) };
    }) })) };
    if (!data.equipos.length) return json({ ok: false, motivo: "sin_datos" });
    await env.SUBS.put(`afj:${id}`, JSON.stringify({ t: Date.now(), fin: st === "post", data }), { expirationTtl: 30 * 86400 });
    return json({ ok: true, ...data });
  } catch (e) {
    if (c) return json({ ok: true, ...c.data, cache: true, viejo: true });
    return json({ ok: false, motivo: String(e.message || e).includes("limite") ? "limite" : "error", error: String(e.message || e).slice(0, 160) });
  }
}

/* ================= prode ================= */
const CODE_CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CH[b % CODE_CH.length]).join("");
const okUid = u => typeof u === "string" && u.length >= 8 && u.length <= 64;
async function prodeCrear(env, b) {
  if (!okUid(b.uid)) return json({ ok: false, error: "uid" }, 400);
  let code = newCode(); for (let i = 0; i < 4 && await env.SUBS.get(`p:${code}`); i++) code = newCode();
  const g = { nombre: clean(b.nombre, 40) || "Prode", creado: new Date().toISOString(), dueno: await hash(b.uid), miembros: { [await hash(b.uid)]: clean(b.alias, 24) || "Yo" }, picks: {}, eventos: {} };
  await env.SUBS.put(`p:${code}`, JSON.stringify(g));
  return json({ ok: true, code });
}
async function prodeUnirse(env, b) {
  const code = String(b.code || "").toUpperCase(), g = await env.SUBS.get(`p:${code}`, "json");
  if (!g) return json({ ok: false, error: "No existe un prode con ese código." }, 404);
  if (!okUid(b.uid)) return json({ ok: false, error: "uid" }, 400);
  const h = await hash(b.uid);
  if (!g.miembros[h] && Object.keys(g.miembros).length >= 60) return json({ ok: false, error: "El prode está lleno." }, 429);
  g.miembros[h] = clean(b.alias, 24) || g.miembros[h] || "Jugador";
  await env.SUBS.put(`p:${code}`, JSON.stringify(g));
  return json({ ok: true, code });
}
async function prodePick(env, b) {
  const code = String(b.code || "").toUpperCase(), g = await env.SUBS.get(`p:${code}`, "json");
  if (!g) return json({ ok: false, error: "No existe el prode." }, 404);
  if (!okUid(b.uid)) return json({ ok: false, error: "uid" }, 400);
  const h = await hash(b.uid), id = String(b.id || "");
  if (!g.miembros[h]) return json({ ok: false, error: "No eres parte de este prode." }, 403);
  if (!/^\d+$/.test(id) || !/^\d{1,2}-\d{1,2}$/.test(String(b.pick || ""))) return json({ ok: false, error: "Pronóstico inválido." }, 400);
  const ev = g.eventos[id] || { k: b.k, h: clean(b.h), a: clean(b.a), slug: String(b.slug || "all").replace(/[^a-z0-9._]/gi, ""), comp: clean(b.comp, 50) };
  if (!ev.k || Date.now() >= new Date(ev.k).getTime()) return json({ ok: false, error: "El partido ya empezó." }, 409);
  if (!g.eventos[id] && Object.keys(g.eventos).length >= 400) return json({ ok: false, error: "Demasiados partidos en este prode." }, 429);
  g.eventos[id] = ev;
  (g.picks[h] ||= {})[id] = b.pick;
  await env.SUBS.put(`p:${code}`, JSON.stringify(g));
  return json({ ok: true });
}
async function resultado(env, id, ev) {
  const c = await env.SUBS.get(`res:${id}`); if (c) return c;
  if (Date.now() < new Date(ev.k).getTime() + 100 * 60e3) return null;
  try {
    const d = new Date(ev.k), ds = [ymd(d), ymd(new Date(d.getTime() + 864e5))];
    for (const x of ds) {
      const j = await espn(`${ESPN}/${ev.slug || "all"}/scoreboard?dates=${x}${(ev.slug || "all") === "all" ? "&limit=1000" : ""}`);
      const e = (j.events || []).find(y => String(y.id) === String(id)); if (!e) continue;
      const c0 = (e.competitions || [])[0] || {}, st = ((c0.status || e.status || {}).type || {}).state;
      if (st !== "post") return null;
      const h = (c0.competitors || []).find(q => q.homeAway === "home") || {}, a = (c0.competitors || []).find(q => q.homeAway === "away") || {};
      const r = `${h.score}-${a.score}`; await env.SUBS.put(`res:${id}`, r, { expirationTtl: 60 * 60 * 24 * 365 }); return r;
    }
  } catch (x) {}
  return null;
}
const sign = (x, y) => Math.sign(x - y);
async function prodeVer(env, code, uid) {
  const g = await env.SUBS.get(`p:${code.toUpperCase()}`, "json");
  if (!g) return json({ ok: false, error: "No existe un prode con ese código." }, 404);
  const me = uid ? await hash(uid) : null, now = Date.now();
  let fetched = 0;
  const res = {};
  for (const [id, ev] of Object.entries(g.eventos)) {
    const c = await env.SUBS.get(`res:${id}`);
    if (c) res[id] = c; else if (fetched < 8 && now > new Date(ev.k).getTime() + 100 * 60e3) { fetched++; const r = await resultado(env, id, ev); if (r) res[id] = r; }
  }
  const tabla = Object.entries(g.miembros).map(([h, alias]) => {
    let pts = 0, ex = 0, ac = 0, n = 0;
    for (const [id, p] of Object.entries(g.picks[h] || {})) {
      const r = res[id]; if (!r) continue; n++;
      const [ph, pa] = p.split("-").map(Number), [rh, ra] = r.split("-").map(Number);
      if (ph === rh && pa === ra) { pts += 3; ex++; } else if (sign(ph, pa) === sign(rh, ra)) { pts += 1; ac++; }
    }
    return { alias, pts, exactos: ex, aciertos: ac, jugados: n, yo: h === me };
  }).sort((a, b) => b.pts - a.pts || b.exactos - a.exactos || a.alias.localeCompare(b.alias));
  const eventos = Object.entries(g.eventos).map(([id, ev]) => {
    const empezado = now >= new Date(ev.k).getTime();
    return { id, ...ev, res: res[id] || null, mio: me && g.picks[me] ? g.picks[me][id] || null : null,
      otros: empezado ? Object.entries(g.miembros).map(([h, alias]) => ({ alias, pick: (g.picks[h] || {})[id] || null })).filter(x => x.pick) : null,
      n: Object.values(g.picks).filter(p => p[id]).length };
  }).sort((a, b) => String(a.k).localeCompare(String(b.k)));
  return json({ ok: true, code: code.toUpperCase(), nombre: g.nombre, miembro: !!(me && g.miembros[me]), dueno: me === g.dueno, tabla, eventos });
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return cors(req, new Response(null, { status: 204 }));
    const u = new URL(req.url), p = u.pathname;
    let res;
    try {
      if (p === "/vapid") res = json({ publicKey: (await vapid(env)).pub });
      else if (p === "/estado") { const seg = (await env.SUBS.get("seguidos", "json")) || {}; res = json({ ok: true, partidos: Object.keys(seg).length }); }
      else if (p === "/votos") res = await votos(env, (u.searchParams.get("ids") || "").split(",").filter(Boolean), u.searchParams.get("uid"));
      else if (p.startsWith("/jugador/")) res = await jugador(env, p.split("/")[2], ctx, req);
      else if (p === "/dia") res = await dia(ctx, (u.searchParams.get("d") || "").split(","));
      else if (p === "/jugadores") res = await jugadoresPartido(env, u.searchParams);
      else if (p === "/afestado") res = json({ ok: true, clave: !!env.API_FOOTBALL_KEY, ...((await env.SUBS.get("afrem", "json")) || {}) });
      else if (p.startsWith("/prode/") && req.method === "GET") res = await prodeVer(env, p.split("/")[2] || "", u.searchParams.get("uid"));
      else if (req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        const R = { "/follow": follow, "/unfollow": unfollow, "/prefs": setPrefs, "/novedades": novedades, "/voto": votar, "/prode/crear": prodeCrear, "/prode/unirse": prodeUnirse, "/prode/pick": prodePick }[p];
        res = R ? await R(env, b) : json({ error: "no existe" }, 404);
      } else res = json({ ok: true, servicio: "Ballytics" });
    } catch (e) { res = json({ ok: false, error: String(e) }, 500); }
    return cors(req, res);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(revisar(env)); },
};
