#!/usr/bin/env python3
"""Genera backend/Code.gs = Code.template.gs + pricing.js, para que el precio sea el mismo en navegador y backend."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / 'backend' / 'Code.template.gs').read_text(encoding='utf-8')
pricing = (root / 'pricing.js').read_text(encoding='utf-8')
pricing = pricing.replace("if (typeof module !== 'undefined') module.exports = BookingPricing;", '')
(root / 'backend' / 'Code.gs').write_text(tpl.replace('/*__PRICING__*/', pricing), encoding='utf-8')
print('backend/Code.gs actualizado')
