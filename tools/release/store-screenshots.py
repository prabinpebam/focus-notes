"""
The Microsoft Store's screenshots (D-223): each scene store/listing.json names, from the `store`
review catalogue (the app's own window at 1120 x 720 drawn at twice the scale, captured on CI,
D-141), set with its own shadow on an opaque 2560 x 1440 backdrop and saved as PNG in
store/screenshots/. The Store takes PNG, 1366 x 768 to 3840 x 2160, landscape, with no transparency.

    gh workflow run review-captures.yml --ref <branch> -f catalog=store
    node tools/review/fetch-captures.mjs --branch <branch> --catalog store --label store
    python tools/release/store-screenshots.py --captures <the fetched folder>

Each window is scaled down to fit the canvas inside a margin, so its writing reads larger than a
big window's would. The `cascade` scene lays cascade-1 (at the back) to cascade-4 (in front) from
the top left to the bottom right: one note in four themes and fonts. The backdrop is light behind a
light window and dark behind a dark one (the front one, in the cascade), so the window's edge reads.
`--preview` takes captures of any size, as a local run makes them.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CANVAS = (2560, 1440)
# The drawn window in device pixels: 1120 x 720 at twice the scale (store-catalog.spec.ts).
WINDOW = (2240, 1440)
# Room left around a single window, and around the cascade, on each side.
MARGIN = (120, 90)
# The cascade's windows, as a share of a single window's size, and the steps between them.
CASCADE = 4
CASCADE_SCALE = 0.5625
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


class Window:
    """A capture: the window with its shadow, and where the drawn window sits in it."""

    def __init__(self, path: Path, preview: bool):
        self.image = Image.open(path).convert("RGBA")
        px = np.asarray(self.image)
        self.box = drawn_box(px)
        x0, y0, x1, y1 = self.box
        self.size = (x1 - x0, y1 - y0)
        if not preview and (abs(self.size[0] - WINDOW[0]) > 4 or abs(self.size[1] - WINDOW[1]) > 4):
            raise SystemExit(f"{path.name}: the window is {self.size[0]} x {self.size[1]}, not {WINDOW[0]} x {WINDOW[1]}: capture it with the store catalogue on CI (or pass --preview)")
        body = px[y0:y1, x0:x1, :3].astype(np.float64)
        self.mode = "light" if (0.2126 * body[..., 0] + 0.7152 * body[..., 1] + 0.0722 * body[..., 2]).mean() >= 128 else "dark"

    def scaled(self, scale: float) -> tuple:
        """The capture at `scale` (its alpha premultiplied, so the shadow's edge stays clean), and its drawn box's top left."""
        w, h = self.image.size
        img = self.image.convert("RGBa").resize((round(w * scale), round(h * scale)), Image.LANCZOS).convert("RGBA")
        return img, (round(self.box[0] * scale), round(self.box[1] * scale))


def fit(size: tuple, room: tuple) -> float:
    return min(1.0, room[0] / size[0], room[1] / size[1])


def place(canvas: Image.Image, win: Window, scale: float, at: tuple) -> Image.Image:
    """`win` at `scale` with its drawn window's top left at `at`; its shadow is clipped by the canvas."""
    img, (bx, by) = win.scaled(scale)
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.paste(img, (at[0] - bx, at[1] - by))
    return Image.alpha_composite(canvas, layer)


def compose(win: Window) -> Image.Image:
    room = (CANVAS[0] - 2 * MARGIN[0], CANVAS[1] - 2 * MARGIN[1])
    scale = fit(win.size, room)
    w, h = round(win.size[0] * scale), round(win.size[1] * scale)
    return place(backdrop(win.mode), win, scale, ((CANVAS[0] - w) // 2, (CANVAS[1] - h) // 2)).convert("RGB")


def cascade(wins: list) -> Image.Image:
    room = (CANVAS[0] - 2 * MARGIN[0], CANVAS[1] - 2 * MARGIN[1])
    scale = fit(wins[-1].size, room) * CASCADE_SCALE
    w, h = round(wins[-1].size[0] * scale), round(wins[-1].size[1] * scale)
    steps = len(wins) - 1
    dx, dy = (room[0] - w) // steps, (room[1] - h) // steps
    # The whole stack centred.
    x = (CANVAS[0] - (w + steps * dx)) // 2
    y = (CANVAS[1] - (h + steps * dy)) // 2
    canvas = backdrop(wins[-1].mode)
    for i, win in enumerate(wins):
        canvas = place(canvas, win, scale * wins[-1].size[0] / win.size[0], (x + i * dx, y + i * dy))
    return canvas.convert("RGB")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--captures", default=str(ROOT / "test-results" / "review" / "store"))
    p.add_argument("--out", default=str(ROOT / "store" / "screenshots"))
    p.add_argument("--preview", action="store_true", help="take captures of any size (a local run's)")
    a = p.parse_args()
    scenes = json.loads((ROOT / "store" / "listing.json").read_text(encoding="utf-8-sig"))["screenshots"]["scenes"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    report = {}
    def load(name: str) -> Window:
        capture = Path(a.captures) / f"{name}.png"
        if not capture.exists():
            raise SystemExit(f"No capture for {name} in {a.captures}: run the store review catalogue")
        return Window(capture, a.preview)

    for i, name in enumerate(scenes, 1):
        file = out / f"{i:02d}-{name}.png"
        image = cascade([load(f"cascade-{n}") for n in range(1, CASCADE + 1)]) if name == "cascade" else compose(load(name))
        image.save(file, "PNG", optimize=True)
        report[file.name] = file.stat().st_size
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
