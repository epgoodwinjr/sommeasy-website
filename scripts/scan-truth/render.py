"""Draw the scan-truth wine lists (lists.json) as photos of a printed page.

    python3 scripts/scan-truth/render.py <out-dir>

A list with no title of its own is drawn once per heading in lists.json
("sept19-plain.jpg", "sept19-glass.jpg"): the same wines and prices under
"WINE" and under "WINES BY THE GLASS & BOTTLE". Prices are two right-hand
columns under GLASS / BOTTLE, "13 / 52", or one price each. The images are
only ever sent to the real /api/parse-wine-list handler by scan.mjs.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = [
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(size):
    for path in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render(key, spec, out_dir, title=None):
    width, margin, row = 1500, 110, 58
    rows = sum(len(s["wines"]) + 2 for s in spec["sections"]) + 4
    img = Image.new("RGB", (width, margin * 2 + rows * row), "#fbf8f1")
    d = ImageDraw.Draw(img)
    title_font, head, body = font(46), font(30), font(27)
    columns = spec["priceStyle"] == "columns"
    glass_x, bottle_x = width - margin - 190, width - margin - 40

    y = margin
    heading = title or spec["title"]
    w = d.textlength(heading, font=title_font)
    d.text(((width - w) / 2, y), heading, fill="#1b1b1b", font=title_font)
    y += row * 2
    if columns:
        for label, x in (("GLASS", glass_x), ("BOTTLE", bottle_x)):
            d.text((x - d.textlength(label, font=head), y), label, fill="#555", font=head)
        y += row
    for section in spec["sections"]:
        y += row // 2
        d.text((margin, y), section["name"], fill="#7a1f2b", font=head)
        y += row + row // 4
        for wine in section["wines"]:
            d.text((margin, y), wine["name"], fill="#1b1b1b", font=body)
            if columns:
                for value, x in ((wine["glass"], glass_x), (wine["bottle"], bottle_x)):
                    text = str(value)
                    d.text((x - d.textlength(text, font=body), y), text, fill="#1b1b1b", font=body)
            else:
                text = str(wine["price"]) if "price" in wine else f'{wine["glass"]} / {wine["bottle"]}'
                d.text((width - margin - d.textlength(text, font=body), y), text, fill="#1b1b1b", font=body)
            y += row
    path = os.path.join(out_dir, f"{key}.jpg")
    img.crop((0, 0, width, y + margin)).save(path, quality=88)
    print("wrote", path, img.size)


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(HERE, "lists.json")) as f:
        data = json.load(f)
    for key, spec in data["lists"].items():
        if "title" in spec:
            render(key, spec, out)
            continue
        for variant, heading in data["headings"].items():
            render(f"{key}-{variant}", spec, out, title=heading)
