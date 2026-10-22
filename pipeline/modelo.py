"""Modelo Dixon-Coles con ponderación temporal (Dixon & Coles, 1997).

log λ_local  = mu + local + ataque_local − defensa_visita
log λ_visita = mu + ataque_visita − defensa_local

- Cada partido pesa w = exp(−XI · días de antigüedad).
- El objetivo mezcla goles con tiros al arco (ALPHA) cuando hay datos de tiros.
- rho corrige los marcadores bajos (0-0, 1-0, 0-1, 1-1).
- Penalización L2 pequeña para equipos con pocos partidos.

Parámetros elegidos con un backtest walk-forward en 2024-25 y evaluados en 2025-26.
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar
from scipy.stats import poisson

XI = 0.003
ALPHA = 0.3
L2 = 1.0
MAX_GOALS = 10


def fit(df, ref_date, xi=XI, alpha=ALPHA, l2=L2):
    """df: columnas date, home, away, hg, ag, hst, ast (tiros al arco; pueden faltar)."""
    ref = np.datetime64(pd.Timestamp(ref_date).date(), "D")
    days = (ref - pd.to_datetime(df["date"]).values.astype("datetime64[D]")).astype(float)
    w = np.exp(-xi * days)
    keep = (days >= 0) & (w > 1e-3)
    d, w = df[keep], w[keep]
    teams = sorted(set(d.home) | set(d.away))
    idx = {t: i for i, t in enumerate(teams)}
    h, a = d.home.map(idx).values.astype(int), d.away.map(idx).values.astype(int)
    hg, ag = d.hg.values.astype(float), d.ag.values.astype(float)
    yh, ya = hg.copy(), ag.copy()
    hst = pd.to_numeric(d.get("hst"), errors="coerce").values.astype(float) if "hst" in d else np.full(len(d), np.nan)
    ast = pd.to_numeric(d.get("ast"), errors="coerce").values.astype(float) if "ast" in d else np.full(len(d), np.nan)
    ok = ~(np.isnan(hst) | np.isnan(ast))
    usa_tiros = bool(alpha > 0 and len(ok) and ok.mean() > 0.5)
    if usa_tiros:
        k = (hg[ok].sum() + ag[ok].sum()) / max(hst[ok].sum() + ast[ok].sum(), 1)
        yh[ok] = (1 - alpha) * hg[ok] + alpha * k * hst[ok]
        ya[ok] = (1 - alpha) * ag[ok] + alpha * k * ast[ok]
    n, sw = len(teams), w.sum()

    def nll(p):
        mu, home, att, dfn = p[0], p[1], p[2:2 + n], p[2 + n:]
        eh, ea = mu + home + att[h] - dfn[a], mu + att[a] - dfn[h]
        lh, la = np.exp(eh), np.exp(ea)
        ll = np.sum(w * (yh * eh - lh + ya * ea - la)) - 0.5 * l2 * (att @ att + dfn @ dfn)
        rh, ra = w * (yh - lh), w * (ya - la)
        g = np.empty_like(p)
        g[0], g[1] = rh.sum() + ra.sum(), rh.sum()
        g[2:2 + n] = np.bincount(h, rh, n) + np.bincount(a, ra, n) - l2 * att
        g[2 + n:] = -np.bincount(a, rh, n) - np.bincount(h, ra, n) - l2 * dfn
        return -ll / sw, -g / sw

    p0 = np.zeros(2 + 2 * n)
    p0[0] = np.log(max((yh * w).sum() / sw, 0.1))
    p = minimize(nll, p0, jac=True, method="L-BFGS-B").x
    att, dfn = p[2:2 + n], p[2 + n:]
    lh = np.exp(p[0] + p[1] + att[h] - dfn[a])
    la = np.exp(p[0] + att[a] - dfn[h])
    hi, ai = hg.astype(int), ag.astype(int)

    def nll_rho(r):
        t = np.ones_like(lh)
        t = np.where((hi == 0) & (ai == 0), 1 - lh * la * r, t)
        t = np.where((hi == 0) & (ai == 1), 1 + lh * r, t)
        t = np.where((hi == 1) & (ai == 0), 1 + la * r, t)
        t = np.where((hi == 1) & (ai == 1), 1 - r, t)
        return -np.sum(w * np.log(np.clip(t, 1e-10, None)))

    rho = minimize_scalar(nll_rho, bounds=(-0.25, 0.25), method="bounded").x
    return Modelo(float(p[0]), float(p[1]), float(rho), dict(zip(teams, att)), dict(zip(teams, dfn)), usa_tiros)


class Modelo:
    def __init__(self, mu, home, rho, att, dfn, usa_tiros=False):
        self.mu, self.home, self.rho, self.att, self.dfn, self.usa_tiros = mu, home, rho, att, dfn, usa_tiros

    def rates(self, home, away):
        return (float(np.exp(self.mu + self.home + self.att.get(home, 0) - self.dfn.get(away, 0))),
                float(np.exp(self.mu + self.att.get(away, 0) - self.dfn.get(home, 0))))

    def matrix(self, home, away):
        return score_matrix(*self.rates(home, away), self.rho)

    def to_json(self):
        return {"mu": round(self.mu, 5), "home": round(self.home, 5), "rho": round(self.rho, 5),
                "equipos": {t: [round(float(self.att[t]), 5), round(float(self.dfn[t]), 5)] for t in self.att}}


def score_matrix(lh, la, rho):
    g = np.arange(MAX_GOALS + 1)
    m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
    m[0, 0] *= 1 - lh * la * rho
    m[0, 1] *= 1 + lh * rho
    m[1, 0] *= 1 + la * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()


def markets(m):
    g = np.arange(m.shape[0])
    tot = g[:, None] + g[None, :]
    i, j = np.unravel_index(np.argmax(m), m.shape)
    return {"H": float(np.tril(m, -1).sum()), "D": float(np.trace(m)), "A": float(np.triu(m, 1).sum()),
            "O25": float(m[tot > 2.5].sum()), "BTTS": float(m[1:, 1:].sum()), "top": f"{i}-{j}"}
