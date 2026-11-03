#!/usr/bin/env python3
"""
Alta de un cliente nuevo, de config.json a URL viva, en un solo comando.

    python3 tools/alta.py casa-luna --config ~/Downloads/config.json
    python3 tools/alta.py casa-luna --config c.json --domain reservas.casaluna.mx
    python3 tools/alta.py casa-luna --config c.json --dry-run

Hace, en orden: valida el config, arma la carpeta, crea el repo, publica en
GitHub Pages, apunta el dominio y espera a que el sitio responda.

El paso de Apps Script sigue siendo manual y el script lo dice al final; es lo
siguiente que hay que automatizar.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SLUG_OK = re.compile(r'^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$')
DOMINIO_OK = re.compile(r'^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$')


class Alto(Exception):
    """Algo impide continuar; el mensaje va directo al operador."""


def paso(n, total, texto):
    print(f'\n[{n}/{total}] {texto}', flush=True)


# Tokens que nunca deben aparecer en un log ni en el informe que guarda Actions.
SECRETOS: list[str] = []


def oculta(texto):
    for s in SECRETOS:
        if s:
            texto = texto.replace(s, '***')
    return texto


def correr(cmd, cwd=None, entrada=None, permitir_fallo=False):
    r = subprocess.run(cmd, cwd=cwd, input=entrada, capture_output=True, text=True)
    if r.returncode and not permitir_fallo:
        salida = oculta((r.stderr or r.stdout).strip())
        raise Alto(f'Fallo: {oculta(" ".join(cmd))}\n{salida}')
    return r


# ── Validación del config ────────────────────────────────────────────────

REQUERIDOS = [
    ('property.name', str), ('property.maxGuests', int),
    ('property.checkIn', str), ('property.checkOut', str),
    ('rates.defaultNightly', (int, float)), ('rates.defaultMinNights', int),
    ('fees.cleaning', (int, float)),
    ('currency', str), ('defaultLanguage', str), ('languages', list),
    ('contact.email', str), ('payment.mode', str),
]


def busca(cfg, ruta):
    o = cfg
    for parte in ruta.split('.'):
        if not isinstance(o, dict) or parte not in o:
            return None
        o = o[parte]
    return o


def valida(cfg):
    """Devuelve (errores, avisos). Un error detiene el alta; un aviso no."""
    errores, avisos = [], []

    for ruta, tipo in REQUERIDOS:
        v = busca(cfg, ruta)
        if v is None or (isinstance(v, str) and not v.strip()):
            errores.append(f'falta {ruta}')
        elif not isinstance(v, tipo):
            errores.append(f'{ruta} debería ser {tipo} y es {type(v).__name__}')

    nombre = busca(cfg, 'property.name') or ''
    if nombre.strip().lower() in ('casa aurora', 'example', 'demo', ''):
        errores.append('property.name sigue siendo el de la plantilla')

    if (busca(cfg, 'contact.email') or '').endswith('example.com'):
        errores.append('contact.email sigue siendo el de la plantilla')

    tarifa = busca(cfg, 'rates.defaultNightly')
    if isinstance(tarifa, (int, float)) and tarifa <= 0:
        errores.append('rates.defaultNightly tiene que ser mayor que cero')

    # unit y plan los emite el formulario; un valor raro no rompe nada visible,
    # sólo deja el sitio hablando de "noches" cuando se rentan autos.
    unidad = cfg.get('unit', 'night')
    if unidad not in ('night', 'day'):
        errores.append(f'unit debería ser "night" o "day", y es "{unidad}"')
    plan = cfg.get('plan')
    if plan is not None and plan not in ('renta', 'compra'):
        errores.append(f'plan debería ser "renta" o "compra", y es "{plan}"')
    if plan == 'renta':
        if cfg.get('extras'):
            avisos.append('plan es "renta" pero el config trae extras; '
                          'la renta va sobre la plantilla y no los muestra')
        if busca(cfg, 'fees.petPerNight'):
            avisos.append('plan es "renta" pero hay cargo por mascota; no se va a cobrar')

    idiomas = busca(cfg, 'languages') or []
    pred = busca(cfg, 'defaultLanguage')
    if idiomas and pred and pred not in idiomas:
        errores.append(f'defaultLanguage "{pred}" no está en languages {idiomas}')

    for idioma in idiomas:
        for campo in ('property.tagline', 'property.about', 'policy'):
            v = busca(cfg, campo)
            if isinstance(v, dict) and not (v.get(idioma) or '').strip():
                avisos.append(f'{campo}.{idioma} está vacío')

    # "demo" es el estado normal de un alta nueva, no un problema: se informa
    # al final, en los pasos que faltan, y no detiene nada.
    modo = busca(cfg, 'payment.mode')
    if modo == 'stripe' and not (cfg.get('backendUrl') or '').strip():
        avisos.append('payment.mode es "stripe" pero backendUrl está vacío; '
                      'hay que pegar la URL del Apps Script antes de cobrar')

    if not (busca(cfg, 'property.photos') or []):
        avisos.append('property.photos está vacío; la página sale sin portada '
                      'ni galería, sólo con el nombre y el formulario')

    wa = busca(cfg, 'contact.whatsapp') or ''
    if wa.replace('+', '').replace(' ', '') in ('520000000000', ''):
        avisos.append('contact.whatsapp sigue siendo el de la plantilla')

    return errores, avisos


def limpia(cfg):
    """Quita las llaves de documentación que empiezan con _."""
    if isinstance(cfg, dict):
        return {k: limpia(v) for k, v in cfg.items() if not k.startswith('_')}
    if isinstance(cfg, list):
        return [limpia(x) for x in cfg]
    return cfg


# ── Pasos del alta ───────────────────────────────────────────────────────

def revisa_entorno(seco):
    faltan = [c for c in ('git', 'gh') if shutil.which(c) is None]
    if faltan:
        raise Alto(f'No encuentro {", ".join(faltan)} en el PATH.')
    if seco:
        # En prueba no se consulta a GitHub: el usuario sale del remoto del motor.
        r = correr(['git', 'remote', 'get-url', 'origin'], cwd=RAIZ, permitir_fallo=True)
        m = re.search(r'github\.com[:/]([^/]+)/', r.stdout.strip())
        return m.group(1) if m else 'USUARIO'
    # Se comprueba con una llamada real, no con `gh auth status`: esa puede
    # fallar por un GH_TOKEN viejo aunque la API responda por otro camino.
    r = correr(['gh', 'api', 'user', '-q', '.login'], permitir_fallo=True)
    usuario = r.stdout.strip()
    if r.returncode or not usuario:
        raise Alto('gh no puede hablar con GitHub. Corre:  gh auth login\n'
                   'Si tienes un GH_TOKEN viejo en el entorno, bórralo antes:  unset GH_TOKEN')
    return usuario


def token_de_git():
    """El token con el que empujar el repo del cliente.

    En la Mac, `gh auth login` instaló un ayudante de credenciales y `git push`
    se autentica solo. Dentro de GitHub Actions ese ayudante no existe, y
    actions/checkout sólo autentica el repo que descargó, no una carpeta nueva
    que apunta a otro repo: ahí el push pide usuario, no hay nadie que lo
    teclee, y el alta muere con el repo creado y vacío. Así que si hay token se
    empuja con él en la URL; si no, se deja que el ayudante opine.

    El token viaja como argumento, no al .git/config del cliente, y queda
    tapado en cualquier mensaje de error.
    """
    for nombre in ('GH_TOKEN', 'GITHUB_TOKEN'):
        t = (os.environ.get(nombre) or '').strip()
        if t:
            return t
    return correr(['gh', 'auth', 'token'], permitir_fallo=True).stdout.strip()


def arma_carpeta(slug, cfg, destino, dominio):
    if destino.exists():
        raise Alto(f'{destino} ya existe. Bórrala o usa otro slug.')
    destino.mkdir(parents=True)
    for f in ('index.html', 'pricing.js'):
        shutil.copy(RAIZ / f, destino / f)
    (destino / 'config.json').write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if dominio:
        (destino / 'CNAME').write_text(dominio + '\n', encoding='utf-8')
    (destino / '.nojekyll').write_text('', encoding='utf-8')
    return sorted(p.name for p in destino.iterdir())


def publica(slug, destino, usuario, privado, seco):
    cmds = [
        ['git', 'init', '-q', '-b', 'main'],
        ['git', 'add', '-A'],
        ['git', '-c', 'user.name=WD Studio', '-c', 'user.email=hola@wdstudio.agency',
         'commit', '-q', '-m', f'Alta de {slug}'],
    ]
    for c in cmds:
        if seco:
            print(f'      (prueba) {" ".join(c)}')
        else:
            correr(c, cwd=destino)

    # Se crea por REST y no con `gh repo create`, que usa GraphQL y no
    # siempre está disponible.
    crear = ['gh', 'api', '-X', 'POST', 'user/repos',
             '-f', f'name={slug}',
             '-F', f'private={"true" if privado else "false"}',
             '-F', 'has_issues=false', '-F', 'has_wiki=false',
             '-f', 'description=Booking Page · WD Studio']
    url_limpia = f'https://github.com/{usuario}/{slug}.git'
    token = '' if seco else token_de_git()
    if token:
        SECRETOS.append(token)
        url_push = f'https://x-access-token:{token}@github.com/{usuario}/{slug}.git'
    else:
        url_push = url_limpia
    remoto = ['git', 'remote', 'add', 'origin', url_limpia]
    empujar = ['git', 'push', '-q', url_push, 'main:main']
    pages = ['gh', 'api', '-X', 'POST', f'repos/{usuario}/{slug}/pages',
             '-f', 'source[branch]=main', '-f', 'source[path]=/']
    if seco:
        for c in (crear, remoto, empujar, pages):
            print(f'      (prueba) {" ".join(c)}')
        return f'https://{usuario}.github.io/{slug}/'

    r = correr(crear, permitir_fallo=True)
    if r.returncode:
        salida = (r.stderr or r.stdout)
        if 'already exists' in salida:
            # Un repo vacío es la huella de un alta que creó el repo y no pudo
            # empujar. No es un cliente que ya exista: se reutiliza. Si tiene
            # aunque sea un commit, se para, para no pisar a nadie.
            c = correr(['gh', 'api', f'repos/{usuario}/{slug}/commits'],
                       permitir_fallo=True)
            vacio = 'Git Repository is empty' in (c.stdout + c.stderr)
            if not vacio:
                raise Alto(f'Ya existe un repo {usuario}/{slug} y tiene contenido.\n'
                           'Usa otro slug, o bórralo en GitHub si fue una prueba.')
            print(f'      {usuario}/{slug} ya existía vacío; lo reutilizo')
        if 'bound to their configured repositories' in salida or 'GraphQL' in salida:
            raise Alto('Este entorno no puede crear repos: está limitado a uno solo.\n'
                       'Corre el alta desde tu Mac, donde gh tiene permiso completo.')
        raise Alto(f'No pude crear el repo:\n{salida.strip()}')
    correr(remoto, cwd=destino)
    correr(empujar, cwd=destino)
    r = correr(pages, permitir_fallo=True)
    if r.returncode and 'already exists' not in (r.stderr + r.stdout):
        raise Alto(f'No pude activar Pages:\n{(r.stderr or r.stdout).strip()}')
    datos = correr(['gh', 'api', f'repos/{usuario}/{slug}/pages', '-q', '.html_url'],
                   permitir_fallo=True)
    return (datos.stdout.strip() or f'https://{usuario}.github.io/{slug}/')


def espera(url, intentos=20, pausa=15, seco=False):
    if seco:
        print('      (prueba) no se consulta la URL')
        return False
    for i in range(1, intentos + 1):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            pass
        print(f'      intento {i}/{intentos}, todavía no responde…', flush=True)
        time.sleep(pausa)
    return False


# ── Principal ────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description='Alta de un cliente, de config a URL viva.')
    p.add_argument('slug', help='nombre corto del cliente, por ejemplo casa-luna')
    p.add_argument('--config', required=True,
                   help='config.json que salió del formulario, o - para leerlo de la entrada')
    p.add_argument('--json', action='store_true',
                   help='además del informe, imprime una línea JSON con el resultado')
    p.add_argument('--domain', help='dominio propio, por ejemplo reservas.casaluna.mx')
    p.add_argument('--private', action='store_true', help='repo privado')
    p.add_argument('--dry-run', action='store_true', help='enseña los pasos sin ejecutarlos')
    p.add_argument('--force', action='store_true', help='continúa aunque haya avisos')
    a = p.parse_args()

    if not SLUG_OK.match(a.slug):
        raise Alto('El slug sólo admite minúsculas, números y guiones, '
                   'entre 3 y 40 caracteres, y no puede empezar ni acabar en guion.')
    if a.domain and not DOMINIO_OK.match(a.domain):
        raise Alto(f'El dominio "{a.domain}" no tiene forma de dominio.')

    if a.config == '-':
        crudo, origen = sys.stdin.read(), 'la entrada estándar'
    else:
        ruta = pathlib.Path(a.config).expanduser()
        if not ruta.is_file():
            raise Alto(f'No encuentro {ruta}')
        crudo, origen = ruta.read_text(encoding='utf-8'), str(ruta)
    if not crudo.strip():
        raise Alto(f'No llegó nada por {origen}')
    try:
        cfg = json.loads(crudo)
    except json.JSONDecodeError as e:
        raise Alto(f'El config de {origen} no es JSON válido: {e}')

    TOTAL = 5
    paso(1, TOTAL, 'Reviso el config')
    errores, avisos = valida(cfg)
    if errores:
        raise Alto('El config no está listo:\n  · ' + '\n  · '.join(errores))
    for av in avisos:
        print(f'      aviso: {av}')
    # Los avisos sólo detienen el alta cuando hay una persona delante que pueda
    # decidir. Con --json el alta la corre el workflow, y ahí no hay nadie a
    # quien preguntar: detenerse significa que el cliente llenó el formulario,
    # dejó un campo opcional en blanco, y su sitio no existe sin que nadie se
    # entere. Así que corre, y los avisos van en el resultado para que queden
    # registrados y se puedan revisar después.
    if avisos and not a.force and not a.json and not a.dry_run:
        print('\n      Hay avisos. Revisa arriba y vuelve a correr con --force si están bien.')
        return 2
    print(f'      {cfg["property"]["name"]} · {cfg["currency"]} '
          f'{cfg["rates"]["defaultNightly"]}/noche · mínimo '
          f'{cfg["rates"]["defaultMinNights"]} noches')

    paso(2, TOTAL, 'Reviso el entorno')
    usuario = revisa_entorno(a.dry_run)
    print(f'      GitHub: {usuario}')

    paso(3, TOTAL, 'Armo la carpeta')
    destino = RAIZ.parent / a.slug
    archivos = arma_carpeta(a.slug, limpia(cfg), destino, a.domain)
    print(f'      {destino}')
    print(f'      {", ".join(archivos)}')

    paso(4, TOTAL, 'Creo el repo y publico')
    url = a.domain and f'https://{a.domain}/' or None
    url_pages = publica(a.slug, destino, usuario, a.private, a.dry_run)
    url = url or url_pages

    paso(5, TOTAL, 'Espero a que el sitio responda')
    vivo = espera(url_pages, seco=a.dry_run)

    print('\n' + '─' * 58)
    print(f'  Cliente:  {cfg["property"]["name"]}')
    print(f'  Carpeta:  {destino}')
    print(f'  Sitio:    {url}')
    if a.domain:
        print(f'            apunta un CNAME de {a.domain} a {usuario}.github.io')
    print(f'  Estado:   {"respondiendo" if vivo else "publicando, tarda unos minutos"}')
    print('─' * 58)
    if cfg.get('payment', {}).get('mode') == 'demo':
        print('\n  Falta, para que cobre de verdad:')
        print('   1. Desplegar el Apps Script y pegar su URL en backendUrl')
        print('   2. Poner la llave de Stripe en las propiedades del Apps Script,')
        print('      nunca en el repo ni por mensaje')
        print('   3. Cambiar payment.mode a "stripe" y volver a subir')

    if a.json:
        # Una sola línea, la última, para que quien llame pueda leerla.
        print('\n' + json.dumps({
            'ok': True, 'slug': a.slug, 'cliente': cfg['property']['name'],
            'url': url, 'repo': f'{usuario}/{a.slug}', 'vivo': vivo,
            'dominio': a.domain or None, 'avisos': avisos,
        }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Alto as e:
        print(f'\n✗ {e}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nCancelado.', file=sys.stderr)
        sys.exit(130)
