/**
 * The app-built window on Windows and Linux (D-14, DSK-01, DSK-03, DSK-08). Electron's transparent
 * windows lose native resizing, snapping, maximize, and the shadow, so this does them: it moves and
 * resizes the window as the renderer's window frame reports the pointer, previews and applies snap
 * zones, maximizes and restores itself, runs the system menu's keyboard Move and Size, and lets
 * clicks in the shadow margin through to whatever is behind, as the page reports the pointer near
 * the edges. The geometry is core's window-geometry.
 */
import {
  clampToDisplays, contentBounds, displayFor, DRAG_THRESHOLD, fitToDisplay, hitZone, keyboardStep, layoutsFor, needsRemeasure, outerBounds,
  resizeBounds, restoreUnderPointer, snapZoneAt, verticalRect, verticalSnapAt, WINDOW_METRICS, zoneRect,
  type ArrowKey, type DisplayInfo, type Point, type Rect, type ResizeEdge, type SnapZone,
} from "@focus-notes/core/window-geometry";
import type { WindowReport } from "@focus-notes/core";
import { MIN_SIZE, type Placement, type PlacedZone, type WindowMemory, type WindowMode } from "./placement.ts";

/** The parts of a BrowserWindow this uses. */
export interface WinLike {
  getBounds(): Rect;
  setBounds(r: Rect): void;
  setPosition(x: number, y: number): void;
  minimize(): void;
  close(): void;
  isMinimized(): boolean;
  isVisible(): boolean;
  isFocused(): boolean;
  isDestroyed(): boolean;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
  moveTop(): void;
}
export interface ScreenLike {
  getAllDisplays(): DisplayInfo[];
  getCursorScreenPoint(): Point;
}
/** The translucent accent rectangle that previews a snap zone. */
export interface PreviewLike {
  show(r: Rect, color: string): void;
  hide(): void;
}
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

interface Options {
  frame: WindowReport["frame"];
  screen: ScreenLike;
  preview: () => PreviewLike;
  /** The preview's color, from the theme's `cmp.windowFrame.snapPreview` with its opacity. */
  previewColor: () => string;
  notify: (r: WindowReport) => void;
  save: (m: WindowMemory) => void;
  /** The system forwards pointer moves to the page while the window ignores the mouse (Windows, not Linux). */
  forwardsMoves: boolean;
  /** Tells the page the window lets clicks through, or no longer does, so it reports every forwarded move meanwhile (D-150). */
  passthrough?: (on: boolean) => void;
}

const ARROWS: Record<string, ArrowKey> = { ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down" };
const metrics = { edge: WINDOW_METRICS.resizeEdge, corner: WINDOW_METRICS.resizeCorner };
/** The page reports pointer moves this close to the window's edges (CSS px): the margin, a corner handle, and room for a fast move. */
export const POINTER_EDGE_PX = WINDOW_METRICS.margin + WINDOW_METRICS.resizeCorner + 16;
/** How often Linux checks a pointer in the margin of an ignoring window, which the page can't see. */
export const POINTER_WATCH_MS = 50;

export class CustomWindow {
  readonly #win: WinLike;
  readonly #o: Options;
  #mode: WindowMode;
  /** A snap zone, or "vertical": the work area's full height at the window's own x and width (D-141). */
  #zone: PlacedZone | undefined;
  #restore: Rect;
  #drag: { kind: "move" | ResizeEdge; start: Point; from: Rect; moved: boolean; snap?: { zone: SnapZone; display: DisplayInfo }; vertical?: DisplayInfo } | undefined;
  #keys: { mode: "move" | "size"; edge?: ResizeEdge; original: Rect; current: Rect } | undefined;
  #ignoring = false;
  /** Full screen is the app's own too: Electron doesn't track it for transparent windows. */
  #full = false;
  #beforeFull: Rect | undefined;
  #previewing = false;
  #tracking = false;
  /** Linux only, while the pointer is in the margin of an ignoring window. */
  #watch: ReturnType<typeof setInterval> | undefined;

  constructor(win: WinLike, o: Options, placement: Placement) {
    this.#win = win;
    this.#o = o;
    this.#mode = placement.mode;
    this.#zone = placement.zone;
    this.#restore = placement.restore;
  }

  /** The window's outer bounds for a placement: the visible window and its shadow margin. */
  static outer(p: Placement, frame: WindowReport["frame"]): Rect {
    return outerBounds(p.content, frame === "custom" && p.mode === "normal" ? WINDOW_METRICS.margin : 0);
  }

  /** The shadow margin now: only a rounded window at rest has one. */
  margin(): number {
    return this.#o.frame === "custom" && this.#mode === "normal" && !this.#full ? WINDOW_METRICS.margin : 0;
  }
  resizable(): boolean {
    return this.#mode !== "maximized" && !this.#full;
  }
  /** The visible window's bounds. */
  content(): Rect {
    return contentBounds(this.#win.getBounds(), this.margin());
  }
  #displays(): DisplayInfo[] {
    return this.#o.screen.getAllDisplays();
  }
  #display(): DisplayInfo {
    return displayFor(this.content(), this.#displays());
  }

  report(): WindowReport {
    return {
      frame: this.#o.frame,
      maximized: this.#mode === "maximized",
      snapped: this.#mode === "snapped",
      fullScreen: this.#full,
      active: this.#win.isFocused(),
      layouts: layoutsFor(this.#display().workArea),
      ...(this.#keys ? { keyboard: this.#keys.mode } : {}),
    };
  }
  notify(): void {
    if (!this.#win.isDestroyed()) this.#o.notify(this.report());
  }
  memory(): WindowMemory {
    const bounds = this.#mode === "normal" && !this.#full ? this.content() : this.#restore;
    return {
      version: 1,
      bounds,
      ...(this.#mode === "maximized" ? { maximized: true } : {}),
      ...(this.#mode === "snapped" && this.#zone === "vertical" ? { vertical: true } : {}),
      ...(this.#mode === "snapped" && this.#zone && this.#zone !== "vertical" ? { zone: this.#zone } : {}),
      ...(this.#full ? { fullScreen: true } : {}),
    };
  }
  save(): void {
    this.#o.save(this.memory());
  }

  #setMode(mode: WindowMode, zone?: PlacedZone): void {
    this.#mode = mode;
    this.#zone = zone;
    // The renderer redraws the frame (corners, margin) as the window changes shape.
    this.notify();
  }
  #apply(content: Rect): void {
    this.#win.setBounds(outerBounds(content, this.margin()));
  }

  maximize(): void {
    this.snap("maximize");
  }
  /** Snaps to a zone of the window's display (or the given one), keeping where Restore goes. */
  snap(zone: SnapZone, display: DisplayInfo = this.#display()): void {
    if (this.#full) return;
    if (this.#mode === "normal") this.#restore = this.content();
    this.#setMode(zone === "maximize" ? "maximized" : "snapped", zone === "maximize" ? undefined : zone);
    this.#apply(zoneRect(zone, display.workArea));
    this.save();
    this.settle();
  }
  restore(): void {
    if (this.#mode === "normal" || this.#full) return;
    this.#setMode("normal");
    this.#apply(clampToDisplays(this.#restore, this.#displays(), MIN_SIZE));
    this.save();
    this.settle();
  }
  toggleMaximize(): void {
    if (this.#mode === "maximized") this.restore();
    else this.maximize();
  }

  /**
   * Windows' vertical maximize (D-141): the work area's full height at the same x and width, square
   * and without the margin, as a snapped window is. Restore, or dragging it away, puts back its height.
   * `display` is where a resize reached the screen's edge; otherwise the window's own display.
   */
  maximizeVertically(display: DisplayInfo = this.#display(), from?: Rect): void {
    if (this.#full || this.#mode === "maximized" || this.#zone === "vertical") return;
    const r = from ?? this.content();
    if (this.#mode === "normal") this.#restore = r;
    this.#setMode("snapped", "vertical");
    this.#apply(verticalRect(r, display.workArea));
    this.save();
    this.settle();
  }
  /** Double-clicking the top or bottom border: maximizes vertically, or restores a vertically maximized window. */
  toggleVertical(): void {
    if (this.#mode === "snapped" && this.#zone === "vertical") this.restore();
    else this.maximizeVertically();
  }
  /**
   * Win+Shift+Up and Win+Shift+Down, when the shell lets them reach the window (it handles them
   * itself for windows with a native frame). True when the key was one of them.
   */
  snapKey(input: KeyInput): boolean {
    if (input.type !== "keyDown" || !input.meta || !input.shift || input.alt || input.control) return false;
    if (input.key === "ArrowUp") this.maximizeVertically();
    else if (input.key === "ArrowDown") {
      if (this.#zone === "vertical") this.restore();
    } else return false;
    return true;
  }
  minimize(): void {
    this.#win.minimize();
  }
  /** Full screen (F11): the whole display, with no corners, margin, or shadow; leaving puts it back as it was. */
  toggleFullScreen(): void {
    this.#keys = undefined;
    if (this.#full) {
      this.#full = false;
      this.notify();
      this.#apply(this.#beforeFull ?? this.#restore);
    } else {
      const display = this.#display();
      this.#beforeFull = this.content();
      if (this.#mode === "normal") this.#restore = this.#beforeFull;
      this.#full = true;
      this.notify();
      this.#win.setBounds(display.bounds);
    }
    this.save();
    this.settle();
  }

  /**
   * A move (by the band) or a resize (by a handle), in screen DIP. Moving a maximized or snapped
   * window restores it under the pointer; moving to a screen edge previews a zone, and releasing there snaps.
   */
  drag(phase: "start" | "move" | "end", kind: "move" | ResizeEdge, x: number, y: number, shift: boolean): void {
    const p = { x, y };
    if (phase === "start") {
      if (this.#full || this.#keys || (kind !== "move" && !this.resizable())) return;
      this.#drag = { kind, start: p, from: this.content(), moved: false };
      this.#setIgnore(false);
      return;
    }
    const d = this.#drag;
    if (!d || (kind !== d.kind && phase !== "end")) return;
    if (!d.moved && Math.hypot(x - d.start.x, y - d.start.y) < DRAG_THRESHOLD) {
      if (phase === "end") this.#drag = undefined;
      return;
    }
    if (!d.moved) {
      d.moved = true;
      if (this.#mode !== "normal") {
        if (d.kind === "move") d.from = restoreUnderPointer(this.#restore, d.from, d.start, displayFor(d.from, this.#displays()).workArea);
        else this.#restore = d.from; // A snapped window resized by hand becomes a normal window where it is.
        this.#setMode("normal");
        if (d.kind === "move") this.#apply(d.from);
      }
    }
    const delta = { x: x - d.start.x, y: y - d.start.y };
    if (d.kind === "move") {
      const outer = outerBounds({ ...d.from, x: d.from.x + delta.x, y: d.from.y + delta.y }, this.margin());
      // Only the position: the system keeps the size right on a display with another scale.
      this.#win.setPosition(outer.x, outer.y);
      const snap = snapZoneAt(p, this.#displays());
      if (snap) d.snap = snap;
      else delete d.snap;
      this.#showPreview(snap ? zoneRect(snap.zone, snap.display.workArea) : undefined);
    } else {
      const next = resizeBounds(d.from, d.kind, delta, MIN_SIZE, shift);
      this.#apply(next);
      // The top or bottom edge reaching the work area's edge previews a vertical maximize (D-141).
      const display = displayFor(d.from, this.#displays());
      if (verticalSnapAt(d.kind, p, display)) d.vertical = display;
      else delete d.vertical;
      this.#showPreview(d.vertical ? verticalRect(d.from, d.vertical.workArea) : undefined);
    }
    if (phase !== "end") return;
    this.#drag = undefined;
    this.#showPreview(undefined);
    if (d.kind === "move" && d.snap) return this.snap(d.snap.zone, d.snap.display);
    if (d.vertical) return this.maximizeVertically(d.vertical, d.from);
    if (d.kind === "move") this.#remeasure({ width: d.from.width, height: d.from.height });
    this.#restore = this.content();
    this.notify();
    this.save();
    this.settle();
  }

  /** On a display with another scale, the window keeps its size in DIP, which keeps its size on screen. */
  #remeasure(expected: { width: number; height: number }): void {
    const now = this.content();
    if (!needsRemeasure(expected, now)) return;
    this.#apply(fitToDisplay({ ...now, ...expected }, displayFor(now, this.#displays())));
  }

  #showPreview(r: Rect | undefined): void {
    if (!r) {
      if (this.#previewing) this.#o.preview().hide();
      this.#previewing = false;
      return;
    }
    this.#o.preview().show(r, this.#o.previewColor());
    if (!this.#previewing) this.#win.moveTop();
    this.#previewing = true;
  }

  /** The system menu's Move and Size: the arrow keys until Enter keeps it or Esc puts it back. */
  keyboard(mode: "move" | "size"): void {
    if (this.#full || this.#mode === "maximized") return;
    if (this.#mode === "snapped") {
      this.#restore = this.content();
      this.#setMode("normal");
      this.#apply(this.#restore);
    }
    const r = this.content();
    this.#keys = { mode, original: r, current: r };
    this.notify();
  }
  get keyboardActive(): boolean {
    return Boolean(this.#keys);
  }
  /** A key while Move or Size runs. True when it was used (every key is, until it ends). */
  key(input: KeyInput): boolean {
    const k = this.#keys;
    if (!k) return false;
    if (input.type !== "keyDown") return true;
    if (input.key === "Enter") this.endKeyboard(true);
    else if (input.key === "Escape") this.endKeyboard(false);
    else if (ARROWS[input.key]) {
      const step = keyboardStep(k.current, k.mode, ARROWS[input.key]!, k.edge, MIN_SIZE, input.control);
      k.current = step.rect;
      if (step.edge) k.edge = step.edge;
      this.#apply(step.rect);
    }
    return true;
  }
  endKeyboard(keep: boolean): void {
    const k = this.#keys;
    if (!k) return;
    this.#keys = undefined;
    if (!keep) this.#apply(k.original);
    this.#restore = this.content();
    this.notify();
    this.save();
    this.settle();
  }

  /** Displays came or went, or changed their work areas: a maximized or snapped window refits; a normal one stays reachable. */
  displaysChanged(): void {
    if (this.#full) return;
    const displays = this.#displays();
    if (this.#mode === "normal") {
      const now = this.content();
      const fit = clampToDisplays(now, displays, MIN_SIZE);
      if (fit.x !== now.x || fit.y !== now.y || fit.width !== now.width || fit.height !== now.height) this.#apply(fit);
    } else if (this.#zone === "vertical") this.#apply(verticalRect(this.content(), this.#display().workArea));
    else this.#apply(zoneRect(this.#mode === "maximized" ? "maximize" : this.#zone ?? "maximize", this.#display().workArea));
    this.notify();
    this.settle();
  }

  /**
   * Clicks in the shadow margin pass through to whatever is behind (Window management → Shadow).
   * Nothing polls (PRF-04): the page reports the pointer moving near the window's edges
   * (`window:pointer`, from the moment the caret is ready, PRF-02), and this checks it against the
   * margin and the handles. While the window ignores the mouse, Windows still forwards the moves to
   * the page. Linux can't, so there, and only while the pointer is in the margin of an ignoring
   * window, the pointer is checked every `POINTER_WATCH_MS` until it leaves the margin or the
   * window hides (D-104). While it lets clicks through, the page reports every forwarded move, not
   * only near the edges, so a pointer that reaches the middle without crossing them (Alt+Tab, a window
   * that moved or appeared under it) takes the mouse again (D-150).
   */
  trackPointer(): void {
    this.#tracking = true;
  }
  stop(): void {
    this.#tracking = false;
    this.#stopWatch();
    if (this.#previewing) this.#o.preview().hide();
  }
  pointerCheck(): void {
    const w = this.#win;
    if (!this.#tracking || w.isDestroyed()) return this.#stopWatch();
    // A hidden or minimized window takes the pointer again when it's back, where the page can see it.
    if (!w.isVisible() || w.isMinimized()) return this.#setIgnore(false);
    if (this.#drag || this.#keys) return;
    const at = this.#pointerAt();
    // Out of the window: where the system forwards moves nothing changes; elsewhere the window takes the pointer again, so it sees it come back.
    if (at === "away") return this.#o.forwardsMoves ? undefined : this.#setIgnore(false);
    this.#setIgnore(at === "margin");
  }
  /**
   * The system showed, restored, activated, moved, or resized the window, or its shape changed: it
   * takes the mouse unless the pointer is in its margin right now (D-150). A window someone just
   * activated is never left letting their clicks through.
   */
  settle(): void {
    const w = this.#win;
    if (!this.#tracking || w.isDestroyed()) return;
    if (!w.isVisible() || w.isMinimized() || this.#drag || this.#keys) return this.#setIgnore(false);
    this.#setIgnore(this.#pointerAt() === "margin");
  }
  /** Where the pointer is: away from the window, in its shadow margin, or on the visible window (its handles included). */
  #pointerAt(): "away" | "margin" | "window" {
    const b = this.#win.getBounds();
    const c = this.#o.screen.getCursorScreenPoint();
    const p = { x: c.x - b.x, y: c.y - b.y };
    if (p.x < 0 || p.y < 0 || p.x >= b.width || p.y >= b.height) return "away";
    return hitZone(p, { width: b.width, height: b.height }, { margin: this.margin(), ...metrics }, this.resizable()) === "outside" ? "margin" : "window";
  }
  /** Whether the pointer is being checked on a timer now: on Linux, only while it's in the margin. */
  get watching(): boolean {
    return this.#watch !== undefined;
  }
  get passingThrough(): boolean {
    return this.#ignoring;
  }
  #setIgnore(ignore: boolean): void {
    if (ignore !== this.#ignoring) {
      this.#ignoring = ignore;
      if (!this.#win.isDestroyed()) this.#win.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
      this.#o.passthrough?.(ignore);
    }
    // The page can't see a pointer the window ignores unless the system forwards its moves.
    if (ignore && !this.#o.forwardsMoves) {
      this.#watch ??= setInterval(() => this.pointerCheck(), POINTER_WATCH_MS);
      this.#watch.unref?.();
    } else this.#stopWatch();
  }
  #stopWatch(): void {
    if (this.#watch === undefined) return;
    clearInterval(this.#watch);
    this.#watch = undefined;
  }
}
