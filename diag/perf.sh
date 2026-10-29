#!/bin/bash
set +e
mkdir -p diag/out
pip install -q pillow >/dev/null 2>&1
python3 - > diag/out/img.txt 2>&1 <<'PY'
import urllib.request, io, time
from PIL import Image
U = ["https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/359.png&w=80&h=80",
     "https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/23.png&w=80&h=80",
     "https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/1543.png&w=80&h=80",
     "https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/arg.png&w=80&h=80",
     "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/359.png&w=80&h=80",
     "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/11995.png&w=48&h=48",
     "https://a.espncdn.com/i/leaguelogos/soccer/500/1543.png",
     "https://wsrv.nl/?url=media.api-sports.io/football/players/1100.png&w=96&h=96&fit=cover&output=webp",
     "https://wsrv.nl/?url=media.api-sports.io/football/leagues/203.png&w=96&h=96&fit=contain&output=webp",
     "https://media.api-sports.io/football/leagues/203.png",
     "https://images.weserv.nl/?url=media.api-sports.io/football/players/1100.png&w=96&h=96&fit=cover&output=webp"]
for u in U:
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30)
        b = r.read(); im = Image.open(io.BytesIO(b))
        print(r.status, len(b), im.size, im.mode, r.headers.get("content-type"), r.headers.get("cache-control"), r.headers.get("access-control-allow-origin"), round(time.time()-t, 2), u)
    except Exception as e:
        print("ERR", e, u)
PY
