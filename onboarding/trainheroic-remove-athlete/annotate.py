"""Mark up the raw TrainHeroic screenshots for the "remove an athlete" guide.

Draws TAC-branded highlight rings, numbered badges and arrows, dims everything
outside the highlights, and blurs athlete names and emails that are not the
demo account. Reads raw/, writes img/.

    python3 annotate.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
RAW, OUT = HERE / "raw", HERE / "img"
FONT = HERE / "assets" / "Mulish-ExtraBold.ttf"

PINE = (0, 48, 48)
SAND = (222, 197, 174)
SAND_DK = (197, 166, 131)
CREAM = (245, 243, 235)
SS = 3  # supersample factor for smooth edges


def blur(img, box, radius=9):
    region = img.crop(box).filter(ImageFilter.GaussianBlur(radius))
    img.paste(region, box)


def pad(box, p):
    x0, y0, x1, y1 = box
    return (x0 - p, y0 - p, x1 + p, y1 + p)


def sc(v):
    return tuple(int(round(c * SS)) for c in v)


def ring(d, box, w, radius, gap=8):
    b = sc(pad(box, gap + w // 2))
    r = radius * SS
    d.rounded_rectangle(pad(b, (w // 2 + 2) * SS), r + (w // 2 + 2) * SS, outline=PINE + (255,), width=(w + 4) * SS)
    d.rounded_rectangle(b, r, outline=SAND + (255,), width=w * SS)
    d.rounded_rectangle(pad(b, -(w // 2 + 1) * SS), max(r - (w // 2 + 1) * SS, 0), outline=PINE + (255,), width=2 * SS)


def badge(d, centre, n, size):
    cx, cy = sc(centre)
    r = size * SS
    d.ellipse((cx - r - 4 * SS, cy - r - 4 * SS, cx + r + 4 * SS, cy + r + 4 * SS), fill=CREAM + (255,))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PINE + (255,))
    font = ImageFont.truetype(str(FONT), int(r * 1.25))
    d.text((cx, cy + r * 0.04), str(n), font=font, fill=SAND + (255,), anchor="mm")


def arrow(d, start, end, w):
    (x0, y0), (x1, y1) = sc(start), sc(end)
    ang = math.atan2(y1 - y0, x1 - x0)
    head = w * 3.2 * SS
    bx, by = x1 - head * math.cos(ang), y1 - head * math.sin(ang)

    def tri(extra):
        h = head + extra
        px, py = x1 + extra * math.cos(ang), y1 + extra * math.sin(ang)
        qx, qy = px - h * math.cos(ang), py - h * math.sin(ang)
        spread = h * 0.62
        return [(px, py),
                (qx + spread * math.sin(ang), qy - spread * math.cos(ang)),
                (qx - spread * math.sin(ang), qy + spread * math.cos(ang))]

    d.line((x0, y0, bx, by), fill=PINE + (255,), width=(w + 6) * SS)
    d.polygon(tri(4 * SS), fill=PINE + (255,))
    d.line((x0, y0, bx, by), fill=SAND + (255,), width=w * SS)
    d.polygon(tri(0), fill=SAND + (255,))


def render(name, out, marks, blurs=(), dim=110, stroke=10, radius=14, badge_size=26, crop=None, pad_right=0):
    img = Image.open(RAW / name).convert("RGB")
    for b in blurs:
        blur(img, b)
    if pad_right:  # room for a ring on an element that sits on the right edge
        W, H = img.size
        wide = Image.new("RGB", (W + pad_right, H))
        wide.paste(img, (0, 0))
        wide.paste(img.crop((W - 1, 0, W, H)).resize((pad_right, H)), (W, 0))
        img = wide

    W, H = img.size
    # Spotlight: dim everything, then cut the highlight areas back out.
    shade = Image.new("L", (W, H), dim)
    sd = ImageDraw.Draw(shade)
    for m in marks:
        if "box" in m:
            sd.rounded_rectangle(pad(m["box"], 8), radius, fill=0)
    img = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), img, shade)

    over = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    for m in marks:
        if "arrow" in m:
            arrow(d, *m["arrow"], w=stroke + 2)
    for m in marks:
        if "box" in m:
            ring(d, m["box"], stroke, radius)
    for m in marks:
        if "badge" in m:
            badge(d, m["badge"], m["n"], badge_size)
    over = over.resize((W, H), Image.LANCZOS)
    img = img.convert("RGBA")
    img.alpha_composite(over)
    img = img.convert("RGB")
    if crop:
        img = img.crop(crop)
    img.save(OUT / out, "PNG", optimize=True)
    print("wrote", out, img.size)


# Rows in the My Athletes list: (name/email x-range, row centre y). Sarah is the demo athlete and stays visible.
athlete_rows = [212, 354, 425, 496, 566, 637, 708, 778, 849, 920, 985]

render("01-homepage.webp", "01-login-button.png", [
    {"box": (1540, 30, 1698, 96), "badge": (1484, 63), "n": 1},
    {"arrow": ((1330, 250), (1520, 110))},
], dim=120, crop=(560, 0, 2000, 560))

render("02-login.png", "02-login-form.png", [
    {"box": (505, 242, 1252, 414), "badge": (448, 328), "n": 1},
    {"box": (510, 468, 1248, 535), "badge": (448, 501), "n": 2},
], dim=90, badge_size=28, crop=(360, 90, 1400, 620))

render("03-coach-home.webp", "03-teams-menu.png", [
    {"box": (6, 234, 68, 286), "badge": (130, 260), "n": 1},
    {"arrow": ((340, 260), (172, 260))},
], blurs=[(186, 278, 310, 306), (186, 723, 310, 751), (186, 1168, 310, 1196)], dim=110, radius=10, crop=(0, 0, 1260, 620))

render("04-my-teams.webp", "04-team-row-menu.png", [
    {"box": (1956, 208, 1996, 258), "badge": (1900, 320), "n": 1},
], dim=110, radius=10, pad_right=50, crop=(900, 80, 2050, 380))

render("05-team-menu.png", "05-view-athletes.png", [
    {"box": (378, 228, 662, 274), "badge": (335, 251), "n": 1},
], dim=90, stroke=6, radius=10, badge_size=20)

step6 = dict(marks=[
    {"box": (108, 264, 146, 304), "badge": (200, 284), "n": 1},
    {"box": (1402, 82, 1622, 124), "badge": (1512, 172), "n": "A"},
    {"box": (1644, 84, 1740, 122), "badge": (1692, 172), "n": "B"},
], blurs=[(296, c - 22, 620, c + 22) for c in athlete_rows], dim=100, radius=10)
render("06-my-athletes.webp", "06a-tick-athlete.png", crop=(70, 160, 760, 440), **step6)
render("06-my-athletes.webp", "06b-archive-or-remove.png", crop=(1330, 70, 1790, 220), **step6)

render("07-confirm.png", "07-confirm-ok.png", [
    {"box": (452, 161, 585, 216), "badge": (628, 188), "n": 1},
], dim=90, stroke=6, radius=10, badge_size=20)
