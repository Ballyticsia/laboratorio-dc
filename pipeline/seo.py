"""Páginas para Google y para compartir: una página propia por partido y por liga (sin "#"), sitemap.xml y 404.html.

El sitio es una sola página que cambia con "#/…", y Google no indexa lo que va después del "#".
Este paso (se corre antes de publicar; no se guarda en el repositorio) escribe en site/:
- partido/<liga>/<id>-<local>-vs-<visita>/index.html: los partidos de los próximos días y los ya
  calificados del registro, con título, descripción, datos estructurados y el texto principal ya escrito.
- liga/<liga>/index.html, y picks/, modelo/, metodo/, terminos/, privacidad/, responsable/, sobre/.
- sitemap.xml, robots.txt y 404.html.
Cada página es la misma app (app.js lee la dirección y abre esa pantalla), así que la persona ve lo de
siempre y Google y WhatsApp leen un título y una descripción reales.
"""
import html
import json
import os
import re
import shutil
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

RAIZ = os.path.join(os.path.dirname(__file__), "..")
SITE = os.path.join(RAIZ, "site")
DATA = os.path.join(SITE, "data")
URL = os.environ.get("SITIO_URL", "https://ballyticsia.github.io/laboratorio-dc/").rstrip("/") + "/"
BASE_ABS = "/" + URL.split("://", 1)[1].split("/", 1)[1] if URL.count("/") > 3 else "/"
TZ = ZoneInfo("America/Santiago")
DIAS_PROX = int(os.environ.get("SEO_DIAS", "14"))
GENERADAS = ["partido", "liga", "arbitro", "picks", "modelo", "metodo", "terminos", "privacidad", "responsable", "sobre"]
DIAS_SEM = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
e = html.escape


def slug(s):
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def ruta_partido(liga, p):
    return f"partido/{liga}/{p['id']}-{slug(p['home'])}-vs-{slug(p['away'])}/"


def pc(x, d=0):
    return "—" if x is None else f"{100 * x:.{d}f}".replace(".", ",") + " %"


def dc(x, d=1):
    return "—" if x is None else f"{x:.{d}f}".replace(".", ",")


def local(iso):
    return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(TZ)


def fecha_larga(iso):
    t = local(iso)
    return f"{DIAS_SEM[t.weekday()]} {t.day} de {MESES[t.month - 1]}"


def hora(iso):
    return local(iso).strftime("%H:%M")


def leer(path, defecto=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def plantilla():
    with open(os.path.join(SITE, "index.html"), encoding="utf-8") as f:
        return f.read()


def pagina(tpl, ruta, titulo, desc, cuerpo, ld=None, og_tipo="website", base=None):
    """Arma una página a partir de index.html: base relativa, título, descripción, OG, JSON-LD y el texto inicial."""
    prof = ruta.strip("/").count("/") + 1 if ruta.strip("/") else 0
    base = base or ("../" * prof or "./")
    url = URL + ruta
    h = tpl.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<base href="{base}">', 1)
    h = re.sub(r"<title>.*?</title>", f"<title>{e(titulo)}</title>", h, count=1, flags=re.S)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{e(desc)}">', h, count=1)
    h = re.sub(r'<link rel="canonical"[^>]*>\n?', "", h)
    h = re.sub(r'<meta property="og:[^>]*>\n?', "", h)
    h = re.sub(r'<meta name="twitter:[^>]*>\n?', "", h)
    h = re.sub(r'<script type="application/ld\+json">.*?</script>\n?', "", h, flags=re.S)
    extra = (f'<link rel="canonical" href="{e(url)}">\n'
             f'<meta property="og:type" content="{og_tipo}">\n<meta property="og:site_name" content="Ballytics">\n'
             f'<meta property="og:title" content="{e(titulo)}">\n<meta property="og:description" content="{e(desc)}">\n'
             f'<meta property="og:url" content="{e(url)}">\n<meta property="og:image" content="{URL}assets/og.png">\n'
             f'<meta property="og:locale" content="es_CL">\n<meta name="twitter:card" content="summary_large_image">\n')
    for x in (ld or []):
        extra += '<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
    h = h.replace("</head>", extra + "</head>", 1)
    h, n = re.subn(r'(<div class="wrap" id="app">).*?(</div></main>)', lambda m: m.group(1) + cuerpo + m.group(2), h, count=1, flags=re.S)
    if not n:
        raise RuntimeError("index.html cambió: no encontré el contenedor de la app")
    return h


def escribir(ruta, contenido):
    d = os.path.join(SITE, ruta)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(contenido)


def migas(*pares):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": URL + r} for i, (n, r) in enumerate(pares)]}


def kpi(lbl, v, s=""):
    return f'<div class="kpi"><span class="lbl">{e(lbl)}</span><span class="v num">{e(v)}</span>{f"<span class=s>{e(s)}</span>" if s else ""}</div>'


def nav_links(L):
    return (f'<p class="note"><a class="link" href="liga/{e(L["id"])}/">Más partidos de {e(L["nombre"])}</a> · '
            f'<a class="link" href="picks/">Picks públicos</a> · <a class="link" href="modelo/">Cuánto acierta el modelo</a></p>')


def partido_proximo(tpl, L, p):
    nom = L["nombre"]
    H, A = p["home"], p["away"]
    f, hh = fecha_larga(p["kickoff"]), hora(p["kickoff"])
    fuente = "ajustada a la cuota sin margen" if p.get("calib") else "del modelo propio (sin cuota disponible)"
    titulo = f"{H} vs {A}: pronóstico y probabilidades ({local(p['kickoff']).strftime('%d/%m')}) | Ballytics"
    desc = (f"{nom}, {f} a las {hh} (Chile). Probabilidades: {H} {pc(p['pH'])}, empate {pc(p['pD'])}, {A} {pc(p['pA'])}. "
            f"Goles previstos {dc(p.get('lh'))}–{dc(p.get('la'))}, marcador más probable {p.get('top', '—')} y más de 2,5 goles {pc(p.get('pO25'))}.")
    k = max((("H", p["pH"]), ("D", p["pD"]), ("A", p["pA"])), key=lambda x: x[1])
    fav = {"H": f"gana {H}", "D": "empate", "A": f"gana {A}"}[k[0]]
    ks = [kpi(H, pc(p["pH"]), "local"), kpi("Empate", pc(p["pD"])), kpi(A, pc(p["pA"]), "visita"),
          kpi("Goles previstos", f"{dc(p.get('lh'))} – {dc(p.get('la'))}"), kpi("Marcador más probable", str(p.get("top", "—")).replace("-", "–")),
          kpi("Más de 2,5 goles", pc(p.get("pO25"))), kpi("Ambos marcan", pc(p.get("pBTTS")))]
    if p.get("ch") is not None and p.get("ca") is not None:
        ks.append(kpi("Córners esperados", dc(p["ch"] + p["ca"])))
    if p.get("th") is not None and p.get("ta") is not None:
        ks.append(kpi("Tarjetas esperadas", dc(p["th"] + p["ta"])))
    gol = sorted(p.get("goleadores") or [], key=lambda g: -g.get("p", 0))[:3]
    gtxt = ", ".join(f"{g.get('jugador')} ({pc(g['p'])})" for g in gol if g.get("jugador"))
    arb = (p.get("arbitro") or {}).get("n")
    cuerpo = (f'<section class="view seo-pre" aria-labelledby="h-seo"><p class="muted">{e(nom)} · {e(f)} · {e(hh)} (hora de Chile)</p>'
              f'<h1 id="h-seo">{e(H)} vs {e(A)}: probabilidades y pronóstico</h1>'
              f'<p>Según Ballytics, lo más probable es que <b>{e(fav)}</b> ({pc(k[1])}). Probabilidad {e(fuente)}.</p>'
              f'<div class="kpis">{"".join(ks)}</div>'
              + (f"<p>Más probables para marcar: {e(gtxt)}.</p>" if gtxt else "")
              + (f"<p>Árbitro: {e(arb)}.</p>" if arb else "")
              + f'<p class="note">Probabilidades de un modelo estadístico, no consejos de apuesta. +18.</p>{nav_links(L)}</section>')
    ev = {"@context": "https://schema.org", "@type": "SportsEvent", "name": f"{H} vs {A}", "sport": "Soccer",
          "startDate": local(p["kickoff"]).isoformat(), "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
          "homeTeam": {"@type": "SportsTeam", "name": H}, "awayTeam": {"@type": "SportsTeam", "name": A},
          "competitor": [{"@type": "SportsTeam", "name": H}, {"@type": "SportsTeam", "name": A}],
          "superEvent": {"@type": "SportsEvent", "name": nom}, "description": desc, "url": URL + ruta_partido(L["id"], p)}
    ruta = ruta_partido(L["id"], p)
    return ruta, pagina(tpl, ruta, titulo, desc, cuerpo, [ev, migas(("Ballytics", ""), (nom, f"liga/{L['id']}/"), (f"{H} vs {A}", ruta))], "article")


def partido_jugado(tpl, L, fl):
    nom = L["nombre"]
    H, A, hg, ag = fl["home"], fl["away"], int(fl["hg"]), int(fl["ag"])
    P = [fl.get("fH") or fl.get("pH"), fl.get("fD") or fl.get("pD"), fl.get("fA") or fl.get("pA")]
    if None in P:
        return None, None
    k = max(range(3), key=lambda i: P[i])
    real = 0 if hg > ag else 1 if hg == ag else 2
    lado = [f"{H} ganaba", "el empate", f"{A} ganaba"]
    ok = k == real
    top = fl.get("ftop") or fl.get("top")
    titulo = f"{H} {hg}-{ag} {A}: lo que predijo Ballytics | {nom}"
    desc = (f"{nom}, {fecha_larga(fl['kickoff'])}: {H} {hg}-{ag} {A}. Antes del partido Ballytics daba {H} {pc(P[0])}, empate {pc(P[1])} y "
            f"{A} {pc(P[2])}; el resultado más probable era {['victoria de ' + H, 'el empate', 'victoria de ' + A][k]} y {'acertó' if ok else 'falló'}.")
    o25 = fl.get("fO25") or fl.get("pO25")
    ks = [kpi("Resultado", f"{hg} – {ag}"), kpi(f"Ballytics: {H}", pc(P[0])), kpi("Empate", pc(P[1])), kpi(A, pc(P[2]))]
    if o25 is not None:
        ks.append(kpi("Más de 2,5 goles", pc(o25), "pasó" if (hg + ag > 2.5) == (o25 > .5) else "no pasó"))
    if top:
        ks.append(kpi("Marcador más probable", str(top).replace("-", "–"), "acertó" if top == f"{hg}-{ag}" else "falló"))
    cuerpo = (f'<section class="view seo-pre" aria-labelledby="h-seo"><p class="muted">{e(nom)} · {e(fecha_larga(fl["kickoff"]))}</p>'
              f'<h1 id="h-seo">{e(H)} {hg}–{ag} {e(A)}: lo que predijo Ballytics</h1>'
              f'<p>Antes del partido, lo más probable para Ballytics era que {e(lado[k])} ({pc(P[k])}). <b>{"Acertó" if ok else "Falló"}.</b> '
              f'Cada predicción queda guardada antes del inicio y se califica después en el registro público.</p>'
              f'<div class="kpis">{"".join(ks)}</div>{nav_links(L)}</section>')
    ev = {"@context": "https://schema.org", "@type": "SportsEvent", "name": f"{H} vs {A}", "sport": "Soccer",
          "startDate": local(fl["kickoff"]).isoformat(), "eventStatus": "https://schema.org/EventScheduled",
          "homeTeam": {"@type": "SportsTeam", "name": H}, "awayTeam": {"@type": "SportsTeam", "name": A},
          "description": desc}
    ruta = ruta_partido(L["id"], fl)
    return ruta, pagina(tpl, ruta, titulo, desc, cuerpo, [ev, migas(("Ballytics", ""), (nom, f"liga/{L['id']}/"), (f"{H} vs {A}", ruta))], "article")


PERFIL = {"muchas": "saca muchas tarjetas", "pocas": "saca pocas tarjetas", "deja": "deja jugar (cobra pocas faltas)", "cobra": "cobra muchas faltas", "rojas": "expulsa seguido"}


def arbitro(tpl, L, H, r):
    nom, B, dt, etq = L["nombre"], H.get("base") or {}, H.get("datos") or {}, H.get("etiquetas") or {}
    perfil = [PERFIL[k] for k in r.get("perfil") or [] if k in PERFIL]
    temps = ", ".join(etq.get(k, k) for k in (r.get("temps") or {}))
    titulo = f"{r['n']}: árbitro, tarjetas e historial con cada equipo | Ballytics"
    desc = (f"{r['n']}, árbitro de {nom}: {r['pj']} partidos ({temps})"
            + (f", {dc(r.get('tpp'))} tarjetas por partido (liga {dc(B.get('tpp'))})" if dt.get("tarjetas") and r.get("tpp") is not None else "")
            + (f", {dc(r.get('fpp'))} faltas (liga {dc(B.get('fpp'))})" if dt.get("faltas") and r.get("fpp") is not None else "")
            + f". Cómo le fue a cada equipo con él" + (f"; perfil: {', '.join(perfil)}" if perfil else "") + ".")
    filas = "".join(f'<tr><td>{e(x["t"])}</td><td class="n">{x["pj"]}</td><td class="n">{x["g"]}-{x["e"]}-{x["p"]}</td><td class="n">{dc(x.get("ppg"), 2)}</td>'
                    f'<td class="n">{dc(x.get("ppg_esp"), 2)}</td></tr>' for x in (r.get("equipos") or [])[:20])
    cuerpo = (f'<section class="view seo-pre" aria-labelledby="h-seo"><p class="muted">Árbitro · {e(nom)}</p><h1 id="h-seo">{e(r["n"])}</h1><p>{e(desc)}</p>'
              f'<div class="panel flush scroll"><table class="t"><thead><tr><th>Equipo</th><th class="n">PJ</th><th class="n">G-E-P</th><th class="n">Pts/PJ</th>'
              f'<th class="n">Lo normal</th></tr></thead><tbody>{filas}</tbody></table></div>'
              f'<p class="note">Lo normal: lo que hace el equipo con los demás árbitros. Son estadísticas, no juicios sobre el árbitro.</p>'
              f'<p class="note"><a class="link" href="liga/{e(L["id"])}/">{e(nom)}</a> · <a class="link" href="picks/">Picks públicos</a></p></section>')
    ruta = f"arbitro/{L['id']}/{r['slug']}/"
    ld = {"@context": "https://schema.org", "@type": "Person", "name": r["n"], "jobTitle": "Árbitro de fútbol", "description": desc, "url": URL + ruta}
    return ruta, pagina(tpl, ruta, titulo, desc, cuerpo, [ld, migas(("Ballytics", ""), (nom, f"liga/{L['id']}/"), (r["n"], ruta))], "profile")


def liga(tpl, L, proximos):
    nom = L["nombre"]
    titulo = f"{nom}: probabilidades, tabla y pronósticos | Ballytics"
    desc = (f"{nom} ({L.get('pais', '')}): probabilidades de cada partido con un modelo estadístico abierto, tabla, proyección de la temporada, "
            f"goleadores, córners, tarjetas y árbitros. Se actualiza cada 2 horas.")
    filas = "".join(f'<tr><td>{s["pos"]}</td><td>{e(s["equipo"])}</td><td class="n">{s["pj"]}</td><td class="n">{s["pts"]}</td>'
                    f'<td class="n">{pc(s.get("p_campeon"))}</td></tr>' for s in (L.get("tabla") or [])[:12])
    tabla = (f'<div class="panel flush scroll"><table class="t"><thead><tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n">Pts</th>'
             f'<th class="n">Campeón</th></tr></thead><tbody>{filas}</tbody></table></div>') if filas and L.get("tabla_ok", True) else ""
    lis = "".join(f'<li><a class="link" href="{e(r)}">{e(p["home"])} vs {e(p["away"])}</a> · {e(fecha_larga(p["kickoff"]))} {e(hora(p["kickoff"]))}: '
                  f'{pc(p["pH"])} / {pc(p["pD"])} / {pc(p["pA"])}</li>' for r, p in proximos[:20])
    gol = ", ".join(f"{g['jugador']} ({g['goles']})" for g in (L.get("goleadores") or [])[:5])
    cuerpo = (f'<section class="view seo-pre" aria-labelledby="h-seo"><p class="muted">{e(L.get("pais", ""))} · {e(L.get("region", ""))}</p>'
              f'<h1 id="h-seo">{e(nom)}: probabilidades y pronósticos</h1><p>{e(desc)}</p>'
              + (f"<h2>Próximos partidos</h2><ul>{lis}</ul>" if lis else "")
              + (f"<h2>Tabla</h2>{tabla}" if tabla else "")
              + (f"<p>Goleadores: {e(gol)}.</p>" if gol else "")
              + '<p class="note"><a class="link" href="picks/">Picks públicos</a> · <a class="link" href="modelo/">Cuánto acierta el modelo</a></p></section>')
    ruta = f"liga/{L['id']}/"
    ld = {"@context": "https://schema.org", "@type": "SportsOrganization", "name": nom, "sport": "Soccer", "url": URL + ruta}
    return ruta, pagina(tpl, ruta, titulo, desc, cuerpo, [ld, migas(("Ballytics", ""), (nom, ruta))])


FIJAS = {
    "picks/": ("Picks públicos de Ballytics: récord con regla fija", "Dos listas de picks por día con regla fija y cuota real, publicadas antes de los partidos y calificadas gane o pierda. El récord completo, sin borrar los que se pierden.",
               "Picks públicos", "Dos listas por día (Seguros y Valor) con regla fija. Se publican antes de los partidos y se califican todas con la cuota real."),
    "modelo/": ("Cuánto acierta Ballytics: registro público de predicciones", "Cada predicción de Ballytics queda guardada antes del partido y se califica con el resultado: ganador, goles, ambos marcan, córners, tarjetas, goleadores y comparación con el mercado.",
                "Resultados del modelo", "Cada predicción queda guardada antes del inicio y se califica con el resultado real."),
    "metodo/": ("Cómo funciona Ballytics: modelo Dixon-Coles y cuotas", "Cómo calcula Ballytics las probabilidades: modelo Dixon-Coles con fuerza de ataque y defensa, tiros al arco, ajuste a las cuotas sin margen, córners, tarjetas y goleadores.",
                "Cómo funciona", "Un modelo Dixon-Coles con ataque y defensa de cada equipo, ajustado a las cuotas sin margen cuando existen."),
    "terminos/": ("Términos de uso | Ballytics", "Las reglas para usar Ballytics: herramienta de estadística, no casa de apuestas ni consejo de apuesta. Solo mayores de 18.", "Términos de uso", "Las reglas para usar Ballytics."),
    "privacidad/": ("Privacidad | Ballytics", "Qué datos usa Ballytics, para qué, cuánto tiempo y cómo borrarlos.", "Privacidad", "Qué datos usa Ballytics y cómo borrarlos."),
    "responsable/": ("Juego responsable | Ballytics", "Consejos para apostar con responsabilidad y dónde pedir ayuda. +18.", "Juego responsable", "Consejos para jugar con responsabilidad y dónde pedir ayuda."),
    "sobre/": ("Sobre Ballytics", "Qué es Ballytics: probabilidades de fútbol explicadas, con un modelo abierto y un registro público.", "Sobre Ballytics", "Probabilidades de fútbol explicadas, con un registro público."),
}


def main():
    for d in GENERADAS:   # se rehace todo cada vez (los partidos jugados y los viejos salen solos)
        shutil.rmtree(os.path.join(SITE, d), ignore_errors=True)
    tpl = plantilla()
    ind = leer(os.path.join(DATA, "indice.json"), {})
    ahora = datetime.now(timezone.utc)
    hasta = ahora + timedelta(days=DIAS_PROX)
    mapa = [(URL, ahora, "hourly", "1.0")]
    n_prox = n_jug = 0
    ligas = {}
    for meta in ind.get("ligas", []):
        L = leer(os.path.join(DATA, f"{meta['id']}.json"))
        if not L:
            continue
        ligas[L["id"]] = L
        prox = []
        for p in L.get("partidos", []):
            if not str(p.get("id", "")).isdigit() or p.get("estado") != "pendiente":
                continue
            k = datetime.fromisoformat(p["kickoff"].replace("Z", "+00:00"))
            if not (ahora - timedelta(hours=3) <= k <= hasta):
                continue
            ruta, h = partido_proximo(tpl, L, p)
            escribir(ruta, h)
            prox.append((ruta, p))
            mapa.append((URL + ruta, ahora, "hourly", "0.7"))
            n_prox += 1
        ruta, h = liga(tpl, L, prox)
        escribir(ruta, h)
        mapa.append((URL + ruta, ahora, "daily", "0.8"))
    n_arb = 0
    for lid, L in ligas.items():   # fichas de árbitros con 5 partidos o más
        H = leer(os.path.join(DATA, "arbitros", f"{lid}.json"))
        for r in ((H or {}).get("refs") or {}).values():
            if r.get("pj", 0) >= 5 and r.get("slug"):
                ruta, h = arbitro(tpl, L, H, r)
                escribir(ruta, h)
                mapa.append((URL + ruta, ahora, "weekly", "0.5"))
                n_arb += 1
    hechos = {m[0] for m in mapa}
    reg = leer(os.path.join(DATA, "registro.json"), {}) or {}
    for fl in reg.get("filas", []):
        L = ligas.get(fl.get("liga"))
        if not L or fl.get("hg") is None or not str(fl.get("id", "")).isdigit():
            continue
        ruta, h = partido_jugado(tpl, L, fl)
        if not ruta or URL + ruta in hechos:
            continue
        escribir(ruta, h)
        mapa.append((URL + ruta, datetime.fromisoformat(fl["kickoff"].replace("Z", "+00:00")), "monthly", "0.4"))
        n_jug += 1
    for ruta, (titulo, desc, h1, txt) in FIJAS.items():
        cuerpo = f'<section class="view seo-pre narrow" aria-labelledby="h-seo"><h1 id="h-seo">{e(h1)}</h1><p class="muted">{e(txt)}</p></section>'
        escribir(ruta, pagina(tpl, ruta, titulo, desc, cuerpo, [migas(("Ballytics", ""), (h1, ruta))]))
        mapa.append((URL + ruta, ahora, "daily" if ruta in ("picks/", "modelo/") else "monthly", "0.6"))
    # 404: la misma app (lee la dirección: un partido ya jugado muestra lo que predijo); base absoluta
    cuerpo = '<section class="view narrow" aria-label="Cargando"><div class="panel skel-box"></div></section>'
    with open(os.path.join(SITE, "404.html"), "w", encoding="utf-8") as f:
        f.write(pagina(tpl, "", "Ballytics", "Probabilidades de fútbol con un modelo abierto y un registro público.", cuerpo, base=BASE_ABS)
                .replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"', 1))
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, t, freq, pri in mapa:
        xml.append(f"<url><loc>{e(loc)}</loc><lastmod>{t.strftime('%Y-%m-%d')}</lastmod><changefreq>{freq}</changefreq><priority>{pri}</priority></url>")
    xml.append("</urlset>")
    with open(os.path.join(SITE, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(xml) + "\n")
    with open(os.path.join(SITE, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nSitemap: {URL}sitemap.xml\n")
    print(f"Páginas para Google: {n_prox} partidos próximos, {n_jug} jugados, {len(ligas)} ligas, {n_arb} árbitros · sitemap con {len(mapa)} direcciones")


if __name__ == "__main__":
    main()
