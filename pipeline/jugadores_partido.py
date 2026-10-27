"""Estadísticas de cada jugador dentro de un partido (nota, pases, tiros, duelos…) desde API-Football.

El sitio deja en el almacenamiento KV de Cloudflare (llave "afped") los partidos que la gente está
mirando. Este programa, que corre en GitHub cada 10 minutos, los baja de API-Football y los deja en KV
("afj:<id de ESPN>") para que el servidor los entregue. Se hace desde GitHub porque API-Football limita
las consultas que salen de los servidores compartidos de Cloudflare.

Necesita API_FOOTBALL_KEY, CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID. Cuida el límite diario:
deja RESERVA consultas libres para las bajas del robot principal.
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
ESPERA = float(os.environ.get("AF_ESPERA", "6.5"))   # segundos entre consultas (plan gratis: 10 por minuto; Pro: 300)

AF = "https://v3.football.api-sports.io"
CF = "https://api.cloudflare.com/client/v4/accounts/{acc}/storage/kv/namespaces"
RESERVA = int(os.environ.get("JUG_RESERVA", "25"))
MAX_POR_CORRIDA = int(os.environ.get("JUG_MAX", "8"))
KEY = os.environ.get("API_FOOTBALL_KEY", "")
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACC = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
restantes = None
ultima = 0.0

STOP = {"fc", "cf", "sc", "ac", "afc", "cd", "club", "de", "al", "the", "fk", "sk", "if", "bk", "united", "city", "deportivo", "atletico", "sporting", "real", "ca", "cr", "u", "sad"}


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s).split() if w not in STOP]


def parecido(a, b):
    A, B = norm(a), norm(b)
    if not A or not B:
        return 0.0
    n = sum(1 for w in A if any(x == w or (len(w) > 3 and (x.startswith(w) or w.startswith(x))) for x in B))
    return n / max(len(A), len(B))


def cf(method, path, body=None, ttl=None):
    url = CF.format(acc=ACC) + path + (f"?expiration_ttl={ttl}" if ttl else "")
    data = body.encode() if isinstance(body, str) else body
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def namespace():
    j = json.loads(cf("GET", "?per_page=100"))
    for ns in j.get("result", []):
        if ns.get("title") == "ballytics-avisos":
            return ns["id"]
    return None


def kv_get(ns, k):
    v = cf("GET", f"/{ns}/values/{urllib.parse.quote(k, safe='')}")
    return json.loads(v) if v else None


def kv_put(ns, k, v, ttl=None):
    cf("PUT", f"/{ns}/values/{urllib.parse.quote(k, safe='')}", json.dumps(v, ensure_ascii=False), ttl)


def af(path):
    """Una consulta a API-Football, respetando 10 por minuto y la reserva diaria."""
    global restantes, ultima
    if restantes is not None and restantes <= RESERVA:
        raise RuntimeError("reserva")
    espera = ESPERA - (time.time() - ultima)
    if espera > 0:
        time.sleep(espera)
    req = urllib.request.Request(AF + path, headers={"x-apisports-key": KEY, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        ultima = time.time()
        rem = r.headers.get("x-ratelimit-requests-remaining")
        if rem is not None and rem.lstrip("-").isdigit():
            restantes = int(rem)
        j = json.loads(r.read().decode())
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"])[:200])
    return j.get("response") or []


def n0(v):
    try:
        return None if v is None else int(float(v))
    except (TypeError, ValueError):
        return None


def compactar(resp, fid):
    eqs = []
    for t in resp:
        js = []
        for p in t.get("players") or []:
            s = (p.get("statistics") or [{}])[0]
            g = s.get("games") or {}
            sh, go, pa, tk, du, dr, fo, ca, pe = (s.get(k) or {} for k in ("shots", "goals", "passes", "tackles", "duels", "dribbles", "fouls", "cards", "penalty"))
            r = g.get("rating")
            try:
                r = round(float(r), 1) if r else None
            except (TypeError, ValueError):
                r = None
            acc = pa.get("accuracy")
            js.append(dict(id=p["player"]["id"], n=p["player"]["name"], foto=p["player"].get("photo"), num=n0(g.get("number")), pos=g.get("position"),
                           min=n0(g.get("minutes")), r=r, cap=bool(g.get("captain")), sup=bool(g.get("substitute")),
                           sh=n0(sh.get("total")), sot=n0(sh.get("on")), g=n0(go.get("total")), **{"as": n0(go.get("assists"))}, sv=n0(go.get("saves")), gc=n0(go.get("conceded")),
                           pas=n0(pa.get("total")), kp=n0(pa.get("key")), acc=n0(str(acc).rstrip("%")) if acc is not None else None,
                           tk=n0(tk.get("total")), blk=n0(tk.get("blocks")), int=n0(tk.get("interceptions")), du=n0(du.get("total")), duw=n0(du.get("won")),
                           dr=n0(dr.get("attempts")), drs=n0(dr.get("success")), fd=n0(fo.get("drawn")), fc=n0(fo.get("committed")),
                           yc=n0(ca.get("yellow")), rc=n0(ca.get("red")), off=n0(s.get("offsides")), pw=n0(pe.get("won")), ps=n0(pe.get("scored")), pm=n0(pe.get("missed"))))
        eqs.append(dict(nombre=(t.get("team") or {}).get("name"), logo=(t.get("team") or {}).get("logo"), jugadores=js))
    return dict(fixture=fid, equipos=eqs)


def main():
    if not (KEY and TOKEN and ACC):
        print("Faltan secretos (API_FOOTBALL_KEY / CLOUDFLARE_*): no hago nada.")
        return
    ns = namespace()
    if not ns:
        print("No encontré el almacenamiento del servidor.")
        return
    ped = kv_get(ns, "afped") or {}
    ahora = time.time() * 1000
    orden = sorted(ped.items(), key=lambda kv: ({"in": 0, "post": 1}.get(kv[1].get("st"), 2), -kv[1].get("t", 0)))
    hechos, listas = 0, {}
    for eid, p in orden:
        if hechos >= MAX_POR_CORRIDA:
            break
        c = kv_get(ns, f"afj:{eid}")
        if c and (c.get("fin") or c.get("sin") or (p.get("st") != "post" and ahora - c.get("t", 0) < 9 * 60000)):
            continue
        try:
            fid = (c or {}).get("data", {}).get("fixture") or kv_get(ns, f"afm:{eid}")
            if not fid:
                k = p.get("k") or ""
                d = k[:10]
                if not re.match(r"\d{4}-\d{2}-\d{2}$", d):
                    continue
                if d not in listas:
                    listas[d] = kv_get(ns, f"afd:{d}")
                    if not listas[d]:
                        listas[d] = [[f["fixture"]["id"], f["fixture"]["timestamp"], f["teams"]["home"]["name"], f["teams"]["away"]["name"]] for f in af(f"/fixtures?date={d}")]
                        kv_put(ns, f"afd:{d}", listas[d], ttl=3 * 86400)
                ts = datetime.fromisoformat(k.replace("Z", "+00:00")).timestamp()
                best, bs = None, 0.0
                for f_id, t, fh, fa in listas[d]:
                    if abs(t - ts) > 20 * 60:
                        continue
                    sc = parecido(p.get("h"), fh) + parecido(p.get("a"), fa)
                    if sc > bs:
                        best, bs = f_id, sc
                if not best or bs < 0.6:
                    print(f"  {eid}: no encontré el partido en API-Football ({p.get('h')} vs {p.get('a')})")
                    kv_put(ns, f"afj:{eid}", {"t": ahora, "sin": "cruce"}, ttl=6 * 3600)
                    continue
                fid = best
                kv_put(ns, f"afm:{eid}", fid, ttl=30 * 86400)
            resp = af(f"/fixtures/players?fixture={fid}")
            hechos += 1
            if not resp:
                if p.get("st") == "post":
                    kv_put(ns, f"afj:{eid}", {"t": ahora, "sin": "datos"}, ttl=12 * 3600)
                print(f"  {eid}: API-Football no tiene estadísticas por jugador")
                continue
            data = compactar(resp, fid)
            kv_put(ns, f"afj:{eid}", {"t": time.time() * 1000, "fin": p.get("st") == "post", "data": data}, ttl=30 * 86400)
            print(f"  {eid}: {p.get('h')} vs {p.get('a')} · {sum(len(e['jugadores']) for e in data['equipos'])} jugadores")
        except RuntimeError as e:
            print(f"  se detiene: {e}")
            break
        except Exception as e:  # un partido con problemas no frena a los demás
            print(f"  {eid}: error {e}")
    kv_put(ns, "afrem", {"d": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "n": restantes, "t": datetime.now(timezone.utc).isoformat(timespec="minutes"), "hechos": hechos})
    print(f"Listo: {hechos} partidos · consultas restantes hoy: {restantes}")


if __name__ == "__main__":
    sys.exit(main())
