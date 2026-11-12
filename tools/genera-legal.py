#!/usr/bin/env python3
"""Escribe las cuatro páginas legales de Booking Page desde landing/legal.json.

    python3 tools/genera-legal.py

Deja landing/terminos/index.html, landing/privacidad/index.html y sus dos
equivalentes bajo landing/en/.

Los términos son los mismos que el cliente acepta en el alta. Si se tocan
aquí hay que tocarlos también en tools/intake.html y subir la versión en los
dos sitios: si divergen, vale la que el cliente firmó, y la pública te
contradice.
"""

import html
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
LANDING = RAIZ / 'landing'


def esc(s):
    return html.escape(str(s), quote=True)


def pagina(doc, datos, en, otra_cara):
    idioma = 'en' if en else 'es'
    base = '../../' if en else '../'
    ent = datos['entidad']

    t = {
        'inicio': 'Booking Page' if en else 'Booking Page',
        'version': 'Version' if en else 'Versión',
        'vigente': 'In force since' if en else 'En vigor desde el',
        'otra': ('Privacy policy' if doc == 'terminos' else 'Terms and conditions') if en
                else ('Política de privacidad' if doc == 'terminos' else 'Términos y condiciones'),
        'volver': 'Back to Booking Page' if en else 'Volver a Booking Page',
        'duda': ('Anything unclear, write to us' if en
                 else 'Si algo no queda claro, escríbenos'),
    }
    bloque = datos[doc][idioma]
    anio, mes, dia = datos['version'].split('-')
    meses = (['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'] if en else
             ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
              'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])
    fecha_larga = (f'{meses[int(mes) - 1]} {int(dia)}, {anio}' if en
                   else f'{int(dia)} de {meses[int(mes) - 1]} de {anio}')
    otro = 'privacidad' if doc == 'terminos' else 'terminos'
    ruta_otro = ({'terminos': 'terms', 'privacidad': 'privacy'}[otro] if en else otro)

    apartados = ''.join(
        f'<section class="apartado"><h2>{esc(titulo)}</h2><p>{esc(texto)}</p></section>'
        for titulo, texto in bloque['apartados'])

    # La entidad sólo se imprime cuando está rellenada: una ficha legal con
    # huecos vacíos es peor que no ponerla.
    ficha = ''
    if ent.get('razon_social') or ent.get('domicilio'):
        partes = [p for p in (ent.get('razon_social'), ent.get('domicilio')) if p]
        ficha = ('<p class="ficha">' + esc(' · '.join(partes)) +
                 f' · <a href="mailto:{esc(ent["correo"])}">{esc(ent["correo"])}</a></p>')

    return f"""<!doctype html>
<html lang="{idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(bloque['titulo'])} · Booking Page</title>
<meta name="description" content="{esc(bloque['entradilla'])}">
<meta name="robots" content="index,follow">
<style>
  :root{{
    --verde:#0E9C7A; --verde-hondo:#073F31;
    --tinta:#14171A; --g700:#4A5054; --g400:#8A9196;
    --papel:#FFFFFF; --hueso:#F3F2EE; --linea:rgba(20,23,26,.12);
    --display:'Cormorant Garamond','Bitstream Charter',Georgia,serif;
    --texto:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }}
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{background:var(--papel);color:var(--tinta);font-family:var(--texto);
    font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased}}
  a{{color:var(--verde);text-decoration:none}}
  a:hover{{text-decoration:underline}}
  .barra{{border-bottom:1px solid var(--linea)}}
  .envoltura{{max-width:760px;margin:0 auto;padding:0 28px}}
  .barra .envoltura{{display:flex;align-items:center;justify-content:space-between;
    height:64px;gap:20px}}
  .marca{{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:600}}
  .marca span{{color:var(--g400);font-weight:400}}
  .idiomas a{{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--g400)}}
  .idiomas a.activo{{color:var(--tinta)}}
  main{{padding:clamp(48px,7vw,86px) 0}}
  h1{{font-family:var(--display);font-weight:300;
    font-size:clamp(2.1rem,5vw,3.2rem);line-height:1.1;letter-spacing:-.01em}}
  .entradilla{{margin-top:18px;color:var(--g700);font-size:1.05rem;max-width:60ch}}
  .meta{{margin-top:26px;padding-top:20px;border-top:1px solid var(--linea);
    font-size:13px;color:var(--g400)}}
  .ficha{{margin-top:6px;font-size:13px;color:var(--g400)}}
  .apartado{{margin-top:38px}}
  .apartado h2{{font-family:var(--display);font-weight:400;font-size:1.5rem;
    line-height:1.2;margin-bottom:10px}}
  .apartado p{{color:var(--g700)}}
  .cierre{{margin-top:56px;padding-top:28px;border-top:1px solid var(--linea);
    display:flex;gap:22px;flex-wrap:wrap;font-size:14px}}
  footer{{border-top:1px solid var(--linea);padding:28px 0;margin-top:40px;
    font-size:12px;color:var(--g400)}}
  footer .envoltura{{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}}
</style>
</head>
<body>

<header class="barra">
  <div class="envoltura">
    <a class="marca" href="{base}">Booking Page <span>· WD Studio</span></a>
    <div class="idiomas">
      <a href="{'../../terminos/' if en else '#'}"{'' if en else ' class="activo"'}>ES</a>
      <a href="{'#' if en else otra_cara}"{' class="activo"' if en else ''}>EN</a>
    </div>
  </div>
</header>

<main>
  <div class="envoltura">
    <h1>{esc(bloque['titulo'])}</h1>
    <p class="entradilla">{esc(bloque['entradilla'])}</p>
    <p class="meta">{t['version']} {esc(datos['version'])} · {t['vigente']} {esc(fecha_larga)}</p>
    {ficha}

    {apartados}

    <div class="cierre">
      <a href="{base}{ruta_otro}/">{t['otra']}</a>
      <a href="{base}">{t['volver']}</a>
      <a href="mailto:{esc(ent['correo'])}">{t['duda']}</a>
    </div>
  </div>
</main>

<footer>
  <div class="envoltura">
    <span>© <span id="anio">2026</span> WD Studio Agency</span>
    <span><a href="{base}">wdstudio.agency</a></span>
  </div>
</footer>

<script>document.getElementById('anio').textContent = new Date().getFullYear();</script>
</body>
</html>
"""


def main():
    datos = json.loads((LANDING / 'legal.json').read_text(encoding='utf-8'))

    salidas = [
        ('terminos',   False, LANDING / 'terminos' / 'index.html',        '../en/terms/'),
        ('privacidad', False, LANDING / 'privacidad' / 'index.html',      '../en/privacy/'),
        ('terminos',   True,  LANDING / 'en' / 'terms' / 'index.html',    ''),
        ('privacidad', True,  LANDING / 'en' / 'privacy' / 'index.html',  ''),
    ]

    for doc, en, destino, otra in salidas:
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(pagina(doc, datos, en, otra), encoding='utf-8')
        print(f'  {destino.relative_to(RAIZ)}')

    ent = datos['entidad']
    if not ent.get('razon_social') or not ent.get('domicilio'):
        print('\nAviso: falta la razón social o el domicilio en legal.json.')
        print('La ficha legal no se imprime hasta que estén, y tanto el RGPD')
        print('como la ley mexicana piden identificar a quién responde.')
    print('\n4 páginas legales escritas.')


if __name__ == '__main__':
    sys.exit(main())
