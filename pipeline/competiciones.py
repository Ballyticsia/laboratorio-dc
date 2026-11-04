"""Revisión semanal del catálogo de competiciones (site/assets/competiciones.json).

Para cada competición se pregunta a ESPN cuántos partidos hubo y habrá cerca de hoy:
- "activa": tiene partidos entre 60 días atrás y 60 días adelante
- "pausa": no tiene ahora, pero sí en el último año (fin de temporada, receso)
- "inactiva": nada en más de un año (torneos que ya no existen o que ESPN dejó de cubrir)

El sitio usa ese estado para ordenar la lista (las inactivas no se muestran) y para explicar bien
una competición sin partidos en vez de mostrar una página vacía. También guarda el logo que usa
ESPN ("le") para poder compararlo con el actual; con --grilla arma una imagen con ambos logos de
cada competición para revisarlos a ojo (data/logos_revision.png, no se publica).
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCH = os.path.join(RAIZ, "site", "assets", "competiciones.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"


LOG = []


def pedir(url):
    """Igual que pipeline/datos.py (que funciona desde GitHub): sin cabeceras extra; si ESPN rechaza limit, sin él."""
    for i in range(2):
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 400 and "&limit=" in url:
                url = url.split("&limit=")[0]
                continue
            LOG.append(f"{url.split('soccer/')[-1]}: HTTP {e.code}")
            return None
        except Exception as e:   # noqa: BLE001
            if i == 1:
                LOG.append(f"{url.split('soccer/')[-1]}: {e}")
            time.sleep(2)
    return None


def fechas_calendario(lg):
    """Días con partidos de la temporada según el calendario que ESPN entrega con la liga."""
    out = []
    for x in lg.get("calendar") or []:
        if isinstance(x, str):
            out.append(x[:10])
        elif isinstance(x, dict):
            for k in ("startDate", "endDate"):
                if x.get(k):
                    out.append(x[k][:10])
            for e in x.get("entries") or []:
                if isinstance(e, dict) and e.get("startDate"):
                    out.append(e["startDate"][:10])
    return sorted(set(out))


def revisar(c, hoy):
    j = pedir(f"{ESPN}/{c['s']}/scoreboard?limit=200")
    if j is None:
        return None
    evs = j.get("events") or []
    lg = (j.get("leagues") or [{}])[0]
    logos = lg.get("logos") or []
    le = next((x.get("href") for x in logos if "dark" not in (x.get("rel") or [])), None) or (logos[0].get("href") if logos else None)
    ahora, cerca_a, cerca_d, lejos = hoy.isoformat(), (hoy - timedelta(days=60)).isoformat(), (hoy + timedelta(days=60)).isoformat(), (hoy - timedelta(days=400)).isoformat()
    dias = fechas_calendario(lg) + [e.get("date", "")[:10] for e in evs if e.get("date")]
    temp = lg.get("season") or {}
    fin_temp = (temp.get("endDate") or "")[:10]
    fut = sorted(d for d in dias if d >= ahora)
    pas = sorted(d for d in dias if d < ahora)
    out = {"pas": sum(1 for d in pas if d >= cerca_a), "fut": sum(1 for d in fut if d <= cerca_d)}
    if fut:
        out["prox"] = fut[0]
    if pas:
        out["ultimo"] = pas[-1]
    if out["pas"] or out["fut"] or any(e.get("status", {}).get("type", {}).get("state") == "in" for e in evs):
        estado = "activa"
    elif fut or (pas and pas[-1] >= lejos) or (fin_temp and fin_temp >= lejos):
        estado = "pausa"
    elif pas or fin_temp:   # solo con prueba de que lo último fue hace más de un año
        estado = "inactiva"
    else:                   # ESPN no entrega calendario: no se esconde, se muestra como en pausa
        estado = "pausa"
    return estado, out, le


def grilla(comps):
    """Imagen con el logo actual y el de ESPN de cada competición, para revisar a ojo."""
    from PIL import Image, ImageDraw
    W, H, cols = 300, 120, 6
    filas = (len(comps) + cols - 1) // cols
    img = Image.new("RGB", (W * cols, H * filas), (245, 246, 250))
    d = ImageDraw.Draw(img)
    def bajar(u):
        if not u:
            return None
        try:
            req = urllib.request.Request(u if u.startswith("http") else "https://ballyticsia.github.io/laboratorio-dc/" + u, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA")
        except Exception:   # noqa: BLE001
            return None
    for i, c in enumerate(comps):
        x, y = (i % cols) * W, (i // cols) * H
        d.rectangle([x, y, x + W - 1, y + H - 1], outline=(200, 200, 210))
        for k, u in enumerate([c.get("l"), c.get("le")]):
            im = bajar(u)
            if im:
                im.thumbnail((64, 64))
                img.paste(im, (x + 8 + k * 76, y + 8), im)
            else:
                d.text((x + 20 + k * 76, y + 30), "—", fill=(150, 0, 0))
        d.text((x + 8, y + 80), f"{c['s']} · {c.get('estado', '?')}", fill=(20, 20, 30))
        d.text((x + 8, y + 96), c["n"][:40], fill=(60, 60, 80))
    out = os.path.join(RAIZ, "data", "logos_revision.png")
    img.save(out)
    print("grilla:", out)


AF_SLUGS = {"chi.2"}   # igual que datos_af.FUENTE: ligas con datos de API-Football


def main():
    hoy = date.today()
    comps = json.load(open(ARCH, encoding="utf-8"))
    cambios, t0 = 0, time.time()
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=6) as ex:   # varias a la vez: con una por una no alcanzaba la media hora
        res = list(ex.map(lambda c: revisar(c, hoy), comps))
    print(f"revisadas en {time.time() - t0:.0f} s", flush=True)
    for c, r in zip(comps, res):
        if r is None:
            print("sin respuesta:", c["s"])
            continue
        estado, act, le = r
        if c["s"] in AF_SLUGS:   # ESPN no la cubre: los datos vienen de API-Football (página de liga con modelo)
            estado, act, le = "activa", {"af": True}, None
        if c.get("estado") != estado or c.get("act") != act or (le and c.get("le") != le):
            cambios += 1
        c["estado"], c["act"] = estado, act
        if le:
            c["le"] = le
    with open(ARCH, "w", encoding="utf-8") as f:
        json.dump(comps, f, ensure_ascii=False, separators=(",", ":"))
    cuenta = {e: sum(1 for c in comps if c.get("estado") == e) for e in ("activa", "pausa", "inactiva")}
    print(f"{len(comps)} competiciones, {cambios} con cambios: {cuenta}")
    print("inactivas:", ", ".join(f"{c['s']} ({c['n']})" for c in comps if c.get("estado") == "inactiva"))
    print("\n".join(LOG[:60]))
    if "--grilla" in sys.argv:
        with open(os.path.join(RAIZ, "data", "competiciones_log.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(LOG) + "\n\n" + "\n".join(f"{c['s']}\t{c.get('estado')}\t{json.dumps(c.get('act'))}" for c in comps))
        grilla(comps)


if __name__ == "__main__":
    main()
