#!/usr/bin/env python3
"""El bucle: abre las páginas en un navegador de verdad y comprueba el
resultado, en vez de fiarse del diff.

Lo que vigila es que lo que se ve sin JavaScript sea lo mismo que se ve con
JavaScript. El 24 de noviembre de 2026 esto cachó que la página en inglés
mostraba 53,500 estáticos y saltaba a 2,805 al cargar, porque arranca en
dólares y los valores escritos estaban en pesos.

python3 tools/qa-funnel.py"""
import pathlib, re, sys
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
fallos = []

def ok(cond, msg):
    print(('  OK   ' if cond else '  FALLA ') + msg)
    if not cond:
        fallos.append(msg)

# --- estático, sin ejecutar JS -------------------------------------------
for f, ids in [('landing/index.html', ['v-tarifa', 'v-noches', 'r-ahorro', 'r-comision',
                                       'r-cuesta', 'r-nota', 'p-mes', 'p-ano', 'p-ano-nota']),
               ('landing/en/index.html', ['v-tarifa', 'v-noches', 'r-ahorro', 'r-comision',
                                          'r-cuesta', 'r-nota', 'p-mes', 'p-ano', 'p-ano-nota'])]:
    s = (RAIZ / f).read_text(encoding='utf-8')
    print(f'\n{f} · sin JavaScript')
    for i in ids:
        m = re.search(r'id="%s"\s*>(.*?)<' % re.escape(i), s, re.S)
        ok(bool(m and m.group(1).strip()), f'#{i} trae contenido en el HTML')

# --- pasos: el título dice lo que la lista tiene --------------------------
NUM = {'Tres': 3, 'Cuatro': 4, 'Three': 3, 'Four': 4}
for f in ('landing/index.html', 'landing/en/index.html'):
    s = (RAIZ / f).read_text(encoding='utf-8')
    m = re.search(r'<h2 class="heading">(\w+) (?:pasos|steps)', s)
    lista = re.search(r'<ol class="pasos">(.*?)</ol>', s, re.S)
    print(f'\n{f} · pasos')
    if m and lista:
        dice, hay = NUM.get(m.group(1)), lista.group(1).count('<li>')
        ok(dice == hay, f'el título dice {m.group(1)} ({dice}) y la lista tiene {hay}')
    else:
        ok(False, 'no se encontró el bloque de pasos')

# --- la oferta vieja no sobrevive en ningún sitio -------------------------
print('\noferta')
viejo = []
for p in RAIZ.rglob('*'):
    if p.is_file() and '.git' not in p.parts and 'blog' not in p.parts \
       and p.suffix in ('.html', '.js', '.json', '.gs'):
        t = p.read_text(encoding='utf-8', errors='ignore').lower()
        if 'seis meses' in t or 'six months' in t or 'primeras veinte' in t:
            viejo.append(str(p.relative_to(RAIZ)))
ok(not viejo, 'no queda rastro de los seis meses ni de las veinte ' + (str(viejo) if viejo else ''))

# --- legales --------------------------------------------------------------
print('\nlegales')
for f, frases in [('landing/terminos/index.html',
                   ['PCI-DSS', 'intermediario financiero', 'topada al monto', 'tres meses sin costo']),
                  ('landing/en/terms/index.html',
                   ['PCI-DSS', 'financial intermediary', 'capped at', 'three months at no cost'])]:
    s = (RAIZ / f).read_text(encoding='utf-8')
    for fr in frases:
        ok(fr in s, f'{f} contiene "{fr}"')

# --- con JavaScript: el número pintado coincide con el estático -----------
print('\ncon JavaScript')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for f, esperado in (('landing/index.html', '10 noches'), ('landing/en/index.html', '10 nights')):
        ruta = RAIZ / f
        estatico = re.search(r'id="r-ahorro"[^>]*>(.*?)<', ruta.read_text(encoding='utf-8')).group(1)
        pg = b.new_page()
        pg.goto(f'file://{ruta}')
        pg.wait_for_timeout(1200)
        vivo = pg.inner_text('#r-ahorro').strip()
        noches = pg.inner_text('#v-noches').strip()
        ok(vivo == estatico.strip(),
           f'{f}: estático {estatico.strip()!r} == hidratado {vivo!r}')
        ok(noches == esperado, f'{f}: #v-noches hidrata a {esperado!r} (dio {noches!r})')
        pg.close()
    b.close()

print('\n' + ('TODO EN VERDE' if not fallos else f'{len(fallos)} FALLAS'))
sys.exit(1 if fallos else 0)
