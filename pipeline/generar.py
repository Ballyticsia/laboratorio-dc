"""
generar.py — descarga datos, reajusta los modelos y escribe los JSON que lee el sitio.

Uso local:   python pipeline/generar.py                 (desde la carpeta del proyecto)
             python pipeline/generar.py --ligas premier chile
En GitHub:   lo corre .github/workflows/actualizar.yml tres veces al día.

Modelos por liga:
- Goles: Dixon-Coles (pipeline/modelo.py).
- Córners y tarjetas: el mismo modelo de ataque/defensa con ponderación temporal,
  ajustado sobre córners ganados y tarjetas recibidas (sin corrección rho).
"""
import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import datos  # noqa: E402
import fotos  # noqa: E402
import arbitros  # noqa: E402
import picks_publicos  # noqa: E402
import copas  # noqa: E402
import cuotas  # noqa: E402
import lesiones  # noqa: E402
import xg  # noqa: E402
from modelo import XI, ALPHA, calibrar, fit, markets, mercado_q, score_matrix  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SALIDA = os.path.join(RAIZ, "site", "data")
REGISTRO = os.path.join(RAIZ, "data", "registro.csv")
REG_JUG = os.path.join(RAIZ, "data", "registro_jugadores.json")   # goleadores y amarillas predichos (y lo que pasó)
EXTRA = {}   # id -> córners, tarjetas, goleadores y amonestados reales de cada partido jugado
HISTORIAL = os.path.join(RAIZ, "data", "historial.json")
TEMPORADAS = 3
SIMS = 10000
DETALLE_DIAS = 21
HOME_L2 = 20.0      # localía propia de cada equipo, encogida hacia el promedio (backtest: log-loss 0,9948 → 0,9942)   # partidos con análisis completo (córners, tarjetas, goleadores, h2h)

# zonas: (desde, hasta, etiqueta, clase CSS). "inicio": mes en que empieza la temporada.
EUROPA = "Europa"
try:
    LOGOS = {c["s"]: c.get("l") for c in json.load(open(os.path.join(os.path.dirname(__file__), "..", "site", "assets", "competiciones.json"), encoding="utf-8"))}
except Exception:
    LOGOS = {}

LIGAS = [
    dict(id="premier", nombre="Premier League", pais="Inglaterra", region=EUROPA, s1="eng.1", s2=["eng.2"], inicio=7,
         zonas=[(1, 4, "Champions League", "cl"), (5, 5, "Europa League", "el"), (6, 6, "Conference League", "ecl"), (18, 20, "Descenso", "desc")]),
    dict(id="laliga", nombre="LaLiga", pais="España", region=EUROPA, s1="esp.1", s2=["esp.2"], inicio=7,
         zonas=[(1, 4, "Champions League", "cl"), (5, 5, "Europa League", "el"), (6, 6, "Conference League", "ecl"), (18, 20, "Descenso", "desc")]),
    dict(id="seriea", nombre="Serie A", pais="Italia", region=EUROPA, s1="ita.1", s2=["ita.2"], inicio=7,
         zonas=[(1, 4, "Champions League", "cl"), (5, 5, "Europa League", "el"), (6, 6, "Conference League", "ecl"), (18, 20, "Descenso", "desc")]),
    dict(id="bundesliga", nombre="Bundesliga", pais="Alemania", region=EUROPA, s1="ger.1", s2=["ger.2"], inicio=7,
         zonas=[(1, 4, "Champions League", "cl"), (5, 5, "Europa League", "el"), (6, 6, "Conference League", "ecl"), (16, 16, "Promoción", "promo"), (17, 18, "Descenso", "desc")]),
    dict(id="ligue1", nombre="Ligue 1", pais="Francia", region=EUROPA, s1="fra.1", s2=["fra.2"], inicio=7,
         zonas=[(1, 3, "Champions League", "cl"), (4, 4, "Champions (previa)", "cl"), (5, 5, "Europa League", "el"), (6, 6, "Conference League", "ecl"), (16, 16, "Promoción", "promo"), (17, 18, "Descenso", "desc")]),
    dict(id="championship", peso=0.75, nombre="Championship", pais="Inglaterra", region=EUROPA, s1="eng.2", s2=["eng.1", "eng.3"], inicio=7,
         zonas=[(1, 2, "Ascenso directo", "cl"), (3, 6, "Playoffs de ascenso", "el"), (22, 24, "Descenso", "desc")]),
    dict(id="portugal", peso=0.85, nombre="Primeira Liga", pais="Portugal", region=EUROPA, s1="por.1", s2=[], inicio=7,
         zonas=[(1, 2, "Champions League", "cl"), (3, 3, "Champions (previa)", "cl"), (4, 4, "Europa League", "el"), (16, 16, "Promoción", "promo"), (17, 18, "Descenso", "desc")]),
    dict(id="eredivisie", peso=0.85, nombre="Eredivisie", pais="Países Bajos", region=EUROPA, s1="ned.1", s2=[], inicio=7,
         zonas=[(1, 2, "Champions League", "cl"), (3, 3, "Champions (previa)", "cl"), (4, 4, "Europa League", "el"), (16, 16, "Promoción", "promo"), (17, 18, "Descenso", "desc")]),
    dict(id="chile", peso=0.9, nombre="Liga de Primera", pais="Chile", region="Sudamérica", s1="chi.1", s2=[], inicio=1,
         zonas=[(1, 1, "Libertadores (fase de grupos)", "cl"), (2, 3, "Libertadores (previa)", "el"), (4, 7, "Sudamericana", "ecl"), (15, 16, "Descenso", "desc")]),
    dict(id="argentina", peso=0.85, nombre="Liga Profesional", pais="Argentina", region="Sudamérica", s1="arg.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="brasil", peso=0.85, nombre="Brasileirão", pais="Brasil", region="Sudamérica", s1="bra.1", s2=[], inicio=1,
         zonas=[(1, 4, "Libertadores (fase de grupos)", "cl"), (5, 6, "Libertadores (previa)", "el"), (7, 12, "Sudamericana", "ecl"), (17, 20, "Descenso", "desc")]),
    dict(id="mls", peso=0.75, nombre="MLS", pais="Estados Unidos", region="Norteamérica", s1="usa.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="champions", peso=1.2, nombre="Champions League", pais="UEFA", region="Copas", s1="uefa.champions", s2=["uefa.europa", "uefa.europa.conf", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "ned.1"], inicio=7, tabla=False, oficial=True,
         zonas=[(1, 8, "Octavos de final", "cl"), (9, 24, "Playoff de octavos", "el"), (25, 36, "Eliminado", "desc")]),
    dict(id="libertadores", peso=1.0, nombre="Copa Libertadores", pais="CONMEBOL", region="Copas", s1="conmebol.libertadores", s2=["conmebol.sudamericana", "arg.1", "bra.1", "chi.1", "col.1", "ecu.1", "uru.1", "par.1", "per.1"], inicio=1, tabla=False, oficial=True),
    # ---- ampliación: más ligas y copas ----
    dict(id="europaleague", peso=1.0, nombre="Europa League", pais="UEFA", region="Copas", s1="uefa.europa", s2=["uefa.champions", "uefa.europa.conf", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "ned.1", "tur.1", "sco.1", "bel.1"], inicio=7, tabla=False, oficial=True,
         zonas=[(1, 8, "Octavos de final", "cl"), (9, 24, "Playoff de octavos", "el"), (25, 36, "Eliminado", "desc")]),
    dict(id="conference", peso=0.85, nombre="Conference League", pais="UEFA", region="Copas", s1="uefa.europa.conf", s2=["uefa.champions", "uefa.europa", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "ned.1", "tur.1", "sco.1", "bel.1"], inicio=7, tabla=False, oficial=True,
         zonas=[(1, 8, "Octavos de final", "cl"), (9, 24, "Playoff de octavos", "el"), (25, 36, "Eliminado", "desc")]),
    dict(id="sudamericana", peso=0.9, nombre="Copa Sudamericana", pais="CONMEBOL", region="Copas", s1="conmebol.sudamericana", s2=["conmebol.libertadores", "arg.1", "bra.1", "chi.1", "col.1", "ecu.1", "uru.1", "par.1", "per.1"], inicio=1, tabla=False, oficial=True),
    dict(id="ligamx", peso=0.85, nombre="Liga MX", pais="México", region="Norteamérica", s1="mex.1", s2=[], inicio=7, tabla=False, oficial=True),
    dict(id="colombia", peso=0.8, nombre="Liga BetPlay", pais="Colombia", region="Sudamérica", s1="col.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="uruguay", peso=0.75, nombre="Primera División", pais="Uruguay", region="Sudamérica", s1="uru.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="peru", peso=0.7, nombre="Liga 1", pais="Perú", region="Sudamérica", s1="per.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="ecuador", peso=0.75, nombre="LigaPro", pais="Ecuador", region="Sudamérica", s1="ecu.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="paraguay", peso=0.7, nombre="Primera División", pais="Paraguay", region="Sudamérica", s1="par.1", s2=[], inicio=1, tabla=False, oficial=True),
    dict(id="chile2", peso=0.7, nombre="Primera B", pais="Chile", region="Sudamérica", s1="chi.2", s2=["chi.1"], inicio=1,
         zonas=[(1, 1, "Ascenso directo", "cl"), (2, 8, "Liguilla de ascenso", "el"), (16, 16, "Descenso", "desc")]),
    dict(id="turquia", peso=0.85, nombre="Süper Lig", pais="Turquía", region=EUROPA, s1="tur.1", s2=[], inicio=7,
         zonas=[(1, 1, "Champions League", "cl"), (2, 2, "Champions (previa)", "cl"), (3, 3, "Europa League", "el"), (4, 4, "Conference League", "ecl"), (16, 18, "Descenso", "desc")]),
    dict(id="escocia", peso=0.8, nombre="Premiership", pais="Escocia", region=EUROPA, s1="sco.1", s2=["sco.2"], inicio=7,
         zonas=[(1, 1, "Champions League", "cl"), (2, 2, "Champions (previa)", "cl"), (3, 3, "Europa League", "el"), (11, 11, "Promoción", "promo"), (12, 12, "Descenso", "desc")]),
    dict(id="belgica", peso=0.8, nombre="Pro League", pais="Bélgica", region=EUROPA, s1="bel.1", s2=[], inicio=7, tabla=False, oficial=True),
    dict(id="arabia", peso=0.75, nombre="Liga Profesional Saudí", pais="Arabia Saudita", region="Asia", s1="ksa.1", s2=[], inicio=7,
         zonas=[(1, 2, "AFC Champions League Elite", "cl"), (16, 18, "Descenso", "desc")]),
]


def r(x, n=4):
    if x is None:
        return None
    try:
        if isinstance(x, float) and math.isnan(x):
            return None
    except TypeError:
        return None
    return round(float(x), n)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if math.isnan(float(o)) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def evs(x):
    v = x.get("eventos") if isinstance(x, dict) else getattr(x, "eventos", None)
    return v if isinstance(v, list) else None


def stat(x, side, key):
    s = getattr(x, side + "stats", None)
    if isinstance(s, dict) and key in s:
        return float(s[key])
    return np.nan


def cards(x, lado):
    e = evs(x._asdict() if hasattr(x, "_asdict") else x)
    if e is None:
        return np.nan
    return float(sum(1 for v in e if v["lado"] == lado and v["t"] in ("Y", "R")))


def eventos_completos(x):
    """La lista de eventos sirve solo si trae todos los goles del marcador."""
    e = getattr(x, "eventos", None)
    if not isinstance(e, list):
        return False
    return sum(1 for v in e if v["t"] == "G") == int(x.hg + x.ag)


# ---------------- tabla, proyección, rachas, estadísticas ----------------
def standings(df, teams):
    t = {k: dict(equipo=k, pj=0, g=0, e=0, p=0, gf=0, gc=0, pts=0, forma=[]) for k in teams}
    for x in df.sort_values("kickoff").itertuples():
        for eq, gf, gc in ((x.home, x.hg, x.ag), (x.away, x.ag, x.hg)):
            s = t.setdefault(eq, dict(equipo=eq, pj=0, g=0, e=0, p=0, gf=0, gc=0, pts=0, forma=[]))
            s["pj"] += 1
            s["gf"] += int(gf)
            s["gc"] += int(gc)
            res = "G" if gf > gc else ("E" if gf == gc else "P")
            s[{"G": "g", "E": "e", "P": "p"}[res]] += 1
            s["pts"] += {"G": 3, "E": 1, "P": 0}[res]
            s["forma"].append(res)
    out = sorted(t.values(), key=lambda s: (-s["pts"], -(s["gf"] - s["gc"]), -s["gf"], s["equipo"]))
    for i, s in enumerate(out, 1):
        s["pos"], s["dg"], s["forma"] = i, s["gf"] - s["gc"], s["forma"][-5:]
    return out


def project(model, tabla, restantes, zonas, rng):
    teams = [s["equipo"] for s in tabla]
    idx = {t: i for i, t in enumerate(teams)}
    pts = np.tile(np.array([s["pts"] for s in tabla], float), (SIMS, 1))
    for x in restantes.itertuples():
        if x.home not in idx or x.away not in idx:
            continue
        m = model.matrix(x.home, x.away)
        k = m.shape[0]
        cum = np.cumsum(m.ravel())
        draw = np.minimum(np.searchsorted(cum, rng.random(SIMS) * cum[-1]), k * k - 1)
        hg, ag = draw // k, draw % k
        pts[:, idx[x.home]] += np.where(hg > ag, 3, np.where(hg == ag, 1, 0))
        pts[:, idx[x.away]] += np.where(ag > hg, 3, np.where(hg == ag, 1, 0))
    rank = np.argsort(np.argsort(-(pts + rng.random(pts.shape) * 1e-3), axis=1), axis=1) + 1  # 1 = primero
    out = {}
    for t, i in idx.items():
        z = {}
        for a, b, lab, cls in zonas:
            z[cls] = z.get(cls, 0) + float(((rank[:, i] >= a) & (rank[:, i] <= b)).mean())
        out[t] = dict(pts_esp=r(pts[:, i].mean(), 1), p_campeon=r((rank[:, i] == 1).mean()), zonas={k: r(v) for k, v in z.items()})
    return out


def team_matches(df, team):
    rows = []
    for x in df.sort_values("kickoff").itertuples():
        if x.home == team:
            rows.append(dict(gf=x.hg, gc=x.ag, local=True, x=x))
        elif x.away == team:
            rows.append(dict(gf=x.ag, gc=x.hg, local=False, x=x))
    return rows


STREAKS = [
    ("invicto", "partidos invicto", lambda m: m["gf"] >= m["gc"]),
    ("gana", "victorias seguidas", lambda m: m["gf"] > m["gc"]),
    ("sin_ganar", "partidos sin ganar", lambda m: m["gf"] <= m["gc"]),
    ("pierde", "derrotas seguidas", lambda m: m["gf"] < m["gc"]),
    ("marca", "partidos marcando", lambda m: m["gf"] > 0),
    ("sin_marcar", "partidos sin marcar", lambda m: m["gf"] == 0),
    ("valla", "vallas invictas seguidas", lambda m: m["gc"] == 0),
    ("ambos", "partidos con ambos marcando", lambda m: m["gf"] > 0 and m["gc"] > 0),
    ("over", "partidos con más de 2,5 goles", lambda m: m["gf"] + m["gc"] > 2.5),
    ("under", "partidos con menos de 2,5 goles", lambda m: m["gf"] + m["gc"] < 2.5),
]


def streaks(df, teams):
    out = []
    for t in teams:
        ms = team_matches(df, t)
        for key, label, cond in STREAKS:
            n = 0
            for m in reversed(ms):
                if cond(m):
                    n += 1
                else:
                    break
            if n >= 3:
                out.append(dict(equipo=t, tipo=key, texto=label, n=n, de=len(ms)))
    return sorted(out, key=lambda s: -s["n"])


def team_stats(df, teams):
    out = []
    for t in teams:
        ms = team_matches(df, t)
        n = len(ms)
        if not n:
            out.append(dict(equipo=t, pj=0))
            continue

        def avg(fn):
            v = [fn(m) for m in ms]
            v = [a for a in v if a == a]
            return r(sum(v) / len(v), 2) if v else None

        side = lambda m: "h" if m["local"] else "a"
        opp = lambda m: "a" if m["local"] else "h"
        out.append(dict(
            equipo=t, pj=n,
            gf=r(sum(m["gf"] for m in ms) / n, 2), gc=r(sum(m["gc"] for m in ms) / n, 2),
            tiros=avg(lambda m: stat(m["x"], side(m), "totalShots")),
            tiros_arco=avg(lambda m: stat(m["x"], side(m), "shotsOnTarget")),
            tiros_rival=avg(lambda m: stat(m["x"], opp(m), "totalShots")),
            corners=avg(lambda m: stat(m["x"], side(m), "wonCorners")),
            corners_rival=avg(lambda m: stat(m["x"], opp(m), "wonCorners")),
            posesion=avg(lambda m: stat(m["x"], side(m), "possessionPct")),
            faltas=avg(lambda m: stat(m["x"], side(m), "foulsCommitted")),
            tarjetas=avg(lambda m: cards(m["x"], side(m))),
            ambos=r(sum(1 for m in ms if m["gf"] > 0 and m["gc"] > 0) / n, 3),
            over25=r(sum(1 for m in ms if m["gf"] + m["gc"] > 2.5) / n, 3),
            vallas=sum(1 for m in ms if m["gc"] == 0),
            sin_marcar=sum(1 for m in ms if m["gf"] == 0),
        ))
    return out


def players(df):
    """Goleadores y amonestados de la temporada a partir de los eventos de cada partido."""
    goles, tarj, rojas, eq, ultimos = Counter(), Counter(), Counter(), {}, defaultdict(list)
    pens = Counter()
    team_games = defaultdict(list)
    for x in df.sort_values("kickoff").itertuples():
        team_games[x.home].append(x.id)
        team_games[x.away].append(x.id)
        e = getattr(x, "eventos", None)
        if not isinstance(e, list):
            continue
        for v in e:
            if not v.get("jug"):
                continue
            team = x.home if v["lado"] == "h" else x.away
            key = (v["jid"] or v["jug"], team)
            eq[key] = v["jug"]
            if v["t"] == "G" and not v.get("og"):
                goles[key] += 1
                pens[key] += int(bool(v.get("pen")))
                ultimos[key].append(x.id)
            elif v["t"] == "Y":
                tarj[key] += 1
            elif v["t"] == "R":
                rojas[key] += 1

    def last5(key):
        ids = team_games[key[1]][-5:]
        return [sum(1 for g in ultimos[key] if g == i) for i in ids]

    gol = [dict(jid=k[0], jugador=eq[k], equipo=k[1], goles=n, penales=pens[k], ult5=last5(k)) for k, n in goles.most_common(25)]
    amo = sorted(set(tarj) | set(rojas), key=lambda k: (-(tarj[k] + 2 * rojas[k]), eq[k]))[:20]
    tar = [dict(jid=k[0], jugador=eq[k], equipo=k[1], amarillas=tarj[k], rojas=rojas[k]) for k in amo]
    return gol, tar, goles, team_games, tarj


def scorer_probs(model, home, away, goles, team_goals, lam=None):
    """Probabilidad de que cada goleador marque: 1 − exp(−λ_equipo · parte de los goles del equipo)."""
    lh, la = lam or model.rates(home, away)
    out = []
    for team, lam, lado in ((home, lh, "h"), (away, la, "a")):
        tot = team_goals.get(team, 0)
        cands = sorted(((k, n) for k, n in goles.items() if k[1] == team), key=lambda kv: -kv[1])[:3]
        for (jid, _), n in cands:
            share = min(n / (tot + 2.0), 0.6)
            out.append(dict(jid=jid, lado=lado, goles=n, p=r(1 - math.exp(-lam * share), 3)))
    return out


def card_probs(home, away, tarj, team_games, th, ta):
    """Probabilidad de que cada jugador reciba amarilla: su ritmo de amarillas en la temporada, ajustado por
    las tarjetas que se esperan para su equipo en este partido (modelo de tarjetas)."""
    out = []
    for team, exp_t, lado in ((home, th, "h"), (away, ta, "a")):
        pj = max(len(team_games.get(team, [])), 1)
        cands = sorted(((k, n) for k, n in tarj.items() if k[1] == team and n >= 2), key=lambda kv: -kv[1])[:4]
        tot = sum(n for (k, n) in tarj.items() if k[1] == team)
        prom = max(tot / pj, 0.5)                    # amarillas por partido del equipo en la temporada
        f = min(max((exp_t or prom) / prom, 0.6), 1.8)
        for (jid, _), n in cands:
            rate = min(n / pj, 0.9)
            out.append(dict(jid=jid, lado=lado, amarillas=n, p=r(min(1 - math.exp(-rate * f), 0.65), 3)))
    return out


def h2h(full, home, away):
    m = full[((full.home == home) & (full.away == away)) | ((full.home == away) & (full.away == home))]
    m = m[(m.estado == "jugado") & m.hg.notna()].sort_values("kickoff", ascending=False).head(5)
    return [dict(kickoff=x.kickoff, home=x.home, away=x.away, hg=int(x.hg), ag=int(x.ag)) for x in m.itertuples()]


def side_model(played, today, col):
    """Modelo de ataque/defensa para córners o tarjetas."""
    d = played.copy()
    if col == "corners":
        d["hg"] = [stat(x, "h", "wonCorners") for x in d.itertuples()]
        d["ag"] = [stat(x, "a", "wonCorners") for x in d.itertuples()]
    else:
        ok = [eventos_completos(x) for x in d.itertuples()]
        d = d[ok]
        d["hg"] = [cards(x, "h") for x in d.itertuples()]
        d["ag"] = [cards(x, "a") for x in d.itertuples()]
    d = d.dropna(subset=["hg", "ag"])
    d = d[["date", "home", "away", "hg", "ag"]]
    if len(d) < 60:
        return None
    m = fit(d, today, alpha=0.0)
    m.rho = 0.0
    return m


# ---------------- registro público ----------------
def votos_gente(ids):
    """Votos de '¿Quién gana?' guardados en el servidor de Cloudflare (dirección en site/avisos.json)."""
    try:
        with open(os.path.join(RAIZ, "site", "avisos.json"), encoding="utf-8") as f:
            url = json.load(f).get("url")
    except (OSError, ValueError):
        url = None
    if not url or not ids:
        return {}
    import urllib.request
    out = {}
    for i in range(0, len(ids), 60):
        try:
            req = urllib.request.Request(url + "/votos?ids=" + ",".join(ids[i:i + 60]), headers={"User-Agent": "Ballytics robot"})
            with urllib.request.urlopen(req, timeout=20) as r:
                out.update(json.loads(r.read().decode("utf-8")))
        except Exception as e:
            print(f"  (sin votos de la gente: {e})")
            break
    return out


try:
    with open(REG_JUG, encoding="utf-8") as _f:
        REGJ = json.load(_f)
except (OSError, ValueError):
    REGJ = {}


def pois_over(line, lam):
    """P(X > line) para X ~ Poisson(lam): lo mismo que muestra el sitio para córners y tarjetas."""
    k = int(math.floor(line))
    term = cdf = math.exp(-lam)
    for i in range(1, k + 1):
        term *= lam / i
        cdf += term
    return 1 - cdf


def binario(p, y):
    """Acierto, log-loss y log-loss ingenuo (siempre la frecuencia observada) de una probabilidad sí/no."""
    p, y = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6), np.asarray(y, bool)
    base = np.clip(y.mean(), 1e-6, 1 - 1e-6)
    ll = -np.mean(np.where(y, np.log(p), np.log(1 - p)))
    ing = -np.mean(np.where(y, np.log(base), np.log(1 - base)))
    return dict(n=int(len(y)), acierto=r(((p > .5) == y).mean()), logloss=r(ll), ingenuo=r(ing), prob=r(p.mean()), real=r(y.mean()))


def props(clave_p, clave_r):
    """Goleadores o amarillas: cuántos se esperaban, cuántos pasaron y si la probabilidad estuvo bien medida."""
    P, Y, top = [], [], []
    for v in REGJ.values():
        if clave_r not in v or v[clave_r] is None or not v.get(clave_p):
            continue
        real = set(v[clave_r])
        for jid, _, p in v[clave_p]:
            P.append(p); Y.append(jid in real)
        top.append(v[clave_p][0][0] in real)
    if len(P) < 10:
        return None
    out = binario(P, Y)
    out.update(partidos=len(top), esperados=r(sum(P), 1), reales=int(sum(Y)), favorito=r(np.mean(top)))
    P, Y = np.array(P), np.array(Y)
    out["tramos"] = [dict(rango=lab, n=int(s.sum()), prob=r(P[s].mean()), real=r(Y[s].mean()))
                     for lo, hi, lab in [(0, .2, "Menos de 20 %"), (.2, .3, "20–30 %"), (.3, .4, "30–40 %"), (.4, 1.01, "40 % o más")]
                     for s in [(P >= lo) & (P < hi)] if s.sum()]
    return out


def ledger_update(pred_rows, jugados, now_iso, votos=None):
    # lh…top = modelo propio; m* = mercado sin margen; f* = probabilidad Ballytics (ajustada a la cuota si la hay)
    cols = ["id", "liga", "kickoff", "home", "away", "lh", "la", "pH", "pD", "pA", "pO25", "pBTTS", "top", "predicho", "hg", "ag", "mH", "mD", "mA",
            "fH", "fD", "fA", "fO25", "fBTTS", "ftop", "jH", "jD", "jA", "jO25", "vH", "vD", "vA", "vN", "cE", "tE", "cR", "tR",
            # CLV: cuota de ESPN (sin margen) la primera vez que aparece (e*) con el modelo propio de ese momento (o*), y la última antes del inicio (k*)
            "eH", "eD", "eA", "oH", "oD", "oA", "et", "kH", "kD", "kA", "kt",
            # tarjetas esperadas ajustadas por el árbitro designado (se mide antes de usarlo en el modelo)
            "tA"]
    reg = pd.read_csv(REGISTRO, dtype={"id": str}) if os.path.exists(REGISTRO) else pd.DataFrame(columns=cols)
    reg = reg.reindex(columns=cols).set_index("id", drop=False)
    for c_ in ("et", "kt", "predicho", "top", "ftop"):   # columnas de texto (fechas y marcadores)
        reg[c_] = reg[c_].astype("object")
    for a, b in (("fH", "pH"), ("fD", "pD"), ("fA", "pA"), ("fO25", "pO25"), ("fBTTS", "pBTTS"), ("ftop", "top")):
        reg[a] = reg[a].where(reg[a].notna(), reg[b])   # filas antiguas: lo publicado era el modelo propio
    for p in pred_rows:
        if p["id"] in reg.index and pd.notna(reg.at[p["id"], "hg"]):
            continue
        own = p.get("modelo") or p
        reg.loc[p["id"], cols[:14]] = [p[c] for c in cols[:5]] + [own[c] for c in cols[5:13]] + [now_iso]
        reg.loc[p["id"], ["fH", "fD", "fA", "fO25", "fBTTS", "ftop"]] = [p["pH"], p["pD"], p["pA"], p["pO25"], p["pBTTS"], p["top"]]
        v = (votos or {}).get(str(p["id"]))
        if v and v.get("n"):
            reg.loc[p["id"], ["vH", "vD", "vA", "vN"]] = [v["H"], v["D"], v["A"], v["n"]]
        aj = p.get("ajuste")
        reg.loc[p["id"], ["jH", "jD", "jA", "jO25"]] = [aj["pH"], aj["pD"], aj["pA"], aj["pO25"]] if aj else [np.nan] * 4
        q, _, _ = mercado_q(p.get("cuotas"), p.get("mercado"))
        if q is not None:
            reg.loc[p["id"], ["mH", "mD", "mA"]] = q.round(4)
        qd, _, _ = mercado_q(p.get("cuotas"), None)   # siempre la misma fuente (ESPN, cada 2 horas) para medir el movimiento
        if qd is not None and pd.Timestamp(now_iso) < pd.Timestamp(p["kickoff"]):
            if pd.isna(reg.at[p["id"], "eH"]):
                reg.loc[p["id"], ["eH", "eD", "eA", "oH", "oD", "oA", "et"]] = [*qd.round(4), own["pH"], own["pD"], own["pA"], now_iso]
            reg.loc[p["id"], ["kH", "kD", "kA", "kt"]] = [*qd.round(4), now_iso]
        reg.loc[p["id"], ["cE", "tE"]] = [r(p["ch"] + p["ca"], 2) if p.get("ch") is not None and p.get("ca") is not None else np.nan,
                                          r(p["th"] + p["ta"], 2) if p.get("th") is not None and p.get("ta") is not None else np.nan]
        ta = (p.get("arbitro") or {}).get("tarjetas_aj")
        reg.loc[p["id"], "tA"] = r(ta, 2) if isinstance(ta, (int, float)) else np.nan
        pj = REGJ.setdefault(str(p["id"]), {})
        if "rg" not in pj:   # mientras no se juegue, se guarda la última predicción antes del partido
            pj["g"] = [[s_["jid"], s_.get("jugador", ""), s_["p"]] for s_ in sorted(p.get("goleadores", []), key=lambda z: -z["p"])[:8]]
            pj["y"] = [[s_["jid"], s_.get("jugador", ""), s_["p"]] for s_ in sorted(p.get("tarjetas_jug", []), key=lambda z: -z["p"])[:8]]
    res = jugados.set_index("id")
    for i in reg.index[reg.hg.isna()]:
        if i in res.index:
            reg.at[i, "hg"], reg.at[i, "ag"] = res.at[i, "hg"], res.at[i, "ag"]
    for i in reg.index:
        ex = EXTRA.get(str(i))
        if not ex:
            continue
        if pd.isna(reg.at[i, "cR"]) and ex["c"] is not None:
            reg.at[i, "cR"] = ex["c"]
        if pd.isna(reg.at[i, "tR"]) and ex["t"] is not None:
            reg.at[i, "tR"] = ex["t"]
        pj = REGJ.get(str(i))
        if pj is not None and "rg" not in pj and ex["g"] is not None:
            pj["rg"], pj["ry"] = ex["g"], ex["y"]
    reg = reg.reset_index(drop=True)[cols].sort_values("kickoff")
    os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
    reg.to_csv(REGISTRO, index=False)
    vivos = set(reg.id.astype(str))
    with open(REG_JUG, "w", encoding="utf-8") as f:
        json.dump({k: v for k, v in REGJ.items() if k in vivos}, f, ensure_ascii=False, separators=(",", ":"))
    return reg


def clv_summary(reg):
    """¿El modelo propio se adelanta al mercado? Para cada partido ya empezado con cuota temprana y de cierre:
    el lado donde el modelo veía más valor contra la cuota temprana (≥ 2 puntos) y cuánto se movió la cuota hacia ese lado."""
    c = reg.dropna(subset=["eH", "oH", "kH", "et", "kt"]).copy()
    out = {"desde": str(reg.et.dropna().min())[:10] if reg.et.notna().any() else None,
           "midiendo": int((reg.eH.notna() & reg.hg.isna()).sum()), "n": 0}
    if not len(c):
        return out
    ahora = pd.Timestamp.now(tz="UTC")
    c = c[pd.to_datetime(c.kickoff, utc=True) < ahora]
    c = c[(pd.to_datetime(c.kt, utc=True) - pd.to_datetime(c.et, utc=True)).dt.total_seconds() >= 6 * 3600]
    if not len(c):
        return out
    E, O, K = (c[cs].astype(float).values for cs in (["eH", "eD", "eA"], ["oH", "oD", "oA"], ["kH", "kD", "kA"]))
    d = O - E; i = d.argmax(1); ix = np.arange(len(c)); fuerza = d[ix, i]
    sel = fuerza >= 0.02
    if not sel.any():
        out["sin_senal"] = int(len(c))
        return out
    mov = K[ix, i] - E[ix, i]                 # cambio de la probabilidad del mercado en ese lado
    cuota = K[ix, i] / np.clip(E[ix, i], 1e-6, None) - 1   # cuánto mejor era la cuota temprana (1/E) que la de cierre (1/K)
    m, cu, cs = mov[sel], cuota[sel], c[sel]
    out.update(n=int(sel.sum()), a_favor=r((m > 0.0025).mean()), en_contra=r((m < -0.0025).mean()),
               mov_pts=r(m.mean() * 100, 2), clv_cuota=r(cu.mean(), 4))
    lados = np.array(["local", "empate", "visita"])[i[sel]]
    por = []
    for lg, idx in pd.Series(range(len(cs)), index=cs.liga.values).groupby(level=0):
        v = idx.values
        if len(v) >= 3:
            por.append(dict(liga=lg, n=int(len(v)), a_favor=r((m[v] > 0.0025).mean()), mov_pts=r(m[v].mean() * 100, 2)))
    out["por_liga"] = sorted(por, key=lambda x: -x["n"])
    ult = cs.assign(lado_=lados, mod_=O[ix, i][sel], tem_=E[ix, i][sel], cie_=K[ix, i][sel]).sort_values("kickoff").tail(12)
    out["ultimos"] = [dict(liga=x.liga, home=x.home, away=x.away, kickoff=x.kickoff, lado=x.lado_, modelo=r(x.mod_), temprana=r(x.tem_), cierre=r(x.cie_)) for x in ult.itertuples()][::-1]
    return out


def ledger_summary(reg, base):
    g = reg.dropna(subset=["hg", "ag"]).copy()
    out = {"desde": None, "n": 0, "filas": [], "serie": []}
    try:
        out["clv"] = clv_summary(reg)
    except Exception as e:   # el CLV nunca debe impedir publicar el registro
        print("  (CLV no calculado:", e, ")")
    if len(reg) and reg.predicho.notna().any():
        out["desde"] = str(reg.predicho.dropna().min())[:10]
    if len(g):
        g["res"] = np.select([g.hg > g.ag, g.hg == g.ag], ["H", "D"], "A")
        # las métricas principales son de la probabilidad Ballytics (la que se publica)
        P = g[["fH", "fD", "fA"]].astype(float).values
        k = g.res.map({"H": 0, "D": 1, "A": 2}).values
        pk = np.clip(P[np.arange(len(k)), k], 1e-9, None)
        bk = np.clip(np.array([base[x] for x in g.res]), 1e-9, None)
        over = ((g.hg + g.ag) > 2.5).values
        po = g.fO25.astype(float).values
        pick = np.array(["H", "D", "A"])[P.argmax(1)]
        hit = pick == g.res.values
        out.update(n=int(len(g)), logloss=r(-np.log(pk).mean()), logloss_ingenuo=r(-np.log(bk).mean()),
                   acierto_1x2=r(hit.mean()), acierto_o25=r(((po > .5) == over).mean()),
                   marcador_exacto=r((g.ftop == g.hg.astype(int).astype(str) + "-" + g.ag.astype(int).astype(str)).mean()))
        g["hit"], g["dia"] = hit, g.kickoff.str[:10]
        acc = g.groupby("dia").hit.agg(["sum", "count"]).cumsum()
        out["serie"] = [dict(dia=d, acierto=r(s / c, 4), n=int(c)) for d, (s, c) in acc.iterrows()]
        por_liga = []
        for lg, gg in g.groupby("liga"):
            kk = gg.res.map({"H": 0, "D": 1, "A": 2}).values
            PP = gg[["fH", "fD", "fA"]].astype(float).values
            por_liga.append(dict(liga=lg, n=int(len(gg)), acierto=r(gg.hit.mean()),
                                 logloss=r(-np.log(np.clip(PP[np.arange(len(kk)), kk], 1e-9, None)).mean())))
        out["por_liga"] = sorted(por_liga, key=lambda x: -x["n"])
        conf = []
        mxp = P.max(1)
        for lo, hi, lab in [(0, .45, "Menos de 45 %"), (.45, .55, "45–55 %"), (.55, .65, "55–65 %"), (.65, 1.01, "Más de 65 %")]:
            sel = (mxp >= lo) & (mxp < hi)
            if sel.sum():
                conf.append(dict(rango=lab, n=int(sel.sum()), prob=r(mxp[sel].mean()), acierto=r(hit[sel].mean())))
        out["confianza"] = conf
        gm = g.dropna(subset=["mH", "mD", "mA"])
        if len(gm) >= 10:
            km = gm.res.map({"H": 0, "D": 1, "A": 2}).values
            ll3 = lambda cs: r(-np.log(np.clip(gm[cs].astype(float).values[np.arange(len(km)), km], 1e-9, None)).mean())
            hit3 = lambda cs: r((gm[cs].astype(float).values.argmax(1) == km).mean())
            out["vs_mercado"] = dict(n=int(len(gm)), modelo=ll3(["pH", "pD", "pA"]), mercado=ll3(["mH", "mD", "mA"]),
                                     ballytics=ll3(["fH", "fD", "fA"]), acierto_modelo=hit3(["pH", "pD", "pA"]),
                                     acierto_mercado=hit3(["mH", "mD", "mA"]), acierto_ballytics=hit3(["fH", "fD", "fA"]))
        gj = g.dropna(subset=["jH", "jD", "jA"])
        if len(gj):
            kj = gj.res.map({"H": 0, "D": 1, "A": 2}).values
            llj = lambda cs: r(-np.log(np.clip(gj[cs].astype(float).values[np.arange(len(kj)), kj], 1e-9, None)).mean())
            out["bajas"] = dict(n=int(len(gj)), modelo=llj(["pH", "pD", "pA"]), con_bajas=llj(["jH", "jD", "jA"]))
        gv = g[pd.to_numeric(g.vN, errors="coerce").fillna(0) >= 3]
        if len(gv):
            kv = gv.res.map({"H": 0, "D": 1, "A": 2}).values
            V = gv[["vH", "vD", "vA"]].astype(float).values
            Vp = (V + 1) / (V.sum(1, keepdims=True) + 3)          # con un voto "de prior" por resultado
            Fb = gv[["fH", "fD", "fA"]].astype(float).values
            out["gente"] = dict(n=int(len(gv)), votos=int(V.sum()),
                                logloss_gente=r(-np.log(np.clip(Vp[np.arange(len(kv)), kv], 1e-9, None)).mean()),
                                logloss_ballytics=r(-np.log(np.clip(Fb[np.arange(len(kv)), kv], 1e-9, None)).mean()),
                                acierto_gente=r((V.argmax(1) == kv).mean()), acierto_ballytics=r((Fb.argmax(1) == kv).mean()))
        probs, hits = P.ravel(), np.eye(3)[k].ravel()
        cal = []
        for lo in np.arange(0, 1, .1):
            s = (probs >= lo) & (probs < lo + .1)
            if s.sum() >= 10:
                cal.append(dict(pred=r(probs[s].mean()), real=r(hits[s].mean()), n=int(s.sum())))
        out["calibracion"] = cal
        mk = {}
        mk["o25"] = binario(g.fO25.astype(float), (g.hg + g.ag) > 2.5)
        gb = g.dropna(subset=["fBTTS"])
        if len(gb):
            mk["btts"] = binario(gb.fBTTS.astype(float), (gb.hg > 0) & (gb.ag > 0))
        for key, e_, r_, line in (("corners", "cE", "cR", 9.5), ("tarjetas", "tE", "tR", 4.5)):
            gc = g.dropna(subset=[e_, r_])
            if len(gc):
                lam = gc[e_].astype(float).values
                mk[key] = dict(binario([pois_over(line, l) for l in lam], gc[r_].astype(float).values > line), linea=line,
                               esperado=r(lam.mean(), 2), promedio_real=r(gc[r_].astype(float).mean(), 2))
        # ¿el árbitro mejora la predicción de tarjetas? mismos partidos, con y sin el ajuste
        ga = g.dropna(subset=["tE", "tA", "tR"])
        if len(ga):
            sin, con, real = ga.tE.astype(float).values, ga.tA.astype(float).values, ga.tR.astype(float).values
            yv = real > 4.5
            mk["arbitro"] = dict(n=int(len(ga)), linea=4.5, real=r(real.mean(), 2), esperado_sin=r(sin.mean(), 2), esperado_con=r(con.mean(), 2),
                                 error_sin=r(np.abs(sin - real).mean(), 3), error_con=r(np.abs(con - real).mean(), 3),
                                 sin=binario([pois_over(4.5, l) for l in sin], yv), con=binario([pois_over(4.5, l) for l in con], yv))
        for key, cp, cr in (("goleadores", "g", "rg"), ("amarillas", "y", "ry")):
            pr = props(cp, cr)
            if pr:
                mk[key] = pr
        out["mercados"] = mk
    # acierto global: cada predicción de sí o no (el lado que Ballytics da como más probable)
    if len(g):
        picks = {"Ganador": hit}
        picks["Más/menos 2,5"] = (g.fO25.astype(float).values > .5) == ((g.hg + g.ag) > 2.5).values
        gb = g.dropna(subset=["fBTTS"])
        picks["Ambos marcan"] = (gb.fBTTS.astype(float).values > .5) == ((gb.hg > 0) & (gb.ag > 0)).values
        for nom, e_, r_, line in (("Córners", "cE", "cR", 9.5), ("Tarjetas", "tE", "tR", 4.5)):
            gc = g.dropna(subset=[e_, r_])
            picks[nom] = np.array([pois_over(line, l) > .5 for l in gc[e_].astype(float)]) == (gc[r_].astype(float).values > line)
        picks = {k: v for k, v in picks.items() if len(v) >= 10}   # un mercado entra al resumen desde 10 partidos calificados
        tot = sum(len(v) for v in picks.values())
        if tot:
            out["global"] = dict(n=int(tot), aciertos=int(sum(int(np.sum(v)) for v in picks.values())),
                                 por=[dict(mercado=k, n=int(len(v)), acierto=r(np.mean(v))) for k, v in picks.items()])
    rows = reg.sort_values("kickoff", ascending=False).head(500)
    filas = clean(rows.to_dict("records"))
    for f in filas:   # goleador y amonestado más probables de cada partido, y si pasó
        pj = REGJ.get(str(f["id"])) or {}
        for k, kr, dst in (("g", "rg", "gol"), ("y", "ry", "ama")):
            if pj.get(k):
                jid, nom, pr = pj[k][0]
                f[dst] = [nom, pr, (jid in pj[kr]) if pj.get(kr) is not None else None]
    out["filas"] = filas
    return out


# ---------------- principal ----------------
XI_CACHE = os.path.join(RAIZ, "data", "cache_espn", "xi")


def xi_ultimo(event_id, team):
    """Titulares y formación de un equipo en un partido ya jugado (sirve de alineación probable para el siguiente)."""
    os.makedirs(XI_CACHE, exist_ok=True)
    path = os.path.join(XI_CACHE, f"{event_id}.json")
    try:
        with open(path, encoding="utf-8") as f:
            ros = json.load(f)
    except (OSError, ValueError):
        try:
            j = datos._fetch(f"https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event={event_id}")
        except Exception:
            return None
        ros = [dict(team=(t.get("team") or {}).get("displayName"), formation=t.get("formation"),
                    xi=[dict(id=str((x.get("athlete") or {}).get("id") or ""), n=(x.get("athlete") or {}).get("displayName"),
                             c=x.get("jersey"), pos=(x.get("position") or {}).get("abbreviation"), fp=x.get("formationPlace"))
                        for x in t.get("roster") or [] if x.get("starter")])
               for t in j.get("rosters") or []]
        if not any(len(t["xi"]) >= 11 for t in ros):
            return None
        with open(path, "w", encoding="utf-8") as f:
            json.dump(ros, f, ensure_ascii=False)
    t = next((t for t in ros if t["team"] == team), None)
    if not t or len(t["xi"]) < 11:
        return None
    return dict(formacion=t["formation"], xi=t["xi"])


def season_bounds(L, today):
    if L["inicio"] == 1:
        sy = today.year
        return date(sy - (TEMPORADAS - 1), 1, 1), pd.Timestamp(sy, 1, 1), date(sy, 12, 31)
    sy = today.year if today.month >= 7 else today.year - 1
    return date(sy - (TEMPORADAS - 1), 7, 1), pd.Timestamp(sy, 7, 1), date(sy + 1, 6, 30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--ligas", nargs="*")
    args = ap.parse_args()
    datos.DEBUG = args.debug
    os.makedirs(SALIDA, exist_ok=True)
    today = date.today()
    rng = np.random.default_rng(int(today.strftime("%Y%m%d")))
    hoy = pd.Timestamp(today)
    now = datetime.now(timezone.utc)
    now_ts = pd.Timestamp(now).tz_localize(None)

    indice, preds_reg, jugados_all, base_cnt = [], [], [], Counter()
    try:
        with open(HISTORIAL, encoding="utf-8") as f:
            hist = json.load(f)
    except (OSError, ValueError):
        hist = {}
    stamp = now.strftime("%Y-%m-%dT%H:%MZ")
    bajas = lesiones.cargar()
    sus = lesiones.suscripcion()
    if sus and sus.get("vence"):
        quedan = (date.fromisoformat(sus["vence"]) - today).days
        print(f"  API-Football: plan {sus.get('plan')} hasta el {sus['vence']} ({quedan} días)")
        if quedan <= 7:   # el workflow abre un issue con este archivo
            with open(os.path.join(RAIZ, "data", "aviso_renovar.txt"), "w", encoding="utf-8") as fa:
                fa.write(f"El plan {sus.get('plan')} de API-Football vence el {sus['vence']} (quedan {quedan} días). "
                         "Sin él, Ballytics deja de mostrar lesiones, árbitros, fotos y xG. Renueva en dashboard.api-football.com.\n")
    xg.recolectar()
    try:   # xG solo si el backtest mensual (pipeline/backtest_xg.py) mostró que mejora
        with open(os.path.join(RAIZ, "data", "backtest_xg.json"), encoding="utf-8") as fx:
            XGC = json.load(fx)
    except (OSError, ValueError):
        XGC = {}
    usar_xg = bool(XGC.get("usar"))
    print(f"  xG: {'sí, peso ' + str(XGC.get('beta')) if usar_xg else 'no (el backtest no mostró mejora o aún no se corre)'}")
    cuotas.cargar([L["id"] for L in LIGAS if not args.ligas or L["id"] in args.ligas])
    pendientes = []
    portada = dict(partidos=[], jugadores=[], equipos=[], rachas=[])
    for L in LIGAS:
        if args.ligas and L["id"] not in args.ligas:
            continue
        print(f"{L['nombre']}: descargando…", flush=True)
        start, cur_start, season_end = season_bounds(L, today)
        d1 = datos.load(L["s1"], start, season_end, today)
        if d1.empty:
            print("  sin datos, la salto")
            continue
        extra = [datos.load(s, start, today, today) for s in L.get("s2", [])]
        both = pd.concat([d1] + [e for e in extra if not e.empty], ignore_index=True)
        played = both[(both.estado == "jugado") & both.hg.notna() & (both.date <= hoy)].drop_duplicates(["date", "home", "away"])
        n_xg = 0
        slugs = [L["s1"]] + L.get("s2", [])
        if usar_xg and any(s in xg.LIGAS for s in slugs):
            played, n_xg, _ = xg.con_xg(played, slugs, start, today)
        if n_xg:
            model = fit(played, today, home_l2=HOME_L2, alpha=XGC.get("alpha", ALPHA), beta=XGC.get("beta", 0.0))
        else:
            model = fit(played, today, home_l2=HOME_L2)
        mc, mt = side_model(played, today, "corners"), side_model(played, today, "tarjetas")

        cur = d1[d1.date >= cur_start]
        jug = cur[(cur.estado == "jugado") & cur.hg.notna()]
        rest = cur[cur.estado.isin(["pendiente", "en_vivo"]) & (cur.date >= hoy - pd.Timedelta(days=1))].sort_values("kickoff")
        p1 = d1[(d1.estado == "jugado") & d1.hg.notna()]
        base_cnt.update(np.select([p1.hg > p1.ag, p1.hg == p1.ag], ["H", "D"], "A").tolist())
        tiene_tabla = L.get("tabla", True)

        teams = sorted(set(cur.home) | set(cur.away))
        info = {}
        for x in cur.itertuples():
            for side in ("home", "away"):
                info[getattr(x, side)] = dict(corto=getattr(x, side + "_corto"), abr=getattr(x, side + "_abr"),
                                              color=getattr(x, side + "_color"), logo=getattr(x, side + "_logo", None))
        mj = model.to_json()
        att_avg = np.mean([mj["equipos"][t][0] for t in teams if t in mj["equipos"]] or [0])
        def_avg = np.mean([mj["equipos"][t][1] for t in teams if t in mj["equipos"]] or [0])
        tabla = standings(jug, teams)
        proy = project(model, tabla, rest[rest.estado == "pendiente"], L.get("zonas", []), rng) if tiene_tabla else {}
        for s in tabla:
            a_, d_ = mj["equipos"].get(s["equipo"], [att_avg, def_avg])
            s.update(proy.get(s["equipo"], {}), ataque=r(np.exp(a_ - att_avg), 3), defensa=r(np.exp(-(d_ - def_avg)), 3))
        stats_eq = team_stats(jug, teams)
        rachas = streaks(jug, teams)
        goleadores, amonestados, goles_cnt, team_games, tarj_cnt = players(jug)
        team_goals = Counter()
        for (jid, team), n in goles_cnt.items():
            team_goals[team] += n
        name_of = {}
        for x in jug.itertuples():
            e = getattr(x, "eventos", None)
            if isinstance(e, list):
                for v in e:
                    if v.get("jid"):
                        name_of[v["jid"]] = v.get("jug")

        partidos, n_calib = [], 0
        limite = hoy + pd.Timedelta(days=DETALLE_DIAS)
        for x in rest.itertuples():
            lh, la = model.rates(x.home, x.away)
            mk = markets(model.matrix(x.home, x.away))
            solo = dict(lh=r(lh, 3), la=r(la, 3), pH=r(mk["H"]), pD=r(mk["D"]), pA=r(mk["A"]),
                        pO25=r(mk["O25"]), pBTTS=r(mk["BTTS"]), top=mk["top"])
            p = dict(id=x.id or f"{x.kickoff}-{x.home}", liga=L["id"], kickoff=x.kickoff, home=x.home, away=x.away,
                     estado=x.estado, **solo)
            lam = None
            od = getattr(x, "odds", None)
            od = od if isinstance(od, dict) else None
            if od:
                p["cuotas"] = od   # DraftKings vía ESPN (precarga la pestaña Mercados)
            mq = cuotas.buscar(L["id"], x.kickoff, x.home, x.away)   # Pinnacle o promedio de casas (The Odds API)
            if mq:
                p["mercado"] = mq
                cuotas.ESTADO["partidos_con_cuota"] += 1
            if od or mq:
                # Probabilidad Ballytics: goles esperados ajustados al mercado; el modelo propio queda en p["modelo"]
                cal = calibrar(od, model.rho, lh, la, mq)
                if cal:
                    lam = cal
                    fm = markets(score_matrix(cal[0], cal[1], model.rho))
                    p["modelo"] = solo
                    p.update(lh=r(cal[0], 3), la=r(cal[1], 3), pH=r(fm["H"]), pD=r(fm["D"]), pA=r(fm["A"]),
                             pO25=r(fm["O25"]), pBTTS=r(fm["BTTS"]), top=fm["top"], calib=1)
                    n_calib += 1
            if x.date <= limite:
                if mc:
                    p["ch"], p["ca"] = (r(v, 3) for v in mc.rates(x.home, x.away))
                if mt:
                    p["th"], p["ta"] = (r(v, 3) for v in mt.rates(x.home, x.away))
                p["goleadores"] = [dict(s, jugador=name_of.get(s["jid"], "")) for s in scorer_probs(model, x.home, x.away, goles_cnt, team_goals, lam)]
                p["h2h"] = h2h(both, x.home, x.away)
                if mt and tarj_cnt:
                    ct = card_probs(x.home, x.away, tarj_cnt, team_games, p.get("th"), p.get("ta"))
                    if ct:
                        p["tarjetas_jug"] = [dict(c, jugador=name_of.get(c["jid"], "")) for c in ct]
            if x.estado == "pendiente":
                h = hist.setdefault(str(p["id"]), {"k": p["kickoff"], "s": []})
                last = h["s"][-1] if h["s"] else None
                if not last or max(abs(last[1] - p["pH"]), abs(last[2] - p["pD"]), abs(last[3] - p["pA"])) >= 0.004:
                    h["s"].append([stamp, p["pH"], p["pD"], p["pA"]])
                    h["s"] = h["s"][-40:]
                if len(h["s"]) >= 2:
                    p["hist"] = h["s"][-24:]
            if x.estado == "pendiente" and pd.Timestamp(x.kickoff).tz_localize(None) > now_ts and x.date <= hoy + pd.Timedelta(days=3):
                xi = {}
                for lado, team in (("h", x.home), ("a", x.away)):
                    prev = played[(played.home == team) | (played.away == team)]
                    if len(prev):
                        u = prev.sort_values("kickoff").iloc[-1]
                        t = xi_ultimo(str(u.id), team)
                        if t:
                            t["desde"] = dict(fecha=str(u.date.date()), rival=u.away if u.home == team else u.home)
                            xi[lado] = t
                if xi:
                    p["xi_prob"] = xi
            partidos.append(p)
            if x.estado == "pendiente" and pd.Timestamp(x.kickoff).tz_localize(None) > now_ts and x.date <= hoy + pd.Timedelta(days=8):
                preds_reg.append(p)
        resultados = []
        for x in jug.sort_values("kickoff", ascending=False).itertuples():
            e = getattr(x, "eventos", None)
            rr = dict(id=x.id, kickoff=x.kickoff, home=x.home, away=x.away, hg=int(x.hg), ag=int(x.ag),
                      goles=[dict(lado=v["lado"], min=v["min"], jug=v["jug"], pen=v["pen"], og=v["og"])
                             for v in (e or []) if v["t"] == "G"])
            ch, ca = stat(x, "h", "wonCorners"), stat(x, "a", "wonCorners")
            if ch == ch and ca == ca:
                rr["c"] = [int(ch), int(ca)]
            ex = dict(c=int(ch + ca) if ch == ch and ca == ca else None, t=None, g=None, y=None)
            if eventos_completos(x):
                rr["t"] = [int(cards(x, "h")), int(cards(x, "a"))]
                ex["t"] = rr["t"][0] + rr["t"][1]
                if all(v.get("jid") for v in e if v["t"] in ("G", "Y")):   # sin el id del jugador no se puede calificar
                    ex.update(g=[v["jid"] for v in e if v["t"] == "G" and not v["og"]], y=[v["jid"] for v in e if v["t"] == "Y"])
            EXTRA[str(x.id)] = ex
            resultados.append(rr)
        jugados_all.append(jug[["id", "hg", "ag"]])

        # portada: candidatos de esta liga
        fuerza = {s["equipo"]: (s["ataque"] or 1) / (s["defensa"] or 1) for s in tabla}
        for p in partidos:
            k = pd.Timestamp(p["kickoff"]).tz_localize(None)
            if now_ts - pd.Timedelta(hours=2) <= k <= now_ts + pd.Timedelta(days=4):
                peso = min(fuerza.get(p["home"], 1), fuerza.get(p["away"], 1)) * (1 - abs(p["pH"] - p["pA"]) * .5) * L.get("peso", 1.0)
                portada["partidos"].append(dict(liga=L["id"], id=p["id"], peso=r(peso, 4), kickoff=p["kickoff"]))
        for p in partidos:
            k = pd.Timestamp(p["kickoff"]).tz_localize(None)
            if now_ts <= k <= now_ts + pd.Timedelta(days=7):
                for g in p.get("goleadores", []):
                    eqp = p["home"] if g["lado"] == "h" else p["away"]
                    gl = next((x for x in goleadores if x["jid"] == g["jid"] and x["equipo"] == eqp), None)
                    if gl and gl["goles"] >= 3:
                        portada["jugadores"].append(dict(liga=L["id"], partido=p["id"], jid=g["jid"], jugador=gl["jugador"],
                                                         equipo=eqp, p=g["p"], goles=gl["goles"], ult5=gl["ult5"]))
        for s in tabla:
            f = s["forma"]
            if len(f) == 5:
                pf = sum({"G": 3, "E": 1, "P": 0}[c] for c in f)
                portada["equipos"].append(dict(liga=L["id"], equipo=s["equipo"], puntos5=pf, pos=s["pos"]))
        for rr in rachas[:6]:
            portada["rachas"].append(dict(rr, liga=L["id"]))

        grupos = datos.standings(L["s1"]) if L.get("oficial") else []
        copa = None
        try:
            if L["s1"].startswith("uefa.") and grupos and len(grupos[0]["filas"]) >= 30:
                pend = [p for p in partidos if p["estado"] == "pendiente"]
                copa = copas.fase_liga(model, grupos[0]["filas"], pend, rng)
            elif L["s1"].startswith("conmebol."):
                copa = copas.llaves(model, d1, hoy)
        except Exception as e:
            print(f"  (sin simulación de copa: {e})")
        meta = dict(datos.meta(L["s1"]))
        if LOGOS.get(L["s1"]):          # logo revisado a mano (ESPN tiene algunos viejos o genéricos)
            meta["logo"] = LOGOS[L["s1"]]
        out = dict(id=L["id"], nombre=L["nombre"], pais=L["pais"], region=L["region"], logo=meta.get("logo"),
                   actualizado=now.isoformat(timespec="minutes"), datos_hasta=str(p1.date.max().date()) if len(p1) else None,
                   usa_tiros=model.usa_tiros, usa_xg=bool(n_xg), tabla_ok=tiene_tabla, zonas=[dict(desde=a, hasta=b, nombre=n, cls=c) for a, b, n, c in L.get("zonas", [])],
                   modelo=mj, modelo_corners=mc.to_json() if mc else None, modelo_tarjetas=mt.to_json() if mt else None,
                   slug=L["s1"], grupos=grupos, equipos=info, tabla=tabla, stats=stats_eq, rachas=rachas, goleadores=goleadores, amonestados=amonestados,
                   partidos=partidos, resultados=resultados, copa=copa)
        # partidos jugados de la liga en las últimas temporadas, para el historial de los árbitros
        hist_arb = []
        for x in p1.itertuples():
            fh_, fa_ = stat(x, "h", "foulsCommitted"), stat(x, "a", "foulsCommitted")
            hist_arb.append(dict(kickoff=x.kickoff, home=x.home, away=x.away, hg=x.hg, ag=x.ag, ev=getattr(x, "eventos", None),
                                 fh=int(fh_) if fh_ == fh_ else None, fa=int(fa_) if fa_ == fa_ else None))
        pendientes.append((L, out, dict(model=model, goles=goles_cnt, team_goals=team_goals, name_of=name_of, hist_arb=hist_arb)))
        indice.append(dict(id=L["id"], slug=L["s1"], nombre=L["nombre"], pais=L["pais"], region=L["region"], logo=meta.get("logo"),
                           datos_hasta=out["datos_hasta"], proximos=len(partidos)))
        print(f"  {len(jug)} jugados · {len(partidos)} por jugar · datos hasta {out['datos_hasta']} · "
              f"córners {'sí' if mc else 'no'} · tarjetas {'sí' if mt else 'no'} · {len(goleadores)} goleadores · "
              f"{n_calib} ajustados a la cuota" + (f" · {n_xg} con xG" if n_xg else ""), flush=True)

    if not indice:
        print("No conseguí datos de ninguna liga. Revisa la conexión y vuelve a intentar.")
        sys.exit(1)
    tot = sum(base_cnt.values()) or 1
    base = {k: base_cnt[k] / tot for k in ("H", "D", "A")}
    limite_hist = (now_ts - pd.Timedelta(days=3)).isoformat()
    hist = {k: v for k, v in hist.items() if v.get("k", "") >= limite_hist}
    with open(HISTORIAL, "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))

    # bajas (API-Football): se asignan con todos los partidos de todas las ligas a la vista
    if bajas:
        cand = [(f"{L['id']}|{i}", p["kickoff"], p["home"], p["away"]) for L, out, _ in pendientes
                for i, p in enumerate(out["partidos"]) if "goleadores" in p]
        asign = lesiones.asignar(bajas, cand)
        n_aj = 0
        for L, out, ctx in pendientes:
            for i, p in enumerate(out["partidos"]):
                bj = asign.get(f"{L['id']}|{i}")
                if not bj:
                    continue
                share = {}
                for lado, team in (("h", p["home"]), ("a", p["away"])):
                    tot, perdido = max(ctx["team_goals"].get(team, 0), 1), 0
                    for b in bj[lado]:
                        hits = [(jid, n) for (jid, t), n in ctx["goles"].items() if t == team and lesiones.jugador_igual(b["jug"], ctx["name_of"].get(jid, ""))]
                        g = sum(n for _, n in hits)
                        b["goles"] = g
                        if hits and str(hits[0][0]).isdigit():
                            b["jid"] = hits[0][0]   # número de ESPN, para la foto
                        if not b.get("foto"):
                            b.pop("foto", None)
                        if b.get("tipo") == "Missing Fixture":
                            perdido += g
                    share[lado] = min(perdido / tot, 0.6)
                p["bajas"] = bj
                if share["h"] > 0 or share["a"] > 0:
                    # cada gol "perdido" se compensa en parte con el reemplazo: se descuenta el 40 %
                    base_m = p.get("modelo") or p   # el ajuste se aplica al modelo propio; la cuota ya considera las bajas conocidas
                    lh2, la2 = base_m["lh"] * (1 - 0.4 * share["h"]), base_m["la"] * (1 - 0.4 * share["a"])
                    mk2 = markets(score_matrix(lh2, la2, ctx["model"].rho))
                    p["ajuste"] = dict(lh=r(lh2, 3), la=r(la2, 3), pH=r(mk2["H"]), pD=r(mk2["D"]), pA=r(mk2["A"]),
                                       pO25=r(mk2["O25"]), pBTTS=r(mk2["BTTS"]), top=mk2["top"])
                    n_aj += 1
        lesiones.ESTADO["partidos_con_bajas"] = len(asign)
        lesiones.ESTADO["partidos_ajustados"] = n_aj
        print(f"  Bajas asignadas a {len(asign)} partidos · {n_aj} con ajuste por goleadores ausentes")
    fotos.actualizar([(L, out) for L, out, _ in pendientes])
    try:   # árbitros (API-Football): nunca deben impedir publicar
        arbitros.actualizar_ligas([(L, out) for L, out, _ in pendientes])
        arbitros.actualizar_dias()
        arbitros.historial([(L, out, c["hist_arb"]) for L, out, c in pendientes])
    except Exception as e:
        print("  ✗ árbitros:", e)
    # registro público (después de las bajas, para guardar también el modelo con bajas)
    jug_df = pd.concat(jugados_all, ignore_index=True) if jugados_all else pd.DataFrame(columns=["id", "hg", "ag"])
    reg = ledger_update(preds_reg, jug_df, now.isoformat(timespec="minutes"), votos_gente([str(p["id"]) for p in preds_reg]))
    resumen_reg = ledger_summary(reg, base)
    try:   # backtest del árbitro con la temporada (sin mirar el partido que se predice)
        resumen_reg["arbitro_bt"] = arbitros.backtest([(L, out) for L, out, _ in pendientes], reg)
    except Exception as e:
        print("  (backtest del árbitro no calculado:", e, ")")
    with open(os.path.join(SALIDA, "registro.json"), "w", encoding="utf-8") as f:
        json.dump(resumen_reg, f, ensure_ascii=False, separators=(",", ":"))
    try:   # picks públicos: nunca deben impedir publicar
        pp = picks_publicos.actualizar([(L["id"], p) for L, out, _ in pendientes for p in out["partidos"]], jug_df, now)
        with open(os.path.join(SALIDA, "picks_publicos.json"), "w", encoding="utf-8") as f:
            json.dump(clean(pp), f, ensure_ascii=False, separators=(",", ":"))
    except Exception as e:
        print("  ✗ picks públicos:", e)
    for L, out, _ in pendientes:
        with open(os.path.join(SALIDA, f"{L['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(clean(out), f, ensure_ascii=False, separators=(",", ":"))
    # marcador más probable de cada partido próximo: Ballytics juega con él en los prodes (lo lee el worker)
    picks = {str(p["id"]): p["top"] for L, out, _ in pendientes for p in out["partidos"] if p.get("top")}
    with open(os.path.join(SALIDA, "picks.json"), "w", encoding="utf-8") as f:
        json.dump(dict(actualizado=now.isoformat(timespec="minutes"), picks=picks), f, ensure_ascii=False, separators=(",", ":"))
    lesiones.guardar_estado()
    cuotas.guardar_estado()
    portada["partidos"] = sorted(portada["partidos"], key=lambda p: -p["peso"])[:6]
    portada["jugadores"] = sorted(portada["jugadores"], key=lambda p: -p["p"])[:6]
    portada["equipos"] = sorted(portada["equipos"], key=lambda p: (-p["puntos5"], p["pos"]))[:6]
    portada["rachas"] = sorted(portada["rachas"], key=lambda p: -p["n"])[:8]
    with open(os.path.join(SALIDA, "indice.json"), "w", encoding="utf-8") as f:
        try:
            with open(os.path.join(os.path.dirname(__file__), "backtest_mercado.json"), encoding="utf-8") as fb:
                bt_mercado = json.load(fb)
        except (OSError, ValueError):
            bt_mercado = None
        json.dump(clean(dict(actualizado=now.isoformat(timespec="minutes"), xi=XI, alpha=ALPHA, ligas=indice, portada=portada, backtest_mercado=bt_mercado,
                             api_football=dict(activa=lesiones.ESTADO["activa"], bajas=len(bajas), restantes=lesiones.ESTADO["restantes"]),
                             odds_api=dict(activa=cuotas.ESTADO["activa"], partidos=cuotas.ESTADO["partidos_con_cuota"], restantes=cuotas.ESTADO["restantes"]))),
                  f, ensure_ascii=False, separators=(",", ":"))
    print("Listo: datos en site/data/")


if __name__ == "__main__":
    main()
