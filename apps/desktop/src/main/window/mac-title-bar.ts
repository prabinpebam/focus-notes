/**
 * macOS's traffic lights (DSK-02, D-14): hidden at rest like the rest of the chrome, and shown while
 * the pointer is on the title bar band, while the toolbar is open, while the window isn't the active
 * one, and in full screen (where the system shows them with the menu bar at the top edge).
 *
 * Nothing polls at rest (PRF-04). The band is the system's drag region, which the page gets no
 * pointer events from, so the page reports the pointer near the band and leaving the page
 * (`window:pointer`), and the window reports focus, blur, showing, and full screen. Only while the
 * pointer is on the band, or in the strip just under it, of the active window (where the page can
 * lose sight of it) is it checked every `BAND_WATCH_MS`, until it leaves (D-106).
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

/** The strip under the band where the page still reports the pointer, so a quick move onto the band isn't missed (CSS px). */
export const BAND_APPROACH_PX = 24;
/** How often a pointer on the band, which the page can't see, is checked. */
export const BAND_WATCH_MS = 100;

/** The pointer is on the title bar band: the window's top `window.titleBarHeight`. */
export function onBand(p: Point, content: Rect, band: number = WINDOW_METRICS.titleBarHeight): boolean {
  return p.x >= content.x && p.x < content.x + content.width && p.y >= content.y && p.y < content.y + band;
}

export class MacTitleBar {
  readonly #win: MacWinLike;
  readonly #cursor: () => Point;
  #reveal = false;
  #shown: boolean | undefined;
  #tracking = false;
  #watch: ReturnType<typeof setInterval> | undefined;

  constructor(win: MacWinLike, cursor: () => Point) {
    this.#win = win;
    this.#cursor = cursor;
  }

  /** Whether the traffic lights show now. */
  get shown(): boolean {
    return this.#shown ?? true;
  }
  /** Whether the pointer is being checked on a timer now: only while it's on or just under the band. */
  get watching(): boolean {
    return this.#watch !== undefined;
  }

  /** The page's reason to show them: the toolbar is open. */
  reveal(show: boolean): void {
    this.#reveal = show;
    this.update();
  }

  /** From the moment the caret is ready (PRF-02), the page's pointer reports are followed. */
  trackPointer(): void {
    this.#tracking = true;
  }

  /** The page saw the pointer near the band, or leave the page. */
  pointerMoved(): void {
    if (this.#tracking) this.update();
  }

  update(): void {
    const w = this.#win;
    if (w.isDestroyed()) return this.stop();
    const content = w.getContentBounds();
    const p = this.#cursor();
    const active = w.isFocused() && w.isVisible() && !w.isFullScreen();
    // The page can't see the pointer on the band: watch it there, and just under it, until it leaves.
    if (this.#tracking && active && onBand(p, content, WINDOW_METRICS.titleBarHeight + BAND_APPROACH_PX)) {
      this.#watch ??= setInterval(() => this.update(), BAND_WATCH_MS);
      this.#watch.unref?.();
    } else this.#stopWatch();
    const show = this.#reveal || !active || onBand(p, content);
    if (show === this.#shown) return;
    this.#shown = show;
    w.setWindowButtonVisibility(show);
  }

  stop(): void {
    this.#tracking = false;
    this.#stopWatch();
  }
  #stopWatch(): void {
    if (this.#watch === undefined) return;
    clearInterval(this.#watch);
    this.#watch = undefined;
  }
}
