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
from modelo import XI, ALPHA, fit, markets  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SALIDA = os.path.join(RAIZ, "site", "data")
REGISTRO = os.path.join(RAIZ, "data", "registro.csv")
TEMPORADAS = 3
SIMS = 10000
DETALLE_DIAS = 21   # partidos con análisis completo (córners, tarjetas, goleadores, h2h)

# zonas: (desde, hasta, etiqueta, clase CSS). "inicio": mes en que empieza la temporada.
EUROPA = "Europa"
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
    dict(id="chile", peso=0.9, nombre="Primera División", pais="Chile", region="Sudamérica", s1="chi.1", s2=[], inicio=1,
         zonas=[(1, 1, "Libertadores (fase de grupos)", "cl"), (2, 3, "Libertadores (previa)", "el"), (4, 7, "Sudamericana", "ecl"), (15, 16, "Descenso", "desc")]),
    dict(id="argentina", peso=0.85, nombre="Liga Profesional", pais="Argentina", region="Sudamérica", s1="arg.1", s2=[], inicio=1, tabla=False),
    dict(id="brasil", peso=0.85, nombre="Brasileirão", pais="Brasil", region="Sudamérica", s1="bra.1", s2=[], inicio=1,
         zonas=[(1, 4, "Libertadores (fase de grupos)", "cl"), (5, 6, "Libertadores (previa)", "el"), (7, 12, "Sudamericana", "ecl"), (17, 20, "Descenso", "desc")]),
    dict(id="mls", peso=0.75, nombre="MLS", pais="Estados Unidos", region="Norteamérica", s1="usa.1", s2=[], inicio=1, tabla=False),
    dict(id="champions", peso=1.2, nombre="Champions League", pais="UEFA", region="Copas", s1="uefa.champions", s2=["uefa.europa", "uefa.europa.conf"], inicio=7, tabla=False),
    dict(id="libertadores", peso=1.0, nombre="Copa Libertadores", pais="CONMEBOL", region="Copas", s1="conmebol.libertadores", s2=["conmebol.sudamericana"], inicio=1, tabla=False),
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
    return gol, tar, goles, team_games


def scorer_probs(model, home, away, goles, team_goals):
    """Probabilidad de que cada goleador marque: 1 − exp(−λ_equipo · parte de los goles del equipo)."""
    lh, la = model.rates(home, away)
    out = []
    for team, lam, lado in ((home, lh, "h"), (away, la, "a")):
        tot = team_goals.get(team, 0)
        cands = sorted(((k, n) for k, n in goles.items() if k[1] == team), key=lambda kv: -kv[1])[:3]
        for (jid, _), n in cands:
            share = min(n / (tot + 2.0), 0.6)
            out.append(dict(jid=jid, lado=lado, goles=n, p=r(1 - math.exp(-lam * share), 3)))
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
def ledger_update(pred_rows, jugados, now_iso):
    cols = ["id", "liga", "kickoff", "home", "away", "lh", "la", "pH", "pD", "pA", "pO25", "pBTTS", "top", "predicho", "hg", "ag"]
    reg = pd.read_csv(REGISTRO, dtype={"id": str}) if os.path.exists(REGISTRO) else pd.DataFrame(columns=cols)
    reg = reg.set_index("id", drop=False)
    for p in pred_rows:
        if p["id"] in reg.index and pd.notna(reg.at[p["id"], "hg"]):
            continue
        reg.loc[p["id"], cols[:14]] = [p[c] for c in cols[:13]] + [now_iso]
    res = jugados.set_index("id")
    for i in reg.index[reg.hg.isna()]:
        if i in res.index:
            reg.at[i, "hg"], reg.at[i, "ag"] = res.at[i, "hg"], res.at[i, "ag"]
    reg = reg.reset_index(drop=True)[cols].sort_values("kickoff")
    os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
    reg.to_csv(REGISTRO, index=False)
    return reg


def ledger_summary(reg, base):
    g = reg.dropna(subset=["hg", "ag"]).copy()
    out = {"desde": None, "n": 0, "filas": [], "serie": []}
    if len(reg) and reg.predicho.notna().any():
        out["desde"] = str(reg.predicho.dropna().min())[:10]
    if len(g):
        g["res"] = np.select([g.hg > g.ag, g.hg == g.ag], ["H", "D"], "A")
        P = g[["pH", "pD", "pA"]].astype(float).values
        k = g.res.map({"H": 0, "D": 1, "A": 2}).values
        pk = np.clip(P[np.arange(len(k)), k], 1e-9, None)
        bk = np.clip(np.array([base[x] for x in g.res]), 1e-9, None)
        over = ((g.hg + g.ag) > 2.5).values
        po = g.pO25.astype(float).values
        pick = np.array(["H", "D", "A"])[P.argmax(1)]
        hit = pick == g.res.values
        out.update(n=int(len(g)), logloss=r(-np.log(pk).mean()), logloss_ingenuo=r(-np.log(bk).mean()),
                   acierto_1x2=r(hit.mean()), acierto_o25=r(((po > .5) == over).mean()),
                   marcador_exacto=r((g.top == g.hg.astype(int).astype(str) + "-" + g.ag.astype(int).astype(str)).mean()))
        g["hit"], g["dia"] = hit, g.kickoff.str[:10]
        acc = g.groupby("dia").hit.agg(["sum", "count"]).cumsum()
        out["serie"] = [dict(dia=d, acierto=r(s / c, 4), n=int(c)) for d, (s, c) in acc.iterrows()]
        probs, hits = P.ravel(), np.eye(3)[k].ravel()
        cal = []
        for lo in np.arange(0, 1, .1):
            s = (probs >= lo) & (probs < lo + .1)
            if s.sum() >= 10:
                cal.append(dict(pred=r(probs[s].mean()), real=r(hits[s].mean()), n=int(s.sum())))
        out["calibracion"] = cal
    rows = reg.sort_values("kickoff", ascending=False).head(500)
    out["filas"] = clean(rows.to_dict("records"))
    return out


# ---------------- principal ----------------
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
        model = fit(played, today)
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
        goleadores, amonestados, goles_cnt, team_games = players(jug)
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

        partidos = []
        limite = hoy + pd.Timedelta(days=DETALLE_DIAS)
        for x in rest.itertuples():
            lh, la = model.rates(x.home, x.away)
            mk = markets(model.matrix(x.home, x.away))
            p = dict(id=x.id or f"{x.kickoff}-{x.home}", liga=L["id"], kickoff=x.kickoff, home=x.home, away=x.away,
                     estado=x.estado, lh=r(lh, 3), la=r(la, 3), pH=r(mk["H"]), pD=r(mk["D"]), pA=r(mk["A"]),
                     pO25=r(mk["O25"]), pBTTS=r(mk["BTTS"]), top=mk["top"])
            if x.date <= limite:
                if mc:
                    p["ch"], p["ca"] = (r(v, 3) for v in mc.rates(x.home, x.away))
                if mt:
                    p["th"], p["ta"] = (r(v, 3) for v in mt.rates(x.home, x.away))
                p["goleadores"] = [dict(s, jugador=name_of.get(s["jid"], "")) for s in scorer_probs(model, x.home, x.away, goles_cnt, team_goals)]
                p["h2h"] = h2h(both, x.home, x.away)
            partidos.append(p)
            if x.estado == "pendiente" and pd.Timestamp(x.kickoff).tz_localize(None) > now_ts and x.date <= hoy + pd.Timedelta(days=8):
                preds_reg.append(p)
        resultados = []
        for x in jug.sort_values("kickoff", ascending=False).itertuples():
            e = getattr(x, "eventos", None)
            resultados.append(dict(id=x.id, kickoff=x.kickoff, home=x.home, away=x.away, hg=int(x.hg), ag=int(x.ag),
                                   goles=[dict(lado=v["lado"], min=v["min"], jug=v["jug"], pen=v["pen"], og=v["og"])
                                          for v in (e or []) if v["t"] == "G"]))
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

        meta = datos.meta(L["s1"])
        out = dict(id=L["id"], nombre=L["nombre"], pais=L["pais"], region=L["region"], logo=meta.get("logo"),
                   actualizado=now.isoformat(timespec="minutes"), datos_hasta=str(p1.date.max().date()) if len(p1) else None,
                   usa_tiros=model.usa_tiros, tabla_ok=tiene_tabla, zonas=[dict(desde=a, hasta=b, nombre=n, cls=c) for a, b, n, c in L.get("zonas", [])],
                   modelo=mj, modelo_corners=mc.to_json() if mc else None, modelo_tarjetas=mt.to_json() if mt else None,
                   equipos=info, tabla=tabla, stats=stats_eq, rachas=rachas, goleadores=goleadores, amonestados=amonestados,
                   partidos=partidos, resultados=resultados)
        with open(os.path.join(SALIDA, f"{L['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(clean(out), f, ensure_ascii=False, separators=(",", ":"))
        indice.append(dict(id=L["id"], nombre=L["nombre"], pais=L["pais"], region=L["region"], logo=meta.get("logo"),
                           datos_hasta=out["datos_hasta"], proximos=len(partidos)))
        print(f"  {len(jug)} jugados · {len(partidos)} por jugar · datos hasta {out['datos_hasta']} · "
              f"córners {'sí' if mc else 'no'} · tarjetas {'sí' if mt else 'no'} · {len(goleadores)} goleadores", flush=True)

    if not indice:
        print("No conseguí datos de ninguna liga. Revisa la conexión y vuelve a intentar.")
        sys.exit(1)
    tot = sum(base_cnt.values()) or 1
    base = {k: base_cnt[k] / tot for k in ("H", "D", "A")}
    jug_df = pd.concat(jugados_all, ignore_index=True) if jugados_all else pd.DataFrame(columns=["id", "hg", "ag"])
    reg = ledger_update(preds_reg, jug_df, now.isoformat(timespec="minutes"))
    with open(os.path.join(SALIDA, "registro.json"), "w", encoding="utf-8") as f:
        json.dump(ledger_summary(reg, base), f, ensure_ascii=False, separators=(",", ":"))

    portada["partidos"] = sorted(portada["partidos"], key=lambda p: -p["peso"])[:6]
    portada["jugadores"] = sorted(portada["jugadores"], key=lambda p: -p["p"])[:6]
    portada["equipos"] = sorted(portada["equipos"], key=lambda p: (-p["puntos5"], p["pos"]))[:6]
    portada["rachas"] = sorted(portada["rachas"], key=lambda p: -p["n"])[:8]
    with open(os.path.join(SALIDA, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(clean(dict(actualizado=now.isoformat(timespec="minutes"), xi=XI, alpha=ALPHA, ligas=indice, portada=portada)),
                  f, ensure_ascii=False, separators=(",", ":"))
    print("Listo: datos en site/data/")


if __name__ == "__main__":
    main()
