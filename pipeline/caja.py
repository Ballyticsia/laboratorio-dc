"""Estadísticas completas de equipo de cada partido jugado (la "caja" del resumen de ESPN).

El marcador de ESPN solo trae remates, córners, faltas y posesión. El resumen de cada partido
trae además amarillas, rojas, fueras de juego, atajadas, pases, entradas, intercepciones,
centros, despejes y remates bloqueados. Se baja una vez por partido y queda guardado en
data/cache_espn/caja_<liga>.json; un partido terminado no cambia, así que no se vuelve a pedir.

ESPN no publica saques de banda ni saques de meta.
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor

import datos

DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache_espn")
URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event={id}"
MAX_NUEVOS = int(os.environ.get("CAJA_MAX", "400"))   # por corrida y por liga (los primeros días se completa de a poco)
CAMPOS = ("yellowCards", "redCards", "offsides", "saves", "totalPasses", "accuratePasses", "totalTackles", "effectiveTackles",
          "interceptions", "totalCrosses", "accurateCrosses", "totalLongBalls", "blockedShots", "totalClearance",
          "foulsCommitted", "wonCorners", "totalShots", "shotsOnTarget", "possessionPct")
_usados = 0


def _ruta(slug):
    return os.path.join(DIR, f"caja_{slug}.json")


def _num(v):
    try:
        return float(str(v).replace("%", ""))
    except (TypeError, ValueError):
        return None


def _bajar(eid):
    """{"h": {...}, "a": {...}} o {} si ESPN no tiene estadísticas de ese partido; None si falló la descarga."""
    try:
        j = datos._fetch(URL.format(id=eid))
    except Exception:   # noqa: BLE001
        return None
    out = {}
    comp = ((j.get("header") or {}).get("competitions") or [{}])[0]
    lado_de = {str((c.get("team") or {}).get("id")): ("h" if c.get("homeAway") == "home" else "a") for c in comp.get("competitors") or []}
    for t in (j.get("boxscore") or {}).get("teams") or []:
        lado = {"home": "h", "away": "a"}.get(t.get("homeAway")) or lado_de.get(str((t.get("team") or {}).get("id")))
        if not lado:
            continue
        st = {}
        for s in t.get("statistics") or []:
            k = s.get("name")
            if k in CAMPOS:
                v = _num(s.get("displayValue", s.get("value")))
                if v is not None:
                    st[k] = v
        if st:
            out[lado] = st
    return out if len(out) == 2 else {}


def cargar(slug, ids):
    """Devuelve {id: {"h": {...}, "a": {...}}} para los partidos pedidos; baja los que faltan."""
    global _usados
    try:
        with open(_ruta(slug), encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    faltan = [str(i) for i in ids if i and str(i) not in cache][:MAX_NUEVOS]
    if faltan:
        with ThreadPoolExecutor(max_workers=8) as ex:
            for eid, r in zip(faltan, ex.map(_bajar, faltan)):
                if r is not None:
                    cache[eid] = r
        _usados += len(faltan)
        os.makedirs(DIR, exist_ok=True)
        with open(_ruta(slug), "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        print(f"  caja: {len(faltan)} partidos nuevos ({sum(1 for e in faltan if cache.get(e))} con estadísticas)")
    return {str(i): cache[str(i)] for i in ids if cache.get(str(i))}


def mezclar(df, cajas):
    """Agrega a hstats/astats lo que traiga la caja (sin pisar lo que ya venía del marcador)."""
    if df.empty or not cajas:
        return df
    df = df.copy()
    for lado in ("h", "a"):
        col = lado + "stats"
        df[col] = [dict(cajas.get(str(i), {}).get(lado, {}), **(s if isinstance(s, dict) else {}))
                   for i, s in zip(df["id"], df[col] if col in df else [None] * len(df))]
    return df
