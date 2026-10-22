"""¿Mejora el modelo si usa goles esperados (xG)? Backtest walk-forward de los últimos 12 meses.
Usa el xG que el robot va guardando desde API-Football (data/xg/partidos.json).

Cada semana se reajusta el modelo solo con partidos anteriores y se predicen los de esa semana,
con distintos pesos de xG. Resultado en data/backtest_xg.json; generar.py usa xG solo si mejora.
Se corre a mano o una vez al mes con .github/workflows/backtest_xg.yml.
"""
import json
import os
import sys
from datetime import date

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import datos  # noqa: E402
import generar  # noqa: E402
import xg  # noqa: E402
from modelo import fit, markets  # noqa: E402

VARIANTES = [(0.3, 0.0), (0.3, 0.3), (0.3, 0.5), (0.0, 0.5), (0.3, 0.7), (0.0, 0.7)]   # (peso tiros, peso xG)
LIGAS_XG = ["premier", "laliga", "seriea", "bundesliga", "ligue1", "championship", "champions"]
SALIDA = os.path.join(generar.RAIZ, "data", "backtest_xg.json")


def main():
    today = date.today()
    hoy = pd.Timestamp(today)
    res, cobertura = {}, {}
    for L in generar.LIGAS:
        if L["id"] not in LIGAS_XG:
            continue
        print(L["nombre"], flush=True)
        start, _, season_end = generar.season_bounds(L, today)
        d1 = datos.load(L["s1"], start, season_end, today)
        extra = [datos.load(s, start, today, today) for s in L.get("s2", [])]
        both = pd.concat([d1] + [e for e in extra if not e.empty], ignore_index=True)
        played = both[(both.estado == "jugado") & both.hg.notna() & (both.date <= hoy)].drop_duplicates(["date", "home", "away"])
        played, n_xg, n_u = xg.con_xg(played, [L["s1"]] + L.get("s2", []), start, today)
        cobertura[L["id"]] = dict(partidos=int(len(played)), con_xg=int(n_xg), understat=int(n_u))
        print(f"  {len(played)} partidos · {n_xg} con xG (Understat: {n_u})", flush=True)
        if n_xg < 200:
            continue
        k1 = set(zip(d1.date, d1.home, d1.away))
        es1 = np.array([(a, b, c) in k1 for a, b, c in zip(played.date, played.home, played.away)], dtype=bool)
        test = played[es1 & (played.date > hoy - pd.Timedelta(days=365)).values].copy()
        test["wk"] = test.date.dt.to_period("W-MON").dt.start_time
        filas = []
        for wk, games in test.groupby("wk"):
            train = played[played.date < wk]
            if len(train) < 300:
                continue
            mods = {v: fit(train, wk, alpha=v[0], home_l2=generar.HOME_L2, beta=v[1]) for v in VARIANTES}
            for g in games.itertuples():
                y = 0 if g.hg > g.ag else 1 if g.hg == g.ag else 2
                o = (g.hg + g.ag) > 2.5
                row = {}
                for v, m in mods.items():
                    if g.home not in m.att or g.away not in m.att:
                        row = None
                        break
                    mk = markets(m.matrix(g.home, g.away))
                    p = [mk["H"], mk["D"], mk["A"]][y]
                    row[v] = (-np.log(max(p, 1e-9)), -np.log(max(mk["O25"] if o else 1 - mk["O25"], 1e-9)))
                if row:
                    filas.append(row)
        if filas:
            res[L["id"]] = {f"tiros{v[0]}_xg{v[1]}": dict(ll_1x2=round(float(np.mean([f[v][0] for f in filas])), 4),
                                                          ll_o25=round(float(np.mean([f[v][1] for f in filas])), 4)) for v in VARIANTES}
            res[L["id"]]["n"] = len(filas)
            print("  ", res[L["id"]], flush=True)
    # total ponderado por partidos y decisión
    tot = {}
    n = sum(r["n"] for r in res.values())
    for v in VARIANTES:
        k = f"tiros{v[0]}_xg{v[1]}"
        if n:
            tot[k] = dict(ll_1x2=round(sum(r[k]["ll_1x2"] * r["n"] for r in res.values()) / n, 4),
                          ll_o25=round(sum(r[k]["ll_o25"] * r["n"] for r in res.values()) / n, 4))
    base = tot.get("tiros0.3_xg0.0")
    mejor = min(tot, key=lambda k: tot[k]["ll_1x2"]) if tot else None
    usar = bool(base and mejor and mejor != "tiros0.3_xg0.0" and tot[mejor]["ll_1x2"] <= base["ll_1x2"] - 0.002)
    alpha, beta = (float(mejor.split("_")[0][5:]), float(mejor.split("_")[1][2:])) if usar else (0.3, 0.0)
    out = dict(fecha=today.isoformat(), n=n, por_liga=res, total=tot, cobertura=cobertura, mejor=mejor,
               usar=usar, alpha=alpha, beta=beta, errores=xg.ESTADO["errores"][:20])
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(dict(n=n, total=tot, mejor=mejor, usar=usar, alpha=alpha, beta=beta), ensure_ascii=False))


if __name__ == "__main__":
    main()
