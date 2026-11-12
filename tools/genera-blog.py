#!/usr/bin/env python3
"""Construye el blog de Booking Page desde landing/blog/posts/*.md

    python3 tools/genera-blog.py            # sólo los aprobados
    python3 tools/genera-blog.py --borrador # incluye borradores, sin indexar

Escribe landing/blog/index.html, una carpeta por artículo, el mismo juego en
inglés bajo landing/en/blog/, y sitemap.xml + feed.xml.

Cada artículo es un .md con cabecera:

    ---
    titulo: Lo que te cuesta de verdad una reserva por Airbnb
    slug: cuanto-cuesta-una-reserva-airbnb
    idioma: es
    fecha: 2026-11-20
    autor: Diego Larios
    resumen: Una frase que se lee en Google y en el índice.
    estado: publicado          # borrador · revision · publicado
    par: what-an-airbnb-booking-really-costs   # el mismo texto en el otro idioma
    dato: Comisiones reales de 40 reservas de clientes, noviembre 2026
    ---

`estado` y `dato` son las dos puertas. Sin `dato` no se construye: un
artículo que no aporta un número, una medición o una experiencia propia es
justo el que Google trata como contenido a escala, y la sanción cae sobre el
dominio entero, no sobre el artículo.
"""

import argparse
import datetime
import html
import json
import pathlib
import re
import sys
import unicodedata

RAIZ = pathlib.Path(__file__).resolve().parent.parent
LANDING = RAIZ / 'landing'
POSTS = LANDING / 'blog' / 'posts'
SITIO = 'https://wdstudio.agency/booking-page'

# Más de esto en una semana no es una línea editorial, es una fábrica.
TOPE_SEMANAL = 2


def esc(s):
    return html.escape(str(s), quote=True)


# ── Markdown, el trozo que hace falta ──────────────────────────────────
# Sin dependencias: el subconjunto que se usa al escribir un artículo, y
# nada más. Un conversor completo traería riesgos que aquí no compensan.

def en_linea(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)',
               r'<a href="\2" rel="noopener">\1</a>', t)
    return t


def markdown(texto):
    fuera, lineas, i = [], texto.split('\n'), 0
    while i < len(lineas):
        l = lineas[i]

        if not l.strip():
            i += 1
            continue

        m = re.match(r'^(#{2,4})\s+(.*)', l)
        if m:
            n = len(m.group(1))
            fuera.append(f'<h{n}>{en_linea(m.group(2))}</h{n}>')
            i += 1
            continue

        if re.match(r'^\s*[-*]\s+', l):
            items = []
            while i < len(lineas) and re.match(r'^\s*[-*]\s+', lineas[i]):
                items.append(en_linea(re.sub(r'^\s*[-*]\s+', '', lineas[i])))
                i += 1
            fuera.append('<ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>')
            continue

        if re.match(r'^\s*\d+\.\s+', l):
            items = []
            while i < len(lineas) and re.match(r'^\s*\d+\.\s+', lineas[i]):
                items.append(en_linea(re.sub(r'^\s*\d+\.\s+', '', lineas[i])))
                i += 1
            fuera.append('<ol>' + ''.join(f'<li>{x}</li>' for x in items) + '</ol>')
            continue

        if l.startswith('>'):
            trozos = []
            while i < len(lineas) and lineas[i].startswith('>'):
                trozos.append(lineas[i].lstrip('> ').rstrip())
                i += 1
            fuera.append('<blockquote><p>' + en_linea(' '.join(trozos)) + '</p></blockquote>')
            continue

        if l.startswith('|'):
            filas = []
            while i < len(lineas) and lineas[i].startswith('|'):
                filas.append([c.strip() for c in lineas[i].strip('|').split('|')])
                i += 1
            if len(filas) >= 2 and set(''.join(filas[1])) <= set('-: '):
                cab, cuerpo = filas[0], filas[2:]
                t = '<table><thead><tr>' + ''.join(
                    f'<th>{en_linea(c)}</th>' for c in cab) + '</tr></thead><tbody>'
                for f in cuerpo:
                    t += '<tr>' + ''.join(f'<td>{en_linea(c)}</td>' for c in f) + '</tr>'
                fuera.append(t + '</tbody></table>')
                continue
            i -= len(filas)

        parrafo = []
        while i < len(lineas) and lineas[i].strip() and not re.match(
                r'^(#{2,4}\s|\s*[-*]\s|\s*\d+\.\s|>|\|)', lineas[i]):
            parrafo.append(lineas[i].strip())
            i += 1
        if parrafo:
            fuera.append('<p>' + en_linea(' '.join(parrafo)) + '</p>')
        else:
            i += 1

    return '\n'.join(fuera)


# ── Los artículos ──────────────────────────────────────────────────────

def lee(ruta):
    txt = ruta.read_text(encoding='utf-8')
    if not txt.startswith('---'):
        raise ValueError(f'{ruta.name}: falta la cabecera entre ---')
    _, cabecera, cuerpo = txt.split('---', 2)

    meta = {}
    for linea in cabecera.strip().split('\n'):
        if ':' not in linea:
            continue
        k, v = linea.split(':', 1)
        meta[k.strip()] = v.strip()

    faltan = [c for c in ('titulo', 'slug', 'idioma', 'fecha', 'resumen', 'estado')
              if not meta.get(c)]
    if faltan:
        raise ValueError(f'{ruta.name}: falta {", ".join(faltan)} en la cabecera')
    if meta['idioma'] not in ('es', 'en'):
        raise ValueError(f'{ruta.name}: idioma tiene que ser es o en')
    if meta['estado'] not in ('borrador', 'revision', 'publicado'):
        raise ValueError(f'{ruta.name}: estado tiene que ser borrador, revision o publicado')

    meta['cuerpo'] = cuerpo.strip()
    meta['archivo'] = ruta.name
    meta['palabras'] = len(re.findall(r'\w+', cuerpo))
    return meta


def revisa(posts):
    """Las puertas. Avisan y bloquean, en vez de dejar publicar y lamentarlo."""
    problemas = []

    for p in posts:
        if not p.get('dato'):
            problemas.append(
                f'{p["archivo"]}: sin «dato». Un artículo que no aporta un número, '
                'una medición o una experiencia propia es contenido a escala, y '
                'eso lo paga el dominio entero.')
        if p['palabras'] < 300:
            problemas.append(f'{p["archivo"]}: {p["palabras"]} palabras, muy corto para publicar.')

    # Títulos repetidos: dos artículos que dicen lo mismo compiten entre ellos
    # en Google y pierden los dos.
    vistos = {}
    for p in posts:
        clave = (p['idioma'], re.sub(r'\W+', '', p['titulo'].lower()))
        if clave in vistos:
            problemas.append(f'{p["archivo"]}: título repetido con {vistos[clave]}.')
        vistos[clave] = p['archivo']

    # Ritmo: se mira por semana natural, no por total.
    semanas = {}
    for p in posts:
        try:
            f = datetime.date.fromisoformat(p['fecha'])
        except ValueError:
            problemas.append(f'{p["archivo"]}: fecha «{p["fecha"]}» no es AAAA-MM-DD.')
            continue
        semanas.setdefault((p['idioma'],) + f.isocalendar()[:2], []).append(p['archivo'])
    for clave, cuales in semanas.items():
        if len(cuales) > TOPE_SEMANAL:
            problemas.append(
                f'semana {clave[1]}-{clave[2]} ({clave[0]}): {len(cuales)} artículos '
                f'({", ".join(cuales)}). El tope es {TOPE_SEMANAL}.')

    return problemas


# ── Las páginas ────────────────────────────────────────────────────────

ESTILO = """
  :root{
    --verde:#0E9C7A; --tinta:#14171A; --g700:#4A5054; --g500:#6B7378;
    --g400:#8A9196; --g200:#E7E5E1; --papel:#fff; --hueso:#F3F2EE;
    --display:'Cormorant Garamond','Bitstream Charter',Georgia,serif;
    --texto:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--papel);color:var(--tinta);font-family:var(--texto);
    font-size:17px;line-height:1.75;-webkit-font-smoothing:antialiased}
  a{color:var(--verde);text-decoration:none}
  a:hover{text-decoration:underline}
  .envoltura{max-width:720px;margin:0 auto;padding:0 28px}
  .barra{border-bottom:1px solid var(--g200)}
  .barra .envoltura{display:flex;align-items:center;justify-content:space-between;
    height:64px;gap:20px}
  .marca{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:600;
    color:var(--tinta)}
  .marca span{color:var(--g400);font-weight:400}
  .idiomas a{font-size:11px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--g400);margin-left:10px}
  .idiomas a.activo{color:var(--tinta)}
  main{padding:clamp(44px,6vw,76px) 0}
  h1{font-family:var(--display);font-weight:300;font-size:clamp(2.1rem,5vw,3.1rem);
    line-height:1.1;letter-spacing:-.01em}
  .meta{margin-top:18px;font-size:13px;color:var(--g400);
    letter-spacing:.04em}
  .resumen{margin-top:20px;font-size:1.12rem;color:var(--g700);max-width:60ch}
  .dato{margin-top:26px;padding:14px 18px;background:var(--hueso);
    border-left:3px solid var(--verde);font-size:14px;color:var(--g700)}
  article{margin-top:42px}
  article h2{font-family:var(--display);font-weight:400;font-size:1.72rem;
    line-height:1.2;margin:40px 0 12px}
  article h3{font-size:1.14rem;font-weight:600;margin:30px 0 8px}
  article p{margin-bottom:18px;color:var(--g700)}
  article ul,article ol{margin:0 0 20px 22px;color:var(--g700)}
  article li{margin-bottom:8px}
  article blockquote{margin:26px 0;padding-left:20px;border-left:2px solid var(--verde);
    font-family:var(--display);font-size:1.3rem;line-height:1.45;color:var(--tinta)}
  article blockquote p{color:inherit;margin:0}
  article table{width:100%;border-collapse:collapse;margin:24px 0;font-size:15px}
  article th,article td{padding:11px 14px;text-align:left;
    border-bottom:1px solid var(--g200)}
  article th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--g400);font-weight:500}
  article td{color:var(--g700)}
  article code{background:var(--hueso);padding:2px 6px;border-radius:3px;
    font-size:.9em}
  .cierre{margin-top:52px;padding:28px;background:var(--hueso);border-radius:4px}
  .cierre h2{font-family:var(--display);font-weight:300;font-size:1.6rem;
    line-height:1.2;margin-bottom:10px}
  .cierre p{color:var(--g700);font-size:15px;margin-bottom:18px}
  .btn{display:inline-block;font-size:11px;letter-spacing:.2em;
    text-transform:uppercase;padding:13px 24px;border:1px solid var(--tinta);
    color:var(--tinta)}
  .btn:hover{background:var(--tinta);color:#fff;text-decoration:none}
  .lista{margin-top:40px}
  .lista a.item{display:block;padding:24px 0;border-bottom:1px solid var(--g200);
    color:inherit}
  .lista a.item:hover{text-decoration:none}
  .lista a.item:hover h2{color:var(--verde)}
  .lista h2{font-family:var(--display);font-weight:400;font-size:1.5rem;
    line-height:1.22}
  .lista .meta{margin-top:8px}
  .lista p{margin-top:8px;color:var(--g700);font-size:15px}
  .vacio{margin-top:40px;color:var(--g400)}
  .aviso{margin-top:26px;padding:12px 16px;border:1px dashed var(--verde);
    font-size:13px;color:var(--g700)}
  footer{border-top:1px solid var(--g200);padding:28px 0;margin-top:56px;
    font-size:12px;color:var(--g400)}
  footer .envoltura{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
"""


def fecha_larga(iso, en):
    a, m, d = iso.split('-')
    meses = (['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'] if en else
             ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
              'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])
    return (f'{meses[int(m) - 1]} {int(d)}, {a}' if en
            else f'{int(d)} de {meses[int(m) - 1]} de {a}')


def armazon(titulo, descripcion, canonical, cuerpo, en, hreflang=None,
            jsonld=None, indexar=True, base='../../'):
    idioma = 'en' if en else 'es'
    alterna = (f'<link rel="alternate" hreflang="{"es" if en else "en"}" '
               f'href="{hreflang}">' if hreflang else '')
    return f"""<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(titulo)}</title>
<meta name="description" content="{esc(descripcion)}">
<link rel="canonical" href="{canonical}">
{alterna}
{'' if indexar else '<meta name="robots" content="noindex,nofollow">'}
<meta property="og:title" content="{esc(titulo)}">
<meta property="og:description" content="{esc(descripcion)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{canonical}">
<link rel="alternate" type="application/rss+xml" title="Booking Page"
      href="{SITIO}/blog/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{ESTILO}</style>
{f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ''}
</head>
<body>

<header class="barra">
  <div class="envoltura">
    <a class="marca" href="{base}">Booking Page <span>· WD Studio</span></a>
    <div class="idiomas">
      <a href="{base}blog/"{'' if en else ' class="activo"'}>ES</a>
      <a href="{base}en/blog/"{' class="activo"' if en else ''}>EN</a>
    </div>
  </div>
</header>

<main>{cuerpo}</main>

<footer>
  <div class="envoltura">
    <span>© <span class="anio">2026</span> WD Studio Agency</span>
    <span><a href="{base}">Booking Page</a></span>
  </div>
</footer>

<script>document.querySelectorAll('.anio').forEach(function (e) {{
  e.textContent = new Date().getFullYear();
}});</script>
</body>
</html>
"""


def pagina_post(p, pareja):
    en = p['idioma'] == 'en'
    base = '../../../' if en else '../../'
    canonical = f'{SITIO}/{"en/" if en else ""}blog/{p["slug"]}/'
    href = (f'{SITIO}/{"" if en else "en/"}blog/{pareja["slug"]}/') if pareja else None

    t = {
        'volver': 'All articles' if en else 'Todos los artículos',
        'cierre_h': ('Your own booking page, from 79 USD a month' if en
                     else 'Tu propia página de reservas, desde 79 USD al mes'),
        'cierre_p': ('Guests book and pay you directly. No commission per booking.'
                     if en else
                     'El huésped reserva y te paga a ti. Sin comisión por reserva.'),
        'cierre_b': 'See Booking Page' if en else 'Ver Booking Page',
        'borrador': ('Draft — not indexed, not linked from the index.' if en
                     else 'Borrador — no se indexa ni aparece en el índice.'),
    }

    jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': p['titulo'],
        'description': p['resumen'],
        'datePublished': p['fecha'],
        'inLanguage': p['idioma'],
        'author': {'@type': 'Person', 'name': p.get('autor', 'Diego Larios')},
        'publisher': {'@type': 'Organization', 'name': 'WD Studio Agency',
                      'url': 'https://wdstudio.agency'},
        'mainEntityOfPage': canonical,
    }

    aviso = (f'<p class="aviso">{t["borrador"]}</p>'
             if p['estado'] != 'publicado' else '')
    dato = (f'<p class="dato">{esc(p["dato"])}</p>') if p.get('dato') else ''

    cuerpo = f"""
  <div class="envoltura">
    <p class="meta"><a href="{base}{'en/' if en else ''}blog/">{t['volver']}</a></p>
    <h1>{esc(p['titulo'])}</h1>
    <p class="meta">{esc(fecha_larga(p['fecha'], en))} · {esc(p.get('autor', 'Diego Larios'))}
      · {p['palabras']} {'words' if en else 'palabras'}</p>
    <p class="resumen">{esc(p['resumen'])}</p>
    {dato}
    {aviso}
    <article>{markdown(p['cuerpo'])}</article>
    <div class="cierre">
      <h2>{t['cierre_h']}</h2>
      <p>{t['cierre_p']}</p>
      <a class="btn" href="{base}{'en/' if en else ''}">{t['cierre_b']}</a>
    </div>
  </div>"""

    return armazon(f"{p['titulo']} · Booking Page", p['resumen'], canonical,
                   cuerpo, en, href, jsonld,
                   indexar=(p['estado'] == 'publicado'), base=base)


def pagina_indice(posts, en):
    base = '../../' if en else '../'
    canonical = f'{SITIO}/{"en/" if en else ""}blog/'
    t = {
        'titulo': 'Direct bookings, in writing' if en else 'Reserva directa, por escrito',
        'resumen': ('What we learn running booking pages for hosts: real numbers, '
                    'what works and what does not.' if en else
                    'Lo que aprendemos llevando páginas de reserva para anfitriones: '
                    'números reales, lo que funciona y lo que no.'),
        'vacio': 'Nothing published yet.' if en else 'Todavía no hay nada publicado.',
    }
    items = ''
    for p in posts:
        items += f"""<a class="item" href="{base}{'en/' if en else ''}blog/{p['slug']}/">
      <h2>{esc(p['titulo'])}</h2>
      <p class="meta">{esc(fecha_larga(p['fecha'], en))}</p>
      <p>{esc(p['resumen'])}</p>
    </a>"""

    cuerpo = f"""
  <div class="envoltura">
    <h1>{t['titulo']}</h1>
    <p class="resumen">{t['resumen']}</p>
    <div class="lista">{items or f'<p class="vacio">{t["vacio"]}</p>'}</div>
  </div>"""

    href = f'{SITIO}/{"" if en else "en/"}blog/'
    return armazon(f"{t['titulo']} · Booking Page", t['resumen'], canonical,
                   cuerpo, en, href, base=base)


def sitemap(posts):
    urls = [f'{SITIO}/blog/', f'{SITIO}/en/blog/']
    urls += [f'{SITIO}/{"en/" if p["idioma"] == "en" else ""}blog/{p["slug"]}/'
             for p in posts]
    hoy = datetime.date.today().isoformat()
    cuerpo = ''.join(
        f'<url><loc>{u}</loc><lastmod>{hoy}</lastmod></url>' for u in urls)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f'{cuerpo}</urlset>')


def feed(posts):
    ahora = datetime.datetime.now(datetime.timezone.utc).strftime(
        '%a, %d %b %Y %H:%M:%S +0000')
    items = ''
    for p in posts[:20]:
        url = f'{SITIO}/{"en/" if p["idioma"] == "en" else ""}blog/{p["slug"]}/'
        items += (f'<item><title>{esc(p["titulo"])}</title><link>{url}</link>'
                  f'<guid>{url}</guid>'
                  f'<description>{esc(p["resumen"])}</description></item>')
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<rss version="2.0"><channel>'
            '<title>Booking Page · WD Studio</title>'
            f'<link>{SITIO}/blog/</link>'
            '<description>Reserva directa para anfitriones</description>'
            f'<lastBuildDate>{ahora}</lastBuildDate>{items}'
            '</channel></rss>')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--borrador', action='store_true',
                    help='construye también los borradores, sin indexarlos')
    a = ap.parse_args()

    POSTS.mkdir(parents=True, exist_ok=True)
    todos = []
    for f in sorted(POSTS.glob('*.md')):
        try:
            todos.append(lee(f))
        except ValueError as e:
            print(f'  ERROR {e}')
            return 1

    if not todos:
        print('No hay artículos en landing/blog/posts/.')

    vivos = [p for p in todos if p['estado'] == 'publicado']
    problemas = revisa(vivos)
    if problemas:
        print('\nNo se publica. Hay que arreglar esto primero:\n')
        for x in problemas:
            print('  ·', x)
        return 1

    construir = todos if a.borrador else vivos
    por_slug = {(p['idioma'], p['slug']): p for p in todos}

    for p in construir:
        otro = 'en' if p['idioma'] == 'es' else 'es'
        pareja = por_slug.get((otro, p.get('par', ''))) if p.get('par') else None
        carpeta = (LANDING / 'en' / 'blog' if p['idioma'] == 'en'
                   else LANDING / 'blog') / p['slug']
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / 'index.html').write_text(pagina_post(p, pareja), encoding='utf-8')
        marca = '' if p['estado'] == 'publicado' else '  (borrador)'
        print(f'  {carpeta.relative_to(RAIZ)}/index.html{marca}')

    for en in (False, True):
        lista = sorted([p for p in vivos if p['idioma'] == ('en' if en else 'es')],
                       key=lambda p: p['fecha'], reverse=True)
        destino = (LANDING / 'en' / 'blog' if en else LANDING / 'blog')
        destino.mkdir(parents=True, exist_ok=True)
        (destino / 'index.html').write_text(pagina_indice(lista, en), encoding='utf-8')
        print(f'  {destino.relative_to(RAIZ)}/index.html')

    ordenados = sorted(vivos, key=lambda p: p['fecha'], reverse=True)
    (LANDING / 'blog' / 'sitemap.xml').write_text(sitemap(ordenados), encoding='utf-8')
    (LANDING / 'blog' / 'feed.xml').write_text(feed(ordenados), encoding='utf-8')
    print('  landing/blog/sitemap.xml')
    print('  landing/blog/feed.xml')

    print(f'\n{len(vivos)} publicados, '
          f'{len(todos) - len(vivos)} sin publicar.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
