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

Campos opcionales (recomendados):

    imagen: palapa.jpg                 # portada, en landing/blog/media/
    imagen_alt: Palapa y alberca al atardecer
    titulo_seo: Máx. 60 caracteres     # <title> si el titular es largo
    palabra_clave: reservas directas   # frase principal que busca el artículo
    modificado: 2026-11-21             # última revisión de fondo

La segunda imagen va dentro del texto: ![texto alternativo](mar.jpg "pie")

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
MEDIA = LANDING / 'blog' / 'media'
ESTUDIO = 'https://wdstudio.agency/'

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


IMG = re.compile(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$')


def markdown(texto, base='', figura=None):
    """`figura(alt, src, pie)` devuelve el HTML de una imagen de bloque."""
    fuera, lineas, i = [], texto.split('\n'), 0
    while i < len(lineas):
        l = lineas[i]

        if not l.strip():
            i += 1
            continue

        m = IMG.match(l.strip())
        if m and figura:
            fuera.append(figura(m.group(1), m.group(2), m.group(3) or ''))
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
                r'^(#{2,4}\s|\s*[-*]\s|\s*\d+\.\s|>|\||!\[)', lineas[i]):
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
    sin_img = '\n'.join(l for l in cuerpo.split('\n') if not IMG.match(l.strip()))
    meta['palabras'] = len(re.findall(r'\w+', sin_img))
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


# ── Avisos de SEO ──────────────────────────────────────────────────────
# No tumban la construcción: dicen qué le falta a un artículo para competir.

def avisos(posts):
    out = []
    for p in posts:
        a = p['archivo']
        if not p.get('imagen'):
            out.append(f'{a}: sin «imagen» de portada (Google y las redes la usan).')
        elif not imagen(p['imagen']):
            out.append(f'{a}: «{p["imagen"]}» no está en landing/blog/media/.')
        if p.get('imagen') and not p.get('imagen_alt'):
            out.append(f'{a}: la portada no tiene «imagen_alt».')
        for alt, src, _ in re.findall(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)',
                                      p['cuerpo'], re.M):
            if not imagen(src):
                out.append(f'{a}: la imagen del texto «{src}» no está en landing/blog/media/.')
            if not alt.strip():
                out.append(f'{a}: la imagen «{src}» no tiene texto alternativo.')
        if len(titulo_html(p)) > 65:
            out.append(f'{a}: el <title> tiene {len(titulo_html(p))} caracteres; '
                       'Google corta hacia los 60. Añade «titulo_seo».')
        if len(p['resumen']) > 160:
            out.append(f'{a}: el resumen tiene {len(p["resumen"])} caracteres; '
                       'Google corta hacia los 155.')
        clave = p.get('palabra_clave', '').lower()
        if clave:
            if clave not in (p['titulo'] + ' ' + p.get('titulo_seo', '')).lower():
                out.append(f'{a}: «{clave}» no aparece en el título.')
            if clave not in p['resumen'].lower():
                out.append(f'{a}: «{clave}» no aparece en el resumen.')
        else:
            out.append(f'{a}: sin «palabra_clave».')
    return out


# ── Imágenes ───────────────────────────────────────────────────────────

def medidas_jpeg(ruta):
    """Ancho y alto de un JPEG leyendo su cabecera, sin dependencias."""
    with open(ruta, 'rb') as f:
        datos = f.read(256 * 1024)
    i = 2
    while i < len(datos) - 9:
        if datos[i] != 0xFF:
            i += 1
            continue
        marca = datos[i + 1]
        if marca in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                     0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            alto = int.from_bytes(datos[i + 5:i + 7], 'big')
            ancho = int.from_bytes(datos[i + 7:i + 9], 'big')
            return ancho, alto
        largo = int.from_bytes(datos[i + 2:i + 4], 'big')
        i += 2 + largo
    return None


def imagen(nombre):
    """{'src','w','h','peq','pw'} de una imagen de landing/blog/media/, o None."""
    if not nombre:
        return None
    ruta = MEDIA / pathlib.Path(nombre).name
    if not ruta.is_file():
        return None
    w, h = medidas_jpeg(ruta) or (1600, 1067)
    peq = ruta.with_name(ruta.stem + '-800' + ruta.suffix)
    return {'src': ruta.name, 'w': w, 'h': h,
            'peq': peq.name if peq.is_file() else None}


def etiqueta_img(img, alt, base, clase='', prioridad=False, sizes='100vw'):
    src = f'{base}blog/media/{img["src"]}'
    srcset = (f' srcset="{base}blog/media/{img["peq"]} 800w, {src} {img["w"]}w"'
              f' sizes="{sizes}"' if img['peq'] else '')
    carga = (' fetchpriority="high" decoding="async"' if prioridad
             else ' loading="lazy" decoding="async"')
    return (f'<img src="{src}"{srcset} width="{img["w"]}" height="{img["h"]}" '
            f'alt="{esc(alt)}"{carga}{f" class={chr(34)}{clase}{chr(34)}" if clase else ""}>')


# ── Lo que cuesta, leído de la propia página ───────────────────────────
# El precio vive en landing/index.html. Copiarlo aquí es como acabó un
# artículo diciendo 79 USD cuando la página ya cobraba en pesos.

def precio_mes():
    try:
        t = (LANDING / 'index.html').read_text(encoding='utf-8')
        m = re.search(r'MES_MXN\s*=\s*(\d+)', t)
        return int(m.group(1)) if m else None
    except OSError:
        return None


# ── Las páginas ────────────────────────────────────────────────────────

ESTILO = """
  :root{
    --verde:#0E9C7A; --tinta:#14171A; --g700:#4A5054; --g500:#6B7378;
    --g400:#8A9196; --g200:#E7E5E1; --papel:#fff; --hueso:#F3F2EE;
    --display:'Cormorant Garamond','Bitstream Charter',Georgia,serif;
    --texto:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    --col:680px; --ancho:1200px;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--papel);color:var(--tinta);font-family:var(--texto);
    font-size:17px;line-height:1.75;-webkit-font-smoothing:antialiased}
  img{display:block;max-width:100%;height:auto}
  a{color:var(--verde);text-decoration:none}
  a:hover{text-decoration:underline}
  .envoltura{max-width:var(--ancho);margin:0 auto;padding:0 28px}
  .columna{max-width:var(--col);margin:0 auto;padding:0 24px}
  .barra{border-bottom:1px solid var(--g200);background:var(--papel)}
  .barra .envoltura{display:flex;align-items:center;justify-content:space-between;
    height:64px;gap:20px}
  .marca{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:600;
    color:var(--tinta)}
  .marca span{color:var(--g400);font-weight:400}
  .navega{display:flex;align-items:center;gap:22px}
  .navega .cta{font-size:11px;letter-spacing:.16em;text-transform:uppercase;
    color:var(--tinta);border:1px solid var(--tinta);padding:9px 14px}
  .navega .cta:hover{background:var(--tinta);color:#fff;text-decoration:none}
  .idiomas a{font-size:11px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--g400);margin-left:10px}
  .idiomas a.activo{color:var(--tinta)}
  main{padding:clamp(36px,5vw,64px) 0 0}
  .migas{font-size:12px;letter-spacing:.06em;color:var(--g400);margin-bottom:22px}
  .migas a{color:var(--g500)}
  .migas span{margin:0 8px}
  h1{font-family:var(--display);font-weight:300;font-size:clamp(2.2rem,5.4vw,3.5rem);
    line-height:1.08;letter-spacing:-.01em}
  .meta{margin-top:18px;font-size:13px;color:var(--g400);letter-spacing:.04em}
  .resumen{margin-top:20px;font-size:1.16rem;line-height:1.6;color:var(--g700)}
  .portada{max-width:var(--ancho);margin:clamp(30px,4vw,48px) auto 0;padding:0 28px}
  .portada img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:4px;
    background:var(--hueso)}
  .portada figcaption,.figura figcaption{font-size:12px;color:var(--g400);margin-top:10px}
  .dato{margin-top:30px;padding:14px 18px;background:var(--hueso);
    border-left:3px solid var(--verde);font-size:14px;color:var(--g700)}
  .dato b{font-weight:600;color:var(--tinta)}
  article{margin-top:34px}
  article h2{font-family:var(--display);font-weight:400;font-size:1.86rem;
    line-height:1.2;margin:46px 0 12px}
  article h3{font-size:1.14rem;font-weight:600;margin:30px 0 8px}
  article p{margin-bottom:18px;color:var(--g700)}
  article ul,article ol{margin:0 0 20px 22px;color:var(--g700)}
  article li{margin-bottom:8px}
  article strong{color:var(--tinta)}
  article blockquote{margin:26px 0;padding-left:20px;border-left:2px solid var(--verde);
    font-family:var(--display);font-size:1.3rem;line-height:1.45;color:var(--tinta)}
  article blockquote p{color:inherit;margin:0}
  article table{width:100%;border-collapse:collapse;margin:24px 0;font-size:15px}
  article th,article td{padding:11px 14px;text-align:left;
    border-bottom:1px solid var(--g200)}
  article th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--g400);font-weight:500}
  article td{color:var(--g700)}
  article code{background:var(--hueso);padding:2px 6px;border-radius:3px;font-size:.9em}
  /* La segunda imagen sale de la columna: ancho de lectura para el texto,
     ancho de pantalla para la foto. */
  .figura{margin:38px calc(50% - min(48vw, 480px));}
  .figura img{width:100%;border-radius:4px;background:var(--hueso)}
  .figura figcaption{padding:0 4px}
  /* Anuncio dentro del texto: una tarjeta, no una barra lateral. */
  .anuncio{margin:40px 0;padding:24px 26px;border:1px solid var(--g200);
    border-radius:6px;display:flex;gap:22px;align-items:center;flex-wrap:wrap}
  .anuncio div{flex:1 1 300px}
  .anuncio .etq,.tarjeta .etq{font-size:10px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--verde);font-weight:600}
  .anuncio h2,.anuncio p.t{font-family:var(--display);font-weight:400;font-size:1.45rem;
    line-height:1.2;margin:6px 0 6px;color:var(--tinta)}
  .anuncio p{font-size:15px;color:var(--g700);margin:0}
  .btn{display:inline-block;font-size:11px;letter-spacing:.2em;
    text-transform:uppercase;padding:13px 22px;border:1px solid var(--tinta);
    color:var(--tinta);white-space:nowrap}
  .btn:hover{background:var(--tinta);color:#fff;text-decoration:none}
  .btn.lleno{background:var(--tinta);color:#fff}
  .btn.lleno:hover{background:var(--verde);border-color:var(--verde)}
  .cierre{max-width:var(--ancho);margin:64px auto 0;padding:0 28px;
    display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
  .tarjeta{border-radius:6px;overflow:hidden;background:var(--hueso);
    display:flex;flex-direction:column}
  .tarjeta img{width:100%;aspect-ratio:16/9;object-fit:cover}
  .tarjeta .txt{padding:26px 28px 30px;display:flex;flex-direction:column;gap:10px;flex:1}
  .tarjeta h2{font-family:var(--display);font-weight:300;font-size:1.7rem;line-height:1.15}
  .tarjeta p{color:var(--g700);font-size:15px;flex:1}
  .tarjeta .btn{align-self:flex-start;margin-top:6px}
  .tarjeta.oscura{background:var(--tinta);color:#fff}
  .tarjeta.oscura p{color:#C9CDD0}
  .tarjeta.oscura .btn{border-color:#fff;color:#fff}
  .tarjeta.oscura .btn:hover{background:#fff;color:var(--tinta)}
  .relacionados{max-width:var(--ancho);margin:72px auto 0;padding:0 28px}
  .relacionados > h2{font-family:var(--display);font-weight:400;font-size:1.6rem;
    margin-bottom:22px}
  .rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:30px}
  .item{color:inherit;display:block}
  .item:hover{text-decoration:none}
  .item img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:4px;
    background:var(--hueso);transition:opacity .2s}
  .item:hover img{opacity:.88}
  .item h2,.item h3{font-family:var(--display);font-weight:400;font-size:1.42rem;
    line-height:1.22;margin-top:16px;color:var(--tinta)}
  .item:hover h2,.item:hover h3{color:var(--verde)}
  .item .meta{margin-top:6px}
  .item p{margin-top:8px;color:var(--g700);font-size:15px;line-height:1.6}
  .destacado{display:grid;grid-template-columns:1.35fr 1fr;gap:40px;align-items:center;
    margin:44px 0 56px;color:inherit}
  .destacado:hover{text-decoration:none}
  .destacado img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
  .destacado h2{font-family:var(--display);font-weight:300;font-size:clamp(1.8rem,3.4vw,2.5rem);
    line-height:1.12;color:var(--tinta)}
  .destacado:hover h2{color:var(--verde)}
  .destacado p{margin-top:14px;color:var(--g700)}
  .cabeza-indice{max-width:760px}
  .vacio{margin-top:40px;color:var(--g400)}
  .aviso{margin-top:26px;padding:12px 16px;border:1px dashed var(--verde);
    font-size:13px;color:var(--g700)}
  footer{border-top:1px solid var(--g200);padding:28px 0;margin-top:80px;
    font-size:12px;color:var(--g400)}
  footer .envoltura{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  footer a{color:var(--g500)}
  @media (max-width:760px){
    .destacado{grid-template-columns:1fr;gap:20px}
    .figura{margin:30px -24px}
    .figura img{border-radius:0}
    .portada{padding:0}
    .portada img{border-radius:0;aspect-ratio:4/3}
    .portada figcaption{padding:0 24px}
    .navega .cta{display:none}
    .marca span{display:none}
    .navega{gap:14px}
  }
  .idiomas{white-space:nowrap}
"""


def fecha_larga(iso, en):
    a, m, d = iso.split('-')
    meses = (['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'] if en else
             ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
              'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])
    return (f'{meses[int(m) - 1]} {int(d)}, {a}' if en
            else f'{int(d)} de {meses[int(m) - 1]} de {a}')


def titulo_html(p):
    t = p.get('titulo_seo') or p['titulo']
    con_marca = f'{t} · Booking Page'
    return con_marca if len(con_marca) <= 65 else t


def url_post(p):
    return f'{SITIO}/{"en/" if p["idioma"] == "en" else ""}blog/{p["slug"]}/'


def armazon(titulo, descripcion, canonical, cuerpo, en, alternas=None,
            jsonld=None, indexar=True, base='../../', og=None):
    """`alternas`: {'es': url, 'en': url}. `og`: {'imagen','w','h','alt',
    'publicado','modificado','tipo'}."""
    idioma = 'en' if en else 'es'
    og = og or {}
    hreflang = ''
    if alternas:
        hreflang = ''.join(f'<link rel="alternate" hreflang="{k}" href="{v}">\n'
                           for k, v in alternas.items())
        if 'es' in alternas:
            hreflang += f'<link rel="alternate" hreflang="x-default" href="{alternas["es"]}">\n'
    img_og = ''
    if og.get('imagen'):
        img_og = (f'<meta property="og:image" content="{og["imagen"]}">\n'
                  f'<meta property="og:image:width" content="{og["w"]}">\n'
                  f'<meta property="og:image:height" content="{og["h"]}">\n'
                  f'<meta property="og:image:alt" content="{esc(og.get("alt", ""))}">\n'
                  f'<meta name="twitter:image" content="{og["imagen"]}">\n')
    fechas = ''
    if og.get('publicado'):
        fechas = (f'<meta property="article:published_time" content="{og["publicado"]}">\n'
                  f'<meta property="article:modified_time" content="{og["modificado"]}">\n')
    return f"""<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(titulo)}</title>
<meta name="description" content="{esc(descripcion)}">
<link rel="canonical" href="{canonical}">
{hreflang}{'<meta name="robots" content="max-image-preview:large">' if indexar else '<meta name="robots" content="noindex,nofollow">'}
<meta property="og:site_name" content="Booking Page · WD Studio">
<meta property="og:locale" content="{'en_US' if en else 'es_MX'}">
<meta property="og:title" content="{esc(titulo)}">
<meta property="og:description" content="{esc(descripcion)}">
<meta property="og:type" content="{og.get('tipo', 'website')}">
<meta property="og:url" content="{canonical}">
{img_og}{fechas}<meta name="twitter:card" content="{'summary_large_image' if og.get('imagen') else 'summary'}">
<meta name="twitter:title" content="{esc(titulo)}">
<meta name="twitter:description" content="{esc(descripcion)}">
<link rel="alternate" type="application/rss+xml" title="Booking Page" href="{SITIO}/blog/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{ESTILO}</style>
{f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ''}
</head>
<body>

<header class="barra">
  <div class="envoltura">
    <a class="marca" href="{base}{'en/' if en else ''}">Booking Page <span>· WD Studio</span></a>
    <nav class="navega">
      <a href="{base}{'en/' if en else ''}blog/" style="font-size:13px;color:var(--g700)">Blog</a>
      <a class="cta" href="{base}{'en/' if en else ''}">{'Get your page' if en else 'Tu página'}</a>
      <span class="idiomas">
        <a href="{base}blog/"{'' if en else ' class="activo"'} hreflang="es">ES</a>
        <a href="{base}en/blog/"{' class="activo"' if en else ''} hreflang="en">EN</a>
      </span>
    </nav>
  </div>
</header>

<main>{cuerpo}</main>

<footer>
  <div class="envoltura">
    <span>© <span class="anio">2026</span> <a href="{ESTUDIO}">WD Studio Agency</a> ·
      {'Websites, booking and photography for hospitality' if en else 'Sitios web, reserva directa y fotografía para hospitality'}</span>
    <span><a href="{base}{'en/' if en else ''}">Booking Page</a> · <a href="{SITIO}/blog/feed.xml">RSS</a></span>
  </div>
</footer>

<script>document.querySelectorAll('.anio').forEach(function (e) {{
  e.textContent = new Date().getFullYear();
}});</script>
</body>
</html>
"""


def textos(en, precio):
    p = f'{precio:,} MXN' if precio else None
    if en:
        return {
            'volver': 'Blog', 'inicio': 'Booking Page',
            'lectura': 'min read', 'actualizado': 'Updated',
            'dato': 'What this article is built on:',
            'anuncio_etq': 'Booking Page',
            'anuncio_t': 'Your own booking page, your own rules',
            'anuncio_p': (f'Guests book and pay you directly. {p} a month, no commission per booking.'
                          if p else 'Guests book and pay you directly. No commission per booking.'),
            'anuncio_b': 'See how it works',
            'bp_t': 'A booking page that is yours',
            'bp_p': ('Calendar synced with Airbnb and Booking, your seasons and your '
                     'cancellation policy, payment straight to your Stripe.'
                     + (f' {p} a month.' if p else '')),
            'bp_b': 'See Booking Page',
            'wd_etq': 'WD Studio',
            'wd_t': 'Want the whole website, or photos that sell?',
            'wd_p': ('WD Studio designs websites and shoots photography for villas, '
                     'houses and boutique hotels.'),
            'wd_b': 'Talk to WD Studio',
            'relacionados': 'Keep reading',
            'borrador': 'Draft — not indexed, not linked from the index.',
        }
    return {
        'volver': 'Blog', 'inicio': 'Booking Page',
        'lectura': 'min de lectura', 'actualizado': 'Actualizado',
        'dato': 'En qué se apoya este artículo:',
        'anuncio_etq': 'Booking Page',
        'anuncio_t': 'Tu propia página de reservas, con tus reglas',
        'anuncio_p': (f'El huésped reserva y te paga a ti. {p} al mes, sin comisión por reserva.'
                      if p else 'El huésped reserva y te paga a ti. Sin comisión por reserva.'),
        'anuncio_b': 'Ver cómo funciona',
        'bp_t': 'Una página de reservas que es tuya',
        'bp_p': ('Calendario sincronizado con Airbnb y Booking, tus temporadas y tu '
                 'política de cancelación, el pago directo a tu Stripe.'
                 + (f' {p} al mes.' if p else '')),
        'bp_b': 'Ver Booking Page',
        'wd_etq': 'WD Studio',
        'wd_t': '¿Quieres el sitio completo, o fotos que vendan?',
        'wd_p': ('WD Studio diseña sitios web y hace fotografía para villas, casas '
                 'y hoteles boutique.'),
        'wd_b': 'Hablar con WD Studio',
        'relacionados': 'Sigue leyendo',
        'borrador': 'Borrador — no se indexa ni aparece en el índice.',
    }


def con_anuncio(html_cuerpo, anuncio):
    """Mete el anuncio antes del h2 que cae a la mitad del texto."""
    cortes = [m.start() for m in re.finditer(r'<h2>', html_cuerpo)]
    if len(cortes) < 3:
        return html_cuerpo + anuncio
    # Nunca pegado a una foto: dos bloques grandes seguidos cansan.
    for corte in cortes[len(cortes) // 2:] + cortes[1:len(cortes) // 2][::-1]:
        if not html_cuerpo[:corte].rstrip().endswith('</figure>'):
            return html_cuerpo[:corte] + anuncio + html_cuerpo[corte:]
    return html_cuerpo + anuncio


def tarjeta_item(q, base, en, h='h3'):
    img = imagen(q.get('imagen'))
    foto = etiqueta_img(img, q.get('imagen_alt', ''), base,
                        sizes='(max-width:760px) 100vw, 400px') if img else ''
    return f"""<a class="item" href="{base}{'en/' if en else ''}blog/{q['slug']}/">
      {foto}
      <{h}>{esc(q['titulo'])}</{h}>
      <p class="meta">{esc(fecha_larga(q['fecha'], en))}</p>
      <p>{esc(q['resumen'])}</p>
    </a>"""


def pagina_post(p, pareja, otros, precio):
    en = p['idioma'] == 'en'
    base = '../../../' if en else '../../'
    canonical = url_post(p)
    t = textos(en, precio)
    modificado = p.get('modificado') or p['fecha']
    minutos = max(1, round(p['palabras'] / 220))
    alternas = {p['idioma']: canonical}
    if pareja:
        alternas[pareja['idioma']] = url_post(pareja)

    def figura(alt, src, pie):
        img = imagen(src)
        if not img:
            return ''
        return (f'<figure class="figura">{etiqueta_img(img, alt, base, sizes="(max-width:760px) 100vw, 960px")}'
                + (f'<figcaption>{en_linea(pie)}</figcaption>' if pie else '')
                + '</figure>')

    portada = imagen(p.get('imagen'))
    og = {'tipo': 'article', 'publicado': p['fecha'], 'modificado': modificado}
    if portada:
        og.update(imagen=f'{SITIO}/blog/media/{portada["src"]}', w=portada['w'],
                  h=portada['h'], alt=p.get('imagen_alt', ''))

    blog_url = f'{SITIO}/{"en/" if en else ""}blog/'
    jsonld = {'@context': 'https://schema.org', '@graph': [
        {
            '@type': 'BlogPosting',
            '@id': canonical + '#articulo',
            'headline': p['titulo'][:110],
            'description': p['resumen'],
            'datePublished': p['fecha'],
            'dateModified': modificado,
            'inLanguage': 'en' if en else 'es',
            'wordCount': p['palabras'],
            'author': {'@type': 'Person', 'name': p.get('autor', 'Diego Larios'),
                       'url': ESTUDIO},
            'publisher': {'@type': 'Organization', 'name': 'WD Studio Agency',
                          'url': ESTUDIO},
            'mainEntityOfPage': {'@type': 'WebPage', '@id': canonical},
            'isPartOf': {'@type': 'Blog', '@id': blog_url, 'name': 'Booking Page · Blog'},
            **({'keywords': p['palabra_clave']} if p.get('palabra_clave') else {}),
            **({'image': {'@type': 'ImageObject', 'url': og['imagen'],
                          'width': portada['w'], 'height': portada['h']}}
               if portada else {}),
        },
        {
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Booking Page',
                 'item': f'{SITIO}/{"en/" if en else ""}'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': blog_url},
                {'@type': 'ListItem', 'position': 3, 'name': p['titulo'], 'item': canonical},
            ],
        },
    ]}

    aviso = (f'<p class="aviso">{t["borrador"]}</p>'
             if p['estado'] != 'publicado' else '')
    dato = (f'<p class="dato"><b>{t["dato"]}</b> {esc(p["dato"])}</p>'
            if p.get('dato') else '')
    portada_html = ''
    if portada:
        portada_html = (f'<figure class="portada">'
                        f'{etiqueta_img(portada, p.get("imagen_alt", ""), base, prioridad=True, sizes="(max-width:1256px) 100vw, 1200px")}'
                        f'</figure>')
    inicio = f'{base}{"en/" if en else ""}'
    anuncio = f"""<aside class="anuncio" aria-label="Booking Page">
      <div>
        <span class="etq">{t['anuncio_etq']}</span>
        <p class="t">{t['anuncio_t']}</p>
        <p>{t['anuncio_p']}</p>
      </div>
      <a class="btn lleno" href="{inicio}">{t['anuncio_b']}</a>
    </aside>"""
    articulo = con_anuncio(markdown(p['cuerpo'], base, figura), anuncio)

    foto_bp = imagen('mar.jpg')
    foto_wd = imagen('aerea.jpg')
    cierre = f"""
  <section class="cierre" aria-label="{'More from WD Studio' if en else 'Más de WD Studio'}">
    <div class="tarjeta">
      {etiqueta_img(foto_bp, 'Terraza frente al mar' if not en else 'Terrace facing the sea', base, sizes='(max-width:760px) 100vw, 600px') if foto_bp else ''}
      <div class="txt">
        <span class="etq">Booking Page</span>
        <h2>{t['bp_t']}</h2>
        <p>{t['bp_p']}</p>
        <a class="btn" href="{inicio}">{t['bp_b']}</a>
      </div>
    </div>
    <div class="tarjeta oscura">
      {etiqueta_img(foto_wd, 'Casa vista desde arriba, junto a la playa' if not en else 'House seen from above, by the beach', base, sizes='(max-width:760px) 100vw, 600px') if foto_wd else ''}
      <div class="txt">
        <span class="etq">{t['wd_etq']}</span>
        <h2>{t['wd_t']}</h2>
        <p>{t['wd_p']}</p>
        <a class="btn" href="{ESTUDIO}" rel="noopener">{t['wd_b']}</a>
      </div>
    </div>
  </section>"""

    relacionados = ''
    if otros:
        relacionados = f"""
  <section class="relacionados">
    <h2>{t['relacionados']}</h2>
    <div class="rejilla">{''.join(tarjeta_item(q, base, en) for q in otros[:3])}</div>
  </section>"""

    actualizado = (f' · {t["actualizado"]} {esc(fecha_larga(modificado, en))}'
                   if modificado != p['fecha'] else '')
    cuerpo = f"""
  <div class="columna">
    <nav class="migas" aria-label="breadcrumb"><a href="{inicio}">{t['inicio']}</a><span>/</span><a href="{inicio}blog/">{t['volver']}</a></nav>
    <h1>{esc(p['titulo'])}</h1>
    <p class="meta"><time datetime="{p['fecha']}">{esc(fecha_larga(p['fecha'], en))}</time>{actualizado}
      · {esc(p.get('autor', 'Diego Larios'))} · {minutos} {t['lectura']}</p>
    <p class="resumen">{esc(p['resumen'])}</p>
    {aviso}
  </div>
  {portada_html}
  <div class="columna">
    {dato}
    <article>{articulo}</article>
  </div>
  {cierre}
  {relacionados}"""

    return armazon(titulo_html(p), p['resumen'], canonical, cuerpo, en, alternas,
                   jsonld, indexar=(p['estado'] == 'publicado'), base=base, og=og)


def pagina_indice(posts, en, precio):
    base = '../../' if en else '../'
    canonical = f'{SITIO}/{"en/" if en else ""}blog/'
    t = {
        'titulo': ('Direct bookings, your rules' if en else
                   'Reservas directas, con tus reglas'),
        'seo': ('Direct booking blog for vacation rental hosts · Booking Page' if en else
                'Blog de reservas directas para anfitriones · Booking Page'),
        'resumen': ('For hosts on Airbnb and Booking who want their own channel: '
                    'what it costs, what works, and what it feels like when the guest is yours.'
                    if en else
                    'Para anfitriones en Airbnb y Booking que quieren un canal propio: '
                    'lo que cuesta, lo que funciona y lo que se siente cuando el huésped es tuyo.'),
        'vacio': 'Nothing published yet.' if en else 'Todavía no hay nada publicado.',
    }
    contenido = f'<p class="vacio">{t["vacio"]}</p>'
    portada = None
    if posts:
        primero, resto = posts[0], posts[1:]
        img = imagen(primero.get('imagen'))
        portada = img
        foto = etiqueta_img(img, primero.get('imagen_alt', ''), base, prioridad=True,
                            sizes='(max-width:760px) 100vw, 680px') if img else ''
        contenido = f"""<a class="destacado" href="{base}{'en/' if en else ''}blog/{primero['slug']}/">
      {foto}
      <div>
        <p class="meta">{esc(fecha_larga(primero['fecha'], en))}</p>
        <h2>{esc(primero['titulo'])}</h2>
        <p>{esc(primero['resumen'])}</p>
      </div>
    </a>"""
        if resto:
            contenido += f'<div class="rejilla">{"".join(tarjeta_item(q, base, en, "h2") for q in resto)}</div>'

    jsonld = {'@context': 'https://schema.org', '@type': 'Blog', '@id': canonical,
              'name': t['titulo'], 'description': t['resumen'],
              'inLanguage': 'en' if en else 'es',
              'publisher': {'@type': 'Organization', 'name': 'WD Studio Agency',
                            'url': ESTUDIO},
              'blogPost': [{'@type': 'BlogPosting', 'headline': q['titulo'][:110],
                            'url': url_post(q), 'datePublished': q['fecha']}
                           for q in posts[:20]]}
    og = {}
    if portada:
        og = {'imagen': f'{SITIO}/blog/media/{portada["src"]}', 'w': portada['w'],
              'h': portada['h'], 'alt': posts[0].get('imagen_alt', '')}

    cuerpo = f"""
  <div class="envoltura">
    <div class="cabeza-indice">
      <h1>{t['titulo']}</h1>
      <p class="resumen">{t['resumen']}</p>
    </div>
    {contenido}
  </div>"""

    alternas = {'es': f'{SITIO}/blog/', 'en': f'{SITIO}/en/blog/'}
    return armazon(t['seo'], t['resumen'], canonical, cuerpo, en, alternas,
                   jsonld, base=base, og=og)


def sitemap(posts):
    """Con alternas de idioma e imágenes, y lastmod real de cada página."""
    por_slug = {(p['idioma'], p['slug']): p for p in posts}

    def nodo(url, lastmod, alternas, imgs):
        x = f'<url><loc>{url}</loc><lastmod>{lastmod}</lastmod>'
        for k, v in alternas.items():
            x += f'<xhtml:link rel="alternate" hreflang="{k}" href="{v}"/>'
        for src, alt in imgs:
            x += (f'<image:image><image:loc>{SITIO}/blog/media/{src}</image:loc>'
                  f'</image:image>')
        return x + '</url>'

    ultima = max((p.get('modificado') or p['fecha'] for p in posts),
                 default=datetime.date.today().isoformat())
    indices = {'es': f'{SITIO}/blog/', 'en': f'{SITIO}/en/blog/'}
    cuerpo = ''.join(nodo(u, ultima, {**indices, 'x-default': indices['es']}, [])
                     for u in indices.values())
    for p in posts:
        alternas = {p['idioma']: url_post(p)}
        otro = 'en' if p['idioma'] == 'es' else 'es'
        par = por_slug.get((otro, p.get('par', '')))
        if par:
            alternas[otro] = url_post(par)
        imgs = []
        for src in [p.get('imagen')] + re.findall(r'^!\[[^\]]*\]\(([^)\s]+)', p['cuerpo'], re.M):
            img = imagen(src)
            if img:
                imgs.append((img['src'], ''))
        cuerpo += nodo(url_post(p), p.get('modificado') or p['fecha'], alternas, imgs)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml" '
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'
            f'{cuerpo}</urlset>')


def feed(posts):
    def rfc822(iso):
        d = datetime.date.fromisoformat(iso)
        return datetime.datetime(d.year, d.month, d.day, 12, tzinfo=datetime.timezone.utc
                                 ).strftime('%a, %d %b %Y %H:%M:%S +0000')
    ultima = posts[0]['fecha'] if posts else datetime.date.today().isoformat()
    items = ''
    for p in posts[:20]:
        url = url_post(p)
        items += (f'<item><title>{esc(p["titulo"])}</title><link>{url}</link>'
                  f'<guid isPermaLink="true">{url}</guid>'
                  f'<pubDate>{rfc822(p["fecha"])}</pubDate>'
                  f'<description>{esc(p["resumen"])}</description></item>')
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<rss version="2.0"><channel>'
            '<title>Booking Page · WD Studio</title>'
            f'<link>{SITIO}/blog/</link>'
            '<description>Reservas directas para anfitriones</description>'
            f'<lastBuildDate>{rfc822(ultima)}</lastBuildDate>{items}'
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

    for x in avisos(vivos):
        print('  aviso ·', x)

    precio = precio_mes()
    for p in construir:
        otro = 'en' if p['idioma'] == 'es' else 'es'
        pareja = por_slug.get((otro, p.get('par', ''))) if p.get('par') else None
        otros = sorted([q for q in vivos if q['idioma'] == p['idioma']
                        and q['slug'] != p['slug']],
                       key=lambda q: q['fecha'], reverse=True)
        carpeta = (LANDING / 'en' / 'blog' if p['idioma'] == 'en'
                   else LANDING / 'blog') / p['slug']
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / 'index.html').write_text(pagina_post(p, pareja, otros, precio),
                                            encoding='utf-8')
        marca = '' if p['estado'] == 'publicado' else '  (borrador)'
        print(f'  {carpeta.relative_to(RAIZ)}/index.html{marca}')

    for en in (False, True):
        lista = sorted([p for p in vivos if p['idioma'] == ('en' if en else 'es')],
                       key=lambda p: p['fecha'], reverse=True)
        destino = (LANDING / 'en' / 'blog' if en else LANDING / 'blog')
        destino.mkdir(parents=True, exist_ok=True)
        (destino / 'index.html').write_text(pagina_indice(lista, en, precio), encoding='utf-8')
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
