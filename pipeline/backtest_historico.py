"""Prueba histórica con 5 temporadas de Football-Data.co.uk (resultados, tiros al arco y cuotas de cierre).

Responde dos preguntas y deja la respuesta en data/backtest_historico.json:

1. ¿Cómo conviene quitarle el margen a las cuotas? Con las cuotas de cierre de Bet365 (casa "blanda",
   como DraftKings), Pinnacle y el promedio de casas se compara cada método de pipeline/margen.py
   (y los de la librería penaltyblog) contra los resultados reales. El ganador queda en "metodo_margen"
   y el robot lo usa desde la siguiente actualización.
2. ¿Qué tan bueno es el modelo propio? Semana a semana se ajusta con los partidos anteriores y se
   predicen los de esa semana; lo mismo con el Dixon-Coles de penaltyblog (segunda opinión), con la
   mezcla de ambos y contra la cuota de cierre de Pinnacle. Todo sobre los mismos partidos.

Se corre una vez al mes y a mano (.github/workflows/backtest_historico.yml). Football-Data.co.uk publica
estos archivos gratis; se bajan una vez por corrida y se guardan en data/cache_fd/ (no se suben al repo).
"""
import io
import json
import math
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import margen  # noqa: E402
from modelo import fit, markets  # noqa: E402

try:
    import penaltyblog as pb
except Exception as e:   # sin penaltyblog se mide solo lo propio
    print("penaltyblog no disponible:", e)
    pb = None

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "data", "backtest_historico.json")
CACHE = os.path.join(RAIZ, "data", "cache_fd")
HOME_L2 = 20.0   # igual que generar.py
EUROPA = {"E0": "Premier League", "E1": "Championship", "SP1": "LaLiga", "SP2": "LaLiga 2", "I1": "Serie A", "I2": "Serie B",
          "D1": "Bundesliga", "D2": "2. Bundesliga", "F1": "Ligue 1", "F2": "Ligue 2", "N1": "Eredivisie", "P1": "Primeira Liga",
          "SC0": "Escocia", "B1": "Bélgica"}
EXTRA = {"ARG": "Argentina", "BRA": "Brasil", "MEX": "Liga MX", "USA": "MLS"}
N_TEMP = 5                       # temporadas que se califican (la anterior a la primera solo entrena)
MIN_PJ = 5                       # cada equipo con al menos 5 partidos antes de predecirlo
VENTANA = 730                    # días de historia para ajustar
PB_XI = 0.0018                   # el decaimiento que recomienda penaltyblog
EPS = 1e-12


def temporadas(hoy):
    """Las últimas N_TEMP temporadas terminadas (julio a junio) y la anterior, para entrenar."""
    fin = hoy.year if hoy.month >= 7 else hoy.year - 1   # la última que terminó en junio de este año
    return [(y, y + 1) for y in range(fin - N_TEMP - 1, fin)]


def bajar(url, nombre):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, nombre)
    if os.path.exists(f) and time.time() - os.path.getmtime(f) < 20 * 86400:
        return open(f, "rb").read()
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Ballytics backtest (proyecto personal)"})
            data = urllib.request.urlopen(req, timeout=60).read()
            open(f, "wb").write(data)
            time.sleep(0.5)
            return data
        except Exception as e:
            print("  reintento", url, e)
            time.sleep(3 * (i + 1))
    return None


def leer_csv(data):
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(data), encoding=enc, on_bad_lines="skip")
        except Exception:
            continue
    return pd.DataFrame()


def fechas(s):
    d = pd.to_datetime(s, format="%d/%m/%Y", errors="coerce")
    d2 = pd.to_datetime(s, format="%d/%m/%y", errors="coerce")
    return d.fillna(d2)


def num(df, c):
    return pd.to_numeric(df[c], errors="coerce") if c in df else pd.Series(np.nan, index=df.index)


def cargar(hoy):
    """Todos los partidos en un solo formato."""
    filas = []
    temps = temporadas(hoy)
    for div, nombre in EUROPA.items():
        for y0, y1 in temps:
            cod = f"{y0 % 100:02d}{y1 % 100:02d}"
            data = bajar(f"https://www.football-data.co.uk/mmz4281/{cod}/{div}.csv", f"{div}_{cod}.csv")
            if not data:
                continue
            df = leer_csv(data)
            if df.empty or "HomeTeam" not in df:
                continue
            out = pd.DataFrame({"liga": nombre, "date": fechas(df["Date"]), "home": df["HomeTeam"], "away": df["AwayTeam"],
                                "hg": num(df, "FTHG"), "ag": num(df, "FTAG"), "hst": num(df, "HST"), "ast": num(df, "AST")})
            for casa, pre in (("b365", "B365C"), ("pin", "PSC"), ("avg", "AvgC")):
                for k in "HDA":
                    out[f"{casa}_{k}"] = num(df, pre + k)
            for casa, pre in (("b365", "B365C"), ("pin", "PC"), ("avg", "AvgC")):
                out[f"{casa}_o"], out[f"{casa}_u"] = num(df, pre + ">2.5"), num(df, pre + "<2.5")
            filas.append(out)
    lo = pd.Timestamp(temps[0][0], 7, 1)
    for cod, nombre in EXTRA.items():
        data = bajar(f"https://www.football-data.co.uk/new/{cod}.csv", f"{cod}.csv")
        if not data:
            continue
        df = leer_csv(data)
        if df.empty or "Home" not in df:
            continue
        out = pd.DataFrame({"liga": nombre, "date": fechas(df["Date"]), "home": df["Home"], "away": df["Away"],
                            "hg": num(df, "HG"), "ag": num(df, "AG"), "hst": np.nan, "ast": np.nan})
        for casa, pre in (("b365", "B365C"), ("pin", "PSC"), ("avg", "AvgC")):
            for k in "HDA":
                out[f"{casa}_{k}"] = num(df, pre + k)
        for casa in ("b365", "pin", "avg"):
            out[f"{casa}_o"] = out[f"{casa}_u"] = np.nan
        filas.append(out[out.date >= lo])
    if not filas:
        return pd.DataFrame()
    d = pd.concat(filas, ignore_index=True)
    d = d[d.date.notna() & d.hg.notna() & d.ag.notna() & d.home.notna() & d.away.notna()]
    d["res"] = np.select([d.hg > d.ag, d.hg == d.ag], [0, 1], 2)
    d["o25"] = ((d.hg + d.ag) > 2.5).astype(int)
    d["temp"] = d.date.apply(lambda x: f"{x.year}-{(x.year + 1) % 100:02d}" if x.month >= 7 else f"{x.year - 1}-{x.year % 100:02d}")
    return d.sort_values("date").reset_index(drop=True)


# ---------------- 1. métodos para quitar el margen ----------------
PB_METODOS = {"multiplicativo": "multiplicative", "aditivo": "additive", "potencia": "power", "shin": "shin", "odds_ratio": "odds_ratio",
              "diferencial": "differential_margin_weighting", "logaritmico": "logarithmic"}


def probar_margen(d):
    casas = {"b365": "Bet365 (cierre)", "pin": "Pinnacle (cierre)", "avg": "Promedio de casas (cierre)"}
    res, nmax, control = {}, {}, {}
    for casa, nom in casas.items():
        sub = d[d[[f"{casa}_H", f"{casa}_D", f"{casa}_A"]].notna().all(axis=1) & (d[[f"{casa}_H", f"{casa}_D", f"{casa}_A"]] > 1).all(axis=1)]
        sub = sub[(1 / sub[f"{casa}_H"] + 1 / sub[f"{casa}_D"] + 1 / sub[f"{casa}_A"]).between(1.0, 1.25)]
        nmax[nom] = len(sub)
        od = sub[[f"{casa}_H", f"{casa}_D", f"{casa}_A"]].values
        y = sub.res.values.astype(int)
        for m in margen.METODOS:
            P = np.array([margen.quitar(o, m) for o in od])
            ll = float(-np.mean(np.log(np.clip(P[np.arange(len(y)), y], EPS, 1))))
            res.setdefault(m, {})[nom] = round(ll, 5)
        if pb is not None:   # los de penaltyblog que no están en margen.py, y control de que las fórmulas propias coinciden
            muestra = np.random.default_rng(7).choice(len(od), size=min(400, len(od)), replace=False) if len(od) else []
            for m, pm in PB_METODOS.items():
                if m in margen.METODOS:
                    dif = max((float(np.max(np.abs(np.array(pb.implied.calculate_implied(list(od[i]), method=pm).probabilities) - margen.quitar(od[i], m))))
                               for i in muestra), default=0.0)
                    control[m] = max(control.get(m, 0.0), round(dif, 6))
                    continue
                try:
                    P = np.array([pb.implied.calculate_implied(list(o), method=pm).probabilities for o in od])
                    ll = float(-np.mean(np.log(np.clip(P[np.arange(len(y)), y], EPS, 1))))
                    res.setdefault(m, {})[nom] = round(ll, 5)
                except Exception as e:
                    print("  método", m, "falló:", e)
    # elegido: el mejor promedio entre Bet365 y Pinnacle (las casas que usa el robot son DraftKings y Pinnacle) entre los de margen.py
    clave = [casas["b365"], casas["pin"]]
    puntaje = {m: np.mean([res[m][c] for c in clave if c in res.get(m, {})]) for m in margen.METODOS if all(c in res.get(m, {}) for c in clave)}
    elegido = min(puntaje, key=puntaje.get) if puntaje else "multiplicativo"
    return {"log_loss": res, "partidos": nmax, "control_penaltyblog": control}, elegido


# ---------------- 2. modelos semana a semana ----------------
def ll3(p, y):
    return -math.log(max(p[y], EPS))


def metricas():
    return {"n": 0, "ll": 0.0, "ok": 0, "brier": 0.0, "n_o": 0, "ll_o": 0.0}


def sumar(m, p, y, po=None, yo=None):
    m["n"] += 1
    m["ll"] += ll3(p, y)
    m["ok"] += int(int(np.argmax(p)) == y)
    m["brier"] += float(sum((p[k] - (1 if k == y else 0)) ** 2 for k in range(3)))
    if po is not None and yo is not None:
        m["n_o"] += 1
        m["ll_o"] += -math.log(max(po if yo else 1 - po, EPS))


def cerrar(m):
    if not m["n"]:
        return None
    out = {"n": m["n"], "ll": round(m["ll"] / m["n"], 4), "acierto": round(m["ok"] / m["n"], 4), "brier": round(m["brier"] / m["n"], 4)}
    if m["n_o"]:
        out.update(n_o25=m["n_o"], ll_o25=round(m["ll_o"] / m["n_o"], 4))
    return out


def probar_modelos(d, metodo, temps_eval):
    agg = {"total": {}, "temporada": {}, "liga": {}}
    t0 = time.time()
    for liga, dl in d.groupby("liga"):
        dl = dl.reset_index(drop=True)
        ev = dl[dl.temp.isin(temps_eval)]
        if ev.empty:
            continue
        semanas = ev.date.dt.to_period("W-MON").unique()
        print(f"{liga}: {len(ev)} partidos, {len(semanas)} semanas", flush=True)
        for w in semanas:
            ini = w.start_time
            fin = w.end_time
            tr = dl[(dl.date < ini) & (dl.date >= ini - pd.Timedelta(days=VENTANA))]
            te = dl[(dl.date >= ini) & (dl.date <= fin) & dl.temp.isin(temps_eval)]
            if len(tr) < 100 or te.empty:
                continue
            cnt = pd.concat([tr.home, tr.away]).value_counts()
            te = te[te.home.map(cnt).fillna(0).ge(MIN_PJ) & te.away.map(cnt).fillna(0).ge(MIN_PJ)]
            te = te[te[["pin_H", "pin_D", "pin_A"]].notna().all(axis=1)]   # mismos partidos para todos: los que tienen cuota de Pinnacle
            if te.empty:
                continue
            try:
                mod = fit(tr, ini, home_l2=HOME_L2)
            except Exception as e:
                print("  ajuste propio falló:", e)
                continue
            pbm = None
            if pb is not None:
                try:
                    wts = pb.models.dixon_coles_weights(tr.date, PB_XI, ini)
                    pbm = pb.models.DixonColesGoalModel(tr.hg.astype(int), tr.ag.astype(int), tr.home, tr.away, wts)
                    pbm.fit()
                except Exception as e:
                    print("  penaltyblog falló:", e)
                    pbm = None
            for x in te.itertuples():
                y, yo = int(x.res), int(x.o25)
                mk = markets(mod.matrix(x.home, x.away))
                pm, pmo = [mk["H"], mk["D"], mk["A"]], mk["O25"]
                q = margen.quitar([x.pin_H, x.pin_D, x.pin_A], metodo)
                qo = margen.quitar([x.pin_o, x.pin_u], metodo) if not (np.isnan(x.pin_o) or np.isnan(x.pin_u)) else None
                if q is None:
                    continue
                filas = [("modelo_propio", pm, pmo), ("pinnacle", list(q), qo[0] if qo is not None else None)]
                if pbm is not None:
                    try:
                        g = pbm.predict(x.home, x.away)
                        pp, ppo = list(g.home_draw_away), float(g.total_goals("over", 2.5))
                        filas += [("penaltyblog", pp, ppo), ("mezcla", [(a + b) / 2 for a, b in zip(pm, pp)], (pmo + ppo) / 2)]
                    except Exception:
                        pass
                for nom, p, po in filas:
                    if p is None:
                        continue
                    for k, sub in (("total", "todo"), ("temporada", x.temp), ("liga", liga)):
                        sumar(agg[k].setdefault(sub, {}).setdefault(nom, metricas()), p, y, po, yo if po is not None else None)
    print(f"modelos: {time.time() - t0:.0f} s")
    out = {k: {s: {n: cerrar(m) for n, m in v.items()} for s, v in agg[k].items()} for k in agg}
    out["total"] = out["total"].get("todo", {})
    return out


def main():
    hoy = date.today()
    d = cargar(hoy)
    if d.empty:
        print("No pude bajar datos de Football-Data.co.uk; no cambio nada.")
        return
    print(f"{len(d)} partidos, {d.liga.nunique()} ligas, temporadas {sorted(d.temp.unique())}")
    mg, elegido = probar_margen(d)
    print("método de margen elegido:", elegido, json.dumps(mg["log_loss"], ensure_ascii=False))
    # se califican las últimas N_TEMP temporadas; la anterior solo entrena
    temps_eval = [f"{y0}-{y1 % 100:02d}" for y0, y1 in temporadas(hoy)[1:]]
    mods = probar_modelos(d, elegido, temps_eval)
    T = mods["total"]
    # ¿la mezcla con penaltyblog mejora al modelo propio de forma pareja (en casi todas las temporadas)?
    mejor_temp = [t for t, v in mods["temporada"].items() if v.get("mezcla") and v.get("modelo_propio") and v["mezcla"]["ll"] < v["modelo_propio"]["ll"]]
    usar_mezcla = bool(T.get("mezcla") and T.get("modelo_propio") and T["mezcla"]["ll"] < T["modelo_propio"]["ll"]
                       and len(mejor_temp) >= max(1, len(mods["temporada"]) - 1))
    out = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="minutes"), "fuente": "Football-Data.co.uk",
           "penaltyblog": getattr(pb, "__version__", None), "ligas": sorted(d.liga.unique().tolist()),
           "temporadas": sorted(mods["temporada"].keys()), "partidos_descargados": int(len(d)),
           "metodo_margen": elegido, "margen": mg, "modelos": mods,
           "segunda_opinion": {"usar_mezcla": usar_mezcla, "temporadas_que_mejora": sorted(mejor_temp)}}
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ("metodo_margen", "segunda_opinion")}, ensure_ascii=False))
    print(json.dumps(T, ensure_ascii=False))


if __name__ == "__main__":
    main()
