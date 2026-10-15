/**
 * Recovering from a renderer crash (DSK-09, D-148): the one time the window loads its page again.
 * Before it does, a cover in the theme's canvas goes over the drawn window, so the window never shows
 * white or see-through while the new page paints, and what the crashed page hadn't saved goes back
 * into its notes from the recovery journal (QLT-03). The cover goes once the new page reports its
 * first themed frame (`window:firstFrame`), or after a time limit. A page that keeps crashing isn't
 * loaded over and over: the cover stays, in the theme's colour.
 */

/** How many times in `RECOVERY_WINDOW_MS` the page is loaded again after a crash. */
export const MAX_RECOVERIES = 3;
export const RECOVERY_WINDOW_MS = 60_000;
/** How long the cover waits for the new page's first frame. */
export const COVER_TIMEOUT_MS = 10_000;

export interface CrashRecoveryDeps {
  /** The theme's canvas now (the last the page reported). */
  canvas: () => string;
  cover: { show: (color: string) => void; hide: () => void };
  /** Puts what the journal holds back into its notes. */
  restore: () => Promise<void>;
  /** Loads the page again, with the theme in its address. */
  load: () => void;
  /** Calls back on the new page's first themed frame; returns a function that stops listening. */
  onFirstFrame: (f: () => void) => () => void;
  log: (line: string) => void;
  now?: () => number;
}

export class CrashRecovery {
  readonly #d: CrashRecoveryDeps;
  #recent: number[] = [];
  #covered = false;
  #off: (() => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: CrashRecoveryDeps) {
    this.#d = deps;
  }

  /** The renderer is gone (`render-process-gone`'s reason). */
  async gone(reason: string): Promise<void> {
    if (reason === "clean-exit") return;
    const now = (this.#d.now ?? Date.now)();
    this.#recent = this.#recent.filter((t) => now - t < RECOVERY_WINDOW_MS);
    if (!this.#covered) {
      this.#covered = true;
      this.#d.cover.show(this.#d.canvas());
    }
    if (this.#recent.length >= MAX_RECOVERIES) {
      this.#stopWaiting();
      this.#d.log(`renderer-gone reason=${reason} gave-up after=${MAX_RECOVERIES}`);
      return;
    }
    this.#recent.push(now);
    this.#d.log(`renderer-gone reason=${reason} cover=${this.#d.canvas()}`);
    this.#stopWaiting();
    this.#off = this.#d.onFirstFrame(() => this.#uncover("first-frame"));
    this.#timer = setTimeout(() => this.#uncover("timeout"), COVER_TIMEOUT_MS);
    await this.#d.restore().catch(() => {});
    this.#d.load();
  }

  #stopWaiting(): void {
    this.#off?.();
    this.#off = undefined;
    clearTimeout(this.#timer);
  }

  #uncover(on: "first-frame" | "timeout"): void {
    this.#stopWaiting();
    if (!this.#covered) return;
    this.#covered = false;
    this.#d.cover.hide();
    this.#d.log(`renderer-recovered on=${on}`);
  }
}

/** The cover's bounds in the window's content: the drawn window, inside the shadow margin. */
export function coverBounds(size: { width: number; height: number }, margin: number): { x: number; y: number; width: number; height: number } {
  return { x: margin, y: margin, width: Math.max(0, size.width - 2 * margin), height: Math.max(0, size.height - 2 * margin) };
}
