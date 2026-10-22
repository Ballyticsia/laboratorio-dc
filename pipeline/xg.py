"""Goles esperados (xG) por partido desde API-Football (estadísticas de cada partido).

- Understat no permite descargas automáticas (robots.txt), así que no se usa.
- Con la clave API_FOOTBALL_KEY, en cada corrida (como mucho cada MIN_HORAS horas) se piden los
  partidos de ayer y hoy (/fixtures?date=…) y, para los terminados de las ligas con xG, sus
  estadísticas (/fixtures/statistics), que incluyen "expected_goals". Se guardan en data/xg/partidos.json.
- El plan gratis solo deja consultar de ayer a mañana, así que la historia se arma día a día.
- Se cuida el límite diario: se deja una reserva para las bajas.
"""
import json
import os
import urllib.error
from datetime import datetime, timedelta, timezone

import lesiones

CARPETA = os.path.join(os.path.dirname(__file__), "..", "data", "xg")
ARCHIVO = os.path.join(CARPETA, "partidos.json")
MIN_HORAS = float(os.environ.get("XG_MIN_HORAS", "6"))
MAX_POR_CORRIDA = int(os.environ.get("XG_MAX_POR_CORRIDA", "15"))
RESERVA = int(os.environ.get("XG_RESERVA", "25"))   # consultas diarias que se dejan libres
# liga de ESPN -> id de liga en API-Football
LIGAS = {"eng.1": 39, "esp.1": 140, "ita.1": 135, "ger.1": 78, "fra.1": 61, "eng.2": 40, "uefa.champions": 2, "uefa.europa": 3}
ESTADO = {"errores": [], "nuevos": 0, "guardados": 0}
TERMINADO = {"FT", "AET", "PEN"}


def _leer():
    try:
        with open(ARCHIVO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"pedido": None, "partidos": []}


def recolectar():
    """Agrega el xG de los partidos terminados de ayer y hoy (si hay clave y consultas)."""
    if not os.environ.get("API_FOOTBALL_KEY", "").strip():
        return 0
    data = _leer()
    ahora = datetime.now(timezone.utc)
    if data.get("pedido") and (ahora - datetime.fromisoformat(data["pedido"])) < timedelta(hours=MIN_HORAS):
        ESTADO["guardados"] = len(data["partidos"])
        return 0
    hechos = {x["fid"] for x in data["partidos"] if x.get("fid")}
    ids = set(LIGAS.values())
    pend = []
    for dia in ((ahora - timedelta(days=1)).date().isoformat(), ahora.date().isoformat()):
        try:
            r = lesiones._get(f"/fixtures?date={dia}")
        except (urllib.error.URLError, OSError, ValueError) as e:
            ESTADO["errores"].append(f"fixtures {dia}: {e}")
            continue
        if r.get("errors"):
            ESTADO["errores"].append(f"fixtures {dia}: {r['errors']}")
            continue
        for it in r.get("response", []):
            fx, lg, tm = it.get("fixture") or {}, it.get("league") or {}, it.get("teams") or {}
            if lg.get("id") in ids and (fx.get("status") or {}).get("short") in TERMINADO and fx.get("id") not in hechos:
                hechos.add(fx["id"])
                pend.append(dict(fid=fx["id"], fecha=str(fx.get("date"))[:10], liga=lg["id"],
                                 home=(tm.get("home") or {}).get("name"), away=(tm.get("away") or {}).get("name")))
    for x in pend[:MAX_POR_CORRIDA]:
        if lesiones.ESTADO.get("restantes") is not None and lesiones.ESTADO["restantes"] <= RESERVA:
            break
        try:
            r = lesiones._get(f"/fixtures/statistics?fixture={x['fid']}")
        except (urllib.error.URLError, OSError, ValueError) as e:
            ESTADO["errores"].append(f"stats {x['fid']}: {e}")
            continue
        xg = []
        for t in r.get("response", []):
            v = next((s.get("value") for s in t.get("statistics") or [] if s.get("type") == "expected_goals"), None)
            try:
                xg.append(float(v))
            except (TypeError, ValueError):
                xg.append(None)
        if len(xg) == 2 and None not in xg:
            data["partidos"].append(dict(x, xgh=xg[0], xga=xg[1]))
            ESTADO["nuevos"] += 1
        else:
            data["partidos"].append(dict(x, xgh=None, xga=None))   # sin xG: no se vuelve a pedir
    if len(pend) <= MAX_POR_CORRIDA:
        data["pedido"] = ahora.isoformat(timespec="minutes")   # si quedaron pendientes, se sigue en la próxima corrida
    os.makedirs(CARPETA, exist_ok=True)
    with open(ARCHIVO, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    ESTADO["guardados"] = len(data["partidos"])
    print(f"  xG (API-Football): {ESTADO['nuevos']} partidos nuevos · {ESTADO['guardados']} guardados"
          + (f" · errores: {ESTADO['errores'][:3]}" if ESTADO["errores"] else ""))
    return ESTADO["nuevos"]


def temporada_de(d):
    """Understat nombra la temporada 2025-26 como 2025."""
    return d.year if d.month >= 7 else d.year - 1


def cargar(slug, desde, hasta):
    """Partidos guardados con xG de la liga entre dos fechas (o [] si no hay)."""
    lid = LIGAS.get(slug)
    if not lid:
        return []
    d0, d1 = str(desde)[:10], str(hasta)[:10]
    return [dict(fecha=x["fecha"], home=x["home"], away=x["away"], xgh=x["xgh"], xga=x["xga"]) for x in _leer()["partidos"]
            if x.get("liga") == lid and x.get("xgh") is not None and d0 <= x["fecha"] <= d1]


def unir(df, filas):
    """Agrega columnas xgh/xga a los partidos de ESPN (df) que encuentren su par en Understat."""
    df = df.copy()
    df["xgh"], df["xga"] = float("nan"), float("nan")
    if not filas or df.empty:
        return df, 0
    por_fecha = {}
    for i, x in enumerate(df.itertuples()):
        por_fecha.setdefault(str(x.date)[:10], []).append(i)
    xgh, xga, n = df["xgh"].values.copy(), df["xga"].values.copy(), 0
    homes, aways = df["home"].values, df["away"].values
    for u in filas:
        d0 = datetime.fromisoformat(u["fecha"])
        cands = [i for dd in (0, -1, 1) for i in por_fecha.get((d0 + timedelta(days=dd)).date().isoformat(), [])]
        sc = sorted(((lesiones.same_team(u["home"], homes[i]) + lesiones.same_team(u["away"], aways[i]), i) for i in cands), reverse=True)
        if not sc or sc[0][0] < 1.5 or (len(sc) > 1 and sc[0][0] - sc[1][0] < 0.15):
            continue
        i = sc[0][1]
        if xgh[i] != xgh[i]:
            xgh[i], xga[i], n = u["xgh"], u["xga"], n + 1
    df["xgh"], df["xga"] = xgh, xga
    return df, n


def con_xg(df, slugs, desde, hasta):
    """Une el xG de todas las ligas con datos de Understat que aparezcan en `slugs`."""
    filas = []
    for s in slugs:
        filas += cargar(s, desde, hasta)
    out, n = unir(df, filas)
    return out, n, len(filas)
