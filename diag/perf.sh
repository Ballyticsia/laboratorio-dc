#!/bin/bash
set +e
mkdir -p diag/out/lh2 diag/out/cap2
B=https://ballyticsia.github.io/laboratorio-dc
URLS="ballytics_inicio|$B/ ballytics_liga|$B/liga/premier/ ballytics_vivo|$B/#/vivo ballytics_partido|$B/#/partido/ligue1/401876420"
for x in $URLS; do n=${x%%|*}; u=${x#*|}
  for k in 1 2 3; do timeout 150 npx --yes lighthouse@12.6.0 "$u" --quiet --output=json --output-path=diag/out/lh2/${n}_$k.json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox" --max-wait-for-load=60000 || echo "falló $n"; done
done
timeout 150 npx --yes lighthouse@12.6.0 "$B/" --preset=desktop --quiet --output=json --output-path=diag/out/lh2/ballytics_inicioPC_1.json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox" || true
python3 diag/resumir2.py > diag/out/resumen2.txt 2>&1
node diag/capturas2.js || echo "capturas fallaron"
