"""Partidos desde API-Football para las ligas que ESPN no cubre (por ejemplo, la Primera B de Chile:
ESPN dejó de publicarla en 2010).

Entrega lo mismo que datos.load (una fila por partido, con las mismas columnas), así el modelo, la
tabla, las estadísticas, las rachas y los goleadores funcionan igual que con ESPN.

- /fixtures?league&season: una consulta trae la temporada completa (calendario y resultados).
  La temporada actual se pide de nuevo cada AF_PARTIDOS_HORAS; las pasadas, una vez (y otra al
  terminar, por si quedaban partidos).
- /fixtures?ids=a-b-c (hasta 20 por consulta): goles y tarjetas con jugador y minuto, y las
  estadísticas (tiros, córners, faltas, posesión) de cada partido terminado. Se piden una sola vez.
- Todo se guarda en data/api_football/partidos/ (el robot lo sube al repositorio): sin clave, o si
  la API falla, se usa la última copia.
- Los ids de partidos y jugadores llevan el prefijo "af" para que nunca se confundan con los de ESPN
  (el sitio pide a ESPN alineaciones y fotos con esos números).
"""
import json
import os
import re
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone

import pandas as pd

import fotos
import lesiones

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "data", "api_football", "partidos")
HORAS = float(os.environ.get("AF_PARTIDOS_HORAS", "1.5"))
MAX_DETALLE = int(os.environ.get("AF_DETALLE_MAX", "40"))      # consultas de detalle por corrida (20 partidos cada una)
RESERVA = int(os.environ.get("AF_PARTIDOS_RESERVA", "1500"))   # consultas que siempre quedan libres en el día
ESPERA = float(os.environ.get("AF_ESPERA", "0.3"))

JUGADO = {"FT", "AET", "PEN"}
PENDIENTE = {"NS", "TBD"}
EN_VIVO = {"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"}

# estadística de API-Football → nombre que usa ESPN (y el resto del robot)
STATS = {"Total Shots": "totalShots", "Shots on Goal": "shotsOnTarget", "Corner Kicks": "wonCorners",
         "Ball Possession": "possessionPct", "Fouls": "foulsCommitted", "Offsides": "offsides",
         "Yellow Cards": "yellowCards", "Red Cards": "redCards", "Goalkeeper Saves": "saves"}

# palabras que no sirven para la abreviatura ni el nombre corto ("Deportes Copiapó" → COP, "Copiapó")
CLUB = {"club", "deportes", "deportivo", "cd", "csd", "cf", "fc", "sc", "ac", "ca", "cs", "sa", "sadp"}   # se quitan del nombre corto
RELLENO = CLUB | {"de", "del", "la", "el", "los", "las"}   # además no cuentan para la abreviatura

# primeras palabras que se repiten en muchos nombres: la abreviatura usa además la siguiente
PREFIJOS = {"SAN", "SANTA", "SANTO", "SANTIAGO", "UNION", "UNIVERSIDAD", "REAL", "ATLETICO", "SPORTING", "DEPORTIVO", "CLUB", "INDEPENDIENTE", "NUEVA", "NUEVO"}

USADAS = 0


def _puedo():
    r = lesiones.ESTADO.get("restantes")
    return bool(os.environ.get("API_FOOTBALL_KEY", "").strip()) and (r is None or r > RESERVA)


def _af(path):
    global USADAS
    USADAS += 1
    j = lesiones._get(path)
    if ESPERA:
        time.sleep(ESPERA)
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"])[:160])
    return j.get("response") or []


def _leer(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _guardar(path, d):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def _sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def corto(nombre):
    """Sin "Deportes", "Club", "CD"… al comienzo ni "FC", "SADP"… al final; lo del medio se deja ("San Marcos de Arica")."""
    w = [x for x in re.split(r"\s+", str(nombre or "").strip()) if x]
    relleno = lambda x: _sin_tildes(x).lower().strip(".") in CLUB
    while len(w) > 1 and relleno(w[0]):
        w = w[1:]
    while len(w) > 1 and relleno(w[-1]):
        w = w[:-1]
    return " ".join(w) if w else str(nombre or "")


def abreviatura(nombre):
    util = [_sin_tildes(x).upper() for x in re.split(r"[\s.\-]+", corto(nombre)) if x and _sin_tildes(x).lower() not in RELLENO]
    util = [re.sub(r"[^A-Z0-9]", "", x) for x in util]
    util = [x for x in util if x]
    if not util:
        return "?"
    if len(util) >= 3:                                  # "Unión San Felipe" → USF
        return "".join(x[0] for x in util[:3])
    if len(util) == 2 and (len(util[0]) <= 3 or util[0] in PREFIJOS):   # "Santa Cruz" → SCR, "Universidad de Concepción" → UCO
        return (util[0][0] + util[1][:2])[:3]
    return util[0][:3]                                  # "Curicó Unido" → CUR


def _unicas(rows):
    """Dos equipos de la misma liga nunca comparten abreviatura (se usa la inicial y las dos primeras del último nombre)."""
    abr = {}
    for x in rows:
        for lado in ("home", "away"):
            abr[x[lado]] = x[lado + "_abr"]
    usadas = {}
    for n in sorted(abr):
        a = abr[n]
        if a in usadas:
            w = [re.sub(r"[^A-Z0-9]", "", _sin_tildes(x).upper()) for x in corto(n).split()]
            w = [x for x in w if x]
            alt = [(w[0][0] + w[-1][:2]) if len(w) > 1 else "", (w[0][:2] + w[-1][-1]) if w else ""] + [a[:2] + c for c in "23456789"]
            a = next((c for c in alt if len(c) == 3 and c not in usadas), a)
        usadas[a] = n
        abr[n] = a
    for x in rows:
        for lado in ("home", "away"):
            x[lado + "_abr"] = abr[x[lado]]


def _kickoff(iso):
    """'2026-11-03T20:00:00+00:00' → '2026-11-03T20:00Z' (el formato de ESPN)."""
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%MZ")


def _compacto(f):
    """Lo que se guarda de cada partido de la lista de la temporada."""
    fx, t, g, sc = f["fixture"], f["teams"], f.get("goals") or {}, f.get("score") or {}
    pen = sc.get("penalty") or {}
    return {"id": fx["id"], "date": fx["date"], "st": (fx.get("status") or {}).get("short"),
            "h": [t["home"]["id"], t["home"]["name"], t["home"].get("logo")], "a": [t["away"]["id"], t["away"]["name"], t["away"].get("logo")],
            "g": [g.get("home"), g.get("away")], "pen": [pen.get("home"), pen.get("away")], "ronda": (f.get("league") or {}).get("round")}


def _num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace("%", "").strip())
    except ValueError:
        return None


def detalle(f, hid, aid, hg, ag):
    """Eventos (goles y tarjetas) y estadísticas de un partido terminado, con los nombres de ESPN."""
    lado_de = {hid: "h", aid: "a"}
    ev = []
    for e in f.get("events") or []:
        lado = lado_de.get((e.get("team") or {}).get("id"))
        tipo, det, com = e.get("type"), str(e.get("detail") or ""), str(e.get("comments") or "")
        if not lado or "shootout" in com.lower():
            continue
        if tipo == "Goal" and "Missed" not in det:
            t = "G"
        elif tipo == "Card" and "Red" in det:
            t = "R"
        elif tipo == "Card" and "Yellow" in det:
            t = "Y"
        else:
            continue
        tm, pl = e.get("time") or {}, e.get("player") or {}
        mi = (tm.get("elapsed") or 0) + (tm.get("extra") or 0)
        ev.append({"t": t, "lado": lado, "min": int(mi) if mi else None, "jug": pl.get("name"),
                   "jid": f"af{pl['id']}" if pl.get("id") else "", "pen": det == "Penalty", "og": det == "Own Goal"})
    # autogoles: API-Football no siempre pone el mismo equipo; se elige el lado que cuadra con el marcador
    og = [v for v in ev if v["t"] == "G" and v["og"]]
    if og and hg is not None and ag is not None:
        def cuenta(invertir):
            c = {"h": 0, "a": 0}
            for v in ev:
                if v["t"] == "G":
                    lado = v["lado"]
                    if v["og"] and invertir:
                        lado = "a" if lado == "h" else "h"
                    c[lado] += 1
            return c["h"] == hg and c["a"] == ag
        if not cuenta(False) and cuenta(True):
            for v in og:
                v["lado"] = "a" if v["lado"] == "h" else "h"
    st = {"h": {}, "a": {}}
    for bloque in f.get("statistics") or []:
        lado = lado_de.get((bloque.get("team") or {}).get("id"))
        if not lado:
            continue
        for s in bloque.get("statistics") or []:
            k, v = STATS.get(s.get("type")), _num(s.get("value"))
            if k and v is not None:
                st[lado][k] = v
    return {"ev": ev, "hs": st["h"], "as": st["a"]}


def fila(c, det):
    """Partido compacto (+ detalle si lo hay) → fila con las columnas de datos.parse_events."""
    st = c.get("st")
    estado = "jugado" if st in JUGADO else "pendiente" if st in PENDIENTE else "en_vivo" if st in EN_VIVO else "otro"
    k = _kickoff(c["date"])
    row = {"id": f"af{c['id']}", "date": k[:10], "kickoff": k, "estado": estado, "ronda": c.get("ronda")}
    for lado, (tid, nombre, logo) in (("home", c["h"]), ("away", c["a"])):
        row[lado] = nombre
        row[lado + "_corto"] = corto(nombre)
        row[lado + "_abr"] = abreviatura(nombre)
        row[lado + "_color"] = None
        row[lado + "_logo"] = logo
    done = estado == "jugado" and c["g"][0] is not None and c["g"][1] is not None
    row["hg"] = float(c["g"][0]) if done else None
    row["ag"] = float(c["g"][1]) if done else None
    hs, as_ = (det or {}).get("hs") or {}, (det or {}).get("as") or {}
    row["hst"] = hs.get("shotsOnTarget") if done else None
    row["ast"] = as_.get("shotsOnTarget") if done else None
    if done:
        p = c.get("pen") or [None, None]
        if p[0] is not None and p[1] is not None and p[0] != p[1]:
            row["pen"] = "h" if p[0] > p[1] else "a"
        if det:
            row["hstats"], row["astats"], row["eventos"] = hs, as_, det.get("ev") or []
    return row


def _temporada(L, season, hoy, actual):
    path = os.path.join(CARPETA, L["id"], f"{season}.json")
    d = _leer(path)
    if d and d.get("t"):
        edad = datetime.now(timezone.utc) - datetime.fromisoformat(d["t"])
        fin = date(season, 12, 31) if L.get("inicio", 1) == 1 else date(season + 1, 6, 30)
        # la actual cada pocas horas; una pasada solo si se pidió antes de que terminara
        fresca = edad < timedelta(hours=HORAS) if season == actual else datetime.fromisoformat(d["t"]).date() > fin + timedelta(days=7)
        if fresca:
            return d
    if not _puedo():
        return d
    try:
        r = _af(f"/fixtures?league={fotos.AF_LIGA[L['id']]}&season={season}")
    except Exception as e:   # sin datos nuevos se usa la copia anterior
        print(f"  ✗ API-Football {L['id']} {season}: {e}")
        return d
    if not r and d:
        return d
    d = {"t": datetime.now(timezone.utc).isoformat(timespec="minutes"), "season": season, "fx": [_compacto(f) for f in r]}
    _guardar(path, d)
    return d


def _detalles(L, partidos):
    """Pide el detalle de los partidos terminados que aún no lo tienen (hasta MAX_DETALLE consultas)."""
    path = os.path.join(CARPETA, L["id"], "detalle.json")
    det = _leer(path) or {}
    falta = [c for c in partidos if c.get("st") in JUGADO and str(c["id"]) not in det]
    falta.sort(key=lambda c: c["date"], reverse=True)   # primero los más recientes
    pedidas, nuevos = 0, 0
    for i in range(0, len(falta), 20):
        if pedidas >= MAX_DETALLE or not _puedo():
            break
        lote = falta[i:i + 20]
        try:
            r = _af("/fixtures?ids=" + "-".join(str(c["id"]) for c in lote))
        except Exception as e:
            print(f"  ✗ API-Football detalle {L['id']}: {e}")
            break
        pedidas += 1
        por_id = {str(f["fixture"]["id"]): f for f in r}
        for c in lote:
            f = por_id.get(str(c["id"]))
            if not f:
                continue
            g = f.get("goals") or {}
            det[str(c["id"])] = detalle(f, c["h"][0], c["a"][0], g.get("home"), g.get("away"))
            nuevos += 1
    if nuevos:
        _guardar(path, det)
    if falta:
        print(f"  API-Football: detalle de {nuevos} partidos nuevos ({len(falta) - nuevos} quedan para la próxima)")
    return det


def load(L, start, end, today):
    """Igual que datos.load, pero desde API-Football. L necesita su id en fotos.AF_LIGA."""
    if L["id"] not in fotos.AF_LIGA:
        return pd.DataFrame()
    actual = fotos.temporada(L, today)
    # API-Football nombra la temporada por el año en que empieza (2025 = 2025-26 en Europa)
    ultima = end.year if L.get("inicio", 1) == 1 else end.year - 1
    temporadas = [s for s in range(start.year, ultima + 1) if s <= actual]
    partidos = []
    for s in temporadas:
        d = _temporada(L, s, today, actual)
        partidos += (d or {}).get("fx") or []
    if not partidos:
        return pd.DataFrame()
    det = _detalles(L, partidos)
    rows = [fila(c, det.get(str(c["id"]))) for c in partidos]
    rows = [x for x in rows if start.isoformat() <= x["date"] <= end.isoformat()]
    _unicas(rows)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for c in ("hg", "ag", "hst", "ast"):
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    df["date"] = pd.to_datetime(df["date"])
    print(f"  API-Football: {len(df)} partidos de {len(temporadas)} temporadas ({USADAS} consultas en esta corrida)")
    return df.drop_duplicates(["date", "home", "away"]).sort_values("kickoff").reset_index(drop=True)
