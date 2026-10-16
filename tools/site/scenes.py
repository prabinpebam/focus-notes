"""
The product site's desktop scenes (D-176): each app capture from the site catalogue
(apps/desktop/e2e/site-catalog.spec.ts, the app's own window with its drawn corners and shadow in
an alpha margin) set on the wallpaper as a 1920 x 1080 desktop, at the window's real 1x size, centred.

Compositing is in floating point; each scene is written once per width as AVIF (4:4:4, high
quality: no chroma subsampling, so the sky and the focus-mode fades keep smooth gradients) and as
WebP (quality 94) for browsers without AVIF, at 1920 and 960 pixels wide. Quality wins over size.

    python tools/site/scenes.py [--captures test-results/site-capture] [--out site/media]

The wallpaper is site/media/source/wallpaper-1920.webp: "Photo by Cristina Gottardi on Unsplash"
(Unsplash License), cropped to 16:9 from the original and resized once with Lanczos (D-176).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WIDTHS = (1920, 960)
# The dark scenes' wallpaper is a little dimmer, so a dark window reads against it; the photo stays.
DARK_DIM = 0.72


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float64) / 255.0


def compose(wall: np.ndarray, window: np.ndarray, dark: bool) -> np.ndarray:
    out = wall[..., :3] * (DARK_DIM if dark else 1.0)
    h, w = window.shape[:2]
    top = (out.shape[0] - h) // 2
    left = (out.shape[1] - w) // 2
    region = out[top : top + h, left : left + w]
    alpha = window[..., 3:4]
    # The capture is straight (not premultiplied) alpha.
    out[top : top + h, left : left + w] = window[..., :3] * alpha + region * (1 - alpha)
    return out


def save(rgb: np.ndarray, out: Path, name: str) -> dict:
    full = Image.fromarray(np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8))
    sizes = {}
    for width in WIDTHS:
        img = full if width == full.width else full.resize((width, round(full.height * width / full.width)), Image.Resampling.LANCZOS)
        avif = out / f"{name}-{width}.avif"
        webp = out / f"{name}-{width}.webp"
        img.save(avif, "AVIF", quality=90, subsampling="4:4:4", speed=2)
        img.save(webp, "WEBP", quality=94, method=6)
        sizes[width] = {"avif": avif.stat().st_size, "webp": webp.stat().st_size}
    full.save(ROOT / "test-results" / "site-scenes" / f"{name}.png")
    return sizes


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--captures", default=str(ROOT / "test-results" / "site-capture"))
    p.add_argument("--out", default=str(ROOT / "site" / "media"))
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (ROOT / "test-results" / "site-scenes").mkdir(parents=True, exist_ok=True)
    wall = load(ROOT / "site" / "media" / "source" / "wallpaper-1920.webp")
    assert wall.shape[:2] == (1080, 1920), "the wallpaper is 1920 x 1080"
    report = {}
    for capture in sorted(Path(a.captures).glob("*.png")):
        name = capture.stem
        rgb = compose(wall, load(capture), dark=name.endswith("-dark"))
        report[name] = save(rgb, out, name)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
