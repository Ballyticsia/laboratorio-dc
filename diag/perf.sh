#!/bin/bash
# Diagnóstico de rendimiento y diseño: Lighthouse (móvil) de Ballytics y de sitios parecidos, capturas y prueba del redimensionador de ESPN
set +e
mkdir -p diag/out/lh diag/out/cap
B=https://ballyticsia.github.io/laboratorio-dc
URLS="ballytics_inicio|$B/ ballytics_liga|$B/liga/premier/ ballytics_vivo|$B/#/vivo sofascore|https://www.sofascore.com/ fotmob|https://www.fotmob.com/ 365scores|https://www.365scores.com/es onefootball|https://onefootball.com/es/inicio"
for x in $URLS; do n=${x%%|*}; u=${x#*|}
  timeout 150 npx --yes lighthouse@12.6.0 "$u" --quiet --output=json --output-path=diag/out/lh/$n.json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox" --max-wait-for-load=60000 || echo "falló $n"
done
python3 diag/resumir.py > diag/out/resumen.txt 2>&1
# redimensionador de ESPN
for u in "https://a.espncdn.com/i/teamlogos/soccer/500/359.png" "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/359.png&w=80&h=80" "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/359.png&w=80&h=80&format=webp" "https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/23.png&w=64&h=64" "https://a.espncdn.com/i/headshots/soccer/players/full/253989.png" "https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/253989.png&w=96&h=70" "https://media.api-sports.io/football/players/1100.png"; do
  echo "$u $(curl -s -o /dev/null -w '%{http_code} %{size_download} %{content_type} %{time_total}' "$u")" >> diag/out/espn.txt; done
node diag/capturas.js || echo "capturas fallaron"
