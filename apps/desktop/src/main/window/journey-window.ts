/**
 * Journeys and the bench never take the computer's focus (D-104 (7)). With `FOCUS_NOTES_E2E=1` (a
 * test seam, never read in a packaged app) every window opens without being activated, stays off
 * the taskbar, never comes forward, and ignores the computer's own pointer: someone can keep
 * working while the suite runs, and their pointer (or a CI runner's, resting mid-screen) changes
 * nothing a journey checks.
 *
 * Such a window is never the system's active one, so the app's idea of "active" is its own there:
 * the window's `focus` and `blur` events, which it raises itself where the system would (shown or
 * restored: active; hidden or minimized: not) and ignores from the system, and which journeys raise
 * (with `JOURNEY_EVENT`) to drive what the app does
 * for an inactive window (window controls shown, the keyboard move ended, the traffic lights). The
 * page is told it has focus through Chromium's focus emulation, so keys, focus rings, and
 * `:focus-visible` behave as in a focused window.
 */
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

/** The argument a journey's own `focus` and `blur` carry, so they're told from the system's. */
export const JOURNEY_EVENT = "journey";

/** Options every journey window is created with. */
export const JOURNEY_WINDOW_OPTIONS: BrowserWindowConstructorOptions = { skipTaskbar: true };

/**
 * Keeps a window out of the person's way: shown and restored without activating, never focused or
 * raised, and active as the app sees it per its `focus` and `blur` events (see above). Call it
 * before anything else listens to the window, so every listener sees the new state.
 */
export function keepOutOfTheWay(win: BrowserWindow): void {
  let active = false;
  // The system's own focus and blur don't count: the person may click the window, or another app,
  // while the suite runs. Only the window's own (below) and the journey's (`JOURNEY_EVENT`) do.
  const emit = win.emit.bind(win);
  win.emit = ((event: string | symbol, ...args: unknown[]) => {
    if ((event === "focus" || event === "blur") && args[0] !== JOURNEY_EVENT) return false;
    if (event === "focus") active = true;
    if (event === "blur") active = false;
    return emit(event, ...args);
  }) as typeof win.emit;
  const activate = () => {
    if (!active) win.emit("focus", JOURNEY_EVENT);
  };
  const deactivate = () => {
    if (active) win.emit("blur", JOURNEY_EVENT);
  };
  win.on("show", activate);
  win.on("restore", activate);
  win.on("hide", deactivate);
  win.on("minimize", deactivate);
  win.isFocused = () => active && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  // Shown or restored, it's active, whether or not the system reports "show" for an inactive window.
  const showInactive = win.showInactive.bind(win);
  win.showInactive = () => {
    showInactive();
    activate();
  };
  win.show = () => win.showInactive();
  win.restore = () => win.showInactive();
  win.focus = () => {};
  win.moveTop = () => {};
  // The computer's own pointer never reaches the page: resting over the window (a CI runner's sits
  // in the middle of its screen) or moved by someone working meanwhile, it would hover and change
  // what journeys check. Journeys' pointer goes to the page directly, through the DevTools protocol.
  const ignore = win.setIgnoreMouseEvents.bind(win);
  win.setIgnoreMouseEvents = () => ignore(true);
  ignore(true);
}
