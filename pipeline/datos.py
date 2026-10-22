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
            row["hg"] = _num(h.get("score")) if done else None
            row["ag"] = _num(a.get("score")) if done else None
            row["hst"] = _stat(h, "shotsOnTarget", "ST", "SOT") if done else None
            row["ast"] = _stat(a, "shotsOnTarget", "ST", "SOT") if done else None
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
    path = os.path.join(CACHE, f"{slug}_{ym}.json")
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
