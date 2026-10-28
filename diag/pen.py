import json, urllib.request, os
os.makedirs("diag/out", exist_ok=True)
G = lambda u: json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read())
s = G("https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=401925177")
out = {"shootout": s.get("shootout"), "header": s.get("header", {}).get("competitions", [{}])[0].get("status"),
       "competitors": [{k: v for k, v in x.items() if k in ("homeAway", "score", "shootoutScore", "winner", "team")} for x in s.get("header", {}).get("competitions", [{}])[0].get("competitors", [])],
       "commentary5": [c for c in s.get("commentary", []) if ((c.get("play") or {}).get("period") or {}).get("number") == 5 or "enalt" in (c.get("text") or "")],
       "gk": [{"homeAway": r.get("homeAway"), "gk": [{"n": (x.get("athlete") or {}).get("displayName"), "id": (x.get("athlete") or {}).get("id"), "starter": x.get("starter"), "subbedIn": x.get("subbedIn"), "pos": (x.get("position") or {}).get("abbreviation")} for x in r.get("roster", []) if str((x.get("position") or {}).get("abbreviation", "")).upper().startswith("G")]} for r in s.get("rosters", [])]}
json.dump(out, open("diag/out/pen.json", "w"), ensure_ascii=False, indent=1)
