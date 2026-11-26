#!/usr/bin/env python3
"""Barreras que no se pueden saltar.

Una skill le dice a un agente cómo hacer las cosas y puede olvidarla. Esto no
pide nada: tumba la construcción. Cada regla de aquí existe porque algo se
rompió de verdad, y la referencia de cada una dice qué.

Se corre en el flujo de publicación, antes de subir nada. Si sale en rojo, no
se publica. Para correrlo en local: python3 tools/guardrails.py
"""
import json
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
fallos = []


def falla(regla, detalle):
    fallos.append(f'{regla}: {detalle}')


def lee(rel):
    return (RAIZ / rel).read_text(encoding='utf-8')


# ── G1 · Nada vacío esperando al JavaScript ───────────────────────────────
# Roto el 24 nov 2026: la calculadora traía los resultados en blanco y los
# llenaba el script. Quien llegaba desde un buscador veía una caja vacía.
HIDRATA = ['v-tarifa', 'v-noches', 'r-ahorro', 'r-comision', 'r-cuesta',
           'r-nota', 'p-mes', 'p-ano', 'p-ano-nota']

for pagina in ('landing/index.html', 'landing/en/index.html'):
    s = lee(pagina)
    for ident in HIDRATA:
        m = re.search(r'id="%s"[^>]*>(.*?)<' % re.escape(ident), s, re.S)
        if not m:
            falla('G1', f'{pagina} ya no tiene #{ident}; actualiza la lista HIDRATA')
        elif not m.group(1).strip():
            falla('G1', f'{pagina} deja #{ident} vacío en el HTML')


# ── G2 · El título dice lo que la lista tiene ─────────────────────────────
# Roto desde el principio: "Tres pasos y estás cobrando" encima de cuatro.
NUMERO = {'Un': 1, 'Dos': 2, 'Tres': 3, 'Cuatro': 4, 'Cinco': 5,
          'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5}

for pagina in ('landing/index.html', 'landing/en/index.html'):
    s = lee(pagina)
    titulo = re.search(r'<h2 class="heading">(\w+) (?:pasos|steps)', s)
    lista = re.search(r'<ol class="pasos">(.*?)</ol>', s, re.S)
    if not titulo or not lista:
        falla('G2', f'{pagina}: no se encuentra el bloque de pasos')
        continue
    dice = NUMERO.get(titulo.group(1))
    hay = lista.group(1).count('<li>')
    if dice != hay:
        falla('G2', f'{pagina}: el título dice {titulo.group(1)} y la lista tiene {hay}')


# ── G3 · Una sola oferta, en todas partes ─────────────────────────────────
# Roto el 24 nov 2026: la oferta cambió a tres meses y "seis meses" seguía
# vivo en siete sitios, los términos que el cliente acepta incluidos.
# "veinte" volvió a ser legítimo el 25 nov 2026: el código de lanzamiento tiene
# veinte canjes. Lo que no puede volver es la oferta de seis meses ni el periodo
# de prueba, que contradecía el cobro por adelantado.
PROHIBIDO = ['seis meses', 'six months', 'mes de prueba', 'one-month trial',
             'treinta días antes del primer cobro', "thirty days' notice before the first"]

for p in RAIZ.rglob('*'):
    if not p.is_file() or p.suffix not in ('.html', '.js', '.json', '.gs'):
        continue
    partes = p.relative_to(RAIZ).parts
    if '.git' in partes or 'blog' in partes:
        continue
    t = p.read_text(encoding='utf-8', errors='ignore').lower()
    for frase in PROHIBIDO:
        if frase in t:
            falla('G3', f'{p.relative_to(RAIZ)} dice "{frase}"')


# ── G4 · Ninguna llave en el repositorio ──────────────────────────────────
# No se ha roto. Está aquí porque el día que se rompa ya es tarde: las llaves
# de Stripe viven en las propiedades del Apps Script y en los secretos de
# GitHub, nunca en un archivo.
LLAVES = [r'sk_live_[A-Za-z0-9]', r'sk_test_[A-Za-z0-9]', r'rk_live_[A-Za-z0-9]',
          r'whsec_[A-Za-z0-9]', r'ghp_[A-Za-z0-9]{20}', r'AIza[A-Za-z0-9_\-]{30}']

for p in RAIZ.rglob('*'):
    if not p.is_file() or '.git' in p.relative_to(RAIZ).parts:
        continue
    if p.suffix in ('.png', '.jpg', '.jpeg', '.webp', '.pdf', '.woff2', '.mp4'):
        continue
    t = p.read_text(encoding='utf-8', errors='ignore')
    for patron in LLAVES:
        if re.search(patron, t):
            falla('G4', f'{p.relative_to(RAIZ)} parece traer una llave ({patron})')


# ── G5 · Los enlaces de pago, en un solo sitio ────────────────────────────
# Roto el 19 nov 2026: la landing publicada apuntaba a enlaces viejos en
# dólares mientras el precio real ya estaba en pesos. Nadie se dio cuenta
# hasta que un cliente estuvo a punto de pagar.
VIVOS = set(json.loads(lee('tools/enlaces-pago.json'))['vivos'])

for p in RAIZ.rglob('*'):
    if not p.is_file() or p.suffix not in ('.html', '.js', '.json', '.gs'):
        continue
    if '.git' in p.relative_to(RAIZ).parts or p.name == 'enlaces-pago.json':
        continue
    for enlace in re.findall(r'https://buy\.stripe\.com/[A-Za-z0-9]+',
                             p.read_text(encoding='utf-8', errors='ignore')):
        if enlace not in VIVOS:
            falla('G5', f'{p.relative_to(RAIZ)} usa un enlace de pago que no está '
                        f'en tools/enlaces-pago.json: {enlace}')


# ── G6 · Lo legal dice lo que tiene que decir ─────────────────────────────
# Puesto el 24 nov 2026, cuando se añadieron las tres secciones que faltaban.
# Sin esto, una regeneración distraída las borra y nadie lo nota.
OBLIGADO = {
    'landing/terminos/index.html': ['PCI-DSS', 'intermediario financiero',
                                    'topada al monto'],
    'landing/en/terms/index.html': ['PCI-DSS', 'financial intermediary',
                                    'capped at'],
}
for pagina, frases in OBLIGADO.items():
    s = lee(pagina)
    for f in frases:
        if f not in s:
            falla('G6', f'{pagina} ya no dice "{f}"')


# ── G7 · Lo legal publicado sale de legal.json ────────────────────────────
# Las cuatro páginas legales las escribe genera-legal.py. Editarlas a mano
# funciona hasta la siguiente regeneración, que borra el cambio en silencio.
# Si esto falla, alguien editó el HTML en vez de la fuente.
antes = {p: (RAIZ / p).read_text(encoding='utf-8') for p in OBLIGADO}
antes.update({p: (RAIZ / p).read_text(encoding='utf-8') for p in
              ('landing/privacidad/index.html', 'landing/en/privacy/index.html')})
subprocess.run([sys.executable, 'tools/genera-legal.py'], cwd=RAIZ,
               capture_output=True, check=True)
for p, contenido in antes.items():
    if (RAIZ / p).read_text(encoding='utf-8') != contenido:
        falla('G7', f'{p} no coincide con landing/legal.json: edita la fuente, '
                    f'no el HTML, y vuelve a generar')
        (RAIZ / p).write_text(contenido, encoding='utf-8')


# ── resultado ─────────────────────────────────────────────────────────────
if fallos:
    print(f'\n{len(fallos)} barrera(s) rota(s):\n')
    for f in fallos:
        print('  ' + f)
    print('\nNo se publica.')
    sys.exit(1)

print('Barreras en verde.')
