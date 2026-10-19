"""
The Microsoft Store's screenshots (D-202 (11)): each scene store/listing.json names, from the `store`
review catalogue (the site's scenes at an exact 1920 x 1080 drawn window, captured on CI from the
app's own window, D-141), set with its own shadow on an opaque 2560 x 1440 backdrop and saved as PNG
in store/screenshots/. The Store takes PNG, 1366 x 768 to 3840 x 2160, landscape, with no transparency.

    gh workflow run review-captures.yml --ref <branch> -f catalog=store
    node tools/review/fetch-captures.mjs --branch <branch> --catalog store --label store
    python tools/release/store-screenshots.py --captures <the fetched folder>

The backdrop is light behind a light window and dark behind a dark one, so the window's edge reads.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CANVAS = (2560, 1440)
# The window must be shown at its real pixels: a capture smaller than this was clamped by a small screen.
MIN_WINDOW = (1900, 1060)
# Calm, neutral backdrops, top to bottom, for a light window and for a dark one.
BACKDROPS = {"light": ((236, 238, 242), (214, 219, 228)), "dark": ((44, 47, 56), (24, 26, 32))}


def drawn_box(rgba: np.ndarray) -> tuple:
    """The opaque window's box inside the capture's transparent shadow margin."""
    opaque = rgba[..., 3] == 255
    rows, cols = np.nonzero(opaque.any(axis=1))[0], np.nonzero(opaque.any(axis=0))[0]
    return int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1


def backdrop(mode: str) -> Image.Image:
    top, bottom = (np.array(c, dtype=np.float64) for c in BACKDROPS[mode])
    t = np.linspace(0.0, 1.0, CANVAS[1])[:, None, None]
    rows = (top * (1 - t) + bottom * t).round().astype(np.uint8)
    return Image.fromarray(np.repeat(rows, CANVAS[0], axis=1)).convert("RGBA")


def compose(capture: Image.Image) -> Image.Image:
    rgba = capture.convert("RGBA")
    px = np.asarray(rgba)
    x0, y0, x1, y1 = drawn_box(px)
    w, h = x1 - x0, y1 - y0
    if w < MIN_WINDOW[0] or h < MIN_WINDOW[1]:
        raise SystemExit(f"The window is {w} x {h}, not 1920 x 1080: capture it with the store catalogue on CI")
    body = px[y0:y1, x0:x1, :3].astype(np.float64)
    luminance = (0.2126 * body[..., 0] + 0.7152 * body[..., 1] + 0.0722 * body[..., 2]).mean()
    canvas = backdrop("light" if luminance >= 128 else "dark")
    # The drawn window centred; its shadow margin comes with it, clipped to the canvas if wider.
    ox = (CANVAS[0] - w) // 2 - x0
    oy = (CANVAS[1] - h) // 2 - y0
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.paste(rgba, (ox, oy))
    return Image.alpha_composite(canvas, layer).convert("RGB")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--captures", default=str(ROOT / "test-results" / "review" / "store"))
    p.add_argument("--out", default=str(ROOT / "store" / "screenshots"))
    a = p.parse_args()
    scenes = json.loads((ROOT / "store" / "listing.json").read_text(encoding="utf-8-sig"))["screenshots"]["scenes"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    report = {}
    for i, name in enumerate(scenes, 1):
        capture = Path(a.captures) / f"{name}.png"
        if not capture.exists():
            raise SystemExit(f"No capture for {name} in {a.captures}: run the store review catalogue")
        file = out / f"{i:02d}-{name}.png"
        compose(Image.open(capture)).save(file, "PNG", optimize=True)
        report[file.name] = file.stat().st_size
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
