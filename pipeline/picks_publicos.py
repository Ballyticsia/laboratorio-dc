"""Picks públicos: dos listas diarias con regla fija, cuota real y monto fijo, calificadas gane o pierda.

La idea es poder mostrar con números, y no con un caso suelto, cómo le va a quien sigue a Ballytics.

Reglas (no cambian; si algún día cambian, se anota la fecha en REGLAS["cambios"]):
- "Seguros": hasta 3 por día. El resultado 1X2 que la probabilidad Ballytics ve más probable,
  si es de 60 % o más. Se eligen los 3 más probables del día.
- "Valor": hasta 3 por día. Donde el modelo propio (sin la cuota) ve más que la casa: valor
  esperado de 5 % o más con la cuota que paga la casa y al menos 3 puntos sobre la probabilidad
  sin margen del mercado, con cuota entre 1,50 y 6,00. Se eligen los 3 de mayor valor esperado,
  sin repetir partidos que ya están en los seguros.
- Solo partidos con cuota real publicada (DraftKings vía ESPN): esa cuota es la que se paga.
- La lista de cada día (hora de Chile) se fija a las 18:00 del día anterior, o en la primera
  actualización después, solo con partidos que todavía no empiezan. Una vez fijada no cambia.
- 1 unidad por pick. Ganado suma (cuota − 1); perdido resta 1; suspendido o sin resultado
  4 días después del inicio queda nulo (0).
- La cuota de cierre (la última antes del inicio) se guarda para medir si la lista se adelanta al mercado.

El archivo data/picks_publicos.json queda en el repositorio público: su historial en GitHub muestra
que cada lista se publicó antes de los partidos.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from modelo import mercado_q

RAIZ = os.path.join(os.path.dirname(__file__), "..")
ARCHIVO = os.path.join(RAIZ, "data", "picks_publicos.json")
TZ = ZoneInfo("America/Santiago")
HORA_FIJA = 18          # la lista del día D se fija a esta hora (Chile) del día D-1
MAX_DIA = 3
SEG_MIN = 0.60
VAL_EV, VAL_PTS, VAL_CMIN, VAL_CMAX = 0.05, 0.03, 1.50, 6.00
NULO_DIAS = 4
REGLAS = {
    "desde": "2026-10-28",
    "seguro": f"Hasta {MAX_DIA} por día: el resultado (1X2) que Ballytics ve más probable, si es de {int(SEG_MIN * 100)} % o más.",
    "valor": (f"Hasta {MAX_DIA} por día: el modelo propio ve un valor esperado de {int(VAL_EV * 100)} % o más con la cuota de la casa "
              f"y al menos {int(VAL_PTS * 100)} puntos sobre el mercado sin margen; cuota entre 1,50 y 6,00; sin repetir partidos de los seguros."),
    "fijado": f"La lista de cada día se fija a las {HORA_FIJA}:00 (hora de Chile) del día anterior y no cambia.",
    "monto": "1 unidad por pick con la cuota de DraftKings (vía ESPN) del momento en que se fijó la lista.",
    "cambios": [],
}
LADOS = ("H", "D", "A")


def _cargar():
    try:
        with open(ARCHIVO, encoding="utf-8") as f:
            d = json.load(f)
        d.setdefault("dias", {})
        return d
    except (OSError, ValueError):
        return {"dias": {}}


def _ts(iso):
    return pd.Timestamp(iso).tz_convert("UTC") if pd.Timestamp(iso).tzinfo else pd.Timestamp(iso).tz_localize("UTC")


def _dia_local(iso):
    return _ts(iso).tz_convert(TZ).date().isoformat()


def _precio(p, lado):
    c = p.get("cuotas") or {}
    v = c.get({"H": "h", "D": "d", "A": "a"}[lado])
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if v > 1.0 else None


def _candidatos(partidos, dia, ahora):
    """Partidos de ese día (hora de Chile) que todavía no empiezan y tienen cuota real."""
    out = []
    for liga, p in partidos:
        if p.get("estado") != "pendiente" or not p.get("kickoff") or not p.get("cuotas"):
            continue
        if _ts(p["kickoff"]) <= ahora or _dia_local(p["kickoff"]) != dia:
            continue
        if not all(_precio(p, l) for l in LADOS):
            continue
        out.append((liga, p))
    return out


def _fila(liga, p, est, lado, prob, cuota, extra=None):
    f = dict(id=str(p["id"]), liga=liga, kickoff=p["kickoff"], home=p["home"], away=p["away"], est=est, lado=lado,
             prob=round(float(prob), 4), cuota=round(float(cuota), 3), cierre=round(float(cuota), 3), res=None, hg=None, ag=None)
    if extra:
        f.update(extra)
    return f


def elegir(cands):
    seg, val = [], []
    for liga, p in cands:
        P = [p["pH"], p["pD"], p["pA"]]
        k = int(np.argmax(P))
        if P[k] >= SEG_MIN:
            seg.append((P[k], _fila(liga, p, "seguro", LADOS[k], P[k], _precio(p, LADOS[k]))))
        own = p.get("modelo") or p
        q, _, _ = mercado_q(p.get("cuotas"), p.get("mercado"))
        if q is None:
            continue
        mejor = None
        for i, lado in enumerate(LADOS):
            c = _precio(p, lado)
            po = float(own["p" + lado])
            ev = po * c - 1
            if VAL_CMIN <= c <= VAL_CMAX and ev >= VAL_EV and po - q[i] >= VAL_PTS and (mejor is None or ev > mejor[0]):
                mejor = (ev, _fila(liga, p, "valor", lado, po, c, dict(mercado=round(float(q[i]), 4), ev=round(ev, 4))))
        if mejor:
            val.append(mejor)
    seg = [f for _, f in sorted(seg, key=lambda x: (-x[0], x[1]["kickoff"]))[:MAX_DIA]]
    usados = {f["id"] for f in seg}   # nunca dos picks del mismo partido (podrían contradecirse)
    val = [f for _, f in sorted(val, key=lambda x: (-x[0], x[1]["kickoff"])) if f["id"] not in usados][:MAX_DIA]
    return seg + val


def _calificar(f, res, ahora):
    if f["res"] is not None:
        return
    if f["id"] in res:
        hg, ag = res[f["id"]]
        r = "H" if hg > ag else "D" if hg == ag else "A"
        f.update(hg=int(hg), ag=int(ag), res="G" if r == f["lado"] else "P")
    elif ahora > _ts(f["kickoff"]) + timedelta(days=NULO_DIAS):
        f["res"] = "N"


def _ganancia(f):
    return {"G": f["cuota"] - 1, "P": -1.0}.get(f["res"], 0.0)


def resumen(dias):
    filas = [f for d in sorted(dias) for f in dias[d]["picks"]]
    out = {}
    for est in ("seguro", "valor", "todos"):
        fs = [f for f in filas if est == "todos" or f["est"] == est]
        cal = [f for f in fs if f["res"] in ("G", "P")]
        g = sum(f["res"] == "G" for f in cal)
        u = sum(_ganancia(f) for f in cal)
        serie, acc, dia_ant = [], 0.0, None
        for f in sorted(cal, key=lambda x: x["kickoff"]):
            acc += _ganancia(f)
            d = _dia_local(f["kickoff"])
            if serie and serie[-1]["dia"] == d:
                serie[-1].update(u=round(acc, 3), n=serie[-1]["n"] + 1)
            else:
                serie.append(dict(dia=d, u=round(acc, 3), n=(serie[-1]["n"] if serie else 0) + 1))
        clv = [f["cuota"] / f["cierre"] - 1 for f in cal if f.get("cierre")]
        out[est] = dict(n=len(cal), ganados=int(g), perdidos=len(cal) - int(g), nulos=sum(f["res"] == "N" for f in fs),
                        pendientes=sum(f["res"] is None for f in fs), unidades=round(u, 3),
                        roi=round(u / len(cal), 4) if cal else None, acierto=round(g / len(cal), 4) if cal else None,
                        esperado=round(sum(f["prob"] for f in cal) / len(cal), 4) if cal else None,
                        cuota_media=round(sum(f["cuota"] for f in cal) / len(cal), 3) if cal else None,
                        clv=round(sum(clv) / len(clv), 4) if clv else None, serie=serie)
    return out


def actualizar(partidos, jugados, ahora=None):
    """partidos: lista de (liga, partido) con lo publicado; jugados: DataFrame id/hg/ag."""
    ahora = ahora or pd.Timestamp.now(tz="UTC")
    ahora = _ts(ahora)
    loc = ahora.tz_convert(TZ)
    st = _cargar()
    dias = st["dias"]
    # 1) fijar las listas que tocan: hoy (si no se fijó a tiempo) y mañana desde las 18:00
    for d in (loc.date(), loc.date() + timedelta(days=1)):
        key = d.isoformat()
        if key in dias or key < REGLAS["desde"]:
            continue
        hora = datetime(d.year, d.month, d.day, tzinfo=TZ) - timedelta(days=1) + timedelta(hours=HORA_FIJA)
        if loc < hora:
            continue
        picks = elegir(_candidatos(partidos, key, ahora))
        dias[key] = dict(fijado=ahora.isoformat(timespec="minutes").replace("+00:00", "Z"), tarde=bool(loc.date() == d), picks=picks)
        print(f"  Picks públicos {key}: {sum(f['est'] == 'seguro' for f in picks)} seguros · {sum(f['est'] == 'valor' for f in picks)} de valor")
    # 2) cuota de cierre (la última antes del inicio) y 3) calificar
    vivos = {str(p["id"]): p for _, p in partidos}
    res = {}
    if jugados is not None and len(jugados):
        for x in jugados.dropna(subset=["hg", "ag"]).itertuples():
            res[str(x.id)] = (x.hg, x.ag)
    for d in dias.values():
        for f in d["picks"]:
            p = vivos.get(f["id"])
            if p is not None and f["res"] is None and ahora < _ts(f["kickoff"]):
                c = _precio(p, f["lado"])
                if c:
                    f["cierre"] = round(c, 3)
            _calificar(f, res, ahora)
    st.update(reglas=REGLAS, actualizado=ahora.isoformat(timespec="minutes").replace("+00:00", "Z"))
    os.makedirs(os.path.dirname(ARCHIVO), exist_ok=True)
    with open(ARCHIVO, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    sig = loc.date() + timedelta(days=1)
    while sig.isoformat() in dias:
        sig += timedelta(days=1)
    prox = datetime(sig.year, sig.month, sig.day, tzinfo=TZ) - timedelta(days=1) + timedelta(hours=HORA_FIJA)
    return dict(reglas=REGLAS, actualizado=st["actualizado"], resumen=resumen(dias),
                proxima=dict(dia=sig.isoformat(), hora=prox.isoformat(timespec="minutes")),
                dias=[dict(dia=k, **dias[k]) for k in sorted(dias, reverse=True)][:120])
