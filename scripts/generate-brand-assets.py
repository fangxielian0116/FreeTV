"""Generate the FreeTV launcher icons from one small, editable drawing."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "static" / "brand"
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 1024
SCALE = 2


def point(value):
    return round(value * SCALE)


def box(values):
    return tuple(point(value) for value in values)


background = Image.new("RGB", (SIZE * SCALE, SIZE * SCALE))
pixels = background.load()
top = (17, 63, 89)
bottom = (35, 130, 169)
for y in range(SIZE * SCALE):
    for x in range(SIZE * SCALE):
        amount = (x * 0.36 + y * 0.64) / (SIZE * SCALE)
        pixels[x, y] = tuple(round(a * (1 - amount) + b * amount) for a, b in zip(top, bottom))

# A quiet highlight gives the mark depth without introducing fine detail at 72 px.
highlight = Image.new("RGBA", background.size)
highlight_draw = ImageDraw.Draw(highlight)
highlight_draw.ellipse(box((-170, -340, 690, 520)), fill=(194, 239, 250, 42))
highlight = highlight.filter(ImageFilter.GaussianBlur(point(80)))
background = Image.alpha_composite(background.convert("RGBA"), highlight)

foreground = Image.new("RGBA", background.size)
draw = ImageDraw.Draw(foreground)
draw.rounded_rectangle(box((205, 284, 819, 740)), radius=point(100), outline=(255, 255, 255, 255), width=point(62))
draw.polygon([box((432, 411))[:2], box((432, 612))[:2], box((624, 512))[:2]], fill=(255, 255, 255, 255))
draw.ellipse(box((704, 350, 760, 406)), fill=(255, 177, 133, 255))

background = background.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
foreground = foreground.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
icon = Image.alpha_composite(background, foreground)

icon.save(OUT / "icon-1024.png")
for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    icon.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"android-{density}.png")
