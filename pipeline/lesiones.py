"""Lesiones y suspensiones desde API-Football (api-football.com).

- Usa la clave guardada en el secreto de GitHub API_FOOTBALL_KEY (variable de entorno).
- Una sola consulta por día de partidos (/injuries?date=AAAA-MM-DD) cubre todas las ligas.
- Para cuidar el plan gratis (100 consultas al día) cada fecha se vuelve a pedir solo si
  la copia guardada tiene más de MIN_HORAS horas.
- Si no hay clave, se acabaron las consultas o la API falla, el sitio sigue funcionando sin bajas.
"""
import difflib
import json
import os
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = "https://v3.football.api-sports.io"
CARPETA = os.path.join(os.path.dirname(__file__), "..", "data", "api_football")
MIN_HORAS = float(os.environ.get("API_FOOTBALL_MIN_HORAS", "6"))
DIAS = int(os.environ.get("API_FOOTBALL_DIAS", "3"))
ESTADO = {"activa": False, "consultas": 0, "restantes": None, "errores": [], "fechas": {}}

STOP = {"fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "cd", "ud", "sd", "rc", "rcd", "club", "de", "del", "la", "el",
        "real", "sporting", "athletic", "fk", "sk", "if", "bk", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "09", "1899", "1909", "1913"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(w for w in s.split() if w)


def core(s):
    ws = [w for w in norm(s).split() if w not in STOP]
    return " ".join(ws) or norm(s)


ALIAS = {"wolves": "wolverhampton wanderers", "spurs": "tottenham hotspur", "psg": "paris saint germain",
         "man united": "manchester united", "man utd": "manchester united", "man city": "manchester city",
         "inter": "internazionale", "nottm forest": "nottingham forest", "bayern munchen": "bayern munich",
         "atletico madrid": "atletico madrid", "newcastle": "newcastle united", "brighton": "brighton hove albion",
         "west ham": "west ham united", "leeds": "leeds united", "leicester": "leicester city"}


def same_team(a, b):
    na, nb = norm(a), norm(b)
    na, nb = ALIAS.get(na, na), ALIAS.get(nb, nb)
    ca, cb = core(na), core(nb)
    if not ca or not cb:
        return 0.0
    if ca == cb:
        return 1.0
    ta, tb = set(ca.split()), set(cb.split())
    if ta <= tb or tb <= ta:
        return 0.92
    r = difflib.SequenceMatcher(None, ca, cb).ratio()
    if (ta - tb) and (tb - ta) and len(ta) > 1 and len(tb) > 1:
        r *= 0.75   # "manchester united" frente a "manchester city"
    return r


def asignar(bajas, partidos):
    """Asigna cada baja al partido y equipo más parecido de ese día.
    partidos: lista de (clave, kickoff, home, away). Solo acepta coincidencias claras."""
    por_dia = {}
    for clave, k, h, a in partidos:
        for lado, team in (("h", h), ("a", a)):
            por_dia.setdefault(k[:10], []).append((clave, lado, team))
    out = {}
    for b in bajas:
        f = (b.get("fecha") or "")[:10]
        if not f:
            continue
        d0 = datetime.fromisoformat(f)
        cands = [c for dd in (-1, 0, 1) for c in por_dia.get((d0 + timedelta(days=dd)).date().isoformat(), [])]
        if not cands:
            continue
        sc = sorted(((same_team(b["equipo"], t), clave, lado) for clave, lado, t in cands), reverse=True)
        best = sc[0]
        segundo = next((x for x in sc[1:] if (x[1], x[2]) != (best[1], best[2])), (0, None, None))
        if best[0] < 0.8 or best[0] - segundo[0] < 0.08:
            continue
        lista = out.setdefault(best[1], {"h": [], "a": []})[best[2]]
        if not any(x["jug"] == b["jug"] for x in lista):
            lista.append({"jug": b["jug"], "tipo": b["tipo"], "motivo": b["motivo"], "foto": b.get("foto")})
    return out


def _get(path):
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    req = urllib.request.Request(BASE + path, headers={"x-apisports-key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        ESTADO["consultas"] += 1
        rem = r.headers.get("x-ratelimit-requests-remaining")
        if rem is not None:
            try:
                ESTADO["restantes"] = int(rem)
            except ValueError:
                pass
        return json.loads(r.read().decode("utf-8"))


def _cargar_fecha(dia):
    os.makedirs(CARPETA, exist_ok=True)
    path = os.path.join(CARPETA, f"lesiones_{dia}.json")
    viejo = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            viejo = json.load(f)
        edad = (datetime.now(timezone.utc) - datetime.fromisoformat(viejo["pedido"])).total_seconds() / 3600
        if edad < MIN_HORAS:
            ESTADO["fechas"][dia] = {"filas": len(viejo["filas"]), "desde_cache": True}
            return viejo["filas"]
    try:
        data = _get(f"/injuries?date={dia}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        ESTADO["errores"].append(f"{dia}: {e}")
        return viejo["filas"] if viejo else []
    errs = data.get("errors")
    if errs:
        ESTADO["errores"].append(f"{dia}: {errs}")
        return viejo["filas"] if viejo else []
    filas = []
    for it in data.get("response", []):
        p, t, fx = it.get("player") or {}, it.get("team") or {}, it.get("fixture") or {}
        filas.append({"jug": p.get("name"), "tipo": p.get("type"), "motivo": p.get("reason"), "equipo": t.get("name"),
                      "fecha": fx.get("date"), "liga": (it.get("league") or {}).get("name"), "foto": p.get("photo")})
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"pedido": datetime.now(timezone.utc).isoformat(timespec="minutes"), "filas": filas}, f, ensure_ascii=False)
    ESTADO["fechas"][dia] = {"filas": len(filas), "desde_cache": False}
    return filas


def cargar():
    """Devuelve la lista de bajas de hoy y los próximos días (todas las ligas)."""
    if not os.environ.get("API_FOOTBALL_KEY", "").strip():
        print("  (sin API_FOOTBALL_KEY: se omiten lesiones)")
        return []
    ESTADO["activa"] = True
    hoy = datetime.now(timezone.utc).date()
    filas = []
    for i in range(DIAS):
        filas += _cargar_fecha((hoy + timedelta(days=i)).isoformat())
    # limpiar copias viejas
    if os.path.isdir(CARPETA):
        for fn in os.listdir(CARPETA):
            m = re.match(r"lesiones_(\d{4}-\d{2}-\d{2})\.json$", fn)
            if m and m.group(1) < (hoy - timedelta(days=2)).isoformat():
                os.remove(os.path.join(CARPETA, fn))
    print(f"  API-Football: {len(filas)} bajas · {ESTADO['consultas']} consultas · restantes hoy: {ESTADO['restantes']}"
          + (f" · errores: {ESTADO['errores']}" if ESTADO["errores"] else ""))
    return filas


def jugador_igual(nombre_api, nombre_espn):
    """API-Football suele escribir 'E. Haaland'; ESPN, 'Erling Haaland'."""
    a, b = norm(nombre_api).split(), norm(nombre_espn).split()
    if not a or not b:
        return False
    if a == b:
        return True
    if a[-1] != b[-1]:
        return False
    ia = a[0][0] if a[0] else ""
    return len(a) == 1 or len(b) == 1 or ia == b[0][0]


def guardar_estado():
    os.makedirs(CARPETA, exist_ok=True)
    with open(os.path.join(CARPETA, "estado.json"), "w", encoding="utf-8") as f:
        json.dump(dict(ESTADO, actualizado=datetime.now(timezone.utc).isoformat(timespec="minutes")), f, ensure_ascii=False, indent=1)


def suscripcion():
    """Plan y vencimiento de API-Football (/status, no gasta consultas). Se pide una vez al día."""
    path = os.path.join(CARPETA, "suscripcion.json")
    try:
        with open(path, encoding="utf-8") as f:
            sv = json.load(f)
        if datetime.now(timezone.utc) - datetime.fromisoformat(sv["revisado"]) < timedelta(hours=20):
            return sv
    except (OSError, ValueError, KeyError):
        sv = None
    if not os.environ.get("API_FOOTBALL_KEY", "").strip():
        return sv
    try:
        r = _get("/status").get("response") or {}
        s = r.get("subscription") or {}
        sv = {"plan": s.get("plan"), "vence": (s.get("end") or "")[:10] or None, "activa": bool(s.get("active")),
              "limite_dia": (r.get("requests") or {}).get("limit_day"), "revisado": datetime.now(timezone.utc).isoformat(timespec="minutes")}
        os.makedirs(CARPETA, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(sv, f, ensure_ascii=False, indent=1)
    except Exception as e:
        print("  (no pude revisar la suscripción de API-Football:", e, ")")
    return sv
