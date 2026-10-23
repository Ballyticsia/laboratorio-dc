/* Ballytics · servidor de avisos de gol (Cloudflare Worker, plan gratis).

   - El sitio inscribe el navegador (suscripción Web Push) a los partidos que la persona sigue.
   - Cada minuto (cron) revisa en ESPN solo las competiciones de esos partidos; si cambia el
     marcador o termina el partido, deja un mensaje en la cola de cada suscriptor y le manda un
     "push" vacío firmado con VAPID. El service worker del sitio pide los mensajes a /novedades.
   - Todo se guarda en KV (binding SUBS). Las llaves VAPID se crean solas la primera vez.

   Llaves en KV:
     vapid            -> { pub, jwk }                    llaves VAPID
     seguidos         -> { [eventId]: { slug, name, s, st, subs: [hash] } }
     sub:<hash>       -> suscripción del navegador
     q:<hash>         -> mensajes pendientes [{t, b, id, k}]                                   */

const ORIGINS = ["https://ballyticsia.github.io", "http://localhost:8793", "http://localhost:8000"];
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const MAX_SEGUIDOS = 300;

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const enc = new TextEncoder();

async function hash(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 24); }

function cors(req, res) {
  const o = req.headers.get("Origin");
  const h = new Headers(res.headers);
  if (o && ORIGINS.includes(o)) { h.set("Access-Control-Allow-Origin", o); h.set("Vary", "Origin"); }
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

async function vapid(env) {
  let v = await env.SUBS.get("vapid", "json");
  if (v) return v;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  v = { pub, jwk };
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
  const jwt = `${head}.${body}.${b64u(sig)}`;
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: `vapid t=${jwt}, k=${v.pub}`, TTL: "3600", Urgency: "high", "Content-Length": "0" } });
  return r.status;
}

async function follow(env, b) {
  const sub = b.subscription;
  if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !b.id || !/^\d+$/.test(String(b.id))) return json({ ok: false, error: "datos inválidos" }, 400);
  const h = await hash(sub.endpoint);
  await env.SUBS.put(`sub:${h}`, JSON.stringify(sub), { expirationTtl: 60 * 60 * 24 * 60 });
  const seg = (await env.SUBS.get("seguidos", "json")) || {};
  if (!seg[b.id] && Object.keys(seg).length >= MAX_SEGUIDOS) return json({ ok: false, error: "lleno" }, 429);
  const e = seg[b.id] || { slug: String(b.slug || "all").replace(/[^a-z0-9._]/gi, "") || "all", name: String(b.name || "").slice(0, 80), s: b.s || "", st: String(b.st || ""), d: b.date || "", subs: [] };
  if (!e.subs.includes(h)) e.subs.push(h);
  seg[b.id] = e;
  await env.SUBS.put("seguidos", JSON.stringify(seg));
  return json({ ok: true, siguiendo: Object.keys(seg).filter(id => seg[id].subs.includes(h)) });
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
  const h = await hash(b.endpoint), k = `q:${h}`;
  const q = (await env.SUBS.get(k, "json")) || [];
  if (q.length) await env.SUBS.delete(k);
  return json({ mensajes: q });
}

/* ---------- revisión cada minuto ---------- */
function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }
async function revisar(env) {
  const seg = (await env.SUBS.get("seguidos", "json")) || {};
  const ids = Object.keys(seg);
  if (!ids.length) return { seguidos: 0 };
  // una consulta por competición (y por día, por los partidos que cruzan la medianoche)
  const now = new Date(), y = new Date(now.getTime() - 864e5);
  const slugs = [...new Set(ids.map(id => seg[id].slug || "all"))];
  const evs = {};
  for (const slug of slugs) for (const d of [ymd(now), ymd(y)]) {
    try {
      const r = await fetch(`${ESPN}/${slug}/scoreboard?dates=${d}${slug === "all" ? "&limit=1000" : ""}`, { headers: { "User-Agent": "Mozilla/5.0 Ballytics" } });
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of j.events || []) if (seg[e.id]) evs[e.id] = e;
    } catch (x) {}
  }
  let cambios = 0, enviados = 0;
  const colas = {};
  for (const id of ids) {
    const w = seg[id], e = evs[id];
    if (!e) { if (w.d && now - new Date(w.d) > 2 * 864e5) delete seg[id]; continue; }
    const c = (e.competitions || [])[0] || {}, st = (c.status || e.status || {}).type || {};
    const h = (c.competitors || []).find(x => x.homeAway === "home") || {}, a = (c.competitors || []).find(x => x.homeAway === "away") || {};
    const hn = (h.team || {}).shortDisplayName || (h.team || {}).displayName || "", an = (a.team || {}).shortDisplayName || (a.team || {}).displayName || "";
    const s = `${h.score ?? 0}-${a.score ?? 0}`, clock = (c.status || e.status || {}).displayClock || "";
    const msgs = [];
    if (w.s && s !== w.s && st.state !== "pre") {
      const [ph, pa] = w.s.split("-").map(Number), [nh, na] = s.split("-").map(Number);
      const quien = nh > ph ? hn : na > pa ? an : "";
      msgs.push({ t: quien ? `⚽ ¡Gol de ${quien}!` : "Cambio en el marcador", b: `${hn} ${h.score} – ${a.score} ${an}${clock ? " · " + clock : ""}`, id, k: s });
    }
    if (w.st === "pre" && st.state === "in") msgs.push({ t: "Empezó el partido", b: `${hn} vs ${an}`, id, k: "ini" });
    if (st.state === "post" && w.st !== "post") msgs.push({ t: "Final del partido", b: `${hn} ${h.score} – ${a.score} ${an}`, id, k: "fin" });
    w.s = s; w.st = st.state;
    if (msgs.length) { cambios++; for (const sh of w.subs) (colas[sh] ||= []).push(...msgs); }
    if (st.state === "post") delete seg[id];
  }
  for (const [sh, msgs] of Object.entries(colas)) {
    const k = `q:${sh}`, q = ((await env.SUBS.get(k, "json")) || []).concat(msgs).slice(-10);
    await env.SUBS.put(k, JSON.stringify(q), { expirationTtl: 60 * 60 * 6 });
    const sub = await env.SUBS.get(`sub:${sh}`, "json");
    if (!sub) continue;
    try {
      const code = await push(env, sub); enviados++;
      if (code === 404 || code === 410) {   // la suscripción ya no existe: se borra
        await env.SUBS.delete(`sub:${sh}`);
        for (const id of Object.keys(seg)) seg[id].subs = seg[id].subs.filter(x => x !== sh);
      }
    } catch (x) {}
  }
  await env.SUBS.put("seguidos", JSON.stringify(seg));
  return { seguidos: ids.length, cambios, enviados };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return cors(req, new Response(null, { status: 204 }));
    const u = new URL(req.url);
    let res;
    try {
      if (u.pathname === "/vapid") res = json({ publicKey: (await vapid(env)).pub });
      else if (u.pathname === "/estado") { const seg = (await env.SUBS.get("seguidos", "json")) || {}; res = json({ ok: true, partidos: Object.keys(seg).length }); }
      else if (req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        res = u.pathname === "/follow" ? await follow(env, b) : u.pathname === "/unfollow" ? await unfollow(env, b) : u.pathname === "/novedades" ? await novedades(env, b) : json({ error: "no existe" }, 404);
      } else res = json({ ok: true, servicio: "Ballytics avisos" });
    } catch (e) { res = json({ ok: false, error: String(e) }, 500); }
    return cors(req, res);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(revisar(env)); },
};
