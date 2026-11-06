/* Revisión visual del sitio publicado: abre las pantallas principales en teléfono y computador (con ESPN,
   escudos y fotos reales), saca una captura de cada una y anota lo que se ve mal: errores de JavaScript,
   páginas que se salen por el costado, imágenes rotas, datos que no cargaron y pantallas lentas.
   Uso: node tests/capturas.js [carpeta]   (BASE=https://… para revisar otra dirección)
   Deja las capturas, informe.md e informe.json en la carpeta (por defecto: capturas/). */
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const BASE = (process.env.BASE || "https://ballyticsia.github.io/laboratorio-dc/").replace(/\/?$/, "/");
const OUT = path.resolve(process.argv[2] || "capturas");
const SITE = path.join(__dirname, "..", "site");
const leer = f => { try { return JSON.parse(fs.readFileSync(path.join(SITE, "data", f), "utf8")); } catch (e) { return null; } };

function rutas() {
  const ind = leer("indice.json") || { ligas: [] }, out = [["inicio", "", "Inicio"], ["vivo", "#/vivo", "En vivo"]];
  const L = leer("premier.json") || leer(((ind.ligas || [])[0] || {}).id + ".json");
  if (L) {
    out.push(["liga", `#/liga/${L.id}/resumen`, "Liga"], ["tabla", `#/liga/${L.id}/tabla`, "Tabla"], ["estadisticas", `#/liga/${L.id}/estadisticas`, "Estadísticas de la liga"]);
    const p = (L.partidos || [])[0];
    if (p) out.push(["partido", `#/partido/${L.id}/${p.id}`, "Partido (análisis)"], ["mercados", `#/partido/${L.id}/${p.id}/mercados`, "Mercados"]);
    const t = ((L.tabla || [])[0] || {}).equipo; if (t) out.push(["equipo", `#/equipo/${L.id}/${encodeURIComponent(t)}`, "Equipo"]);
    const g = (L.goleadores || [])[0]; if (g) out.push(["jugador", `#/jugador/${L.id}/${g.jid}`, "Jugador"]);
    const r = (L.resultados || []).find(x => /^\d+$/.test(String(x.id)));
    if (r) out.push(["envivo", `#/envivo/${r.id}`, "Partido jugado"], ["envivo-est", `#/envivo/${r.id}/estadisticas`, "Partido jugado: estadísticas"], ["envivo-al", `#/envivo/${r.id}/alineaciones`, "Partido jugado: alineaciones"]);
  }
  if (leer("chile2.json")) out.push(["ascenso", "#/liga/chile2/resumen", "Liga de Ascenso"]);
  out.push(["competiciones", "#/competiciones", "Competiciones"], ["picks", "#/picks", "Picks"], ["prode", "#/prode", "Prode"], ["registro", "#/registro", "Resultados del modelo"], ["metodo", "#/metodo", "Cómo funciona"]);
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const R = rutas(), b = await chromium.launch(), filas = [];
  for (const [dev, vp] of [["telefono", { width: 390, height: 844 }], ["computador", { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, locale: "es-CL", timezoneId: "America/Santiago", deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    for (const [k, r, n] of R) {
      const prob = [], t0 = Date.now();
      const onErr = e => prob.push(`error de JavaScript: ${String(e.message).slice(0, 160)}`);
      pg.on("pageerror", onErr);
      try {
        await pg.goto(BASE + r, { waitUntil: "load", timeout: 40000 });
        await pg.waitForFunction(() => { const a = document.getElementById("app"); return a && !a.querySelector(".boot") && a.textContent.trim().length > 60; }, null, { timeout: 20000 });
        await pg.waitForTimeout(1500);
        // se baja hasta el final de a poco: hay bloques que se cargan al aparecer en pantalla
        await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
        await pg.waitForTimeout(2000);   // ESPN, escudos y fotos
        const seg = (Date.now() - t0) / 1000;
        const m = await pg.evaluate(() => {
          const imgs = [...document.querySelectorAll("#app img")].filter(i => i.getBoundingClientRect().width > 0);
          const rotas = imgs.filter(i => i.complete && i.naturalWidth === 0).length;
          const txt = document.getElementById("app").textContent;
          return { ancho: document.documentElement.scrollWidth - innerWidth, imgs: imgs.length, rotas, sinDatos: /No pude cargar/.test(txt), vacios: document.querySelectorAll(".skel").length };
        });
        if (m.ancho > 1) prob.push(`se sale ${m.ancho} px por el costado`);
        if (m.rotas) prob.push(`${m.rotas} de ${m.imgs} imágenes no cargaron`);
        if (m.sinDatos) prob.push("dice que no pudo cargar los datos");
        if (m.vacios > 3) prob.push(`${m.vacios} bloques siguen "cargando" después de abrir`);
        if (seg > 12) prob.push(`tardó ${seg.toFixed(1)} s en abrir`);
        await pg.screenshot({ path: path.join(OUT, `${k}-${dev}.png`), fullPage: true });
        filas.push({ dev, k, n, seg: +seg.toFixed(1), ...m, prob });
      } catch (e) {
        filas.push({ dev, k, n, prob: [`no abrió: ${String(e.message).split("\n")[0]}`] });
      }
      pg.off("pageerror", onErr);
    }
    await ctx.close();
  }
  await b.close();
  const malas = filas.filter(f => f.prob.length);
  const md = [`# Revisión visual · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "", `Sitio: ${BASE}`, "",
    malas.length ? `**${malas.length} pantallas con algo que revisar** (de ${filas.length}).` : `**Todo bien:** ${filas.length} pantallas sin problemas.`, "",
    "| Pantalla | Equipo | Segundos | Problemas | Captura |", "|---|---|---|---|---|",
    ...filas.map(f => `| ${f.n} | ${f.dev} | ${f.seg ?? "—"} | ${f.prob.join("; ") || "—"} | [ver](${f.k}-${f.dev}.png) |`)].join("\n");
  fs.writeFileSync(path.join(OUT, "informe.md"), md + "\n");
  fs.writeFileSync(path.join(OUT, "informe.json"), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), filas }, null, 1));
  console.log(md);
})().catch(e => { console.error(e); process.exit(1); });
