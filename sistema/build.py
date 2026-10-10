#!/usr/bin/env python3
"""Gera sistema/index.html (arquivo único) a partir de sistema/src/.
Uso: python3 sistema/build.py"""
import glob, os
D = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(D, 'src')
def ler(n): return open(os.path.join(S, n), encoding='utf-8').read()
import base64
def b64(n): return base64.b64encode(open(os.path.join(S, 'assets', n), 'rb').read()).decode()
# imagens e modelo do papel timbrado embutidos no arquivo único
assets = ("const ASSET_LOGO='data:image/png;base64," + b64('logo-ms.png') + "';\n"
          "const ASSET_MARCA='data:image/png;base64," + b64('marca-dagua-a4.png') + "';\n"
          "const ASSET_DOCX='" + b64('modelo-timbrado.docx') + "';\n")
js = assets + ''.join(ler(os.path.basename(f)) for f in sorted(glob.glob(os.path.join(S, '*.js'))))
html = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Gestão do Escritório</title>\n'
        '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#0F2942">\n'
        '<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Gestão MS">\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n'
        '<style>\n' + ler('style.css') + '</style>\n</head>\n' + ler('shell.html') + '<script>\n' + js + '</script>\n</body>\n</html>\n')
open(os.path.join(D, 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html gerado:', len(html.splitlines()), 'linhas')
