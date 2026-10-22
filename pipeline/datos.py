"""Descarga de resultados y calendario desde los marcadores públicos de ESPN.

- Un pedido por liga y por mes (ESPN no acepta rangos de fechas).
- Los meses ya terminados se guardan en data/cache_espn/ y no se vuelven a pedir.
- El mes actual, el anterior y los futuros se piden siempre (resultados y calendario frescos).
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import date

import numpy as np
import pandas as pd

URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates={ym}&limit=1000"
CACHE = os.path.join(os.path.dirname(__file__), "..", "data", "cache_espn")
DEBUG = False


def months(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield f"{y}{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _stat(comp, *names):
    for s in comp.get("statistics") or []:
        if s.get("name") in names or s.get("abbreviation") in names:
            try:
                return float(s.get("displayValue", s.get("value")))
            except (TypeError, ValueError):
                return None
    return None


def _logo(team):
    """Escudo que publica ESPN. Prefiere la versión para fondo oscuro si existe."""
    logos = team.get("logos") or []
    for lg in logos:
        if "dark" in (lg.get("rel") or []) and lg.get("href"):
            return lg["href"]
    for lg in logos:
        if lg.get("href"):
            return lg["href"]
    return team.get("logo")


def _events(comp, hid, aid):
    """Goles y tarjetas con jugador y minuto (lista 'details' de ESPN)."""
    out = []
    for d in comp.get("details") or []:
        tid = str((d.get("team") or {}).get("id", ""))
        lado = "h" if tid == hid else ("a" if tid == aid else None)
        if not lado or d.get("shootout"):
            continue
        if d.get("scoringPlay"):
            t = "G"
        elif d.get("redCard"):
            t = "R"
        elif d.get("yellowCard"):
            t = "Y"
        else:
            continue
        ath = (d.get("athletesInvolved") or [{}])[0]
        minuto = _num((d.get("clock") or {}).get("value"))
        out.append({"t": t, "lado": lado, "min": int(minuto // 60) + 1 if minuto is not None else None,
                    "jug": ath.get("displayName"), "jid": str(ath.get("id") or ""),
                    "pen": bool(d.get("penaltyKick")), "og": bool(d.get("ownGoal"))})
    return out


def _american(ml):
    v = _num(ml)
    if v is None or v == 0:
        return None
    return round(1 + (v / 100 if v > 0 else 100 / -v), 3)


def _odds(comp):
    """Cuotas 1X2 (decimal) si ESPN las incluye. Vienen en formato americano."""
    for o in comp.get("odds") or []:
        if not isinstance(o, dict):
            continue
        h = _american((o.get("homeTeamOdds") or {}).get("moneyLine"))
        a = _american((o.get("awayTeamOdds") or {}).get("moneyLine"))
        d = _american((o.get("drawOdds") or {}).get("moneyLine"))
        if h and a and d:
            return {"h": h, "d": d, "a": a, "casa": ((o.get("provider") or {}).get("name"))}
    return None


def _all_stats(comp):
    out = {}
    for s in comp.get("statistics") or []:
        k = s.get("name") or s.get("abbreviation")
        v = _num(s.get("displayValue", s.get("value")))
        if k and v is not None:
            out[k] = v
    return out


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def parse_events(data):
    rows = []
    for ev in data.get("events", []):
        try:
            comp = ev["competitions"][0]
            teams = {c["homeAway"]: c for c in comp["competitors"]}
            h, a = teams["home"], teams["away"]
            st = (ev.get("status") or comp.get("status") or {}).get("type", {})
            done = bool(st.get("completed"))
            state = st.get("state", "")
            row = {"id": str(ev.get("id", "")), "date": ev["date"][:10], "kickoff": ev["date"],
                   "estado": "jugado" if done else ("pendiente" if state == "pre" else ("en_vivo" if state == "in" else "otro"))}
            for side, c in (("home", h), ("away", a)):
                t = c["team"]
                row[side] = t.get("displayName") or t.get("name")
                row[side + "_corto"] = t.get("shortDisplayName") or row[side]
                row[side + "_abr"] = t.get("abbreviation") or row[side][:3].upper()
                row[side + "_color"] = t.get("color")
                row[side + "_logo"] = _logo(t)
            od = _odds(comp)
            if od:
                row["odds"] = od
            row["hg"] = _num(h.get("score")) if done else None
            row["ag"] = _num(a.get("score")) if done else None
            row["hst"] = _stat(h, "shotsOnTarget", "ST", "SOT") if done else None
            row["ast"] = _stat(a, "shotsOnTarget", "ST", "SOT") if done else None
            if done:  # todas las estadísticas que ESPN publique (córners, faltas, posesión…)
                row["hstats"], row["astats"] = _all_stats(h), _all_stats(a)
                row["eventos"] = _events(comp, str(h.get("id")), str(a.get("id")))
            rows.append(row)
        except (KeyError, TypeError, IndexError):
            continue
    return rows


def _fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        with urllib.request.urlopen(url.replace("&limit=1000", ""), timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))


def get_month(slug, ym, fresh):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"v3_{slug}_{ym}.json")
    if os.path.exists(path) and not fresh:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = None
    for intento in range(3):
        try:
            data = _fetch(URL.format(slug=slug, ym=ym))
            break
        except Exception as e:
            if intento == 2:
                print(f"  ✗ no pude bajar {slug} {ym}: {e}")
                if os.path.exists(path):  # mejor datos viejos que nada
                    with open(path, encoding="utf-8") as f:
                        return json.load(f)
                return []
            time.sleep(2 + 3 * intento)
    if DEBUG:
        with open(os.path.join(CACHE, "..", "espn_ejemplo.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    lg = (data or {}).get("leagues") or []
    if lg:
        meta = {"nombre": lg[0].get("name"), "logo": ((lg[0].get("logos") or [{}])[0]).get("href")}
        with open(os.path.join(CACHE, f"meta_{slug}.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False)
    muestra = os.path.join(CACHE, "..", "espn_muestra.json")
    if not os.path.exists(muestra) and data and data.get("events"):
        done = [e for e in data["events"] if ((e.get("status") or {}).get("type") or {}).get("completed")]
        with open(muestra, "w", encoding="utf-8") as f:  # un partido de ejemplo, para saber qué campos trae ESPN
            json.dump({"leagues": data.get("leagues", [])[:1], "events": (done or data["events"])[:1]}, f, ensure_ascii=False, indent=1)
    prox = os.path.join(CACHE, "..", "espn_muestra_proximo.json")
    if data and data.get("events") and not os.path.exists(prox):
        pre = [e for e in data["events"] if ((e.get("status") or {}).get("type") or {}).get("state") == "pre"]
        if pre:
            with open(prox, "w", encoding="utf-8") as f:
                json.dump(pre[0], f, ensure_ascii=False, indent=1)
    rows = parse_events(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    time.sleep(0.3)
    return rows


def load(slug, start, end, today):
    cur = f"{today.year}{today.month:02d}"
    prev_d = date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)
    prev = f"{prev_d.year}{prev_d.month:02d}"
    rows = []
    for ym in months(start, end):
        rows += get_month(slug, ym, fresh=ym >= prev)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for c in ("hg", "ag", "hst", "ast"):
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    df["date"] = pd.to_datetime(df["date"])
    return df.drop_duplicates(["date", "home", "away"]).sort_values("kickoff").reset_index(drop=True)


def meta(slug):
    path = os.path.join(CACHE, f"meta_{slug}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings"


def _stats_map(entry):
    out = {}
    for st in entry.get("stats") or []:
        k = st.get("name") or st.get("type")
        v = st.get("value", st.get("displayValue"))
        try:
            out[k] = float(v)
        except (TypeError, ValueError):
            pass
    return out


def standings(slug):
    """Tablas oficiales de ESPN. Devuelve [{nombre, filas:[...]}] o [] si no hay."""
    try:
        data = _fetch(STANDINGS.format(slug=slug))
    except Exception as e:
        print(f"  (sin tabla oficial {slug}: {e})")
        return []
    grupos = []

    def walk(node, name):
        st = node.get("standings") or {}
        entries = st.get("entries") or []
        if entries:
            filas = []
            for e in entries:
                t = e.get("team") or {}
                m = _stats_map(e)
                filas.append(dict(equipo=t.get("displayName") or t.get("name"), pos=int(m.get("rank", 0) or 0),
                                  pj=int(m.get("gamesPlayed", 0)), g=int(m.get("wins", 0)), e=int(m.get("ties", 0)),
                                  p=int(m.get("losses", 0)), gf=int(m.get("pointsFor", 0)), gc=int(m.get("pointsAgainst", 0)),
                                  pts=int(m.get("points", 0))))
            filas.sort(key=lambda f: (f["pos"] or 999, -f["pts"]))
            for i, f in enumerate(filas, 1):
                f["pos"] = f["pos"] or i
                f["dg"] = f["gf"] - f["gc"]
            grupos.append(dict(nombre=node.get("name") or name or "", filas=filas))
        for ch in node.get("children") or []:
            walk(ch, ch.get("name") or name)

    walk(data, data.get("name"))
    return [g for g in grupos if g["filas"]]
