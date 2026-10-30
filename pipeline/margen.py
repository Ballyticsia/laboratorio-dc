"""Quitar el margen de la casa a las cuotas: de cuotas a probabilidades.

La casa cobra su margen repartido de forma desigual: los resultados poco probables suelen
venir más castigados (sesgo favorito-sorpresa). Cada método reparte el margen distinto:

- multiplicativo: divide todo por la suma (el método simple de siempre)
- aditivo:        resta la misma cantidad a cada resultado
- potencia:       eleva las probabilidades a un exponente k (castiga más a las sorpresas)
- shin:           modelo de Shin (1993): supone una parte de apostadores con información
- odds_ratio:     razón de chances constante (Cheung 2015)

Qué método usa Ballytics lo decide pipeline/backtest_historico.py con 5 temporadas de cuotas
de cierre de Football-Data.co.uk (data/backtest_historico.json, campo "metodo_margen").
Las fórmulas se comparan ahí mismo con las de la librería penaltyblog para asegurar que dan igual.
"""
import json
import os

import numpy as np
from scipy.optimize import brentq

METODOS = ("multiplicativo", "aditivo", "potencia", "shin", "odds_ratio")
_DEC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "backtest_historico.json")
_metodo = None


def metodo_elegido():
    """El método que ganó en el backtest histórico (si no hay backtest, el multiplicativo)."""
    global _metodo
    if _metodo is None:
        try:
            with open(_DEC, encoding="utf-8") as f:
                m = json.load(f).get("metodo_margen")
            _metodo = m if m in METODOS else "multiplicativo"
        except (OSError, ValueError):
            _metodo = "multiplicativo"
    return _metodo


def quitar(cuotas, metodo=None):
    """cuotas decimales (2 o 3 resultados) → probabilidades que suman 1, o None si no sirven."""
    try:
        o = np.array([float(x) for x in cuotas], dtype=float)
    except (TypeError, ValueError):
        return None
    if len(o) < 2 or not np.all(np.isfinite(o)) or np.any(o <= 1):
        return None
    inv = 1 / o
    s = inv.sum()
    metodo = metodo or metodo_elegido()
    if s <= 1 or metodo == "multiplicativo":   # sin margen (o casa generosa): no hay nada que repartir
        return inv / s
    try:
        if metodo == "aditivo":
            p = inv - (s - 1) / len(inv)
            if np.any(p <= 0):
                return inv / s
        elif metodo == "potencia":
            k = brentq(lambda k: np.sum(inv ** k) - 1, 1.0, 10.0)
            p = inv ** k
        elif metodo == "shin":
            def prob(z):
                return (np.sqrt(z * z + 4 * (1 - z) * inv * inv / s) - z) / (2 * (1 - z))
            z = brentq(lambda z: prob(z).sum() - 1, 0.0, 0.5)
            p = prob(z)
        elif metodo == "odds_ratio":
            def prob(c):
                return inv / (c + inv - c * inv)
            c = brentq(lambda c: prob(c).sum() - 1, 1.0, 100.0)
            p = prob(c)
        else:
            return inv / s
    except (ValueError, RuntimeError):
        return inv / s
    return p / p.sum()
