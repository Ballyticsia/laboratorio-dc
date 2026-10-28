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
import math
import os
import re
import unicodedata
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


def clave(n):
    """Mismo árbitro escrito distinto ("M. Vergara" y "Manuel Vergara"): inicial del nombre + primer apellido."""
    w = [x for x in fotos.norm(str(n or "").replace(".", " ")) if x]
    ap = next((x for x in w[1:] if len(x) > 2), w[-1] if w else "")
    return f"{w[0][0]} {ap}" if w else ""


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
        # un solo nombre por árbitro (el más completo de sus variantes)
        largo = {}
        for f in fx:
            if f[3]:
                k = clave(f[3])
                if len(f[3]) > len(largo.get(k, "")):
                    largo[k] = f[3]
        uno = lambda n: largo.get(clave(n), n) if n else None
        for x in out.get("resultados", []):
            x["arbitro"] = uno(_cruzar(fx, x["kickoff"], x["home"], x["away"]))
        for p in out.get("partidos", []):
            p["arbitro_n"] = uno(_cruzar(fx, p["kickoff"], p["home"], p["away"]))
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
            # [fecha, local, visita, árbitro, id de API-Football]: el id sirve para el xG en vivo del centro del partido
            sal[d] = [[f["fixture"]["date"], f["teams"]["home"]["name"], f["teams"]["away"]["name"], limpiar(f["fixture"].get("referee")) or "", f["fixture"]["id"]]
                      for f in r]
            est[d] = datetime.now(timezone.utc).isoformat(timespec="minutes")
        except Exception as e:
            print(f"  ✗ árbitros del {d}: {e}")
    sal = {k: v for k, v in sal.items() if k in dias}
    sal["_t"] = {k: v for k, v in est.items() if k in dias}
    with open(SALIDA_DIA, "w", encoding="utf-8") as f:
        json.dump(sal, f, ensure_ascii=False, separators=(",", ":"))


def _pois_over(line, lam):
    k = int(math.floor(line))
    term = cdf = math.exp(-lam)
    for i in range(1, k + 1):
        term *= lam / i
        cdf += term
    return 1 - cdf


def _medir(filas, linea=4.5):
    """filas: (esperado sin árbitro, esperado con árbitro, real). Error medio y log-loss de "más de 4,5"."""
    if not filas:
        return None
    n = len(filas)
    def ll(i):
        s = 0.0
        for f in filas:
            p = min(max(_pois_over(linea, f[i]), 1e-6), 1 - 1e-6)
            s -= math.log(p) if f[2] > linea else math.log(1 - p)
        return round(s / n, 4)
    return {"n": n, "error_sin": round(sum(abs(f[0] - f[2]) for f in filas) / n, 3), "error_con": round(sum(abs(f[1] - f[2]) for f in filas) / n, 3),
            "logloss_sin": ll(0), "logloss_con": ll(1), "real": round(sum(f[2] for f in filas) / n, 2)}


def backtest(ligas, reg=None):
    """¿El árbitro ayuda a predecir las tarjetas? Para cada partido jugado de la temporada con árbitro y tarjetas,
    el factor del árbitro se calcula con sus OTROS partidos (sin mirar el resultado de ese partido).
    - "promedio": predicción = promedio de la liga (sin ese partido), con y sin el factor del árbitro.
    - "modelo": partidos del registro con las tarjetas que esperaba el modelo antes del inicio, con y sin el factor."""
    prom, mod = [], []
    tE = {}
    if reg is not None and len(reg):
        for x in reg.dropna(subset=["tE", "tR"]).itertuples():
            tE[str(x.id)] = (float(x.tE), float(x.tR))
    for L, out in ligas:
        con = [x for x in out.get("resultados", []) if x.get("arbitro") and x.get("hg") is not None]
        res = [x for x in con if isinstance(x.get("t"), list) and len(x["t"]) == 2 and None not in x["t"] and sum(x["t"]) > 0]
        if len(res) < 30 or len(res) < 0.7 * len(con):   # liga sin tarjetas confiables (como en _stats_liga)
            continue
        T, N = sum(sum(x["t"]) for x in res), len(res)
        suma, cuenta = defaultdict(float), defaultdict(int)
        for x in res:
            suma[x["arbitro"]] += sum(x["t"]); cuenta[x["arbitro"]] += 1
        for x in res:
            t = sum(x["t"]); liga = (T - t) / (N - 1)
            s, k = suma[x["arbitro"]] - t, cuenta[x["arbitro"]] - 1
            fac = ((s + liga * K_PRIOR) / (k + K_PRIOR)) / liga
            prom.append((liga, liga * fac, t))
            if str(x.get("id")) in tE:
                e, real = tE[str(x["id"])]
                mod.append((e, e * fac, real))
    out = {"promedio": _medir(prom), "modelo": _medir(mod), "k_prior": K_PRIOR}
    return out if out["promedio"] else None


# ---------------- historial de 3 temporadas: ficha de cada árbitro ----------------
# Une los partidos de ESPN de las últimas temporadas (tarjetas por equipo, faltas, goles de penal) con el árbitro
# de API-Football. Las temporadas pasadas se piden una vez (no cambian) y se guardan en data/api_football/fixtures/.
SALIDA_HIST = os.path.join(RAIZ, "site", "data", "arbitros")
HIST_TEMP = int(os.environ.get("ARB_TEMPORADAS", "3"))
FDR = 0.10           # "llamativo": sigue siendo improbable por azar después de corregir por comparar cientos de pares (Benjamini-Hochberg)
MIN_PAR = 4          # partidos mínimos de un árbitro con un equipo para compararlos
MIN_PERFIL = 8        # partidos con el dato para dar un perfil (tarjetas, faltas)


def slug(n):
    s = unicodedata.normalize("NFD", str(n or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _fixtures_pasada(L, season):
    path = os.path.join(CARPETA, f"{L['id']}_{season}.json")
    d, viejo = _viejo(path, 24 * 60)   # una temporada terminada no cambia: se revisa cada 60 días
    if (d is None or viejo) and _puedo():
        try:
            r = _af(f"/fixtures?league={fotos.AF_LIGA[L['id']]}&season={season}")
            d = {"t": datetime.now(timezone.utc).isoformat(timespec="minutes"), "season": season,
                 "fx": [[f["fixture"]["date"], f["teams"]["home"]["name"], f["teams"]["away"]["name"], limpiar(f["fixture"].get("referee"))] for f in r]}
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
            print(f"  Árbitros {L['id']} {season}: {len(d['fx'])} partidos (temporada pasada)")
        except Exception as e:
            print(f"  ✗ árbitros {L['id']} {season}: {e}")
    return (d or {}).get("fx") or []


def _indice(temporadas):
    idx = defaultdict(list)
    for season, fx in temporadas:
        for f in fx:
            if not f[3]:
                continue
            try:
                dt = datetime.fromisoformat(f[0])
            except ValueError:
                continue
            idx[dt.date()].append((dt, f[1], f[2], f[3], season))
    return idx


def _buscar(idx, kickoff, home, away):
    try:
        t = datetime.fromisoformat(str(kickoff).replace("Z", "+00:00"))
    except ValueError:
        return None
    mejor, out = 0.0, None
    for k in (-1, 0, 1):
        for dt, h, a, r, s in idx.get(t.date() + timedelta(days=k), []):
            if abs((dt - t).total_seconds()) > 36 * 3600:
                continue
            ph, pa = fotos.parecido(home, h), fotos.parecido(away, a)
            if ph >= 0.5 and pa >= 0.5 and ph + pa > mejor:
                mejor, out = ph + pa, (r, s)
    return out


def _fila(x):
    """Un partido jugado: tarjetas (amarillas y rojas) y goles de penal por equipo si ESPN trae todos los eventos; faltas."""
    hg, ag, ev = int(x["hg"]), int(x["ag"]), x.get("ev")
    ok = isinstance(ev, list) and sum(1 for v in ev if v.get("t") == "G") == hg + ag
    c = lambda lado, tipos: sum(1 for v in ev if v.get("lado") == lado and v.get("t") in tipos) if ok else None
    pen = lambda lado: sum(1 for v in ev if v.get("t") == "G" and v.get("pen") and v.get("lado") == lado) if ok else None
    return {"k": x["kickoff"], "h": x["home"], "a": x["away"], "hg": hg, "ag": ag, "yh": c("h", "Y"), "ya": c("a", "Y"),
            "rh": c("h", "R"), "ra": c("a", "R"), "ph": pen("h"), "pa": pen("a"), "fh": x.get("fh"), "fa": x.get("fa")}


def _pts(m, lado):
    a, b = (m["hg"], m["ag"]) if lado == "h" else (m["ag"], m["hg"])
    return 3 if a > b else 1 if a == b else 0


def _media(xs):
    xs = [v for v in xs if v is not None]
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    xs = [v for v in xs if v is not None]
    if len(xs) < 3:
        return None
    m = sum(xs) / len(xs)
    return math.sqrt(sum((v - m) ** 2 for v in xs) / (len(xs) - 1))


def historial(ligas):
    """ligas: lista de (definición de liga, salida de la liga, partidos jugados de ESPN de las últimas temporadas).
    Escribe site/data/arbitros/<liga>.json (ficha de cada árbitro) y agrega a cada partido próximo con árbitro
    su perfil de 3 temporadas y el historial con los dos equipos (p['arbitro']['h3'] y ['eq3'])."""
    os.makedirs(SALIDA_HIST, exist_ok=True)
    hoy = date.today()
    hechas = 0
    for L, out, jugados in ligas:
        if L["id"] not in fotos.AF_LIGA or not jugados:
            continue
        actual = fotos.temporada(L, hoy)
        temps = [(actual, _fixtures_liga(L, hoy))] + [(s, _fixtures_pasada(L, s)) for s in range(actual - 1, actual - HIST_TEMP, -1)]
        temps = [(s, fx) for s, fx in temps if fx]
        if not temps:
            continue
        idx = _indice(temps)
        largo = {}
        for _, fx in temps:
            for f in fx:
                if f[3] and len(f[3]) > len(largo.get(clave(f[3]), "")):
                    largo[clave(f[3])] = f[3]
        # solo las temporadas con árbitros conocidos: así el promedio de la liga y "lo normal" de cada equipo son del mismo período
        desde = min((d for d in idx), default=None)
        jugados = [x for x in jugados if desde and str(x["kickoff"])[:10] >= (desde - timedelta(days=1)).isoformat()]
        if not jugados:
            continue
        filas = [_fila(x) for x in jugados]
        for m, x in zip(filas, jugados):
            b = _buscar(idx, x["kickoff"], x["home"], x["away"])
            m["ref"], m["s"] = (largo.get(clave(b[0]), b[0]), b[1]) if b else (None, None)
        # qué datos son confiables en esta liga
        hay_t = sum(1 for m in filas if m["yh"] is not None and (m["yh"] + m["ya"] + m["rh"] + m["ra"]) > 0) >= 0.7 * len(filas)
        hay_f = sum(1 for m in filas if m["fh"] is not None and m["fa"] is not None) >= 0.5 * len(filas)
        hay_p = hay_t and sum((m["ph"] or 0) + (m["pa"] or 0) for m in filas) > 0
        for m in filas:
            if not hay_t:
                m["yh"] = m["ya"] = m["rh"] = m["ra"] = None
            if not hay_p:
                m["ph"] = m["pa"] = None
            if not hay_f:
                m["fh"] = m["fa"] = None
        T = lambda m: None if m["yh"] is None else m["yh"] + m["ya"] + m["rh"] + m["ra"]
        F = lambda m: None if m["fh"] is None or m["fa"] is None else m["fh"] + m["fa"]
        P = lambda m: None if m["ph"] is None else m["ph"] + m["pa"]
        R_ = lambda m: None if m["rh"] is None else m["rh"] + m["ra"]
        liga = {"pj": len(filas), "tpp": _media([T(m) for m in filas]), "rpp": _media([R_(m) for m in filas]), "fpp": _media([F(m) for m in filas]),
                "penpp": _media([P(m) for m in filas]), "local": _media([1.0 if m["hg"] > m["ag"] else 0.0 for m in filas])}
        # promedio de cada equipo por localía (con todos los árbitros) para el "esperado"
        eq = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0, 0.0, 0.0]))   # equipo -> lado -> [pj, pts, pjt, t propias, t rival]
        for m in filas:
            for lado, team in (("h", m["h"]), ("a", m["a"])):
                e = eq[team][lado]; e[0] += 1; e[1] += _pts(m, lado)
                if T(m) is not None:
                    e[2] += 1; e[3] += (m["yh"] + m["rh"]) if lado == "h" else (m["ya"] + m["ra"]); e[4] += (m["ya"] + m["ra"]) if lado == "h" else (m["yh"] + m["rh"])
        sd_pts = _sd([_pts(m, l) for m in filas for l in ("h", "a")]) or 1.25
        sd_t = _sd([(m["yh"] + m["rh"]) if l == "h" else (m["ya"] + m["ra"]) for m in filas if T(m) is not None for l in ("h", "a")]) or 1.3
        por = defaultdict(list)
        for m in filas:
            if m["ref"]:
                por[m["ref"]].append(m)
        refs = {}
        for nombre, ms in por.items():
            ms.sort(key=lambda m: m["k"], reverse=True)
            mt, mf = [m for m in ms if T(m) is not None], [m for m in ms if F(m) is not None]
            r = {"n": nombre, "slug": slug(nombre), "pj": len(ms), "pjt": len(mt), "pjf": len(mf),
                 "temps": {str(s): sum(1 for m in ms if m["s"] == s) for s in sorted({m["s"] for m in ms})},
                 "tpp": _r(_media([T(m) for m in mt])), "ypp": _r(_media([m["yh"] + m["ya"] for m in mt])), "rpp": _r(_media([R_(m) for m in mt]), 3),
                 "fpp": _r(_media([F(m) for m in mf]), 1), "penpp": _r(_media([P(m) for m in ms if P(m) is not None]), 3),
                 "local": _r(_media([1.0 if m["hg"] > m["ag"] else 0.0 for m in ms]), 3), "empate": _r(_media([1.0 if m["hg"] == m["ag"] else 0.0 for m in ms]), 3)}
            # perfil, con "prior" de la liga para no exagerar con pocos partidos
            perfil = []
            if liga["tpp"] and len(mt) >= MIN_PERFIL:
                q = ((sum(T(m) for m in mt) + liga["tpp"] * K_PRIOR) / (len(mt) + K_PRIOR)) / liga["tpp"]
                r["factor_t"] = _r(q, 3)
                perfil.append("muchas" if q >= 1.12 else "pocas" if q <= 0.88 else "normal")
            if liga["fpp"] and len(mf) >= MIN_PERFIL:
                q = ((sum(F(m) for m in mf) + liga["fpp"] * K_PRIOR) / (len(mf) + K_PRIOR)) / liga["fpp"]
                r["factor_f"] = _r(q, 3)
                perfil.append("cobra" if q >= 1.08 else "deja" if q <= 0.92 else "faltas_normal")
            if liga["rpp"] and len(mt) >= 15 and r["rpp"] is not None and r["rpp"] >= 1.6 * liga["rpp"] and r["rpp"] >= 0.25:
                perfil.append("rojas")
            r["perfil"] = perfil
            # con cada equipo: resultados y tarjetas contra lo que ese equipo hace normalmente (misma localía, sin este árbitro)
            equipos = []
            for team in sorted({m["h"] for m in ms} | {m["a"] for m in ms}):
                mm = [(m, "h" if m["h"] == team else "a") for m in ms if team in (m["h"], m["a"])]
                con = defaultdict(lambda: [0, 0.0, 0, 0.0, 0.0])
                for m, lado in mm:
                    c = con[lado]; c[0] += 1; c[1] += _pts(m, lado)
                    if T(m) is not None:
                        c[2] += 1; c[3] += (m["yh"] + m["rh"]) if lado == "h" else (m["ya"] + m["ra"]); c[4] += (m["ya"] + m["ra"]) if lado == "h" else (m["yh"] + m["rh"])
                esp_p = esp_t = esp_o = 0.0
                ok_t = True
                for lado, c in con.items():
                    tot = eq[team][lado]
                    sin = [tot[i] - c[i] for i in range(5)]
                    if sin[0] < 3:   # casi todos sus partidos de esa localía fueron con él: no hay con qué comparar
                        sin = list(tot)
                    esp_p += c[0] * sin[1] / max(sin[0], 1)
                    if c[2]:
                        if sin[2] >= 3:
                            esp_t += c[2] * sin[3] / sin[2]; esp_o += c[2] * sin[4] / sin[2]
                        else:
                            ok_t = False
                n = len(mm); nt = sum(c[2] for c in con.values())
                pts = sum(c[1] for c in con.values()); tr = sum(c[3] for c in con.values()); to = sum(c[4] for c in con.values())
                g = sum(1 for m, l in mm if _pts(m, l) == 3); e_ = sum(1 for m, l in mm if _pts(m, l) == 1)
                z_p = (pts - esp_p) / (sd_pts * math.sqrt(n)) if n else 0
                z_t = (tr - esp_t) / (sd_t * math.sqrt(nt)) if nt and ok_t else None
                pf = sum((m["ph"] if l == "h" else m["pa"]) or 0 for m, l in mm) if hay_p else None
                pc = sum((m["pa"] if l == "h" else m["ph"]) or 0 for m, l in mm) if hay_p else None
                rr = sum((m["rh"] if l == "h" else m["ra"]) or 0 for m, l in mm) if hay_t else None
                v = lambda z, mas, menos: None if z is None else ("pocos" if n < MIN_PAR else "normal")   # lo llamativo se marca después, con toda la liga
                equipos.append({"t": team, "pj": n, "g": g, "e": e_, "p": n - g - e_, "ppg": _r(pts / n), "ppg_esp": _r(esp_p / n),
                                "v_p": v(z_p, "mejor", "peor"), "z_p": _r(z_p), "pjt": nt,
                                "tr": _r(tr / nt) if nt else None, "tr_esp": _r(esp_t / nt) if nt and ok_t else None,
                                "to": _r(to / nt) if nt else None, "to_esp": _r(esp_o / nt) if nt and ok_t else None,
                                "v_t": v(z_t, "mas", "menos"), "z_t": _r(z_t) if z_t is not None else None, "pf": pf, "pc": pc, "rr": rr})
            r["equipos"] = sorted(equipos, key=lambda x: (-x["pj"], x["t"]))
            r["partidos"] = [[m["k"][:10], m["h"], m["a"], m["hg"], m["ag"], None if T(m) is None else m["yh"] + m["rh"], None if T(m) is None else m["ya"] + m["ra"],
                              m["rh"], m["ra"], m["fh"], m["fa"], m["ph"], m["pa"]] for m in ms]
            refs[r["slug"]] = r
        # ¿cuánto se parece todo esto al azar? y corrección por comparaciones múltiples (Benjamini-Hochberg)
        azar = {}
        for clave_z, clave_v, mas, menos in (("z_p", "v_p", "mejor", "peor"), ("z_t", "v_t", "mas", "menos")):
            pares = [e for r in refs.values() for e in r["equipos"] if e["pj"] >= MIN_PAR and e.get(clave_z) is not None]
            if len(pares) < 10:
                continue
            zs = [e[clave_z] for e in pares]
            m = len(pares)
            orden = sorted(pares, key=lambda e: math.erfc(abs(e[clave_z]) / math.sqrt(2)))
            corte = 0
            for i, e in enumerate(orden, 1):
                if math.erfc(abs(e[clave_z]) / math.sqrt(2)) <= i / m * FDR:
                    corte = i
            for e in orden[:corte]:
                e[clave_v] = mas if e[clave_z] > 0 else menos
            azar[clave_z[2:]] = {"pares": m, "sd": _r(math.sqrt(sum(z * z for z in zs) / m), 2), "sobre2": _r(sum(1 for z in zs if abs(z) >= 2) / m, 3), "llamativos": corte}
        liga_out = {k: (_r(v, 3) if isinstance(v, float) else v) for k, v in liga.items()}
        res = {"liga": L["id"], "nombre": out.get("nombre"), "actualizado": datetime.now(timezone.utc).isoformat(timespec="minutes"),
               "temporadas": sorted(s for s, _ in temps), "base": liga_out,
               "etiquetas": {str(s): (f"{s}-{(s + 1) % 100:02d}" if L.get("inicio", 1) != 1 else str(s)) for s, _ in temps}, "datos": {"tarjetas": hay_t, "faltas": hay_f, "penales": hay_p},
               "con_arbitro": sum(1 for m in filas if m["ref"]), "azar": azar, "refs": refs}
        with open(os.path.join(SALIDA_HIST, f"{L['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, separators=(",", ":"))
        # resumen en cada partido próximo (para el panel del árbitro sin pedir otro archivo)
        for p in out.get("partidos", []):
            a = p.get("arbitro")
            if not a or not a.get("n"):
                continue
            r = refs.get(slug(a["n"])) or refs.get(slug(largo.get(clave(a["n"]), a["n"])))
            if not r:
                continue
            a["slug"] = r["slug"]
            a["h3"] = {k: r.get(k) for k in ("pj", "pjt", "pjf", "temps", "tpp", "ypp", "rpp", "fpp", "penpp", "local", "empate", "perfil", "factor_t", "factor_f")}
            a["h3"]["liga"] = liga_out
            a["h3"]["datos"] = res["datos"]
            a["h3"]["etq"] = res["etiquetas"]
            a["h3"]["azar"] = azar
            eq3 = {}
            for lado, team in (("h", p["home"]), ("a", p["away"])):
                x = next((e for e in r["equipos"] if e["t"] == team), None)
                if x:
                    x = dict(x, ultimos=[pp for pp in r["partidos"] if team in (pp[1], pp[2])][:6])
                eq3[lado] = x
            a["eq3"] = eq3
        # enlace a la ficha desde la tabla de árbitros de la liga
        for t in out.get("arbitros") or []:
            rr = refs.get(slug(t["n"]))
            if rr:
                t["slug"] = rr["slug"]; t["pj3"] = rr["pj"]; t["perfil"] = rr["perfil"]
        hechas += 1
        print(f"  Historial de árbitros {L['id']}: {res['con_arbitro']} de {len(filas)} partidos con árbitro en {len(temps)} temporadas · {len(refs)} árbitros")
    return hechas
