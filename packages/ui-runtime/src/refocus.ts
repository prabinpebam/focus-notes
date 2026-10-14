/** Handing the caret back to the note when a panel closes (Main UI → Dismiss). */
import type { AppState } from "@focus-notes/core";
import { REFOCUS_EVENT } from "@focus-notes/ui";

/** A panel that takes focus while it's open: the formatting toolbar, Files, Spotlight, and the dialogs. */
export function panelOpen(ui: AppState["ui"]): boolean {
  return ui.toolbarOpen || ui.shortcuts.open || ui.files.open || ui.theme.open || ui.spotlight.open || ui.findAll.open;
}

/**
 * Asks the note for the caret back. The note takes it a frame later, after the panel's own focus
 * restoration, and only if no panel has opened meanwhile: Mod+O pressed right after a note opened
 * from Files keeps focus on the Files row it moved to (DEF-4).
 *
 * `still` is the caller's own condition, checked at the same moment: a match opened from Find in all
 * notes gives the find bar focus, so the note must not take it once the find bar's focus state has
 * changed (FND-04). Both are checked when asking and again when the note would take focus.
 */
export function refocusNote(ui: () => AppState["ui"], still: () => boolean = () => true): void {
  const wanted = () => !panelOpen(ui()) && still();
  if (wanted()) window.dispatchEvent(new CustomEvent(REFOCUS_EVENT, { detail: { wanted } }));
}
