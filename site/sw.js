/* Ballytics: app instalable y avisos de gol.
   - Lo del propio sitio se pide primero a la red y se guarda una copia para abrir sin conexión.
   - Lo de ESPN y otros sitios va directo (no pasa por aquí).
   - Los avisos llegan como "push" sin contenido; aquí se piden los mensajes al servidor de avisos. */
const CACHE = "bt-v1";   // cambiar al publicar cambios grandes del caparazón
const SHELL = ["./", "index.html", "assets/app.css", "assets/app.js", "assets/competiciones.json", "assets/selecciones.json", "assets/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
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
