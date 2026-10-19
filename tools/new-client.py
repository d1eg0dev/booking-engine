#!/usr/bin/env python3
"""
Crea la carpeta lista para publicar de un cliente nuevo.

  python3 tools/new-client.py casa-luna "Casa Luna"

Genera ../casa-luna/ con index.html, pricing.js y un config.json con el nombre puesto.
Después: editar config.json, subir la carpeta a un repo nuevo y activar GitHub Pages (ver README).
"""
import json, pathlib, shutil, sys

if len(sys.argv) < 3:
    sys.exit('Uso: python3 tools/new-client.py <slug> "<Nombre de la propiedad>"')
slug, name = sys.argv[1], sys.argv[2]
root = pathlib.Path(__file__).resolve().parent.parent
out = root.parent / slug
if out.exists():
    sys.exit(f'{out} ya existe')
out.mkdir()
for f in ('index.html', 'pricing.js'):
    shutil.copy(root / f, out / f)
cfg = json.loads((root / 'config.json').read_text(encoding='utf-8'))
cfg['property']['name'] = name
cfg['payment']['mode'] = 'demo'
cfg['backendUrl'] = ''
cfg['availability']['blockedDates'] = []
(out / 'config.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Listo: {out}\nSiguiente paso: edita {out / "config.json"}')
