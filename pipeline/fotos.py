"""Fotos de jugadores: cruza los planteles de ESPN con los de API-Football para tener la foto de cada jugador.

ESPN casi no tiene fotos de jugadores de fútbol; API-Football sí (media.api-sports.io, gratis y sin gastar
consultas al mostrarlas). Para saber qué foto corresponde a cada jugador de ESPN se baja el plantel del
equipo en ambos lados y se cruzan por número de camiseta y nombre.

Cada equipo cuesta 1 consulta de API-Football (más 1 por liga para la lista de equipos). Con el plan gratis
se avanza de a pocos equipos por corrida, dejando una reserva para las bajas; cada plantel se renueva cada
60 días. Resultado: site/data/fotos.json  {id de ESPN: id de API-Football}.
"""
import json
import os
import re
import time
import unicodedata
from datetime import date, datetime, timezone

import datos
import lesiones

RAIZ = os.path.join(os.path.dirname(__file__), "..")
ESTADO_P = os.path.join(RAIZ, "data", "api_football", "fotos_estado.json")
SALIDA = os.path.join(RAIZ, "site", "data", "fotos.json")
MAX = int(os.environ.get("FOTOS_MAX", "10"))           # consultas de API-Football por corrida
RESERVA = int(os.environ.get("FOTOS_RESERVA", "40"))   # nunca bajar de esto en el día
DIAS = 60
AF_LIGA = {"premier": 39, "laliga": 140, "seriea": 135, "bundesliga": 78, "ligue1": 61, "championship": 40, "portugal": 94, "eredivisie": 88,
           "chile": 265, "chile2": 266, "argentina": 128, "brasil": 71, "mls": 253, "ligamx": 262, "colombia": 239, "uruguay": 268, "peru": 281,
           "ecuador": 242, "paraguay": 250, "turquia": 203, "escocia": 179, "belgica": 144, "arabia": 307}
STOP = {"fc", "cf", "sc", "ac", "afc", "cd", "club", "de", "al", "the", "fk", "sk", "if", "bk", "ca", "cr", "u", "sad", "deportivo", "atletico", "sporting", "real", "united", "city"}
_ultima = [0.0]


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s).split() if w not in STOP]


def parecido(a, b):
    A, B = norm(a), norm(b)
    if not A or not B:
        return 0.0
    n = sum(1 for w in A if any(x == w or (len(w) > 3 and (x.startswith(w) or w.startswith(x))) for x in B))
    return n / max(len(A), len(B))


def nombre_igual(a, b):
    A, B = norm(a), norm(b)
    if not A or not B:
        return 0.0
    n = sum(1 for w in A if any(x == w or (len(w) > 3 and (x.startswith(w) or w.startswith(x))) for x in B))
    return n / min(len(A), len(B)) + (0.5 if A[-1] == B[-1] else 0)


def af(path):
    espera = 6.5 - (time.time() - _ultima[0])
    if espera > 0:
        time.sleep(espera)
    j = lesiones._get(path)
    _ultima[0] = time.time()
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"])[:160])
    return j.get("response") or []


def temporada(L, hoy):
    return hoy.year if L.get("inicio", 1) == 1 or hoy.month >= 7 else hoy.year - 1


def actualizar(ligas):
    """ligas: lista de (definición de liga, salida de la liga con 'equipos' y 'slug')."""
    if not os.environ.get("API_FOOTBALL_KEY", "").strip():
        return
    try:
        with open(ESTADO_P, encoding="utf-8") as f:
            est = json.load(f)
    except (OSError, ValueError):
        est = {"ligas": {}, "equipos": {}}
    try:
        with open(SALIDA, encoding="utf-8") as f:
            mapa = json.load(f)
    except (OSError, ValueError):
        mapa = {}
    hoy = date.today()
    usadas, nuevos = 0, 0

    def puedo():
        r = lesiones.ESTADO.get("restantes")
        return usadas < MAX and (r is None or r > RESERVA)

    pend = []   # (liga, equipo, id ESPN del equipo)
    for L, out in ligas:
        if L["id"] not in AF_LIGA:
            continue
        for team, inf in (out.get("equipos") or {}).items():
            m = re.search(r"/(\d+)\.png", str((inf or {}).get("logo") or ""))
            if not m:
                continue
            k = f"{L['id']}|{team}"
            e = est["equipos"].get(k)
            if e and (hoy - date.fromisoformat(e["t"])).days < DIAS:
                continue
            pend.append((L, out, team, m.group(1), k))
    pend.sort(key=lambda x: (x[0].get("peso", 1) < 0.9, x[4] in est["equipos"]))   # ligas principales y equipos nunca vistos primero
    try:
        for L, out, team, espn_id, k in pend:
            if not puedo():
                break
            lg = est["ligas"].get(L["id"])
            season = temporada(L, hoy)
            if not lg or lg.get("season") != season:
                r = af(f"/teams?league={AF_LIGA[L['id']]}&season={season}")
                usadas += 1
                lg = est["ligas"][L["id"]] = {"season": season, "equipos": [[t["team"]["id"], t["team"]["name"]] for t in r]}
                if not puedo():
                    break
            cand = sorted(((parecido(team, n), i) for i, n in lg["equipos"]), reverse=True)
            if not cand or cand[0][0] < 0.5:
                est["equipos"][k] = {"t": hoy.isoformat(), "af": None}
                continue
            afid = cand[0][1]
            r = af(f"/players/squads?team={afid}")
            usadas += 1
            sq = (r[0].get("players") if r else None) or []
            try:
                ros = datos._fetch(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{out['slug']}/teams/{espn_id}/roster")
            except Exception:
                ros = {}
            n_ok = 0
            libres = list(sq)
            for a in ros.get("athletes") or []:
                num = str(a.get("jersey") or "")
                best, bs = None, 0.0
                for pl in libres:
                    sc = nombre_igual(a.get("displayName") or a.get("fullName"), pl.get("name")) + (1 if num and str(pl.get("number") or "") == num else 0)
                    if sc > bs:
                        best, bs = pl, sc
                if best and bs >= 1:
                    mapa[str(a.get("id"))] = best["id"]
                    libres.remove(best)
                    n_ok += 1
            nuevos += n_ok
            est["equipos"][k] = {"t": hoy.isoformat(), "af": afid, "n": n_ok}
    except Exception as e:   # sin consultas o error: se sigue en la próxima corrida
        print(f"  (fotos: {e})")
    os.makedirs(os.path.dirname(ESTADO_P), exist_ok=True)
    with open(ESTADO_P, "w", encoding="utf-8") as f:
        json.dump(est, f, ensure_ascii=False, separators=(",", ":"))
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(mapa, f, separators=(",", ":"))
    hechos = sum(1 for v in est["equipos"].values() if v.get("af"))
    print(f"  Fotos de jugadores: {len(mapa)} jugadores con foto · {hechos} equipos listos · {usadas} consultas en esta corrida ({nuevos} nuevos)")
