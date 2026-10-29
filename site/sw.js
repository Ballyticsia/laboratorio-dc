/* Ballytics: app instalable y avisos de gol.
   - Lo del propio sitio se pide primero a la red y se guarda una copia para abrir sin conexión.
   - Lo de ESPN y otros sitios va directo (no pasa por aquí).
   - Los avisos llegan como "push" sin contenido; aquí se piden los mensajes al servidor de avisos. */
const CACHE = "bt-v23";   // cambiar al publicar cambios grandes del caparazón
const SHELL = ["./", "index.html", "assets/app.css", "assets/app.js", "assets/competiciones.json", "assets/selecciones.json", "assets/icon-192.png", "assets/fonts/manrope-latin-wght-normal.woff2", "assets/fonts/chakra-petch-latin-700-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMGS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// escudos y fotos (ESPN, wsrv.nl, API-Football): se guardan en el teléfono y la próxima vez aparecen al instante
const IMGS = "bt-img-v1", IMG_HOSTS = /^(a\.espncdn\.com|wsrv\.nl|images\.weserv\.nl|media\.api-sports\.io)$/, IMG_MAX = 700;
let podar = 0;
async function imagen(req) {
  const c = await caches.open(IMGS), hit = await c.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { mode: "cors", credentials: "omit" });   // con CORS se puede guardar sin ocupar espacio de más
    if (r.ok) { c.put(req.url, r.clone()).catch(() => {}); if (++podar % 40 === 0) c.keys().then(ks => ks.length > IMG_MAX && Promise.all(ks.slice(0, ks.length - IMG_MAX).map(k => c.delete(k)))).catch(() => {}); }
    return r;
  } catch (x) { return fetch(req); }   // sin CORS: la imagen se pide normal y no se guarda
}
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method === "GET" && e.request.destination === "image" && IMG_HOSTS.test(u.hostname)) { e.respondWith(imagen(e.request)); return; }
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const nav = e.request.mode === "navigate";
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r
    // index.html solo como respaldo de una página; a un pedido de datos nunca se le devuelve HTML
    // sin conexión, una página con dirección propia (partido/…, liga/…) se abre en la app principal
    || (nav ? (new URL("./", self.registration.scope).pathname === u.pathname || u.pathname.endsWith("/index.html") ? caches.match("index.html") : Response.redirect(new URL("./", self.registration.scope).href, 302)) : new Response(JSON.stringify({ error: "sin conexión" }), { status: 503, headers: { "content-type": "application/json" } })))));
});

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let msgs = [];
    try {
      const cfg = await (await fetch("avisos.json", { cache: "no-store" })).json();
      const sub = await self.registration.pushManager.getSubscription();
      if (cfg.url && sub) {
        const r = await fetch(cfg.url + "/novedades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        msgs = (await r.json()).mensajes || [];
      }
    } catch (x) {}
    if (!msgs.length) msgs = [{ t: "Ballytics", b: "Hay novedades en un partido que sigues.", id: "" }];
    await Promise.all(msgs.slice(-3).map(m => self.registration.showNotification(m.t, {
      body: m.b, tag: `bt-${m.id || "x"}-${m.k || ""}`, icon: "assets/icon-192.png", badge: "assets/icon-192.png",
      data: { url: m.id ? `./#/envivo/${m.id}` : "./#/vivo" } })));
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ("focus" in w) { if ("navigate" in w) w.navigate(url); return w.focus(); }
    return clients.openWindow(url);
  }));
});
