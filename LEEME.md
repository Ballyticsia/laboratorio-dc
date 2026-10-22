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

## Cambiar cosas
- **Horario:** la línea `cron` del workflow (está en hora UTC; Chile es UTC-3).
- **Ligas:** la lista `LIGAS` en `pipeline/generar.py` (códigos de ESPN como `eng.1`, `esp.1`, `por.1`, `ned.1`, `arg.1`, `chi.1`).
- **Colores y tipografías:** las variables al inicio de `site/assets/app.css`.

## Aviso
Las probabilidades salen de un modelo estadístico y no son consejos de apuesta. En el backtest de 2025-26 el modelo predijo peor que las cuotas del mercado, y apostar solo a su "valor" perdió plata. Los datos de ESPN se usan para fines personales y educativos; para un uso comercial hace falta una fuente con licencia.
