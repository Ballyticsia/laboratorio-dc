const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  const sitios = [["ballytics", "https://ballyticsia.github.io/laboratorio-dc/"], ["ballytics_partido", "https://ballyticsia.github.io/laboratorio-dc/liga/premier/"], ["ballytics_vivo", "https://ballyticsia.github.io/laboratorio-dc/#/vivo"], ["sofascore", "https://www.sofascore.com/"], ["fotmob", "https://www.fotmob.com/"], ["365scores", "https://www.365scores.com/es"], ["onefootball", "https://onefootball.com/es/inicio"]];
  for (const [n, u] of sitios) for (const [d, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1440, height: 900 }]]) {
    try { const c = await b.newContext({ viewport: vp, locale: "es-CL", timezoneId: "America/Santiago", userAgent: d === "m" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" : undefined });
      const p = await c.newPage(); const t0 = Date.now(); await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForTimeout(1500); await p.screenshot({ path: `diag/out/cap/${n}_${d}_1500ms.png` });
      await p.waitForTimeout(5000); await p.screenshot({ path: `diag/out/cap/${n}_${d}.png` });
      if (n.startsWith("ballytics") && d === "m") {   // cuánto tardan en verse los escudos
        const imgs = await p.evaluate(() => [...document.images].map(i => ({ s: i.currentSrc.slice(0, 90), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, dw: i.clientWidth })));
        require("fs").writeFileSync(`diag/out/cap/${n}_imgs.json`, JSON.stringify(imgs, null, 1));
      }
      await c.close(); } catch (e) { console.log(n, d, e.message.split("\n")[0]); } }
  await b.close(); })();
