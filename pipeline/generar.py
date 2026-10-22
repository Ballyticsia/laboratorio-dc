"""
generar.py — descarga datos, reajusta el modelo y escribe los JSON que lee el sitio.

Uso local:   python pipeline/generar.py            (desde la carpeta del proyecto)
             python pipeline/generar.py --debug    (guarda una respuesta cruda de ESPN)
En GitHub:   lo corre .github/workflows/actualizar.yml todos los días.
"""
import argparse
import json
import os
import sys
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

LIGAS = [  # id, nombre, país, ESPN 1ª, ESPN 2ª, cupos "top" y descenso para la proyección
    {"id": "premier", "nombre": "Premier League", "pais": "Inglaterra", "s1": "eng.1", "s2": "eng.2", "top": 4, "desc": 3},
    {"id": "laliga", "nombre": "LaLiga", "pais": "España", "s1": "esp.1", "s2": "esp.2", "top": 4, "desc": 3},
    {"id": "seriea", "nombre": "Serie A", "pais": "Italia", "s1": "ita.1", "s2": "ita.2", "top": 4, "desc": 3},
    {"id": "bundesliga", "nombre": "Bundesliga", "pais": "Alemania", "s1": "ger.1", "s2": "ger.2", "top": 4, "desc": 3},
    {"id": "ligue1", "nombre": "Ligue 1", "pais": "Francia", "s1": "fra.1", "s2": "fra.2", "top": 3, "desc": 3},
]


def r(x, n=4):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


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


def project(model, tabla, restantes, top, desc, rng):
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
    rank = np.argsort(np.argsort(-(pts + rng.random(pts.shape) * 1e-3), axis=1), axis=1)  # 0 = primero
    n = len(teams)
    return {t: dict(pts_esp=r(pts[:, i].mean(), 1), p_campeon=r((rank[:, i] == 0).mean(), 4),
                    p_top=r((rank[:, i] < top).mean(), 4), p_desc=r((rank[:, i] >= n - desc).mean(), 4))
            for t, i in idx.items()}


def ledger_update(pred_rows, jugados, now_iso):
    cols = ["id", "liga", "kickoff", "home", "away", "lh", "la", "pH", "pD", "pA", "pO25", "pBTTS", "top", "predicho", "hg", "ag"]
    reg = pd.read_csv(REGISTRO, dtype={"id": str}) if os.path.exists(REGISTRO) else pd.DataFrame(columns=cols)
    reg = reg.set_index("id", drop=False)
    for p in pred_rows:  # solo partidos que aún no empiezan: se guarda la última predicción antes del inicio
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
    out = {"desde": None, "n": 0, "filas": []}
    if len(reg):
        out["desde"] = str(reg.predicho.dropna().min())[:10] if reg.predicho.notna().any() else None
    if len(g):
        g["res"] = np.select([g.hg > g.ag, g.hg == g.ag], ["H", "D"], "A")
        P = g[["pH", "pD", "pA"]].astype(float).values
        k = g.res.map({"H": 0, "D": 1, "A": 2}).values
        pk = np.clip(P[np.arange(len(k)), k], 1e-9, None)
        bk = np.clip(np.array([base[x] for x in g.res]), 1e-9, None)
        over = ((g.hg + g.ag) > 2.5).values
        po = g.pO25.astype(float).values
        pick = np.array(["H", "D", "A"])[P.argmax(1)]
        out.update(n=int(len(g)), logloss=r(-np.log(pk).mean()), logloss_ingenuo=r(-np.log(bk).mean()),
                   acierto_1x2=r((pick == g.res.values).mean()),
                   acierto_o25=r(((po > .5) == over).mean()),
                   marcador_exacto=r((g.top == g.hg.astype(int).astype(str) + "-" + g.ag.astype(int).astype(str)).mean()))
        probs, hits = P.ravel(), np.eye(3)[k].ravel()
        cal = []
        for lo in np.arange(0, 1, .1):
            s = (probs >= lo) & (probs < lo + .1)
            if s.sum() >= 10:
                cal.append(dict(pred=r(probs[s].mean()), real=r(hits[s].mean()), n=int(s.sum())))
        out["calibracion"] = cal
    rows = reg.sort_values("kickoff", ascending=False).head(400)
    out["filas"] = [{k2: (None if (isinstance(v, float) and np.isnan(v)) else v) for k2, v in x.items()}
                    for x in rows.to_dict("records")]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--ligas", nargs="*")
    args = ap.parse_args()
    datos.DEBUG = args.debug
    os.makedirs(SALIDA, exist_ok=True)
    rng = np.random.default_rng(int(date.today().strftime("%Y%m%d")))
    today = date.today()
    hoy = pd.Timestamp(today)
    now = datetime.now(timezone.utc)
    sy = today.year if today.month >= 7 else today.year - 1
    start, cur_start, season_end = date(sy - (TEMPORADAS - 1), 7, 1), pd.Timestamp(sy, 7, 1), date(sy + 1, 6, 30)

    indice, preds_reg, jugados_all, base_cnt = [], [], [], {"H": 0, "D": 0, "A": 0}
    for L in LIGAS:
        if args.ligas and L["id"] not in args.ligas:
            continue
        print(f"{L['nombre']}: descargando…", flush=True)
        d1 = datos.load(L["s1"], start, season_end, today)
        d2 = datos.load(L["s2"], start, today, today)
        if d1.empty:
            print("  sin datos, la salto")
            continue
        both = pd.concat([d1, d2], ignore_index=True)
        played = both[(both.estado == "jugado") & both.hg.notna() & (both.date <= hoy)]
        model = fit(played, today)
        cur = d1[d1.date >= cur_start]
        jug = cur[(cur.estado == "jugado") & cur.hg.notna()]
        rest = cur[cur.estado.isin(["pendiente", "en_vivo"]) & (cur.date >= hoy - pd.Timedelta(days=1))]
        p1 = d1[(d1.estado == "jugado") & d1.hg.notna()]
        for res in np.select([p1.hg > p1.ag, p1.hg == p1.ag], ["H", "D"], "A"):
            base_cnt[res] += 1

        teams = sorted(set(cur.home) | set(cur.away))
        info = {}
        for side in ("home", "away"):
            for x in cur.itertuples():
                info[getattr(x, side)] = dict(corto=getattr(x, side + "_corto"), abr=getattr(x, side + "_abr"),
                                              color=getattr(x, side + "_color"), logo=getattr(x, side + "_logo", None))
        tabla = standings(jug, teams)
        proy = project(model, tabla, rest[rest.estado == "pendiente"], L["top"], L["desc"], rng)
        mj = model.to_json()
        att_avg = np.mean([mj["equipos"][t][0] for t in teams if t in mj["equipos"]])
        def_avg = np.mean([mj["equipos"][t][1] for t in teams if t in mj["equipos"]])
        for s in tabla:
            a_, d_ = mj["equipos"].get(s["equipo"], [att_avg, def_avg])
            s.update(proy.get(s["equipo"], {}), ataque=r(np.exp(a_ - att_avg), 3), defensa=r(np.exp(-(d_ - def_avg)), 3),
                     **info.get(s["equipo"], {}))

        partidos = []
        for x in rest.itertuples():
            lh, la = model.rates(x.home, x.away)
            mk = markets(model.matrix(x.home, x.away))
            p = dict(id=x.id or f"{x.kickoff}-{x.home}", liga=L["id"], kickoff=x.kickoff, home=x.home, away=x.away,
                     estado=x.estado, lh=r(lh, 3), la=r(la, 3), pH=r(mk["H"]), pD=r(mk["D"]), pA=r(mk["A"]),
                     pO25=r(mk["O25"]), pBTTS=r(mk["BTTS"]), top=mk["top"])
            partidos.append(p)
            if x.estado == "pendiente" and pd.Timestamp(x.kickoff) > pd.Timestamp(now) and x.date <= hoy + pd.Timedelta(days=8):
                preds_reg.append(p)
        resultados = [dict(id=x.id, kickoff=x.kickoff, home=x.home, away=x.away, hg=int(x.hg), ag=int(x.ag))
                      for x in jug.sort_values("kickoff", ascending=False).itertuples()]
        jugados_all.append(jug[["id", "hg", "ag"]])

        out = dict(id=L["id"], nombre=L["nombre"], pais=L["pais"], actualizado=now.isoformat(timespec="minutes"),
                   datos_hasta=str(p1.date.max().date()), usa_tiros=model.usa_tiros, top=L["top"], desc=L["desc"],
                   modelo=mj, equipos=info, tabla=tabla, partidos=partidos, resultados=resultados)
        with open(os.path.join(SALIDA, f"{L['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        indice.append(dict(id=L["id"], nombre=L["nombre"], pais=L["pais"], datos_hasta=out["datos_hasta"],
                           proximos=len(partidos)))
        print(f"  {len(jug)} jugados esta temporada · {len(partidos)} por jugar · datos hasta {out['datos_hasta']} · "
              f"{'con' if model.usa_tiros else 'sin'} tiros al arco", flush=True)

    if not indice:
        print("No conseguí datos de ninguna liga. Revisa la conexión y vuelve a intentar.")
        sys.exit(1)
    tot = sum(base_cnt.values()) or 1
    base = {k: v / tot for k, v in base_cnt.items()}
    jug_df = pd.concat(jugados_all, ignore_index=True) if jugados_all else pd.DataFrame(columns=["id", "hg", "ag"])
    reg = ledger_update(preds_reg, jug_df, now.isoformat(timespec="minutes"))
    with open(os.path.join(SALIDA, "registro.json"), "w", encoding="utf-8") as f:
        json.dump(ledger_summary(reg, base), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(SALIDA, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(dict(actualizado=now.isoformat(timespec="minutes"), xi=XI, alpha=ALPHA, ligas=indice), f, ensure_ascii=False)
    print("Listo: datos en site/data/")


if __name__ == "__main__":
    main()
