"""Cuotas de varias casas desde The Odds API (the-odds-api.com), con Pinnacle como referencia.

- Usa la clave guardada en el secreto de GitHub ODDS_API_KEY (variable de entorno).
- El plan gratis trae 500 créditos al mes. Cada consulta de cuotas cuesta
  (mercados × regiones) = 2 créditos (1X2 y más/menos, región "eu", que incluye Pinnacle).
- La lista de partidos (/events) es gratis: solo se piden cuotas de una liga si tiene
  partidos dentro de VENTANA_H horas y la copia guardada tiene más de MIN_HORAS horas.
- Se guarda una reserva de créditos para no quedarse sin consultas antes de fin de mes.
- Probabilidad de mercado: Pinnacle sin margen si está; si no, el promedio sin margen de todas las casas.
- Si no hay clave o la API falla, se usan las cuotas de ESPN (DraftKings) como antes.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from calendar import monthrange
from datetime import datetime, timedelta, timezone

import lesiones

BASE = "https://api.the-odds-api.com/v4"
CARPETA = os.path.join(os.path.dirname(__file__), "..", "data", "odds_api")
MIN_HORAS = float(os.environ.get("ODDS_API_MIN_HORAS", "20"))
VENTANA_H = float(os.environ.get("ODDS_API_VENTANA_H", "36"))
RESERVA_DIA = float(os.environ.get("ODDS_API_RESERVA_DIA", "6"))   # créditos guardados por cada día que queda del mes
COSTO = 2

# liga de Ballytics -> competiciones de The Odds API
DEPORTES = {
    "premier": ["soccer_epl"], "laliga": ["soccer_spain_la_liga"], "seriea": ["soccer_italy_serie_a"],
    "bundesliga": ["soccer_germany_bundesliga"], "ligue1": ["soccer_france_ligue_one"], "championship": ["soccer_efl_champ"],
    "portugal": ["soccer_portugal_primeira_liga"], "eredivisie": ["soccer_netherlands_eredivisie"],
    "chile": ["soccer_chile_campeonato"], "argentina": ["soccer_argentina_primera_division"],
    "brasil": ["soccer_brazil_campeonato"], "mls": ["soccer_usa_mls"], "champions": ["soccer_uefa_champs_league"],
    "libertadores": ["soccer_conmebol_copa_libertadores"],
    # ampliación (al final: si faltan créditos, se priorizan las de arriba)
    "europaleague": ["soccer_uefa_europa_league"], "conference": ["soccer_uefa_europa_conference_league"],
    "sudamericana": ["soccer_conmebol_copa_sudamericana"], "ligamx": ["soccer_mexico_ligamx"], "turquia": ["soccer_turkey_super_league"],
    "escocia": ["soccer_spl"], "belgica": ["soccer_belgium_first_div"],
}
ESTADO = {"activa": False, "creditos_usados": 0, "restantes": None, "consultas": {}, "errores": [], "ligas": {}, "partidos_con_cuota": 0}
_EVENTOS = {}   # liga -> lista de partidos con probabilidades


def _key():
    return os.environ.get("ODDS_API_KEY", "").strip()


def _get(path, params):
    q = dict(params, apiKey=_key())
    req = urllib.request.Request(f"{BASE}{path}?{urllib.parse.urlencode(q)}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        rem, last = r.headers.get("x-requests-remaining"), r.headers.get("x-requests-last")
        try:
            if rem is not None:
                ESTADO["restantes"] = int(float(rem))
            if last is not None:
                ESTADO["creditos_usados"] += int(float(last))
        except ValueError:
            pass
        return json.loads(r.read().decode("utf-8"))


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _sin_margen(precios):
    inv = [1 / p for p in precios if p and p > 1]
    if len(inv) != len(precios):
        return None
    s = sum(inv)
    return [x / s for x in inv]


def resumir(ev):
    """De la respuesta de una casa a probabilidades sin margen (Pinnacle o promedio de casas)."""
    home, away = ev.get("home_team"), ev.get("away_team")
    libros = []
    for bk in ev.get("bookmakers") or []:
        h2h = next((m for m in bk.get("markets") or [] if m.get("key") == "h2h"), None)
        if not h2h:
            continue
        pr = {o.get("name"): o.get("price") for o in h2h.get("outcomes") or []}
        q = _sin_margen([pr.get(home), pr.get("Draw"), pr.get(away)])
        if not q:
            continue
        tot = next((m for m in bk.get("markets") or [] if m.get("key") == "totals"), None)
        lineas = {}
        for o in (tot or {}).get("outcomes") or []:
            if o.get("point") is not None:
                lineas.setdefault(float(o["point"]), {})[o.get("name")] = o.get("price")
        libros.append(dict(key=bk.get("key"), titulo=bk.get("title"), q=q, lineas=lineas))
    if not libros:
        return None
    pin = next((b for b in libros if b["key"] == "pinnacle"), None)
    if pin:
        q, fuente, base = pin["q"], "Pinnacle", [pin]
    else:
        q = [sum(b["q"][i] for b in libros) / len(libros) for i in range(3)]
        fuente, base = (f"promedio de {len(libros)} casas" if len(libros) > 1 else libros[0]["titulo"]), libros
    # más/menos: la línea más común entre las casas de referencia, preferentemente 2,5
    cand = {}
    for b in base:
        for ln, o in b["lineas"].items():
            qo = _sin_margen([o.get("Over"), o.get("Under")])
            if qo:
                cand.setdefault(ln, []).append(qo[0])
    linea = over = None
    if cand:
        linea = 2.5 if 2.5 in cand else max(cand, key=lambda ln: (len(cand[ln]), -abs(ln - 2.5)))
        over = sum(cand[linea]) / len(cand[linea])
    return dict(kickoff=ev.get("commence_time"), home=home, away=away, fuente=fuente, casas=len(libros),
                h=round(q[0], 4), d=round(q[1], 4), a=round(q[2], 4),
                linea=linea, over=round(over, 4) if over is not None else None)


def _presupuesto_ok():
    rem = ESTADO["restantes"]
    if rem is None:
        return True
    hoy = datetime.now(timezone.utc).date()
    quedan = monthrange(hoy.year, hoy.month)[1] - hoy.day
    return rem - COSTO >= RESERVA_DIA * quedan


def _cargar_deporte(sport, ahora):
    os.makedirs(CARPETA, exist_ok=True)
    path = os.path.join(CARPETA, f"{sport}.json")
    viejo = None
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                viejo = json.load(f)
        except (OSError, ValueError):
            viejo = None
    guardados = [e for e in (viejo or {}).get("partidos", []) if (e.get("kickoff") or "") >= _iso(ahora - timedelta(hours=3))]
    edad = None
    if viejo and viejo.get("pedido"):
        edad = (ahora - datetime.fromisoformat(viejo["pedido"])).total_seconds() / 3600
    if edad is not None and edad < MIN_HORAS:
        return guardados, "copia"
    try:
        evs = _get(f"/sports/{sport}/events", {"commenceTimeFrom": _iso(ahora), "commenceTimeTo": _iso(ahora + timedelta(hours=VENTANA_H))})
    except (urllib.error.URLError, OSError, ValueError) as e:
        ESTADO["errores"].append(f"{sport} events: {e}")
        return guardados, "error"
    if not isinstance(evs, list) or not evs:
        return guardados, "sin partidos cerca"
    if not _presupuesto_ok():
        return guardados, "reserva de créditos"
    try:
        data = _get(f"/sports/{sport}/odds", {"regions": "eu", "markets": "h2h,totals", "oddsFormat": "decimal",
                                              "commenceTimeFrom": _iso(ahora), "commenceTimeTo": _iso(ahora + timedelta(days=4))})
    except (urllib.error.URLError, OSError, ValueError) as e:
        ESTADO["errores"].append(f"{sport} odds: {e}")
        return guardados, "error"
    if isinstance(data, dict):   # mensaje de error de la API
        ESTADO["errores"].append(f"{sport}: {data.get('message') or data}")
        return guardados, "error"
    nuevos = [x for x in (resumir(ev) for ev in data) if x]
    ids = {(e["kickoff"], e["home"], e["away"]) for e in nuevos}
    todos = nuevos + [e for e in guardados if (e["kickoff"], e["home"], e["away"]) not in ids]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"pedido": ahora.isoformat(timespec="minutes"), "partidos": todos}, f, ensure_ascii=False)
    return todos, "actualizada"


def cargar(ligas):
    """Carga (o reutiliza) las cuotas de cada liga. Devuelve cuántos partidos tienen cuota."""
    if not _key():
        print("  (sin ODDS_API_KEY: se usan las cuotas de ESPN)")
        return 0
    ESTADO["activa"] = True
    ahora = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    n = 0
    for lid in ligas:
        evs = []
        for sport in DEPORTES.get(lid, []):
            e, como = _cargar_deporte(sport, ahora)
            evs += e
            ESTADO["consultas"][sport] = como
        _EVENTOS[lid] = evs
        n += len(evs)
    print(f"  The Odds API: {n} partidos con cuota · {ESTADO['creditos_usados']} créditos usados ahora · restantes: {ESTADO['restantes']}"
          + (f" · errores: {ESTADO['errores']}" if ESTADO["errores"] else ""))
    return n


def buscar(liga, kickoff, home, away):
    """Probabilidades de mercado del partido (o None)."""
    evs = _EVENTOS.get(liga) or []
    if not evs:
        return None
    try:
        k = datetime.fromisoformat(str(kickoff).replace("Z", "+00:00"))
    except ValueError:
        return None
    best, score = None, 0.0
    for e in evs:
        try:
            ke = datetime.fromisoformat(e["kickoff"].replace("Z", "+00:00"))
        except (ValueError, KeyError, AttributeError):
            continue
        if abs((ke - k).total_seconds()) > 3 * 3600:
            continue
        s = min(lesiones.same_team(e["home"], home), lesiones.same_team(e["away"], away))
        if s > score:
            best, score = e, s
    return best if score >= 0.8 else None


def guardar_estado():
    os.makedirs(CARPETA, exist_ok=True)
    with open(os.path.join(CARPETA, "estado.json"), "w", encoding="utf-8") as f:
        json.dump(dict(ESTADO, actualizado=datetime.now(timezone.utc).isoformat(timespec="minutes")), f, ensure_ascii=False, indent=1)
