import json, re, glob, asyncio, os, concurrent.futures as cf, urllib.request
from playwright.async_api import async_playwright
BASE = "https://ballyticsia.github.io/laboratorio-dc/"
OUT = "diag/out"; os.makedirs(OUT, exist_ok=True)
rep = {"urls": {}, "pages": {}}
urls = set()
for f in glob.glob("site/data/*.json") + glob.glob("site/assets/*.json"):
    urls |= set(re.findall(r'https?://[^"\\ ]+\.(?:png|svg|jpg|jpeg|webp)', open(f).read()))
def chk(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=20)
        b = r.read(); return u, r.status, len(b)
    except Exception as e: return u, getattr(e, "code", str(e)[:60]), 0
with cf.ThreadPoolExecutor(24) as ex:
    for u, s, n in ex.map(chk, sorted(urls)):
        if s != 200 or n < 300: rep["urls"][u] = [s, n]
rep["urls_total"] = len(urls)
import urllib.request as U
try: rep["picks"] = len(json.loads(U.urlopen(BASE + "data/picks.json?x=1", timeout=20).read())["picks"])
except Exception as e: rep["picks"] = str(e)[:80]
RUTAS = {
  "selecciones": "#/selecciones", "competiciones": "#/competiciones", "liga_chile": "#/liga/chile",
  "comp_chile": "#/comp/chi.1/tabla", "jugador_mls": "#/jugador/mls/45843", "prode": "#/prode",
  "invalida": "#/xyz123", "partido_viejo": "#/partido/premier/1", "inicio": "#/", "vivo": "#/vivo", "partido": "#/liga/premier/partidos",
}
async def page_run(name, dev, hashr, ctx):
    pg = await ctx.new_page(); bad = []; errs = []
    pg.on("response", lambda r: bad.append([r.status, r.url]) if r.request.resource_type == "image" and r.status >= 400 else None)
    pg.on("requestfailed", lambda r: bad.append(["fail", r.url]) if r.resource_type == "image" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    await pg.goto(BASE + hashr, wait_until="networkidle", timeout=60000)
    await pg.wait_for_timeout(5000)
    info = await pg.evaluate("""() => ({hash: location.hash, h1: (document.querySelector('h1')||{}).textContent||'',
      broken: [...document.images].filter(i=>i.complete && i.naturalWidth===0).map(i=>i.src).slice(0,40),
      emptyLogos: document.querySelectorAll('.vlogo:empty').length, tfb: document.querySelectorAll('.tfb').length,
      ver: [...document.scripts].map(x=>x.src).filter(x=>x.includes('app.js'))[0]||'',
      natNames: [...document.querySelectorAll('#vs-next .vtn')].slice(0,6).map(x=>x.textContent),
      tag: (document.querySelector('.tagm')||{}).textContent||''})""")
    if name == "prode":
        await pg.click("#pr-new button"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=f"{OUT}/{dev}_prode_vacio.png")
        await pg.fill("#pr-new input[name=nombre]", "Prueba diagnostico"); await pg.fill("#pr-new input[name=alias]", "diag")
        await pg.click("#pr-new button"); await pg.wait_for_timeout(6000)
        info["after_create_hash"] = await pg.evaluate("location.hash")
    if name == "inicio":
        try:
            await pg.fill("#q", "colo"); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f"{OUT}/{dev}_busqueda.png")
        except Exception as e: info["search_err"] = str(e)[:100]
    await pg.screenshot(path=f"{OUT}/{dev}_{name}.png", full_page=(dev == "desk"))
    info["bad"] = bad[:40]; info["errs"] = errs
    rep["pages"][f"{dev}_{name}"] = info; await pg.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        desk = await b.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        wk = await p.webkit.launch()
        mob = await wk.new_context(**p.devices["iPhone 13"], service_workers="block")
        for n, h in RUTAS.items():
            for dev, ctx in (("desk", desk), ("mob", mob)):
                try: await asyncio.wait_for(page_run(n, dev, h, ctx), 120)
                except Exception as e: rep["pages"][f"{dev}_{n}"] = {"error": str(e)[:300]}
asyncio.run(main())
json.dump(rep, open(f"{OUT}/report.json", "w"), ensure_ascii=False, indent=1)
