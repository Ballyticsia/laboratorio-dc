/* Prueba de humo antes de publicar: abre las pantallas principales en un navegador real (teléfono y computador)
   con los datos recién generados y falla si alguna se rompe. Si falla, el robot no publica y el sitio sigue con
   la última versión buena.
   Uso: node tests/humo.js   (después de pipeline/generar.py y pipeline/seo.py) */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const SITE = path.join(__dirname, "..", "site");
const PREF = "/laboratorio-dc/";   // igual que en GitHub Pages: la base absoluta de 404.html apunta aquí
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain" };

function servidor() {
  return http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split("?")[0]);
    if (!u.startsWith(PREF)) { res.writeHead(302, { location: PREF }); return res.end(); }
    let f = path.join(SITE, u.slice(PREF.length));
    if (!f.startsWith(SITE)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!u.endsWith("/")) { res.writeHead(301, { location: u + "/" }); return res.end(); }
      f = path.join(f, "index.html");
    }
    if (!fs.existsSync(f)) { res.writeHead(404, { "content-type": TIPOS[".html"] }); return res.end(fs.readFileSync(path.join(SITE, "404.html"))); }
    res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
}

const leer = f => JSON.parse(fs.readFileSync(path.join(SITE, "data", f), "utf8"));

(async () => {
  const srv = servidor(); await new Promise(r => srv.listen(0, r));
  const B = `http://localhost:${srv.address().port}${PREF}`;
  const ind = leer("indice.json"), L0 = ind.ligas[0].id;
  const port = (ind.portada && ind.portada.partidos || [])[0];
  const pagPartido = fs.existsSync(path.join(SITE, "partido")) ? (() => { for (const l of fs.readdirSync(path.join(SITE, "partido"))) { const d = fs.readdirSync(path.join(SITE, "partido", l)); if (d.length) return `partido/${l}/${d[0]}/`; } return null; })() : null;
  // un árbitro con ficha (si el historial ya existe)
  let arb = null;
  try { for (const f of fs.readdirSync(path.join(SITE, "data", "arbitros"))) { const H = JSON.parse(fs.readFileSync(path.join(SITE, "data", "arbitros", f), "utf8")); const r = Object.values(H.refs || {}).sort((a, b) => b.pj - a.pj)[0]; if (r) { arb = [H.liga, r.slug]; break; } } } catch (e) {}
  const rutas = [
    ["", "Inicio"], [`#/liga/${L0}/resumen`, "Liga"], [`#/liga/${L0}/tabla`, "Tabla"], [`#/liga/${L0}/partidos`, "Partidos de la liga"],
    ...(port ? [[`#/partido/${port.liga}/${port.id}`, "Partido"], [`#/partido/${port.liga}/${port.id}/mercados`, "Mercados"]] : []),
    ["#/registro", "Resultados del modelo"], ["#/picks", "Picks públicos"], ["#/metodo", "Cómo funciona"], ["#/prode", "Prode"],
    ["#/seguimiento", "Mis pronósticos"], ["#/terminos", "Términos"], ["#/privacidad", "Privacidad"], ["#/vivo", "En vivo (sin ESPN)"], ["#/envivo/999", "Tanda de penales (datos de prueba)"],
    [`liga/${L0}/`, "Página de liga"], ...(pagPartido ? [[pagPartido, "Página de partido"]] : []), ["picks/", "Página de picks"],
    ...(arb ? [[`#/arbitro/${arb[0]}/${arb[1]}`, "Ficha de árbitro"], [`#/liga/${arb[0]}/arbitros`, "Árbitros de la liga"]] : []),
    ...(arb && fs.existsSync(path.join(SITE, "arbitro", arb[0], arb[1])) ? [[`arbitro/${arb[0]}/${arb[1]}/`, "Página de árbitro"]] : []),
    ["partido/nada/1-a-vs-b/", "Dirección inexistente (404)"],
  ];
  const b = await chromium.launch(), fallas = [];
  for (const [nom, vp] of [["teléfono", { width: 390, height: 844 }], ["computador", { width: 1366, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, locale: "es-CL", timezoneId: "America/Santiago", serviceWorkers: "block" });
    const pg = await ctx.newPage();
    let actual = "";
    pg.on("pageerror", e => fallas.push(`${nom} · ${actual}: error de JavaScript: ${e.message}`));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) fallas.push(`${nom} · ${actual}: consola: ${m.text().slice(0, 200)}`); });
    // nada de afuera (ESPN, servidor de avisos, fuentes, escudos): la prueba no depende de otros sitios
    // ESPN solo para el partido de prueba con tanda de penales (tests/datos/tanda_penales.json)
    const TANDA = fs.readFileSync(path.join(__dirname, "datos", "tanda_penales.json"), "utf8");
    await pg.route(u => !u.href.startsWith(B), r => /summary\?event=999\b/.test(r.request().url()) ? r.fulfill({ contentType: "application/json", body: TANDA }) : r.abort());
    for (const [r, n] of rutas) {
      actual = n;
      try {
        await pg.goto(B + r, { waitUntil: "load", timeout: 30000 });
        await pg.waitForFunction(() => { const a = document.getElementById("app"); return a && !a.querySelector(".boot") && a.textContent.trim().length > 60; }, null, { timeout: 15000 });
        await pg.waitForTimeout(400);
        const txt = await pg.$eval("#app", a => a.textContent);
        if (/No pude cargar los datos/.test(txt)) fallas.push(`${nom} · ${n}: no cargó los datos`);
        if (/Tanda de penales/.test(n)) { await pg.waitForSelector(".pso .pso-kick", { timeout: 8000 }).catch(() => {}); if ((await pg.$$(".pso .pso-kick")).length !== 10 || !(await pg.$(".pso-arco"))) fallas.push(`${nom} · ${n}: la tanda no se dibujó completa`); }
        if (vp.width < 500) {
          const ancho = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (ancho > 1) fallas.push(`${nom} · ${n}: la página se sale ${ancho} px por el costado`);
        }
      } catch (e) { fallas.push(`${nom} · ${n}: no terminó de abrir (${String(e.message).split("\n")[0]})`); }
    }
    await ctx.close();
  }
  await b.close(); srv.close();
  if (fallas.length) { console.log(`✗ ${fallas.length} problemas:\n- ` + [...new Set(fallas)].join("\n- ")); process.exit(1); }
  console.log(`✓ ${rutas.length} pantallas revisadas en teléfono y computador, sin errores.`);
})().catch(e => { console.error(e); process.exit(1); });
