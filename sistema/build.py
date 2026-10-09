#!/usr/bin/env python3
"""Gera sistema/index.html (arquivo único) a partir de sistema/src/.
Uso: python3 sistema/build.py"""
import glob, os
D = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(D, 'src')
def ler(n): return open(os.path.join(S, n), encoding='utf-8').read()
js = ''.join(ler(os.path.basename(f)) for f in sorted(glob.glob(os.path.join(S, '*.js'))))
html = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Gestão do Escritório</title>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n'
        '<style>\n' + ler('style.css') + '</style>\n</head>\n' + ler('shell.html') + '<script>\n' + js + '</script>\n</body>\n</html>\n')
open(os.path.join(D, 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html gerado:', len(html.splitlines()), 'linhas')
