/**
 * How the person is interacting, as React Aria tracks it to decide whether focus shows its ring
 * (UI-05, A11Y-01).
 */
import { setInteractionModality } from "react-aria";

/**
 * A key ran an app command (KEY-01), so the focus it moves is keyboard focus and shows its ring.
 * React Aria counts only keys without Ctrl, ⌘, or Alt as keyboard use (so a browser shortcut
 * doesn't light up rings), so after the pointer moved, Mod+. would open the toolbar with "New
 * note" focused and no ring at all.
 */
export function keyRanCommand(): void {
  setInteractionModality("keyboard");
}