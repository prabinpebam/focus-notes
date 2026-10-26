"""
The Microsoft Store's logo images (D-225), drawn from the app icon's own geometry
(apps/desktop/scripts/icon.mjs) so they match the package's tiles exactly, saved in store/logos/:

    01-app-tile-300.png, 02-tile-150.png, 03-tile-71.png   Store display images (Windows 10/11)
    04-poster-1440x2160.png                                 2:3 (9:16 slot) poster art
    05-box-2160x2160.png                                    1:1 box art

The poster and box art are required only on Xbox, which a full-trust desktop package can't reach;
the Store may still show them in search and collections. The title and line sit in the top two
thirds, where the Store never lays text over them. Text uses Segoe UI Variable (Windows).

    python tools/release/store-logos.py
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "store" / "logos"
FONT = Path("C:/Windows/Fonts/SegUIVar.ttf")
TITLE = "Focus Notes"
LINE = "A calm writing app."
INK, MUTED = (31, 29, 26), (87, 83, 76)
# The screenshots' light backdrop, top to bottom (store-screenshots.py).
BACKDROP = ((236, 238, 242), (214, 219, 228))


def icon(px: int) -> Image.Image:
    """The app icon at `px` square, rendered by icon.mjs from its geometry."""
    script = (
        "import { render } from './apps/desktop/scripts/icon.mjs';"
        f"process.stdout.write(Buffer.from(render({px}, 4)));"
    )
    raw = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, capture_output=True, check=True).stdout
    if len(raw) != px * px * 4:
        raise SystemExit(f"icon.mjs gave {len(raw)} bytes for {px} px")
    return Image.frombuffer("RGBA", (px, px), raw, "raw", "RGBA", 0, 1)


def font(size: int, style: str) -> ImageFont.FreeTypeFont:
    """Segoe UI Variable at a named instance, such as "Semibold Display"."""
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_name(style)
    return f


def backdrop(w: int, h: int) -> Image.Image:
    top, bottom = (np.array(c, dtype=np.float64) for c in BACKDROP)
    t = np.linspace(0.0, 1.0, h)[:, None, None]
    rows = (top * (1 - t) + bottom * t).round().astype(np.uint8)
    return Image.fromarray(np.repeat(rows, w, axis=1)).convert("RGBA")


def centred(draw: ImageDraw.ImageDraw, w: int, top: int, text: str, f: ImageFont.FreeTypeFont, fill) -> int:
    """Draws `text` centred with its ink's top at `top`; returns the ink's bottom."""
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=f)
    draw.text(((w - (x1 - x0)) / 2 - x0, top - y0), text, font=f, fill=fill)
    return top + (y1 - y0)


def art(w: int, h: int, icon_px: int, icon_top: int, title_px: int, line_px: int) -> Image.Image:
    img = backdrop(w, h)
    img.alpha_composite(icon(icon_px), ((w - icon_px) // 2, icon_top))
    draw = ImageDraw.Draw(img)
    bottom = centred(draw, w, icon_top + icon_px + round(title_px * 0.55), TITLE, font(title_px, "Semibold Display"), INK)
    bottom = centred(draw, w, bottom + round(line_px * 0.9), LINE, font(line_px, "Regular Display"), MUTED)
    if bottom > h * 2 // 3:
        raise SystemExit(f"{w} x {h}: the text ends at {bottom}, below the top two thirds ({h * 2 // 3})")
    return img.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    files = {
        "01-app-tile-300.png": icon(300),
        "02-tile-150.png": icon(150),
        "03-tile-71.png": icon(71),
        "04-poster-1440x2160.png": art(1440, 2160, 640, 360, 170, 76),
        "05-box-2160x2160.png": art(2160, 2160, 700, 250, 200, 86),
    }
    for name, img in files.items():
        img.save(OUT / name, optimize=True)
    print(json.dumps({n: (OUT / n).stat().st_size for n in files}, indent=1))


if __name__ == "__main__":
    main()
