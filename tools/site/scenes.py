"""
The product site's screenshots (D-169, D-176): the app's own window from the site catalogue
(apps/desktop/e2e/site-catalog.spec.ts), cut out of its transparent shadow margin with its rounded
corners kept as transparency, so the page draws the window's shadow (or, for a dark window on a dark
page, its glow) from tokens.

Each is written once per width, 1440 (the window's real size) and 720, as AVIF (4:4:4, high quality:
no chroma subsampling, so the focus-mode fades keep smooth gradients) and as WebP (quality 94) for
browsers without AVIF, both with alpha. Quality wins over size.

    python tools/site/scenes.py [--captures test-results/site-capture] [--out site/media]

Only the scenes site/landing.json shows are written.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
WIDTHS = (1440, 720)
# The window's drawn corner radius at 1x (the app's radius.window), and the supersampling for its edge.
RADIUS = 20
SUPER = 4


def window_only(capture: Image.Image) -> Image.Image:
    """The window without its shadow margin: the opaque body's box, its corners rounded by alpha."""
    rgba = capture.convert("RGBA")
    alpha = np.asarray(rgba)[..., 3]
    # The margin is the same on every side: where the opaque body starts across the middle row, past the
    # window's hairline edge (the page's shadow draws the edge instead).
    m = int(np.nonzero(alpha[alpha.shape[0] // 2] == 255)[0].min()) + 1
    box = (m, m, rgba.width - m, rgba.height - m)
    win = rgba.crop(box)
    w, h = win.size
    mask = Image.new("L", (w * SUPER, h * SUPER), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * SUPER - 1, h * SUPER - 1), radius=RADIUS * SUPER, fill=255)
    mask = mask.resize((w, h), Image.Resampling.LANCZOS)
    a = (np.asarray(win)[..., 3].astype(np.float64) * np.asarray(mask, dtype=np.float64) / 255.0).round().astype(np.uint8)
    out = np.asarray(win).copy()
    out[..., 3] = a
    return Image.fromarray(out)


def save(img: Image.Image, out: Path, name: str) -> dict:
    sizes = {}
    for width in WIDTHS:
        scaled = img if width == img.width else img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
        avif = out / f"{name}-{width}.avif"
        webp = out / f"{name}-{width}.webp"
        scaled.save(avif, "AVIF", quality=90, subsampling="4:4:4", speed=2)
        scaled.save(webp, "WEBP", quality=94, alpha_quality=100, method=6, exact=True)
        sizes[width] = {"avif": avif.stat().st_size, "webp": webp.stat().st_size, "size": scaled.size}
    img.save(ROOT / "test-results" / "site-scenes" / f"{name}.png")
    return sizes


def scenes(landing: dict) -> set:
    names = {landing["hero"]["scene"]}
    for f in landing["features"]:
        if f.get("image"):
            names.add(f["image"]["scene"])
        for mode in ("light", "dark"):
            for t in f.get("themes", {}).get(mode, []):
                names.add(f"theme-{t['id']}")
    return names


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--captures", default=str(ROOT / "test-results" / "site-capture"))
    p.add_argument("--out", default=str(ROOT / "site" / "media"))
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (ROOT / "test-results" / "site-scenes").mkdir(parents=True, exist_ok=True)
    wanted = scenes(json.loads((ROOT / "site" / "landing.json").read_text(encoding="utf-8-sig")))
    report = {}
    for name in sorted(wanted):
        capture = Path(a.captures) / f"{name}.png"
        if not capture.exists():
            raise SystemExit(f"No capture for {name}: run the site catalogue (apps/desktop/e2e/site-catalog.spec.ts)")
        report[name] = save(window_only(Image.open(capture)), out, name)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
