"""Goles esperados (xG) por partido desde Understat, para las cinco grandes ligas.

- Una consulta por liga y temporada; las temporadas pasadas quedan guardadas para siempre
  en data/cache_xg y la actual se vuelve a pedir cada MIN_HORAS horas.
- Los nombres de Understat se cruzan con los de ESPN por fecha y parecido de nombres.
- Si Understat no responde, el modelo funciona igual que antes (goles y tiros al arco).
"""
import codecs
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

import lesiones

CARPETA = os.path.join(os.path.dirname(__file__), "..", "data", "cache_xg")
MIN_HORAS = float(os.environ.get("XG_MIN_HORAS", "12"))
LIGAS = {"eng.1": "EPL", "esp.1": "La_liga", "ger.1": "Bundesliga", "ita.1": "Serie_A", "fra.1": "Ligue_1"}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ESTADO = {"errores": [], "consultas": 0}

lesiones.ALIAS.update({"rasenballsport leipzig": "rb leipzig", "borussia m gladbach": "borussia monchengladbach",
                       "parma calcio 1913": "parma", "verona": "hellas verona", "paris saint germain": "paris saint germain",
                       "wolverhampton wanderers": "wolverhampton wanderers", "athletic club": "athletic bilbao"})


def _http(url, ajax=False):
    h = {"User-Agent": UA, "Accept": "application/json, text/html;q=0.9", "Referer": "https://understat.com/"}
    if ajax:
        h["X-Requested-With"] = "XMLHttpRequest"
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r:
        ESTADO["consultas"] += 1
        return r.read().decode("utf-8", "replace")


def _descargar(liga, temporada):
    # formato actual (datos por AJAX) y, si falla, el antiguo (JSON dentro de la página)
    try:
        d = json.loads(_http(f"https://understat.com/getLeagueData/{liga}/{temporada}", ajax=True))
        if isinstance(d, dict) and isinstance(d.get("dates"), list):
            return d["dates"]
    except (urllib.error.URLError, OSError, ValueError):
        pass
    html = _http(f"https://understat.com/league/{liga}/{temporada}")
    m = re.search(r"datesData\s*=\s*JSON\.parse\('(.*?)'\)", html)
    if not m:
        raise ValueError("no encontré datesData")
    return json.loads(codecs.decode(m.group(1), "unicode_escape"))


def _partidos(raw):
    out = []
    for x in raw:
        if not x.get("isResult"):
            continue
        try:
            out.append(dict(fecha=str(x["datetime"])[:10], home=x["h"]["title"], away=x["a"]["title"],
                            xgh=round(float(x["xG"]["h"]), 3), xga=round(float(x["xG"]["a"]), 3)))
        except (KeyError, TypeError, ValueError):
            continue
    return out


def temporada_de(d):
    """Understat nombra la temporada 2025-26 como 2025."""
    return d.year if d.month >= 7 else d.year - 1


def cargar(slug, desde, hasta):
    """Lista de partidos con xG de la liga entre dos fechas (o [] si no hay)."""
    liga = LIGAS.get(slug)
    if not liga:
        return []
    os.makedirs(CARPETA, exist_ok=True)
    actual = temporada_de(datetime.now(timezone.utc).date())
    filas = []
    for t in range(temporada_de(desde), temporada_de(hasta) + 1):
        path = os.path.join(CARPETA, f"{liga}_{t}.json")
        viejo = None
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    viejo = json.load(f)
            except (OSError, ValueError):
                viejo = None
        fresco = viejo and (t < actual or (datetime.now(timezone.utc) - datetime.fromisoformat(viejo["pedido"])) < timedelta(hours=MIN_HORAS))
        if fresco:
            filas += viejo["partidos"]
            continue
        try:
            ps = _partidos(_descargar(liga, t))
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"pedido": datetime.now(timezone.utc).isoformat(timespec="minutes"), "partidos": ps}, f, ensure_ascii=False, separators=(",", ":"))
            filas += ps
        except (urllib.error.URLError, OSError, ValueError) as e:
            ESTADO["errores"].append(f"{liga} {t}: {e}")
            filas += (viejo or {}).get("partidos", [])
    return filas


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
