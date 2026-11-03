#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pasa clientes ya publicados al motor compartido.

    python3 tools/migrar.py casa-luna
    python3 tools/migrar.py --todos
    python3 tools/migrar.py --todos --dry-run

Los primeros clientes se llevaron una copia entera del motor dentro de su
repo. Eso significa que cualquier corrección se queda en los clientes nuevos
y los viejos no la ven nunca. Esto les cambia el index.html por la plantilla
ligera, que carga el motor de un solo sitio, y borra la copia de pricing.js.

El config.json del cliente no se toca. Si algo sale mal en un cliente, sigue
con el resto y lo reporta al final: con trescientos repos, pararse en el
primero que falle no sirve de nada.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import alta  # noqa: E402  (vive al lado; reusamos su validación y su token)

RAIZ = alta.RAIZ
MARCA = 'Booking Page · WD Studio'


def clientes(usuario):
    """Los repos del alta, reconocidos por la descripción que les pone."""
    r = alta.correr(['gh', 'api', '--paginate', 'user/repos?per_page=100',
                     '-q', '.[] | [.name, .description] | @tsv'])
    out = []
    for linea in r.stdout.splitlines():
        partes = linea.split('\t')
        if len(partes) == 2 and partes[1].strip() == MARCA:
            out.append(partes[0])
    return sorted(out)


def migra(slug, usuario, token, seco):
    url = f'https://github.com/{usuario}/{slug}.git'
    url_push = (f'https://x-access-token:{token}@github.com/{usuario}/{slug}.git'
                if token else url)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix=f'migra-{slug}-'))
    try:
        carpeta = tmp / slug
        alta.correr(['git', 'clone', '-q', '--depth', '1', url_push, str(carpeta)])

        if not (carpeta / 'config.json').is_file():
            return 'saltado', 'no tiene config.json, no parece un cliente'

        plantilla = (RAIZ / 'plantilla.html').read_text(encoding='utf-8')
        nuevo = plantilla.replace('__MOTOR__',
                                  f'https://{usuario}.github.io/booking-engine/')
        viejo = (carpeta / 'index.html').read_text(encoding='utf-8') \
            if (carpeta / 'index.html').is_file() else ''
        sobra = (carpeta / 'pricing.js').is_file()
        if viejo == nuevo and not sobra:
            return 'al día', 'ya estaba en el motor compartido'

        if seco:
            return 'prueba', f'cambiaría index.html{" y borraría pricing.js" if sobra else ""}'

        (carpeta / 'index.html').write_text(nuevo, encoding='utf-8')
        if sobra:
            alta.correr(['git', 'rm', '-q', 'pricing.js'], cwd=carpeta)
        alta.correr(['git', 'add', '-A'], cwd=carpeta)
        if not alta.correr(['git', 'diff', '--cached', '--quiet'],
                           cwd=carpeta, permitir_fallo=True).returncode:
            return 'al día', 'no había nada que cambiar'
        alta.correr(['git', '-c', 'user.name=WD Studio',
                     '-c', 'user.email=hola@wdstudio.agency',
                     'commit', '-q', '-m', 'Pasa al motor compartido'], cwd=carpeta)
        alta.correr(['git', 'push', '-q', url_push, 'HEAD:main'], cwd=carpeta)
        return 'migrado', 'index.html nuevo' + (' y pricing.js fuera' if sobra else '')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description='Pasa clientes al motor compartido.')
    p.add_argument('slugs', nargs='*', help='clientes a migrar; vacío con --todos')
    p.add_argument('--todos', action='store_true', help='todos los repos del alta')
    p.add_argument('--dry-run', action='store_true', help='enseña qué haría')
    p.add_argument('--json', action='store_true', help='resultado en una línea al final')
    a = p.parse_args()

    if not (RAIZ / 'plantilla.html').is_file():
        raise alta.Alto('No encuentro plantilla.html en la raíz del motor.')

    usuario = alta.revisa_entorno(False)
    token = alta.token_de_git()
    if token:
        alta.SECRETOS.append(token)

    lista = list(a.slugs)
    if a.todos:
        lista += [c for c in clientes(usuario) if c not in lista and c != 'booking-engine']
    if not lista:
        raise alta.Alto('Dime qué clientes migrar, o usa --todos.')

    print(f'Motor: https://{usuario}.github.io/booking-engine/')
    print(f'Clientes: {len(lista)}\n')

    res = {}
    for slug in lista:
        if not alta.SLUG_OK.match(slug):
            res[slug] = ('saltado', 'el nombre no tiene forma de slug')
        else:
            try:
                res[slug] = migra(slug, usuario, token, a.dry_run)
            except alta.Alto as e:
                res[slug] = ('falló', str(e).splitlines()[0])
            except subprocess.SubprocessError as e:
                res[slug] = ('falló', str(e))
        estado, nota = res[slug]
        print(f'  {estado:8} {slug:34} {nota}')

    cuenta = {}
    for estado, _ in res.values():
        cuenta[estado] = cuenta.get(estado, 0) + 1
    print('\n' + ' · '.join(f'{v} {k}' for k, v in sorted(cuenta.items())))

    if a.json:
        print(json.dumps({'ok': 'falló' not in cuenta,
                          'cuenta': cuenta,
                          'clientes': {k: v[0] for k, v in res.items()}},
                         ensure_ascii=False))
    return 1 if 'falló' in cuenta else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except alta.Alto as e:
        print(f'\n✗ {e}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nCancelado.', file=sys.stderr)
        sys.exit(130)
