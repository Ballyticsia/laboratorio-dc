/* Revisión de salud del sitio publicado (workflow "Salud del sitio", cada 30 minutos).
   Escribe salud.txt con los problemas encontrados (vacío si todo está bien) y un resumen en GitHub. */
const crypto = require("crypto"), fs = require("fs");
const SITIO = "https://ballyticsia.github.io/laboratorio-dc/";
const problemas = [], notas = [];
const tiempo = (u, ms = 20000) => fetch(u, { signal: AbortSignal.timeout(ms), headers: { "cache-control": "no-cache" } });
(async () => {
  // 1. la página abre
  try { const r = await tiempo(SITIO + "?salud=" + Date.now()); const t = await r.text();
    if (!r.ok) problemas.push(`La página responde ${r.status}.`); else if (!/assets\/app\.js\?v=/.test(t)) problemas.push("La página abre pero no carga el programa (app.js)."); else notas.push("Página: abre bien."); }
  catch (e) { problemas.push("La página no responde: " + e.message); }
  // 2. los datos están al día (el robot corre cada 2 horas)
  let W = null;
  try { const i = await (await tiempo(SITIO + "data/indice.json?t=" + Date.now())).json(), h = (Date.now() - new Date(i.actualizado)) / 36e5;
    if (h > 6) problemas.push(`Los datos tienen ${h.toFixed(1)} horas: el robot de actualización no está publicando.`); else notas.push(`Datos: actualizados hace ${h.toFixed(1)} h.`); }
  catch (e) { problemas.push("No se pudo leer indice.json: " + e.message); }
  try { W = (await (await tiempo(SITIO + "avisos.json?t=" + Date.now())).json()).url; } catch (e) {}
  // 3. el servidor (avisos, IA, prode, En vivo) responde
  if (W) {
    try { const e = await (await tiempo(W + "/estado")).json(); if (!e.ok) problemas.push("El servidor responde con error en /estado."); else notas.push(`Servidor: responde (${e.partidos} partidos seguidos).`); }
    catch (e) { problemas.push("El servidor de Ballytics no responde: " + e.message); }
    try { const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, ""), d = await (await tiempo(W + "/dia?d=" + hoy, 30000)).json();
      if (!d.ok) problemas.push("La lista En vivo no carga (/dia)."); else notas.push(`En vivo: ${d.events.length} partidos hoy.`); }
    catch (e) { problemas.push("La lista En vivo no carga: " + e.message); }
    // 4. errores reales de la gente en las últimas horas
    if (process.env.GEMINI_API_KEY) {
      const tok = crypto.createHash("sha256").update("ballytics-ia-votos|" + process.env.GEMINI_API_KEY).digest("base64url").slice(0, 24);
      try { const r = await (await fetch(W + "/err/resumen?dias=1", { headers: { authorization: "Bearer " + tok }, signal: AbortSignal.timeout(20000) })).json();
        const hoy = Object.values(r.dias || {})[0] || {}, L = Object.values(hoy).sort((a, b) => b.n - a.n), tot = L.reduce((s, x) => s + x.n, 0);
        notas.push(`Errores de usuarios hoy: ${tot}.` + (L.length ? " Más común: " + L.slice(0, 3).map(x => `"${x.m.slice(0, 80)}" ×${x.n} (${Object.keys(x.rutas).join(", ")})`).join("; ") : ""));
        const grave = L.filter(x => x.n >= 25);
        if (grave.length) problemas.push("Errores que se repiten mucho hoy en la página: " + grave.map(x => `"${x.m.slice(0, 100)}" ×${x.n} en ${Object.keys(x.rutas).join(", ")} (versión ${x.v})`).join("; "));
      } catch (e) { notas.push("No se pudieron leer los errores: " + e.message); }
    }
  } else problemas.push("No se encontró la dirección del servidor (avisos.json).");
  fs.writeFileSync("salud.txt", problemas.join("\n"));
  const md = `## Salud del sitio\n${problemas.length ? problemas.map(p => "- ❌ " + p).join("\n") : "- ✅ Todo funciona"}\n\n${notas.map(n => "- " + n).join("\n")}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
})();
