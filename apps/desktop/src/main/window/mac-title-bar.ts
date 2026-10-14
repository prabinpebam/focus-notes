/**
 * macOS's traffic lights (DSK-02, D-14): hidden at rest like the rest of the chrome, and shown while
 * the pointer is on the title bar band, while the toolbar is open, while the window isn't the active
 * one, and in full screen (where the system shows them with the menu bar at the top edge). The band
 * is the system's drag region, which the page gets no pointer events from, so the pointer is checked
 * here a few times a second.
 */
import { WINDOW_METRICS, type Point, type Rect } from "@focus-notes/core/window-geometry";

/** The parts of a BrowserWindow this uses. */
export interface MacWinLike {
  getContentBounds(): Rect;
  isFocused(): boolean;
  isFullScreen(): boolean;
  isVisible(): boolean;
  isDestroyed(): boolean;
  setWindowButtonVisibility(visible: boolean): void;
}

/** The pointer is on the title bar band: the window's top `window.titleBarHeight`. */
export function onBand(p: Point, content: Rect, band = WINDOW_METRICS.titleBarHeight): boolean {
  return p.x >= content.x && p.x < content.x + content.width && p.y >= content.y && p.y < content.y + band;
}

export class MacTitleBar {
  readonly #win: MacWinLike;
  readonly #cursor: () => Point;
  #reveal = false;
  #shown: boolean | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(win: MacWinLike, cursor: () => Point) {
    this.#win = win;
    this.#cursor = cursor;
  }

  /** Whether the traffic lights show now. */
  get shown(): boolean {
    return this.#shown ?? true;
  }

  /** The page's reason to show them: the toolbar is open. */
  reveal(show: boolean): void {
    this.#reveal = show;
    this.update();
  }

  update(): void {
    const w = this.#win;
    if (w.isDestroyed()) return;
    const show = this.#reveal || !w.isFocused() || w.isFullScreen() || !w.isVisible() || onBand(this.#cursor(), w.getContentBounds());
    if (show === this.#shown) return;
    this.#shown = show;
    w.setWindowButtonVisibility(show);
  }

  /** Checks the pointer a few times a second, from the moment the caret is ready (PRF-02). */
  watchPointer(intervalMs = 100): void {
    this.#timer ??= setInterval(() => this.update(), intervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
