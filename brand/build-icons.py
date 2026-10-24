"""Génère toutes les icônes de Selvania Ciné (site, appli Android et Android TV, appli LG).

    python build-icons.py               logo-source.png (le logo actuel)
    python build-icons.py logo.png      un autre logo : PNG / SVG transparent, ou icône complète sur sa tuile

Une icône complète (fond graphite opaque, coins noirs) est reconnue toute seule : elle est recadrée sur
sa tuile, arrondie proprement, et réduite dans la zone sûre des icônes Android.
"""
import pathlib
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from render import render

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # dossier qui contient les dépôts cine-web, cine-android, cine-webos
CINE = ROOT / 'cine-web' / 'public'
RES = ROOT / 'cine-android' / 'cine' / 'src' / 'main' / 'res'
WEBOS = ROOT / 'cine-webos' / 'app'
TMP = pathlib.Path(tempfile.mkdtemp())

RADIUS = 0.235  # arrondi des tuiles (proportion du côté)


def load(path: pathlib.Path) -> Image.Image:
    if path.suffix.lower() == '.svg':
        out = TMP / 'source.png'
        render(str(path), str(out), 2048, 2048)
        path = out
    return Image.open(path).convert('RGBA')


source = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / 'logo-source.png'
if not source.exists():
    sys.exit(f'Logo introuvable : {source}')
SRC = load(source)

# Icône complète ? (opaque, coins noirs autour d'une tuile plus claire)
corner = SRC.getpixel((2, 2))
IS_TILE = corner[3] == 255 and sum(corner[:3]) < 30

if IS_TILE:
    # Recadrage sur la tuile : tout ce qui est plus clair que le noir des coins.
    lum = SRC.convert('L').point(lambda v: 255 if v > 10 else 0)
    box = lum.getbbox()
    trim = round((box[2] - box[0]) * 0.008)  # liseré sombre du bord de la tuile
    TILE = SRC.crop((box[0] + trim, box[1] + trim, box[2] - trim, box[3] - trim))
    side = min(TILE.size)
    TILE = TILE.resize((side, side), Image.LANCZOS)
    BG = TILE.getpixel((side // 2, round(side * 0.06)))[:3]  # couleur de la tuile
else:
    TILE = None
    BG = (0x16, 0x19, 0x1F)
    SRC = SRC.crop(SRC.getbbox())


def rounded(im: Image.Image, radius: float = RADIUS) -> Image.Image:
    im = im.copy()
    mask = Image.new('L', im.size)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=round(im.width * radius), fill=255)
    im.putalpha(ImageChops.multiply(im.getchannel('A'), mask))
    return im


def graphite(size: int) -> Image.Image:
    """Tuile graphite des icônes Selvania (dégradé vertical)."""
    bg = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(size - 1, 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip((0x1c, 0x1f, 0x26), (0x0c, 0x0d, 0x10)))
        draw.line([(0, y), (size, y)], fill=c + (255,))
    return bg


def square(size: int) -> Image.Image:
    """Carré plein (sans coins arrondis) : l'appareil applique lui-même sa forme."""
    if IS_TILE:
        inset = round(TILE.width * 0.07)  # retire les coins arrondis de la tuile d'origine
        return TILE.crop((inset, inset, TILE.width - inset, TILE.height - inset)).resize((size, size), Image.LANCZOS)
    bg = graphite(size)
    mark = fit(SRC, round(size * 0.7))
    bg.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return bg


def tile(size: int) -> Image.Image:
    """Icône arrondie, coins transparents."""
    if IS_TILE:
        return rounded(TILE.resize((size, size), Image.LANCZOS))
    return rounded(square(size))


def fit(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def launcher(size: int) -> Image.Image:
    """Avant-plan des icônes Android : le logo réduit dans la zone sûre (66 %), fondu sur la couleur de fond."""
    canvas = Image.new('RGBA', (size, size), BG + (255,))
    inner = square(round(size * 0.78))
    fade = Image.new('L', inner.size, 0)
    m = round(inner.width * 0.08)
    ImageDraw.Draw(fade).rectangle([m, m, inner.width - m, inner.height - m], fill=255)
    inner.putalpha(fade.filter(ImageFilter.GaussianBlur(m * 0.6)))
    canvas.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
    return canvas


def mono(im: Image.Image) -> Image.Image:
    """Icône « thème » d'Android 13+ : silhouette blanche des parties claires du logo."""
    alpha = im.convert('L').point(lambda v: max(0, min(255, (v - 70) * 3)))
    out = Image.new('RGBA', im.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def save(im: Image.Image, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print('  ', path.relative_to(ROOT))


def cutout() -> Image.Image:
    """Le logo sans sa tuile (pour l'en-tête du site et de l'appli) : le fond graphite (léger dégradé
    vertical) devient transparent, bords adoucis ; les ombres restent en semi-transparence."""
    if not IS_TILE:
        return SRC
    import numpy as np

    im = np.asarray(TILE.convert('RGB'), dtype=np.float32)
    h = im.shape[0]
    top = np.array(TILE.getpixel((TILE.width // 2, round(h * 0.08)))[:3], dtype=np.float32)
    bottom = np.array(TILE.getpixel((TILE.width // 2, round(h * 0.92)))[:3], dtype=np.float32)
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    bg = top + (bottom - top) * t
    diff = np.abs(im - bg).max(axis=2, keepdims=True)
    alpha = np.clip((diff - 10) / 45, 0, 1)
    # couleur « dé-mélangée » du fond : même rendu une fois posée sur un fond sombre
    color = np.where(alpha > 0.02, (im - bg * (1 - alpha)) / np.maximum(alpha, 0.02), 0)
    rgba = np.concatenate([np.clip(color, 0, 255), alpha * 255], axis=2).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    # on ne garde que l'intérieur de la tuile (pas son liseré ni ses coins)
    out.putalpha(ImageChops.multiply(out.getchannel('A'), rounded(Image.new('RGBA', out.size, (0, 0, 0, 255)), RADIUS + 0.02).getchannel('A')))
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())


MARK = tile(1024)
MARK.save(HERE / 'cine-logo.png')
CUT = cutout()
CUT.save(HERE / 'cine-mark.png')


def scene(w: int, h: int, name: str) -> Image.Image:
    """Bannière / écran de démarrage : logo + « SELVANIA CINÉ » (rendus par le navigateur pour le texte)."""
    page = TMP / f'{name}.html'
    page.write_text(
        f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{w}px;height:{h}px}}
body{{display:flex;align-items:center;justify-content:center;gap:{round(h * 0.07)}px;
background:radial-gradient(ellipse at 30% 40%,#1f1b16 0%,#0c0d10 70%);font-family:'Segoe UI Variable Display','Segoe UI',sans-serif}}
img{{height:{round(h * 0.56)}px;filter:drop-shadow(0 {round(h * 0.02)}px {round(h * 0.05)}px rgba(0,0,0,.6))}}
.w{{display:grid;gap:{round(h * 0.01)}px;font-weight:800;letter-spacing:.16em;font-size:{round(h * 0.13)}px;line-height:1}}
.s{{background:linear-gradient(180deg,#fff,#c9ccd3);-webkit-background-clip:text;color:transparent}}
.c{{background:linear-gradient(135deg,#ffc350,#fb9a22 45%,#f2690c);-webkit-background-clip:text;color:transparent}}
</style></head><body><img src="{(HERE / 'cine-logo.png').as_uri()}"><div class="w"><span class="s">SELVANIA</span><span class="c">CINÉ</span></div></body></html>''',
        encoding='utf8',
    )
    out = TMP / f'{name}.png'
    render(str(page), str(out), w, h)
    return Image.open(out).convert('RGB')


print(f'Logo : {source.name}' + (' (icône complète)' if IS_TILE else ''))
print('Site Ciné')
save(fit(CUT, 320), CINE / 'mark.png')
save(tile(512), CINE / 'icon-512.png')
save(tile(192), CINE / 'icon-192.png')
save(square(180), CINE / 'apple-touch-icon.png')
save(launcher(512), CINE / 'icon-maskable-512.png')
tile(256).save(CINE / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('   cine-web/public/favicon.ico')

banner = scene(640, 360, 'banner')

# Les applis ne sont mises à jour que si leur dépôt est cloné à côté de celui-ci.
if RES.is_dir():
    print('Appli Android')
    for folder, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
        fg = launcher(px)
        save(fg, RES / f'mipmap-{folder}' / 'ic_launcher_foreground.png')
        save(mono(fg), RES / f'mipmap-{folder}' / 'ic_launcher_monochrome.png')
    save(fit(CUT, 320), RES / 'drawable-nodpi' / 'logo_mark.png')
    save(tile(288), RES / 'drawable-nodpi' / 'logo_tile.png')
    save(banner, RES / 'drawable-xhdpi' / 'banner.png')
    colors = RES / 'values' / 'colors.xml'
    text = colors.read_text(encoding='utf8')
    start = text.index('<color name="icon_bg">')
    end = text.index('</color>', start) + len('</color>')
    colors.write_text(text[:start] + '<color name="icon_bg">#FF%02X%02X%02X</color>' % BG + text[end:], encoding='utf8')
    print('  ', colors.relative_to(ROOT), '(fond des icônes)')
else:
    print(f'Appli Android : {RES.parent.parent.parent.parent} absent, ignorée')

if WEBOS.is_dir():
    print('Appli LG')
    save(tile(80), WEBOS / 'icon.png')
    save(tile(130), WEBOS / 'largeIcon.png')
    save(banner, WEBOS / 'banner.png')
    save(scene(1920, 1080, 'splash'), WEBOS / 'splash.png')
else:
    print(f'Appli LG : {WEBOS.parent} absent, ignorée')
