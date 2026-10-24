"""Rendu PNG des fichiers de la marque (SVG / HTML) avec un navigateur Chromium sans fenêtre
(Edge, Chrome ou Chromium), fond transparent.

    python render.py <entrée.svg|html> <sortie.png> <largeur> <hauteur>

Navigateur : variable d'environnement BROWSER, sinon le premier trouvé parmi les emplacements habituels.
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

CANDIDATES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'msedge', 'chrome',
]


def browser() -> str:
    for c in [os.environ.get('BROWSER', ''), *CANDIDATES]:
        if c and (pathlib.Path(c).is_file() or shutil.which(c)):
            return c if pathlib.Path(c).is_file() else shutil.which(c)
    sys.exit('Aucun navigateur Chromium trouvé (Edge, Chrome, Chromium) : indiquez-le avec BROWSER=…')


EDGE = browser()


def render(src: str, out: str, w: int, h: int) -> None:
    src_path = pathlib.Path(src).resolve()
    page = src_path
    if src_path.suffix == '.svg':
        # Une page autour du SVG, à la taille voulue, sans marge.
        page = pathlib.Path(tempfile.gettempdir()) / f'render-{src_path.stem}-{w}x{h}.html'
        page.write_text(
            f'<!doctype html><html><body style="margin:0;background:transparent">'
            f'<img src="{src_path.as_uri()}" style="display:block;width:{w}px;height:{h}px"></body></html>',
            encoding='utf8',
        )
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [
                EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={profile}',
                '--default-background-color=00000000', f'--window-size={w},{h}',
                f'--screenshot={pathlib.Path(out).resolve()}', '--allow-file-access-from-files', page.as_uri(),
            ],
            check=True, capture_output=True, timeout=60,
        )


if __name__ == '__main__':
    render(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
