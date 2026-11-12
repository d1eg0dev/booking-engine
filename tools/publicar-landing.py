#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publica la landing, el demo y el formulario en wdstudio.agency/booking-page/.

    python3 tools/publicar-landing.py --repo ~/Proyectos/wdstudio.agency
    python3 tools/publicar-landing.py --repo ~/Proyectos/wdstudio.agency --dry-run

El sitio de la agencia se sirve desde GitHub Pages, desde el repo
d1eg0dev/wdstudio.agency; HostGator sólo guarda el DNS. Así que publicar es
copiar y empujar, y conviene que sea un comando y no una copia a mano: lo que
se copia a mano se desincroniza a la tercera vez.

Qué queda publicado:

    /booking-page/          la landing
    /booking-page/demo/     la página de ejemplo, Casa del Mar
    /booking-page/alta/     el formulario de alta

El motor (motor.css, motor.js, pricing.js) NO se copia: el demo lo carga desde
el repo del motor, igual que cualquier cliente, para que una corrección llegue
a todos a la vez.
"""
from __future__ import annotations

import argparse
import filecmp
import pathlib
import shutil
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = 'booking-page'

# Dentro de la landing, el demo y el formulario quedan colgando de ella.
# El demo vive un nivel arriba en el repositorio y al lado en el sitio. El
# formulario ya se enlaza como alta/, que es la ruta que tendrá publicado, así
# que no hay nada que reescribir para él.
ENLACES = [('href="../demo/"', 'href="demo/"')]
# La página en inglés ya queda un nivel más abajo, en /booking-page/en/, así
# que su "../demo/" apunta solo al sitio correcto. No hay nada que reescribir.
ENLACES_EN: list[tuple[str, str]] = []


class Alto(Exception):
    pass


def correr(cmd, cwd=None, permitir_fallo=False):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode and not permitir_fallo:
        raise Alto(f'Fallo: {" ".join(cmd)}\n{(r.stderr or r.stdout).strip()}')
    return r


def copia_dir(origen: pathlib.Path, destino: pathlib.Path, saltar=()):
    destino.mkdir(parents=True, exist_ok=True)
    for f in sorted(origen.iterdir()):
        if f.name in saltar or f.name.startswith('.'):
            continue
        if f.is_dir():
            copia_dir(f, destino / f.name, saltar)
        else:
            shutil.copy2(f, destino / f.name)


def main():
    p = argparse.ArgumentParser(description='Publica la landing en wdstudio.agency.')
    p.add_argument('--repo', required=True, help='carpeta del repo wdstudio.agency')
    p.add_argument('--dry-run', action='store_true', help='enseña qué cambiaría')
    p.add_argument('--no-push', action='store_true', help='deja el commit sin empujar')
    p.add_argument('--borrar-sobrantes', action='store_true',
                   help='borra del destino lo que no venga de esta carpeta. '
                        'Sin esto se conserva, que es lo que quieres casi siempre')
    a = p.parse_args()

    repo = pathlib.Path(a.repo).expanduser().resolve()
    if not (repo / '.git').is_dir():
        raise Alto(f'{repo} no parece un repo de git.')
    if not (repo / 'CNAME').is_file():
        raise Alto(f'{repo} no trae CNAME: ¿es de verdad el repo de wdstudio.agency?')
    cname = (repo / 'CNAME').read_text().strip()
    if cname != 'wdstudio.agency':
        raise Alto(f'El CNAME dice "{cname}". Esperaba wdstudio.agency.')

    for f in ('landing/index.html', 'demo/index.html', 'demo/config.json', 'tools/intake.html'):
        if not (RAIZ / f).is_file():
            raise Alto(f'Falta {f} en el repo del motor.')

    fuera = repo / DESTINO
    antes = sorted(x.relative_to(fuera).as_posix() for x in fuera.rglob('*') if x.is_file()) \
        if fuera.exists() else []

    tmp = repo / (DESTINO + '.nuevo')
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)

    # La landing, con los enlaces apuntando a donde van a quedar.
    html = (RAIZ / 'landing/index.html').read_text(encoding='utf-8')
    for viejo, nuevo in ENLACES:
        if viejo not in html:
            raise Alto(f'No encuentro el enlace {viejo} en la landing: revisa ENLACES.')
        html = html.replace(viejo, nuevo)
    (tmp / 'index.html').write_text(html, encoding='utf-8')
    copia_dir(RAIZ / 'landing/media', tmp / 'media')

    # La versión en inglés, que es otra página con su propia dirección y no un
    # interruptor dentro de la española. Comparte la carpeta media, por eso
    # sus rutas llevan ../ y aquí no hay nada que reescribir.
    en = RAIZ / 'landing/en/index.html'
    if en.is_file():
        (tmp / 'en').mkdir(parents=True, exist_ok=True)
        html_en = en.read_text(encoding='utf-8')
        for viejo, nuevo in ENLACES_EN:
            html_en = html_en.replace(viejo, nuevo)
        (tmp / 'en' / 'index.html').write_text(html_en, encoding='utf-8')

    # El demo, tal cual: ya carga el motor por dirección absoluta.
    copia_dir(RAIZ / 'demo', tmp / 'demo')

    # El formulario, como index para que la dirección quede limpia.
    (tmp / 'alta').mkdir()
    shutil.copy2(RAIZ / 'tools/intake.html', tmp / 'alta/index.html')

    # Las legales. Las escribe tools/genera-legal.py desde landing/legal.json;
    # si faltan, se avisa en vez de publicar un enlace roto en el pie.
    for carpeta in ('terminos', 'privacidad', 'en/terms', 'en/privacy'):
        origen = RAIZ / 'landing' / carpeta / 'index.html'
        if not origen.is_file():
            print(f'  AVISO: falta landing/{carpeta}/index.html '
                  '· corre tools/genera-legal.py')
            continue
        destino = tmp / carpeta
        destino.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origen, destino / 'index.html')

    nuevos = sorted(x.relative_to(tmp).as_posix() for x in tmp.rglob('*') if x.is_file())
    pesa = sum(x.stat().st_size for x in tmp.rglob('*') if x.is_file())

    print(f'Destino: {fuera}')
    print(f'Archivos: {len(nuevos)} · {pesa/1048576:.2f} MB')
    for f in nuevos:
        marca = ' ' if f in antes and fuera.exists() and \
            filecmp.cmp(fuera / f, tmp / f, shallow=False) else '*'
        print(f'  {marca} {f}')
    # Lo que hay en el destino y no viene de aquí. Antes esto se borraba sin
    # preguntar, porque la carpeta entera se reemplazaba. El 11 de noviembre
    # eso se llevó por delante /booking-page/en/, una versión en inglés que
    # se había hecho directamente en el repositorio del sitio y que esta
    # carpeta no conoce. Publicar no puede significar borrar lo que no
    # conoces: ahora se conserva, se avisa, y hace falta pedirlo expreso.
    sobran = [f for f in antes if f not in nuevos]
    for f in sobran:
        print(f'  - {f}  ({"se borra" if a.borrar_sobrantes else "se conserva"})')

    if a.dry_run:
        shutil.rmtree(tmp)
        print('\nPrueba en seco: no se tocó nada.')
        return 0

    fuera.mkdir(parents=True, exist_ok=True)
    for f in nuevos:
        destino_f = fuera / f
        destino_f.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp / f, destino_f)
    if a.borrar_sobrantes:
        for f in sobran:
            (fuera / f).unlink(missing_ok=True)
    shutil.rmtree(tmp)
    if sobran and not a.borrar_sobrantes:
        print(f'\n  Aviso: {len(sobran)} archivo(s) del destino no vienen de '
              'esta carpeta y se dejaron en su sitio.')
        print('  Si de verdad sobran, vuelve a correrlo con --borrar-sobrantes.')

    correr(['git', 'add', '-A', DESTINO], cwd=repo)
    if correr(['git', 'diff', '--cached', '--quiet'], cwd=repo, permitir_fallo=True).returncode == 0:
        print('\nNo había nada que cambiar.')
        return 0
    correr(['git', '-c', 'user.name=WD Studio', '-c', 'user.email=hola@wdstudio.agency',
            'commit', '-q', '-m', 'Publica Booking Page en /booking-page/'], cwd=repo)
    if a.no_push:
        print('\nCommit hecho, sin empujar.')
        return 0
    correr(['git', 'push', '-q', 'origin', 'HEAD'], cwd=repo)
    print('\nPublicado en https://wdstudio.agency/booking-page/')
    print('GitHub Pages tarda un par de minutos en reconstruir.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Alto as e:
        print(f'\n✗ {e}', file=sys.stderr)
        sys.exit(1)
