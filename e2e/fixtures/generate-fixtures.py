"""Generate synthetic e2e fixture images for Sommeasy Playwright tests.

The originals were never committed (e2e/fixtures/images/ is gitignored).
These render real text so the Claude Vision scan paths are genuinely
exercised; tests accept 'error' outcomes so an imperfect extraction still passes.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()

def label(path, lines, size=(1200, 1600), quality=90, blur=0):
    img = Image.new("RGB", size, "#f5f0e6")  # cream label
    d = ImageDraw.Draw(img)
    # simple border like a wine label
    m = int(size[0] * 0.06)
    d.rectangle([m, m, size[0] - m, size[1] - m], outline="#3a2a1a", width=6)
    y = size[1] // 5
    for text, scale in lines:
        f = font(int(size[0] * scale))
        w = d.textlength(text, font=f)
        d.text(((size[0] - w) / 2, y), text, fill="#241a10", font=f)
        y += int(size[0] * scale * 1.7)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    img.save(path, quality=quality)
    print("wrote", path)

# Clean labels
label(f"{OUT}/label-test-01.jpg", [("KANONKOP", 0.10), ("Paul Sauer", 0.07), ("STELLENBOSCH", 0.05), ("2019", 0.06)])
label(f"{OUT}/label-test-02.jpg", [("PENFOLDS", 0.10), ("Grange", 0.08), ("Shiraz", 0.06), ("2017", 0.06)])
label(f"{OUT}/label-test-03.jpg", [("TRIMBACH", 0.10), ("Pinot Gris", 0.07), ("ALSACE", 0.05), ("2020", 0.06)])

# Low quality: small + blurred + heavy compression
label(f"{OUT}/label-lowquality-01.jpg", [("HENSCHKE", 0.10), ("Hill of Grace", 0.06), ("2018", 0.06)],
      size=(320, 420), quality=30, blur=1.6)
label(f"{OUT}/label-lowquality-02.jpg", [("GAJA", 0.12), ("Barbaresco", 0.07), ("2018", 0.06)],
      size=(300, 400), quality=25, blur=2.0)

# High-res
label(f"{OUT}/label-highres-01.jpg", [("CHATEAU MARGAUX", 0.07), ("Premier Grand Cru", 0.045), ("MARGAUX", 0.05), ("2015", 0.05)],
      size=(2400, 3200), quality=92)
label(f"{OUT}/label-highres-02.jpg", [("CATENA ZAPATA", 0.08), ("Malbec", 0.07), ("MENDOZA", 0.05), ("2018", 0.05)],
      size=(2400, 3200), quality=92)

# Not a wine label
label(f"{OUT}/not-wine.jpg", [("GROCERY LIST", 0.08), ("milk  eggs  bread", 0.05), ("paper towels", 0.05)],
      size=(900, 1200))

# Blank white PNG
Image.new("RGB", (800, 600), "white").save(f"{OUT}/blank-white.png")
print("wrote", f"{OUT}/blank-white.png")

# Tiny image
Image.new("RGB", (24, 24), "#888888").save(f"{OUT}/tiny-image.jpg", quality=60)
print("wrote", f"{OUT}/tiny-image.jpg")

# Wine-list PDFs (text → PDF via macOS cupsfilter; 3 needed by wine-lists.spec.ts)
import shutil, subprocess, tempfile

WINE_LISTS = {
    "winelist-sample.pdf": (
        "SAMPLE WINE LIST — BY THE BOTTLE\n\nRED WINES\n"
        "Kanonkop Paul Sauer, Stellenbosch 2019 ... 85\n"
        "Penfolds Grange Shiraz, Barossa 2017 ... 240\n"
        "Gaja Barbaresco, Piedmont 2018 ... 195\n"
        "Catena Zapata Malbec, Mendoza 2018 ... 78\n\n"
        "WHITE WINES\nTrimbach Pinot Gris, Alsace 2020 ... 55\n"
        "Santa Margherita Pinot Grigio 2022 ... 42\n\n"
        "BY THE GLASS\nHouse Red ... 12\nHouse White ... 11\n"
    ),
    "winelist-bistro.pdf": (
        "BISTRO WINE SELECTION\n\nREDS BY THE BOTTLE\n"
        "Meerlust Rubicon, Stellenbosch 2018 ... 68\n"
        "Torbreck RunRig Shiraz, Barossa 2016 ... 185\n"
        "Joseph Drouhin Gevrey-Chambertin 2019 ... 120\n\n"
        "WHITES BY THE BOTTLE\n"
        "Ken Forrester Chenin Blanc, Stellenbosch 2021 ... 38\n"
    ),
    "winelist-trattoria.pdf": (
        "TRATTORIA VINO — CARTA DEI VINI\n\nROSSI\n"
        "Gaja Barbaresco 2018 ... 210\n"
        "Arpepe Rosso di Valtellina 2019 ... 65\n\n"
        "BIANCHI\nSanta Margherita Pinot Grigio 2022 ... 44\n\n"
        "AL BICCHIERE\nHouse Chianti ... 12\n"
    ),
}

if shutil.which("cupsfilter"):
    for name, text in WINE_LISTS.items():
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as tf:
            tf.write(text)
            txt_path = tf.name
        with open(f"{OUT}/{name}", "wb") as pdf:
            subprocess.run(["cupsfilter", txt_path], stdout=pdf,
                           stderr=subprocess.DEVNULL, check=True)
        os.unlink(txt_path)
        print("wrote", f"{OUT}/{name}")
else:
    print("cupsfilter not found — skipping PDF fixtures (wine-lists.spec.ts will skip PDF tests)")
