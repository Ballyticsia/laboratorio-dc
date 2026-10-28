# Ballytics

Sitio de probabilidades de fútbol con un modelo Dixon-Coles abierto. Se actualiza solo tres veces al día con GitHub Actions y se publica gratis en GitHub Pages.

- **Portada tipo panel:** partido destacado, jugador destacado, equipo en forma, proyección de partido, ranking de fuerza, tabla, próximos partidos, trío más probable, rachas y rendimiento del modelo.
- **Página por partido:** goles esperados, marcador exacto, comparación de la temporada, goleadores probables, últimos enfrentamientos y mercados (1X2, goles, ambos marcan, córners, tarjetas, goleador) con calculadora de valor esperado.
- **Ligas:** resumen, tabla con zonas, partidos por semana, estadísticas de equipos, goleadores y amonestados, rachas, córners y tarjetas, proyección de fin de temporada (10.000 simulaciones) y fuerza.
- **Equipos:** estadísticas, próximos partidos, resultados con goleadores y rachas.
- **Registro público:** cada predicción se guarda antes del partido y se califica después.
- **Cómo funciona:** el método y el backtest contra las cuotas de mercado.

Ligas: Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Championship, Primeira Liga, Eredivisie, Primera División de Chile, Liga Profesional Argentina, Brasileirão, MLS, Champions League y Copa Libertadores. Datos: marcadores públicos de ESPN.

---

## Ponerlo en línea (una sola vez, ~15 minutos)

### 1. Crear la cuenta y el repositorio
1. Entra a **github.com** y crea una cuenta gratis (**Sign up**).
2. Arriba a la derecha toca **+** → **New repository**.
3. Nombre: `laboratorio-dc` (o el que quieras). Marca **Public**. No marques nada más. Toca **Create repository**.

### 2. Subir los archivos
1. Descomprime el zip en tu computador.
2. En la página del repositorio recién creado, toca el enlace **uploading an existing file**.
3. Abre la carpeta descomprimida, **selecciona todo su contenido** (las carpetas `.github`, `data`, `pipeline`, `site` y los archivos sueltos) y arrástralo a la página.
4. Abajo toca **Commit changes**.
5. Revisa que aparezca la carpeta `.github`. Si no aparece (algunos navegadores no suben carpetas que empiezan con punto), haz esto:
   - **Add file → Create new file**.
   - En el nombre escribe exactamente `.github/workflows/actualizar.yml`.
   - Pega el contenido del archivo `actualizar.yml` del zip y toca **Commit changes**.

### 3. Activar GitHub Pages
1. En el repositorio: **Settings** → menú izquierdo **Pages**.
2. En **Source** elige **GitHub Actions**.

### 4. Correr la primera actualización
1. Pestaña **Actions**. Si aparece un botón verde para habilitar los workflows, tócalo.
2. Elige **Actualizar datos y publicar** → **Run workflow** → **Run workflow**.
3. Espera a que salga el ✓ verde. La primera vez tarda 5–10 minutos porque baja tres temporadas.
4. Tu sitio queda en `https://TU-USUARIO.github.io/laboratorio-dc/`. El enlace también aparece en **Settings → Pages**.

Desde ahí se actualiza solo a las 06:17, 12:17 y 18:17 (hora de Chile).

---

## Si algo falla
- **El workflow sale en rojo:** entra a la ejecución, abre el paso que falló y copia el error. Lo más probable es que ESPN haya rechazado la conexión desde los servidores de GitHub; en ese caso hay que cambiar de fuente de datos.
- **El sitio dice "No pude cargar los datos":** la primera actualización aún no termina, o falló. Revisa la pestaña **Actions**.
- **GitHub pausa los workflows programados** si un repositorio pasa 60 días sin actividad. Los commits automáticos de datos cuentan como actividad, pero si ves que se detuvo, entra a **Actions** y reactívalo.

## Probarlo en tu computador
```
python -m pip install -r requirements.txt
python pipeline/generar.py
cd site
python -m http.server 8000
```
Luego abre `http://localhost:8000` en el navegador. Abrir `index.html` con doble clic no funciona, porque el navegador bloquea la lectura de los datos.

## Archivos
| Ruta | Qué es |
|---|---|
| `pipeline/modelo.py` | El modelo Dixon-Coles (ataque, defensa, localía, rho, ponderación temporal). |
| `pipeline/datos.py` | Descarga de ESPN con caché por mes. |
| `pipeline/generar.py` | Ajusta el modelo por liga y escribe los JSON del sitio y el registro. |
| `site/` | El sitio web (HTML, CSS y JavaScript sin dependencias). |
| `site/data/` | Datos que genera el pipeline (los escribe el robot). |
| `data/registro.csv` | Registro histórico de predicciones; no lo edites a mano. |
| `data/cache_espn/` | Meses ya descargados de ESPN. |
| `.github/workflows/actualizar.yml` | El robot: horario, pasos y publicación. |

## API-Football (lesiones y suspensiones)
El robot usa la clave guardada en **Settings → Secrets and variables → Actions** con el nombre `API_FOOTBALL_KEY`.
- Con el plan gratis (100 consultas al día) consulta las bajas de hoy y mañana cada 6 horas (unas 8 consultas al día); el plan gratis no permite fechas más lejanas.
- Con el plan Pro se puede subir `API_FOOTBALL_DIAS` a `3` y bajar `API_FOOTBALL_MIN_HORAS` a `2` en `.github/workflows/actualizar.yml`.
- El estado de la conexión (consultas usadas, restantes y errores) queda en `data/api_football/estado.json`.
- Si la clave falta o la API falla, el sitio sigue funcionando sin bajas.

## Probabilidad Ballytics, modelo propio y mercado
- Si ESPN trae cuota (hoy DraftKings), `modelo.calibrar()` busca los goles esperados que reproducen la cuota sin margen (1X2 y más/menos). De ahí salen todos los mercados del partido.
- Si no hay cuota, se usa el modelo propio (y el ajuste por bajas).
- El modelo propio queda guardado en `p.modelo`, y el registro guarda las tres versiones: modelo propio (`pH…top`), mercado (`mH…mA`) y Ballytics (`fH…ftop`).
- La razón está en `pipeline/backtest_mercado.json`: en 3.747 partidos de 2025-26 la cuota fue más precisa en el 1X2, y sus goles implícitos mejoraron el marcador exacto y "ambos marcan".

## The Odds API (Pinnacle y otras casas)
Secreto `ODDS_API_KEY`. Con el plan gratis (500 créditos al mes) cada liga se actualiza más o menos una vez al día, solo si juega en las próximas 36 horas, y se guarda una reserva para no quedarse sin créditos. El estado queda en `data/odds_api/estado.json`. Sin clave se usan las cuotas de ESPN (DraftKings).

## xG (goles esperados)
El robot guarda el xG de los partidos terminados desde las estadísticas de API-Football (`data/xg/partidos.json`); como el plan gratis solo deja consultar de ayer a mañana, la historia se arma día a día. `pipeline/backtest_xg.py` (workflow "Backtest de xG", mensual o a mano) compara el modelo con y sin xG, y el robot lo usa solo si `data/backtest_xg.json` dice `"usar": true`. Understat no se usa porque no permite descargas automáticas.

## App instalable y avisos de gol
- `site/manifest.webmanifest` y `site/sw.js` hacen que Ballytics se pueda instalar (en iPhone/iPad: Safari → Compartir → Agregar a inicio).
- `worker/index.js` es el servidor de avisos (Cloudflare Workers, plan gratis): cada minuto revisa en ESPN los partidos que alguien sigue y manda un push al haber gol, roja, alineaciones, 15 minutos antes, al empezar y al terminar (cada persona elige cuáles en "🔔 Avisos").
- `.github/workflows/avisos.yml` lo instala solo con los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, y escribe su dirección en `site/avisos.json`.
- En iPhone/iPad los avisos con la app cerrada solo funcionan si Ballytics está instalada en la pantalla de inicio.

## Votos, prode y fichas
- El mismo servidor guarda los votos de "¿Quién gana?" (`/voto`, `/votos`) y los prodes con amigos (`/prode/...`): 3 puntos por marcador exacto y 1 por acertar el ganador o el empate. Los pronósticos de los demás se muestran cuando empieza el partido.
- El robot lee los votos al guardar cada predicción, y la página Registro compara a la gente con Ballytics.
- **Desafía a Ballytics:** el robot publica `site/data/picks.json` (marcador más probable de cada partido próximo). El servidor lo lee y Ballytics juega en todos los prodes con ese marcador; su pronóstico se congela cuando empieza el partido.
- **Respaldo:** en Mis pronósticos se puede descargar y cargar un archivo con todo lo guardado en el navegador (pronósticos, equipos seguidos, prodes) para pasarlo a otro dispositivo.
- La ficha de jugador (`#/ficha/<id>`) lee directo de ESPN; la curva de probabilidad en vivo se calcula en el navegador con el marcador, el minuto y las rojas.
- `pipeline/copas.py` simula la fase de liga de las copas UEFA y las llaves de ida y vuelta de CONMEBOL.

## Árbitros (API-Football)
- `pipeline/arbitros.py`: cada 12 horas baja la temporada de cada liga (`/fixtures?league&season`, con el árbitro) y cada 2 horas los partidos de ayer a pasado mañana de todas las competiciones (`site/data/arbitros.json`).
- Cruza cada partido de ESPN con API-Football (fecha y nombres) y une las variantes del nombre del árbitro ("M. Vergara" = "Manuel Vergara").
- Calcula, con resultados reales de la temporada: tarjetas y penales por partido y % de victorias del local con cada árbitro contra el promedio de la liga, y el historial de cada equipo con él. Si ESPN no publica tarjetas o penales de una liga (Uruguay, Paraguay), esos números no se muestran.
- Se ve en el partido (panel Árbitro), en la liga (pestaña Árbitros), en el centro del partido (Información) y la IA lo conoce. Las tarjetas ajustadas por árbitro se muestran, pero todavía no cambian el modelo.
- Medición antes de usarlo: el registro guarda desde el 28-10-2026 las tarjetas ajustadas por árbitro (`tA`) junto a las del modelo (`tE`) y las reales (`tR`), y `arbitros.backtest` compara con toda la temporada usando el factor de cada árbitro calculado con sus otros partidos. Se ve en Resultados del modelo ("¿Sirve ajustar las tarjetas por el árbitro?"). Primer resultado: con 3.024 partidos la señal existe pero es chica (error 1,77 → 1,76 tarjetas), y sobre el modelo (152 partidos) todavía no mejora.

## xG en vivo (API-Football)
- `site/data/arbitros.json` guarda, para cada partido de ayer a pasado mañana, el id de API-Football (`[fecha, local, visita, árbitro, id]`).
- En el centro del partido (Resumen y Estadísticas), si el partido está en juego o terminó, la página pide `GET /xg?f=<id>` al servidor de avisos, que consulta `/fixtures/statistics` y muestra xG y remates dentro del área. El robot de avisos copia el secreto `API_FOOTBALL_KEY` al servidor.
- Cuida el plan: cada partido se pide como mucho cada 90 segundos (caché compartida), hasta 1.000 consultas al día (`XG_TOPE_DIA`) y nunca si al plan le quedan menos de 2.000 en el día (`XG_MIN_RESTANTES`).

## CLV (¿el modelo se adelanta al mercado?)
- Desde el 27-10-2026, `data/registro.csv` guarda para cada partido la cuota de ESPN sin margen la primera vez que aparece (`eH`, `eD`, `eA`, con el modelo propio de ese momento en `oH`, `oD`, `oA` y la hora en `et`) y la última antes del inicio (`kH`, `kD`, `kA`, `kt`).
- `clv_summary` en `pipeline/generar.py` toma el resultado donde el modelo veía al menos 2 puntos más que la primera cuota y mide cuánto se movió el mercado hacia ese lado hasta el cierre. Se muestra en Resultados del modelo, con el detalle por liga.

## Ballytics IA
- El servidor de avisos tiene `/ia`. Primero usa **Gemini** con el SDK oficial `@google/genai` (secreto de GitHub `GEMINI_API_KEY`, que el robot copia como secreto del worker al instalarlo). Modelos: `gemini-3.5-flash-lite` y, si falla, `gemini-flash-lite-latest`, con razonamiento mínimo para que responda en menos de un segundo.
- Si Gemini falla o se acaba su cuota, responde la IA gratis de Cloudflare (Gemma 4, gpt-oss-120b o Mistral Small).
- Los datos del modelo van en las instrucciones del sistema: probabilidades 1X2, xG previsto, +2,5, ambos marcan, córners y tarjetas esperadas, bajas, comparativa con Pinnacle (o mercado sin margen), cuotas, tabla y goleadores. La IA responde solo con esos datos y no da consejos de apuesta.
- Topes en `worker/index.js`: `IA_TOPE_PERSONA` (20 preguntas al día por persona) e `IA_TOPE_DIA` (400 en total). Las preguntas repetidas salen de la caché por 30 minutos.

- Botones 👍/👎 en cada respuesta: `POST /ia/voto` guarda pregunta, respuesta, modelo y voto por 60 días (KV `iav:…`); `GET /ia/resumen` da los conteos por día, modelo y tipo. El detalle (`GET /ia/votos`) solo lo puede leer el examen automático, con un código derivado de `GEMINI_API_KEY`.

## Picks públicos
- `pipeline/picks_publicos.py`, desde el 28-10-2026. Dos listas por día con regla fija, guardadas en `data/picks_publicos.json` (el historial de git prueba la hora en que se fijó cada lista):
  - **Seguros:** hasta 3 por día, el resultado 1X2 que Ballytics ve más probable si es de 60 % o más.
  - **Valor:** hasta 3 por día, donde el modelo propio ve un valor esperado de 5 % o más con la cuota de la casa y 3 puntos o más sobre el mercado sin margen (cuota entre 1,50 y 6,00), sin repetir partidos de los seguros.
- La lista del día D se fija a las 18:00 (hora de Chile) del día D-1 o en la primera actualización después, solo con partidos que no han empezado, y no cambia más. Cuota real de DraftKings (ESPN) del momento en que se fijó; 1 unidad por pick; ganado suma cuota − 1, perdido resta 1, sin resultado 4 días después queda nulo. También se guarda la cuota de cierre.
- Se ve en la sección Picks (`#/picks`), en una tarjeta del inicio y la IA los conoce. Si se cambia una regla, anotar la fecha en `REGLAS["cambios"]`.

## Páginas para Google y para compartir
- `pipeline/seo.py` corre antes de publicar (no se guarda en el repositorio) y escribe en `site/` una página propia por partido (`partido/<liga>/<id>-<local>-vs-<visita>/`: los de los próximos 14 días y los ya calificados del registro), por liga (`liga/<liga>/`) y para Picks, Modelo, Cómo funciona y las páginas legales, más `sitemap.xml`, `robots.txt` y `404.html`.
- Cada página es la misma app con su título, descripción, vista previa (`assets/og.png`), datos estructurados y el texto principal ya escrito; `app.js` lee la dirección y abre esa pantalla. El botón "Compartir enlace" del partido usa esa dirección, que en WhatsApp se ve con título y descripción.
- Para que Google la encuentre antes: en Google Search Console agrega la propiedad con prefijo de URL `https://ballyticsia.github.io/laboratorio-dc/` y envía `sitemap.xml`. Con dominio propio, cambia `SITIO_URL` en `pipeline/seo.py` (o como variable de entorno) y las direcciones de `site/index.html`.

## Pruebas automáticas
- `tests/humo.js`: antes de publicar, el robot abre 18 pantallas (inicio, liga, partido, mercados, registro, picks, prode, en vivo, páginas para Google y una dirección inexistente) en un navegador real, en teléfono y computador. Si hay un error de JavaScript, una pantalla que no carga o algo que se sale por el costado en el teléfono, **no publica** y abre un issue; el sitio sigue con la última versión buena. Para probar en tu computador: `cd tests && npm ci && npx playwright install chromium && node humo.js` (después de `python pipeline/generar.py` y `python pipeline/seo.py`).
- `tests/examen_ia.js` (workflow "Examen de la IA"): 20 preguntas fijas a la IA en la página publicada, cada lunes y después de cada cambio de código. Revisa que nombre partidos del día pedido, que no invente cuotas, que no diga "paga" para una cuota justa, que las listas no sean cortas, que no llame "claro" a un favorito de menos de 60 %, que diga "Juega con responsabilidad" al hablar de apuestas y que no responda cosas que no son de fútbol. El resultado queda en `data/ia_examen.json` y en el resumen de la ejecución, con los totales de 👍/👎 de la gente.

## Cambiar cosas
- **Horario:** la línea `cron` del workflow (está en hora UTC; Chile es UTC-3).
- **Ligas:** la lista `LIGAS` en `pipeline/generar.py` (códigos de ESPN como `eng.1`, `esp.1`, `por.1`, `ned.1`, `arg.1`, `chi.1`).
- **Colores y tipografías:** las variables al inicio de `site/assets/app.css`.

## Aviso
Las probabilidades salen de un modelo estadístico y no son consejos de apuesta. En el backtest de 2025-26 el modelo predijo peor que las cuotas del mercado, y apostar solo a su "valor" perdió plata. Los datos de ESPN se usan para fines personales y educativos; para un uso comercial hace falta una fuente con licencia.
