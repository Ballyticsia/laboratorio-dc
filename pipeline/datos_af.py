"""Partidos de las ligas que ESPN no cubre (o dejó de cubrir), desde API-Football.

Entrega lo mismo que datos.load (una fila por partido, con goles, tarjetas y estadísticas), así el resto
del robot (modelo, tabla, estadísticas de equipo, mercados) funciona igual que con ESPN.

Consultas por corrida: 1 por liga (calendario de la temporada actual) + 1 cada 20 partidos terminados que
todavía no tengan detalle (goles, tarjetas y estadísticas; queda guardado y no se vuelve a pedir).
Las temporadas pasadas se bajan una sola vez.
"""
import json
import os
import time
from datetime import datetime, timezone

import pandas as pd

import lesiones

RAIZ = os.path.join(os.path.dirname(__file__), "..")
DIR = os.path.join(RAIZ, "data", "api_football", "ligas")
# liga de ESPN (slug que usa el sitio) -> id de liga en API-Football
FUENTE = {"chi.2": 266}
NOMBRE = {"chi.2": "Liga de Ascenso"}
# API-Football escribe sin tildes o abreviado: nombres como los usa el campeonato chileno
EQUIPO = {"Antofagasta": "Deportes Antofagasta", "Curico Unido": "Curicó Unido", "D. Puerto Montt": "Deportes Puerto Montt",
          "Deportes Copiapo": "Deportes Copiapó", "Recoleta": "Deportes Recoleta", "Union Espanola": "Unión Española",
          "Union San Felipe": "Unión San Felipe", "Universidad de Concepcion": "Universidad de Concepción", "Concepción": "Deportes Concepción",
          "Rangers de Talca": "Rangers", "Nublense": "Ñublense", "Huachipato": "Huachipato", "O'Higgins": "O'Higgins"}
MAX_DET = int(os.environ.get("AF_LIGAS_MAX", "15"))   # consultas de detalle por liga y corrida (20 partidos cada una)
ESPERA = float(os.environ.get("AF_ESPERA", "6.5"))
_ultima = [0.0]
JUGADO, VIVO = {"FT", "AET", "PEN"}, {"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"}
STATS = {"Shots on Goal": "shotsOnTarget", "Total Shots": "totalShots", "Blocked Shots": "blockedShots", "Fouls": "foulsCommitted",
         "Corner Kicks": "wonCorners", "Offsides": "offsides", "Ball Possession": "possessionPct", "Yellow Cards": "yellowCards",
         "Red Cards": "redCards", "Goalkeeper Saves": "saves", "Total passes": "totalPasses", "Passes accurate": "accuratePasses"}


def activo():
    return bool(os.environ.get("API_FOOTBALL_KEY", "").strip())


def _af(path):
    espera = ESPERA - (time.time() - _ultima[0])
    if espera > 0:
        time.sleep(espera)
    j = lesiones._get(path)
    _ultima[0] = time.time()
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"])[:200])
    return j.get("response") or []


def _leer(path, defecto):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guardar(path, data):
    os.makedirs(DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def _kick(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%MZ")


def _fixtures(slug, season, fresco):
    path = os.path.join(DIR, f"{slug}_{season}.json")
    viejo = _leer(path, None)
    if viejo is not None and not fresco:
        return viejo
    if not activo():
        return viejo or []
    try:
        r = _af(f"/fixtures?league={FUENTE[slug]}&season={season}")
    except Exception as e:   # noqa: BLE001
        print(f"  ✗ API-Football {slug} {season}: {e}")
        return viejo or []
    filas = [dict(id=x["fixture"]["id"], k=x["fixture"]["date"], st=(x["fixture"].get("status") or {}).get("short"),
                  h=x["teams"]["home"], a=x["teams"]["away"], g=x.get("goals") or {}, pen=(x.get("score") or {}).get("penalty") or {},
                  ronda=(x.get("league") or {}).get("round"), estadio=((x["fixture"].get("venue") or {}).get("name")),
                  arbitro=x["fixture"].get("referee")) for x in r]
    if filas or viejo is None:
        _guardar(path, filas)
    return filas or viejo or []


def _detalle(slug, filas):
    """Goles, tarjetas y estadísticas de los partidos terminados (20 por consulta)."""
    path = os.path.join(DIR, f"{slug}_det.json")
    det = _leer(path, {})
    faltan = [str(f["id"]) for f in filas if f["st"] in JUGADO and str(f["id"]) not in det]
    if faltan and activo():
        for i in range(0, min(len(faltan), 20 * MAX_DET), 20):
            ids = faltan[i:i + 20]
            try:
                r = _af("/fixtures?ids=" + "-".join(ids))
            except Exception as e:   # noqa: BLE001
                print(f"  ✗ detalle API-Football {slug}: {e}")
                break
            for x in r:
                hid = x["teams"]["home"]["id"]
                ev = [dict(t=e.get("type"), d=e.get("detail"), m=(e.get("time") or {}).get("elapsed"), lado="h" if (e.get("team") or {}).get("id") == hid else "a",
                           jug=(e.get("player") or {}).get("name"), jid=(e.get("player") or {}).get("id")) for e in x.get("events") or []]
                st = {}
                for t in x.get("statistics") or []:
                    lado = "h" if (t.get("team") or {}).get("id") == hid else "a"
                    st[lado] = {STATS[s["type"]]: s.get("value") for s in t.get("statistics") or [] if s.get("type") in STATS}
                det[str(x["fixture"]["id"])] = dict(ev=ev, st=st)
        _guardar(path, det)
        print(f"  API-Football {slug}: detalle de {len(det)} partidos ({len(faltan)} faltaban)")
    return det


def _num(v, pct=False):
    if v is None:
        return None if pct else 0.0
    try:
        return float(str(v).replace("%", ""))
    except ValueError:
        return None


def _eventos(d, hg, ag):
    out = []
    for e in d.get("ev") or []:
        t, det = e.get("t"), (e.get("d") or "")
        if t == "Goal" and "Missed" not in det:
            out.append(dict(t="G", lado=e["lado"], min=e.get("m"), jug=e.get("jug"), jid=str(e.get("jid") or ""), pen=det == "Penalty", og=det == "Own Goal"))
        elif t == "Card":
            out.append(dict(t="R" if "Red" in det or "Second" in det else "Y", lado=e["lado"], min=e.get("m"), jug=e.get("jug"), jid=str(e.get("jid") or ""), pen=False, og=False))
    # autogoles: API-Football no siempre deja claro a qué lado sumarlos; se reparten para que calce el marcador
    falta = {"h": int(hg or 0) - sum(1 for v in out if v["t"] == "G" and not v["og"] and v["lado"] == "h"),
             "a": int(ag or 0) - sum(1 for v in out if v["t"] == "G" and not v["og"] and v["lado"] == "a")}
    for v in out:
        if v["t"] == "G" and v["og"]:
            lado = "h" if falta["h"] > 0 else "a"
            v["lado"] = lado
            falta[lado] -= 1
    return out


def _filas(slug, filas, det):
    rows = []
    for f in filas:
        st = f["st"]
        done = st in JUGADO
        row = {"id": f"af{f['id']}", "kickoff": _kick(f["k"]), "estado": "jugado" if done else ("pendiente" if st in ("NS", "TBD") else ("en_vivo" if st in VIVO else "otro"))}
        row["date"] = row["kickoff"][:10]
        for side, t in (("home", f["h"]), ("away", f["a"])):
            n = EQUIPO.get(t.get("name"), t.get("name"))
            row[side] = n
            row[side + "_corto"] = n.replace("Deportes ", "") if n and n.startswith("Deportes ") and len(n) > 16 else n
            row[side + "_abr"] = (n.replace("Deportes ", "").replace("Unión ", "U").replace("Universidad de ", "U")[:3] if n else "").upper()
            row[side + "_color"] = None
            row[side + "_logo"] = t.get("logo")
        row["hg"] = f["g"].get("home") if done else None
        row["ag"] = f["g"].get("away") if done else None
        row["hst"] = row["ast"] = None
        pen = f.get("pen") or {}
        if done and pen.get("home") is not None and pen.get("away") is not None and pen["home"] != pen["away"]:
            row["pen"] = "h" if pen["home"] > pen["away"] else "a"
        d = det.get(str(f["id"]))
        if done and d:
            hs = {k: _num(v, k == "possessionPct") for k, v in (d.get("st") or {}).get("h", {}).items()}
            as_ = {k: _num(v, k == "possessionPct") for k, v in (d.get("st") or {}).get("a", {}).items()}
            row["hstats"] = {k: v for k, v in hs.items() if v is not None}
            row["astats"] = {k: v for k, v in as_.items() if v is not None}
            row["hst"], row["ast"] = row["hstats"].get("shotsOnTarget"), row["astats"].get("shotsOnTarget")
            row["eventos"] = _eventos(d, row["hg"], row["ag"])
        if f.get("arbitro"):
            row["arbitro"] = f["arbitro"].split(",")[0].strip()
        rows.append(row)
    return rows


def load(slug, start, end, today):
    """Como datos.load: partidos de las temporadas entre start y end."""
    seasons = sorted({start.year, end.year, today.year} | set(range(start.year, end.year + 1)))
    rows = []
    for s in seasons:
        if s > today.year:
            continue
        filas = _fixtures(slug, s, fresco=s >= today.year - (today.month == 1))
        det = _detalle(slug, filas) if s == today.year else {}
        rows += _filas(slug, filas, det)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for c in ("hg", "ag", "hst", "ast"):
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    df["date"] = pd.to_datetime(df["date"])
    df = df[(df.date >= pd.Timestamp(start)) & (df.date <= pd.Timestamp(end))]
    return df.drop_duplicates(["date", "home", "away"]).sort_values("kickoff").reset_index(drop=True)


def standings(slug, today):
    """Tabla oficial de API-Football en el formato de datos.standings."""
    if not activo():
        return []
    path = os.path.join(DIR, f"{slug}_tabla.json")
    try:
        r = _af(f"/standings?league={FUENTE[slug]}&season={today.year}")
        grupos = []
        for lg in r:
            for tabla in (lg.get("league") or {}).get("standings") or []:
                filas = [dict(equipo=e["team"]["name"], pos=e.get("rank"), pj=e["all"]["played"], g=e["all"]["win"], e=e["all"]["draw"],
                              p=e["all"]["lose"], gf=e["all"]["goals"]["for"], gc=e["all"]["goals"]["against"], pts=e.get("points"),
                              dg=e.get("goalsDiff")) for e in tabla]
                if filas:
                    grupos.append(dict(nombre=(tabla[0].get("group") or "").replace("Primera B", "").strip(" -:") if len(lg["league"]["standings"]) > 1 else "", filas=filas))
        if grupos:
            _guardar(path, grupos)
            return grupos
    except Exception as e:   # noqa: BLE001
        print(f"  ✗ tabla API-Football {slug}: {e}")
    return _leer(path, [])


def meta(slug):
    return {"nombre": NOMBRE.get(slug), "logo": f"https://media.api-sports.io/football/leagues/{FUENTE[slug]}.png"}
