"""Simulaciones de copas: fase de liga (Champions, Europa League, Conference) y llaves de eliminación
(Libertadores, Sudamericana). Usa las probabilidades del mismo modelo Dixon-Coles de cada liga."""
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

from modelo import score_matrix

MAXG = 10


def _mat(model, h, a, neutral=False):
    lh, la = model.rates(h, a, neutral=neutral)
    return score_matrix(lh, la, model.rho)


def _diff_dist(m):
    """Distribución de (goles local − goles visita) para una tabla de marcadores."""
    n = m.shape[0]
    d = np.zeros(2 * n - 1)
    for i in range(n):
        for j in range(n):
            d[i - j + n - 1] += m[i, j]
    return d


def p_llave(model, a, b, ida=None, vuelta=None, neutral_final=False):
    """Probabilidad de que `a` avance. Ida: a local; vuelta: b local. ida/vuelta = (goles a, goles b) si ya se jugó.
    Empate en el global: penales 50/50 (CONMEBOL y UEFA ya no usan gol de visita)."""
    if neutral_final:
        m = _mat(model, a, b, neutral=True)
        pa = float(np.tril(m, -1).sum()); pd_ = float(np.trace(m))
        return pa + 0.5 * pd_
    n = MAXG + 1
    if ida is None:
        d1 = _diff_dist(_mat(model, a, b))
    else:
        d1 = np.zeros(2 * n - 1); d1[ida[0] - ida[1] + n - 1] = 1.0
    if vuelta is None:
        m2 = _mat(model, b, a)          # local b
        d2 = _diff_dist(m2.T)           # en términos de goles de a − goles de b
    else:
        d2 = np.zeros(2 * n - 1); d2[vuelta[0] - vuelta[1] + n - 1] = 1.0
    tot = np.convolve(d1, d2)
    mid = len(tot) // 2
    return float(tot[mid + 1:].sum() + 0.5 * tot[mid])


def fase_liga(model, filas, pendientes, rng, sims=6000, zonas=((1, 8), (9, 24), (25, 36))):
    """Simula los partidos que faltan de la fase de liga y, con un cuadro simplificado, el resto de la copa."""
    teams = [f["equipo"] for f in filas]
    idx = {t: i for i, t in enumerate(teams)}
    if len(teams) < 16:
        return None
    pts = np.array([f["pts"] for f in filas], float)
    dg = np.array([f["dg"] for f in filas], float)
    gf = np.array([f["gf"] for f in filas], float)
    P, D, G = np.tile(pts, (sims, 1)), np.tile(dg, (sims, 1)), np.tile(gf, (sims, 1))
    n = MAXG + 1
    for x in pendientes:
        if x["home"] not in idx or x["away"] not in idx:
            continue
        try:
            m = _mat(model, x["home"], x["away"])
        except Exception:
            continue
        flat = m.ravel() / m.sum()
        draws = rng.choice(flat.size, size=sims, p=flat)
        hg, ag = draws // n, draws % n
        i, j = idx[x["home"]], idx[x["away"]]
        P[:, i] += np.where(hg > ag, 3, np.where(hg == ag, 1, 0)); P[:, j] += np.where(ag > hg, 3, np.where(hg == ag, 1, 0))
        D[:, i] += hg - ag; D[:, j] += ag - hg; G[:, i] += hg; G[:, j] += ag
    key = P * 1e6 + D * 1e3 + G + rng.random(P.shape)
    order = np.argsort(-key, axis=1)
    pos = np.empty_like(order); rows = np.arange(sims)[:, None]
    pos[rows, order] = np.arange(len(teams))[None, :] + 1
    out = []
    # eliminación directa (cuadro simplificado por posición): playoff 9-24, octavos, cuartos, semis y final
    cache = {}

    def adv(a, b, final=False):
        k = (a, b, final)
        if k not in cache:
            try:
                cache[k] = p_llave(model, a, b, neutral_final=final)
            except Exception:
                cache[k] = 0.5
        return cache[k]

    campeon, final_c = Counter(), Counter()
    ks = min(sims, 3000)
    for s in range(ks):
        rank = [teams[i] for i in order[s]]
        if len(rank) >= 24:
            po = []
            for k in range(8):                          # 9 vs 24, 10 vs 23, …, 16 vs 17
                a, b = rank[8 + k], rank[23 - k]
                po.append(a if rng.random() < adv(a, b) else b)
            ronda = []
            for k in range(8):                          # 1 vs ganador 16/17, …, 8 vs ganador 9/24
                a, b = rank[k], po[7 - k]
                ronda.append(a if rng.random() < adv(a, b) else b)
        else:
            ronda = rank[:16]
        while len(ronda) > 2:
            ronda = [(ronda[i] if rng.random() < adv(ronda[i], ronda[-1 - i]) else ronda[-1 - i]) for i in range(len(ronda) // 2)]
        a, b = ronda
        final_c[a] += 1; final_c[b] += 1
        campeon[a if rng.random() < adv(a, b, True) else b] += 1
    for t, i in idx.items():
        pz = [float(((pos[:, i] >= lo) & (pos[:, i] <= hi)).mean()) for lo, hi in zonas]
        out.append(dict(equipo=t, pts=int(pts[i]), pts_esp=round(float(P[:, i].mean()), 1), pos_media=round(float(pos[:, i].mean()), 1),
                        p_directo=round(pz[0], 4), p_playoff=round(pz[1], 4), p_elim=round(pz[2], 4),
                        p_final=round(final_c[t] / ks, 4), p_campeon=round(campeon[t] / ks, 4)))
    out.sort(key=lambda r: (-r["pts_esp"], r["pos_media"]))
    return dict(tipo="fase_liga", sims=sims, quedan=len(pendientes), equipos=out)


def llaves(model, df, hoy):
    """Llaves de ida y vuelta de la ronda actual (y la final si ya está definida)."""
    d = df[(df.date >= hoy - pd.Timedelta(days=50)) & (df.date <= hoy + pd.Timedelta(days=70))].sort_values("kickoff")
    pares = defaultdict(list)
    for x in d.itertuples():
        pares[frozenset((x.home, x.away))].append(x)
    ties, finales = [], []
    for k, ms in pares.items():
        if len(ms) == 2 and abs((ms[1].date - ms[0].date).days) <= 21:
            ida, vta = ms
            a, b = ida.home, ida.away
            g1 = (int(ida.hg), int(ida.ag)) if ida.estado == "jugado" and ida.hg == ida.hg else None
            g2 = (int(vta.ag), int(vta.hg)) if vta.estado == "jugado" and vta.hg == vta.hg else None   # en términos de a
            try:
                pa = p_llave(model, a, b, g1, g2)
            except Exception:
                continue
            dec = g1 is not None and g2 is not None
            if dec:
                tot = g1[0] + g2[0] - g1[1] - g2[1]
                pa = 1.0 if tot > 0 else 0.0 if tot < 0 else pa
            ties.append(dict(a=a, b=b, ida=f"{g1[0]}-{g1[1]}" if g1 else None, vuelta=f"{g2[1]}-{g2[0]}" if g2 else None,
                             fecha_ida=ida.kickoff, fecha_vuelta=vta.kickoff, p_a=round(pa, 4), decidida=dec, ultima=str(vta.date.date()),
                             pen=getattr(vta, "pen", None) if isinstance(getattr(vta, "pen", None), str) else None))
        elif len(ms) == 1 and ms[0].estado != "jugado":
            finales.append(ms[0])
    if not ties and not finales:
        return None
    # llaves empatadas en el global (se definieron por penales): el ganador es el que aparece en un partido posterior
    for t in ties:
        if t["decidida"] and t["p_a"] not in (0.0, 1.0) and t.get("pen") in ("h", "a"):
            t["p_a"] = 0.0 if t["pen"] == "h" else 1.0          # pen: quién ganó la tanda, visto desde el local de la vuelta (b)
            t["penales"] = True
        elif t["decidida"] and t["p_a"] not in (0.0, 1.0):
            later = {x for f in finales if str(f.date.date()) > t["ultima"] for x in (f.home, f.away)}
            if t["a"] in later and t["b"] not in later:
                t["p_a"] = 1.0
            elif t["b"] in later and t["a"] not in later:
                t["p_a"] = 0.0
            t["penales"] = True
    for t in ties:
        t.pop("pen", None)
    # ronda más reciente: llaves cuyo partido de vuelta es el más cercano a hoy
    ties.sort(key=lambda t: t["ultima"])
    if ties:
        last = max(t["ultima"] for t in ties)
        ronda = [t for t in ties if abs((pd.Timestamp(t["ultima"]) - pd.Timestamp(last)).days) <= 10]
    else:
        ronda = []
    out = dict(tipo="llaves", llaves=ronda)
    vivos = defaultdict(float)
    if 1 <= len(ronda) <= 2:
        for t in ronda:
            vivos[t["a"]] += t["p_a"]; vivos[t["b"]] += 1 - t["p_a"]
        if len(ronda) == 2:                          # semifinales: probabilidad de campeón
            A, B = ronda
            camp = Counter()
            for x, px in ((A["a"], A["p_a"]), (A["b"], 1 - A["p_a"])):
                for y, py in ((B["a"], B["p_a"]), (B["b"], 1 - B["p_a"])):
                    try:
                        w = p_llave(model, x, y, neutral_final=True)
                    except Exception:
                        w = 0.5
                    camp[x] += px * py * w; camp[y] += px * py * (1 - w)
            out["campeon"] = sorted(({"equipo": t, "p": round(p, 4)} for t, p in camp.items() if p > 0), key=lambda r: -r["p"])
    gan = {t["a"] if t["p_a"] == 1.0 else t["b"] for t in ronda if t["decidida"] and t["p_a"] in (0.0, 1.0)}
    fin = [f for f in finales if (not ronda) or (f.home in gan and f.away in gan)]
    if fin:
        f = fin[0]
        try:
            w = p_llave(model, f.home, f.away, neutral_final=True)
            out["final"] = dict(a=f.home, b=f.away, fecha=f.kickoff, p_a=round(w, 4))
            out["campeon"] = [{"equipo": f.home, "p": round(w, 4)}, {"equipo": f.away, "p": round(1 - w, 4)}]
        except Exception:
            pass
    return out
