const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  const sitios = [["inicio", "https://ballyticsia.github.io/laboratorio-dc/"], ["vivo", "https://ballyticsia.github.io/laboratorio-dc/#/vivo"], ["liga", "https://ballyticsia.github.io/laboratorio-dc/liga/premier/"]];
  for (const [n, u] of sitios) for (const [d, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1440, height: 900 }]]) {
    try { const c = await b.newContext({ viewport: vp, locale: "es-CL", timezoneId: "America/Santiago", deviceScaleFactor: d === "m" ? 2 : 1 });
      const p = await c.newPage(); await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(1500); await p.screenshot({ path: `diag/out/cap2/${n}_${d}_1500ms.png` });
      await p.waitForTimeout(4000); await p.screenshot({ path: `diag/out/cap2/${n}_${d}.png` });
      if (d === "m") { const imgs = await p.evaluate(() => [...document.images].map(i => ({ s: i.currentSrc.slice(0, 100), ok: i.complete && i.naturalWidth > 0, op: getComputedStyle(i).opacity, w: i.naturalWidth })));
        require("fs").writeFileSync(`diag/out/cap2/${n}_imgs.json`, JSON.stringify(imgs, null, 1)); }
      await c.close(); } catch (e) { console.log(n, d, e.message.split("\n")[0]); } }
  await b.close(); })();
