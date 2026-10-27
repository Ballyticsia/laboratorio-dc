import json, urllib.request, os, datetime
os.makedirs("diag/out", exist_ok=True)
G = lambda u: json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read())
S = "https://site.api.espn.com/apis/site/v2/sports/soccer"
out = {}
hoy = datetime.datetime.utcnow().strftime("%Y%m%d")
sb = G(f"{S}/eng.league_cup/scoreboard?dates={hoy}")
evs = [e for e in sb.get("events", []) if "Arsenal" in e.get("name", "") or "Fleetwood" in e.get("name", "")] or sb.get("events", [])[:1]
e = evs[0]; c = e["competitions"][0]
out["evento"] = {"id": e["id"], "name": e["name"], "status": c.get("status") or e.get("status"),
  "competitors": [{k: v for k, v in x.items() if k in ("homeAway", "score", "shootoutScore", "winner", "linescores")} for x in c["competitors"]],
  "details_pen": [d for d in c.get("details", []) if "enalty" in json.dumps(d.get("type", {}))][-12:]}
s = G(f"{S}/eng.league_cup/summary?event={e['id']}")
out["summary_keys"] = list(s.keys())
txt = json.dumps(s)
out["tiene_shootout"] = "shootout" in txt.lower()
for k in s:
    if "shoot" in k.lower(): out["clave_" + k] = s[k]
hc = s.get("header", {}).get("competitions", [{}])[0]
out["header_status"] = hc.get("status")
out["header_competitors"] = [{k: v for k, v in x.items() if k in ("homeAway", "score", "shootoutScore", "winner", "linescores")} for x in hc.get("competitors", [])]
ke = s.get("keyEvents", [])
out["keyEvents_ultimos"] = [{k: x.get(k) for k in ("type", "text", "shortText", "period", "clock", "shootout", "team", "scoringPlay", "participants")} for x in ke[-14:]]
com = s.get("commentary", [])
out["commentary_ultimos"] = [{"text": x.get("text"), "time": x.get("time"), "play": {k: (x.get("play") or {}).get(k) for k in ("type", "shootout", "period")}} for x in com[-14:]]
json.dump(out, open("diag/out/pen.json", "w"), ensure_ascii=False, indent=1)
