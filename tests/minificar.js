/* Achica app.js y app.css justo antes de publicar (solo en el robot; en el repositorio quedan legibles).
   Corre antes de la prueba de humo, así la prueba revisa exactamente lo que se publica. */
const fs = require("fs"), path = require("path");
const { minify } = require("terser");
const { transform } = require("lightningcss");
const A = path.join(__dirname, "..", "site", "assets");
(async () => {
  const js = path.join(A, "app.js"), css = path.join(A, "app.css");
  const src = fs.readFileSync(js, "utf8");
  const r = await minify(src, { ecma: 2020, compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (!r.code || r.code.length < src.length * 0.3) throw new Error("terser devolvió algo raro");
  fs.writeFileSync(js, r.code);
  const c = fs.readFileSync(css);
  const o = transform({ filename: "app.css", code: c, minify: true });
  fs.writeFileSync(css, o.code);
  const kb = n => (n / 1024).toFixed(0) + " KB";
  console.log(`app.js ${kb(src.length)} → ${kb(r.code.length)} · app.css ${kb(c.length)} → ${kb(o.code.length)}`);
})().catch(e => { console.error(e); process.exit(1); });
