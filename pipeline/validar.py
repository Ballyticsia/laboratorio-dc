"""Revisa los datos generados antes de guardarlos y publicarlos. Si algo está mal, termina con error y el
sitio sigue mostrando la última versión buena (el robot no guarda ni publica)."""
import glob
import json
import math
import os
import re
import sys
from datetime import datetime

RAIZ = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(RAIZ, "site", "data")
errores = []


def err(msg):
    if len(errores) < 40:
        errores.append(msg)


def leer(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        err(f"{os.path.basename(path)}: JSON inválido ({e})")
        return None


def prob(x, donde):
    if x is None:
        return None
    if not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 or x > 1:
        err(f"{donde}: probabilidad fuera de rango ({x})")
        return None
    return x


def fecha(s, donde):
    try:
        datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        err(f"{donde}: fecha inválida ({s})")


def partido(p, donde):
    ps = [prob(p.get(k), f"{donde} {k}") for k in ("pH", "pD", "pA")]
    if None not in ps and abs(sum(ps) - 1) > 0.011:
        err(f"{donde}: 1X2 no suma 1 ({sum(ps):.3f})")
    for k in ("pO25", "pBTTS"):
        prob(p.get(k), f"{donde} {k}")
    for k in ("lh", "la"):
        v = p.get(k)
        if v is not None and (not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 or v > 8):
            err(f"{donde}: {k} raro ({v})")
    if p.get("top") is not None and not re.match(r"^\d{1,2}-\d{1,2}$", str(p["top"])):
        err(f"{donde}: marcador más probable inválido ({p['top']})")
    fecha(p.get("kickoff"), donde)


def main():
    ind = leer(os.path.join(DATA, "indice.json"))
    if not ind or not ind.get("ligas"):
        err("indice.json sin ligas")
        return
    for l in ind["ligas"]:
        L = leer(os.path.join(DATA, f"{l['id']}.json"))
        if L is None:
            continue
        ids = set()
        for p in L.get("partidos", []):
            d = f"{l['id']}/{p.get('id')}"
            if p.get("id") in ids:
                err(f"{d}: id repetido")
            ids.add(p.get("id"))
            partido(p, d)
            for g in p.get("goleadores", []) + p.get("tarjetas_jug", []):
                prob(g.get("p"), f"{d} jugador {g.get('jid')}")
        for t in L.get("tabla", []):
            if not isinstance(t.get("pts"), (int, float)):
                err(f"{l['id']}: tabla con puntos inválidos ({t.get('equipo')})")
    reg = leer(os.path.join(DATA, "registro.json"))
    if reg:
        ids = set()
        for f in reg.get("filas", []):
            if f.get("id") in ids:
                err(f"registro: id repetido {f.get('id')}")
            ids.add(f.get("id"))
            for k in ("fH", "fD", "fA", "fO25", "fBTTS"):
                prob(f.get(k), f"registro {f.get('id')} {k}")
    pk = os.path.join(DATA, "picks.json")
    if os.path.exists(pk):
        j = leer(pk) or {}
        malos = [k for k, v in (j.get("picks") or {}).items() if not (str(k).isdigit() and re.fullmatch(r"\d{1,2}-\d{1,2}", str(v)))]
        if malos:
            err(f"picks.json: {len(malos)} pronósticos con formato inválido")
    for extra in ("metodologia.json", "fotos.json", "arbitros.json"):
        p = os.path.join(DATA, extra)
        if os.path.exists(p):
            leer(p)
    comps = leer(os.path.join(RAIZ, "site", "assets", "competiciones.json")) or []
    slugs = [c.get("s") for c in comps]
    if len(slugs) != len(set(slugs)):
        err("competiciones.json: competiciones repetidas")
    huerfanos = [os.path.basename(x) for x in glob.glob(os.path.join(DATA, "*.json"))]
    if len(huerfanos) < len(ind["ligas"]):
        err("faltan archivos de ligas")


if __name__ == "__main__":
    main()
    if errores:
        print("Datos con problemas, no se publican:")
        for e in errores:
            print("  -", e)
        sys.exit(1)
    print("Datos revisados: todo en orden.")
