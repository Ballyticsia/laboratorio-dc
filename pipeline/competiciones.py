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
import urllib.request
from datetime import date, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCH = os.path.join(RAIZ, "site", "assets", "competiciones.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"


def pedir(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Ballytics"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:   # noqa: BLE001
            if i == 2:
                print("  falló", url, e)
            time.sleep(2 * (i + 1))
    return None


def rango(a, b):
    return f"{a:%Y%m%d}-{b:%Y%m%d}"


def revisar(c, hoy):
    j = pedir(f"{ESPN}/{c['s']}/scoreboard?dates={rango(hoy - timedelta(days=60), hoy + timedelta(days=60))}&limit=1000")
    if j is None:
        return None
    evs = j.get("events") or []
    lg = (j.get("leagues") or [{}])[0]
    logos = lg.get("logos") or []
    le = next((x.get("href") for x in logos if "dark" not in (x.get("rel") or [])), None) or (logos[0].get("href") if logos else None)
    ahora = hoy.isoformat()
    fut = sorted(e.get("date", "")[:10] for e in evs if e.get("date", "")[:10] >= ahora)
    pas = [e for e in evs if e.get("date", "")[:10] < ahora]
    out = {"pas": len(pas), "fut": len(fut)}
    if fut:
        out["prox"] = fut[0]
    if evs:
        estado = "activa"
    else:
        j2 = pedir(f"{ESPN}/{c['s']}/scoreboard?dates={rango(hoy - timedelta(days=400), hoy - timedelta(days=61))}&limit=1000")
        n = len((j2 or {}).get("events") or [])
        if j2 is None:
            return None
        estado = "pausa" if n else "inactiva"
        if n:
            out["ultimo"] = max(e.get("date", "")[:10] for e in j2["events"])
    j3 = None
    if not fut and estado != "inactiva":   # próxima fecha aunque sea lejana (receso largo)
        j3 = pedir(f"{ESPN}/{c['s']}/scoreboard?dates={rango(hoy + timedelta(days=61), hoy + timedelta(days=240))}&limit=1000")
        f2 = sorted(e.get("date", "")[:10] for e in (j3 or {}).get("events") or [])
        if f2:
            out["prox"] = f2[0]
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


def main():
    hoy = date.today()
    comps = json.load(open(ARCH, encoding="utf-8"))
    cambios = 0
    for c in comps:
        r = revisar(c, hoy)
        time.sleep(0.25)
        if r is None:
            print("sin respuesta:", c["s"])
            continue
        estado, act, le = r
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
    if "--grilla" in sys.argv:
        grilla(comps)


if __name__ == "__main__":
    main()
