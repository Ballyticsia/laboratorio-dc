"""Árbitros (API-Football, plan Pro).

- Por liga, como mucho cada 12 horas: /fixtures?league&season (una consulta trae la temporada completa,
  con el árbitro de cada partido). Se guarda en data/api_football/fixtures/<liga>.json.
- Se cruza con los partidos de ESPN de esa liga (fecha ± 36 h y nombres parecidos) y se calcula, solo con
  resultados reales de la temporada:
    * por árbitro: partidos, tarjetas por partido, penales cobrados por partido y % de victorias del local,
      comparados con el promedio de la liga;
    * por árbitro y equipo: partidos, ganados/empatados/perdidos, tarjetas recibidas y penales a favor y en
      contra, comparados con el promedio del mismo equipo con todos los árbitros.
  Son números, no juicios: con pocos partidos las diferencias son casi siempre azar (el sitio lo dice).
- Para el centro del partido de cualquier competición: /fixtures?date=<día> de ayer a pasado mañana
  → site/data/arbitros.json con el árbitro designado de cada partido del día.
"""
import json
import os
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import fotos
import lesiones

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "data", "api_football", "fixtures")
SALIDA_DIA = os.path.join(RAIZ, "site", "data", "arbitros.json")
HORAS_LIGA = float(os.environ.get("ARB_HORAS_LIGA", "12"))
HORAS_DIA = float(os.environ.get("ARB_HORAS_DIA", "2"))
RESERVA = int(os.environ.get("ARB_RESERVA", "1500"))
K_PRIOR = 8   # partidos "de la liga" que se suman al árbitro para no exagerar con pocos partidos


def _puedo():
    r = lesiones.ESTADO.get("restantes")
    return bool(os.environ.get("API_FOOTBALL_KEY", "").strip()) and (r is None or r > RESERVA)


def _af(path):
    j = lesiones._get(path)
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"])[:160])
    return j.get("response") or []


def limpiar(n):
    n = re.sub(r"\s+", " ", str(n or "")).strip()
    return n.split(",")[0].strip() or None   # "Mathias Riquelme, Chile" → "Mathias Riquelme"


def _viejo(path, horas):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d, (datetime.now(timezone.utc) - datetime.fromisoformat(d["t"])) > timedelta(hours=horas)
    except (OSError, ValueError, KeyError):
        return None, True


def _fixtures_liga(L, hoy):
    os.makedirs(CARPETA, exist_ok=True)
    path = os.path.join(CARPETA, f"{L['id']}.json")
    d, viejo = _viejo(path, HORAS_LIGA)
    season = fotos.temporada(L, hoy)
    if (viejo or (d and d.get("season") != season)) and _puedo():
        try:
            r = _af(f"/fixtures?league={fotos.AF_LIGA[L['id']]}&season={season}")
            d = {"t": datetime.now(timezone.utc).isoformat(timespec="minutes"), "season": season,
                 "fx": [[f["fixture"]["date"], f["teams"]["home"]["name"], f["teams"]["away"]["name"], limpiar(f["fixture"].get("referee"))] for f in r]}
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
        except Exception as e:   # sin datos nuevos se usa la copia anterior
            print(f"  ✗ árbitros {L['id']}: {e}")
    return (d or {}).get("fx") or []


def _cruzar(fx, kickoff, home, away):
    try:
        t = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
    except ValueError:
        return None
    mejor, ref = 0.0, None
    for f_date, h, a, r in fx:
        if not r:
            continue
        try:
            dt = abs((datetime.fromisoformat(f_date) - t).total_seconds())
        except ValueError:
            continue
        if dt > 36 * 3600:
            continue
        ph, pa = fotos.parecido(home, h), fotos.parecido(away, a)
        if ph >= 0.5 and pa >= 0.5 and ph + pa > mejor:
            mejor, ref = ph + pa, r
    return ref


def _pens(x, lado):
    return sum(1 for g in (x.get("goles") or []) if g.get("pen") and g.get("lado") == lado)


def _r(v, n=2):
    return None if v is None else round(float(v), n)


def _stats_liga(out):
    """Árbitro de cada resultado y de cada partido próximo; estadísticas de la temporada."""
    res = [x for x in out.get("resultados", []) if x.get("arbitro") and x.get("hg") is not None]
    if len(res) < 10:
        return {}, {}, {}
    # tarjetas: ESPN no las publica en todas las ligas (Uruguay, Paraguay…). Solo se usan si la mayoría de los
    # partidos las trae; si no, no se muestran (mejor nada que un 0,4 por partido falso).
    con_t = lambda x: isinstance(x.get("t"), list) and len(x["t"]) == 2 and None not in x["t"] and sum(x["t"]) > 0
    hay_t = sum(1 for x in res if con_t(x)) >= 0.7 * len(res)
    for x in res:
        x["_t"] = con_t(x) if hay_t else False
    n, rt = len(res), [x for x in res if x["_t"]]
    liga = {"tpp": sum(sum(x["t"]) for x in rt) / len(rt) if rt else None, "penpp": sum(_pens(x, "h") + _pens(x, "a") for x in res) / n,
            "local": sum(1 for x in res if x["hg"] > x["ag"]) / n}
    por = defaultdict(list)
    for x in res:
        por[x["arbitro"]].append(x)
    arb = {}
    for nombre, xs in por.items():
        k, xt = len(xs), [x for x in xs if x["_t"]]
        arb[nombre] = {"n": nombre, "pj": k, "tpp": sum(sum(x["t"]) for x in xt) / len(xt) if xt else None, "pjt": len(xt),
                       "penpp": sum(_pens(x, "h") + _pens(x, "a") for x in xs) / k, "local": sum(1 for x in xs if x["hg"] > x["ag"]) / k}
    # promedio de cada equipo con todos los árbitros (tarjetas recibidas y penales)
    eq = defaultdict(lambda: {"pj": 0, "pjt": 0, "t": 0, "pf": 0, "pc": 0})
    for x in res:
        for lado, team, otro in (("h", x["home"], "a"), ("a", x["away"], "h")):
            e = eq[team]; i = 0 if lado == "h" else 1
            e["pj"] += 1; e["pf"] += _pens(x, lado); e["pc"] += _pens(x, otro)
            if x["_t"]:
                e["pjt"] += 1; e["t"] += x["t"][i]
    return liga, arb, {"res": res, "eq": eq}


def _equipo_con(ctx, nombre, team):
    xs = [x for x in ctx["res"] if x["arbitro"] == nombre and team in (x["home"], x["away"])]
    if not xs:
        return {"pj": 0}
    g = e = p = t = kt = pf = pc = 0
    for x in xs:
        lado = "h" if x["home"] == team else "a"; i = 0 if lado == "h" else 1
        mio, suyo = (x["hg"], x["ag"]) if lado == "h" else (x["ag"], x["hg"])
        g += mio > suyo; e += mio == suyo; p += mio < suyo
        pf += _pens(x, lado); pc += _pens(x, "a" if lado == "h" else "h")
        if x["_t"]:
            t += x["t"][i]; kt += 1
    k, base = len(xs), ctx["eq"].get(team) or {"pj": 0, "pjt": 0}
    return {"pj": k, "g": g, "e": e, "p": p, "tpp": _r(t / kt) if kt else None, "pf": pf, "pc": pc,
            "tpp_todos": _r(base["t"] / base["pjt"]) if base.get("pjt") else None,
            "pf_todos": _r(base["pf"] / base["pj"]) if base["pj"] else None, "pc_todos": _r(base["pc"] / base["pj"]) if base["pj"] else None}


def actualizar_ligas(ligas):
    """ligas: lista de (definición de liga, salida de la liga). Agrega 'arbitro' a resultados y partidos,
    el resumen del árbitro a cada partido próximo y la tabla 'arbitros' de la liga."""
    hoy = date.today()
    hechos = 0
    for L, out in ligas:
        if L["id"] not in fotos.AF_LIGA:
            continue
        fx = _fixtures_liga(L, hoy)
        if not fx:
            continue
        for x in out.get("resultados", []):
            x["arbitro"] = _cruzar(fx, x["kickoff"], x["home"], x["away"])
        for p in out.get("partidos", []):
            p["arbitro_n"] = _cruzar(fx, p["kickoff"], p["home"], p["away"])
        liga, arb, ctx = _stats_liga(out)
        for x in out.get("resultados", []):
            if not x.get("arbitro"):
                x.pop("arbitro", None)
        if not liga:
            for p in out.get("partidos", []):
                if p.get("arbitro_n"):
                    p["arbitro"] = {"n": p.pop("arbitro_n"), "pj": 0}
                else:
                    p.pop("arbitro_n", None)
            continue
        if not liga["penpp"]:   # liga sin penales marcados en los datos de ESPN: no se muestran
            liga["penpp"] = None
            for a_ in arb.values():
                a_["penpp"] = None
        out["arbitros_liga"] = {"tpp": _r(liga["tpp"]), "penpp": _r(liga["penpp"]), "local": _r(liga["local"], 3)}
        out["arbitros"] = sorted(({"n": a["n"], "pj": a["pj"], "tpp": _r(a["tpp"]), "penpp": _r(a["penpp"]), "local": _r(a["local"], 3)} for a in arb.values()),
                                 key=lambda a: (-a["pj"], a["n"]))
        for p in out.get("partidos", []):
            nombre = p.pop("arbitro_n", None)
            if not nombre:
                continue
            a = arb.get(nombre)
            info = {"n": nombre, "pj": a["pj"] if a else 0}
            if a:
                info.update(tpp=_r(a["tpp"]), penpp=_r(a["penpp"]), local=_r(a["local"], 3))
                if a["tpp"] is not None and liga["tpp"]:
                    # factor de tarjetas con "prior" de la liga: con pocos partidos se parece al promedio
                    fac = ((a["tpp"] * a["pjt"] + liga["tpp"] * K_PRIOR) / (a["pjt"] + K_PRIOR)) / liga["tpp"]
                    info.update(factor_tarjetas=_r(fac, 3),
                                tarjetas_aj=_r((p["th"] + p["ta"]) * fac) if p.get("th") is not None and p.get("ta") is not None else None)
            info["eq"] = {"h": _equipo_con(ctx, nombre, p["home"]), "a": _equipo_con(ctx, nombre, p["away"])}
            p["arbitro"] = info
        for x in out.get("resultados", []):
            x.pop("_t", None)
        hechos += 1
    print(f"  Árbitros: {hechos} ligas con datos")


def actualizar_dias():
    """Árbitro designado de cada partido de ayer a pasado mañana (todas las competiciones)."""
    try:
        with open(SALIDA_DIA, encoding="utf-8") as f:
            sal = json.load(f)
    except (OSError, ValueError):
        sal = {}
    est = sal.get("_t", {})
    hoy = date.today()
    dias = [(hoy + timedelta(days=i)).isoformat() for i in range(-1, 3)]
    for d in dias:
        try:
            edad = datetime.now(timezone.utc) - datetime.fromisoformat(est[d])
        except (KeyError, ValueError):
            edad = timedelta(days=9)
        if edad < timedelta(hours=HORAS_DIA) or not _puedo():
            continue
        try:
            r = _af(f"/fixtures?date={d}")
            sal[d] = [[f["fixture"]["date"], f["teams"]["home"]["name"], f["teams"]["away"]["name"], limpiar(f["fixture"]["referee"])]
                      for f in r if limpiar(f["fixture"].get("referee"))]
            est[d] = datetime.now(timezone.utc).isoformat(timespec="minutes")
        except Exception as e:
            print(f"  ✗ árbitros del {d}: {e}")
    sal = {k: v for k, v in sal.items() if k in dias}
    sal["_t"] = {k: v for k, v in est.items() if k in dias}
    with open(SALIDA_DIA, "w", encoding="utf-8") as f:
        json.dump(sal, f, ensure_ascii=False, separators=(",", ":"))
