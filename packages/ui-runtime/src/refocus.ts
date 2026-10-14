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
 */
export function refocusNote(ui: () => AppState["ui"]): void {
  window.dispatchEvent(new CustomEvent(REFOCUS_EVENT, { detail: { wanted: () => !panelOpen(ui()) } }));
}
