/**
 * Visual baselines (DSY-09, Definition of done → Design system): a stable ID for every surface the
 * visual quality journeys reach, and the work package it belongs to. `baselines.spec.ts` captures
 * each as `<id>.<theme>.png`.
 *
 * - **Candidates** are written to `test-results/baselines/candidates/` (or
 *   `FOCUS_NOTES_BASELINE_DIR`), never into the repository, so nothing can treat them as approved.
 * - **Approved** baselines live in `e2e/baselines/win32/` (Playwright's `snapshotPathTemplate`), and
 *   only the owner adds one there, in a reviewed commit. A surface with an approved baseline is
 *   compared with `toHaveScreenshot`; one without is only captured.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface Baseline {
  id: string;
  /** The work packages whose surface it is (gate-evidence.md, "Baselines"). */
  wp: string[];
  label: string;
}

const b = (id: string, wp: string | string[], label: string): Baseline => ({ id, wp: ([] as string[]).concat(wp), label });

/** Keyed by the surface's name in `surfaces.ts`. */
export const SURFACE_BASELINES: Record<string, Baseline> = {
  "canvas": b("canvas", ["WP-1.1", "WP-1.4"], "The note: blocks, task list, and table"),
  "canvas scrolled": b("canvas-scrolled", ["WP-1.1", "WP-1.11"], "The note scrolled: fading edges"),
  "trigger toolbar": b("trigger-toolbar", "WP-1.6", "Trigger toolbar"),
  "more menu": b("more-menu", "WP-1.6", "⋯ menu"),
  "more submenu": b("more-submenu", ["WP-1.6", "WP-1.9"], "⋯ menu, theme submenu"),
  "find": b("find", "WP-1.10", "Find in note"),
  "find and replace": b("find-replace", "WP-1.10", "Find and replace"),
  "find in all notes": b("find-all", "WP-4.3", "Find in all notes"),
  "cheat sheet": b("cheat-sheet", "WP-1.8", "Keyboard shortcuts"),
  "cheat sheet scrolled": b("cheat-sheet-scrolled", "WP-1.8", "Keyboard shortcuts, scrolled"),
  "files": b("files-panel", "WP-2.4", "Files panel"),
  "files selection": b("files-selection", "WP-2.4", "Files panel, two selected"),
  "move to": b("move-to", "WP-2.4", "Move to dialog"),
  "delete confirmation": b("delete-confirmation", "WP-2.4", "Delete confirmation"),
  "spotlight": b("spotlight", "WP-4.2", "Spotlight"),
  "spotlight notes": b("spotlight-notes", "WP-4.2", "Spotlight, notes"),
  "spotlight commands": b("spotlight-commands", ["WP-4.2", "WP-4.4"], "Spotlight, commands"),
  "spotlight headings": b("spotlight-headings", "WP-4.2", "Spotlight, headings"),
  "spotlight actions": b("spotlight-actions", "WP-4.2", "Spotlight, actions"),
  "theme manager": b("theme-manager", "WP-4.5", "Theme manager"),
  "theme manager themes": b("theme-manager-themes", "WP-4.5", "Theme manager, Themes tab"),
  "theme manager reading": b("theme-manager-reading", "WP-4.5", "Theme manager, Reading tab"),
  "theme manager edit colors": b("theme-manager-edit-colors", "WP-4.5", "Theme manager, Edit colors tab"),
  "settings account": b("settings-account", "WP-3.6", "Settings, Account"),
  "settings workspace": b("settings-workspace", "WP-3.4", "Settings, Workspace"),
  "settings appearance": b("settings-appearance", "WP-1.9", "Settings, Appearance"),
  "formatting toolbar": b("formatting-toolbar", "WP-1.2", "Formatting toolbar"),
  "turn into menu": b("turn-into-menu", "WP-1.2", "Turn into menu"),
  "link editor": b("link-editor", "WP-1.2", "Link editor"),
  "link card": b("link-card", "WP-1.2", "Link card"),
  "slash menu": b("slash-menu", "WP-1.3", "Slash menu"),
  "table cell menu": b("table-cell-menu", "WP-1.5", "Table cell menu"),
  "toast": b("toast-table-paste", ["WP-1.5", "WP-1.3"], "Toast: a table cell holds one line"),
  "window controls": b("window-controls", "WP-2.2", "Title bar window controls"),
  "snap layouts": b("snap-layouts", "WP-2.1", "Snap layouts"),
  "system menu": b("system-menu", "WP-2.1", "Window menu (Alt+Space)"),
};

/** Only in the baseline journey: surfaces the geometry journeys don't open. */
export const EXTRA_BASELINES = {
  focusMode: b("focus-mode", "WP-1.7", "Focus mode on"),
};

/** Keyed by the step's name in `flows.ts`. */
export const FLOW_BASELINES: Record<string, Baseline> = {
  "first-run-welcome": b("first-run-welcome", "WP-3.2", "First run: welcome"),
  "first-run-git": b("first-run-git", "WP-3.2", "First run: Git"),
  "first-run-sign-in": b("first-run-sign-in", "WP-3.2", "First run: sign in"),
  "sync-conflict-toast": b("sync-conflict-toast", "WP-3.5", "Sync conflict toast"),
  "conflict-resolver": b("conflict-resolver", "WP-3.5", "Conflict resolver"),
  "recently-deleted": b("recently-deleted", "WP-3.5", "Recently deleted"),
};

/** Work packages with surfaces that no desktop baseline covers yet (the web reader and vault). */
export const NOT_COVERED = ["WP-6.3", "WP-6.4"];

export const candidatesDir = (): string => process.env.FOCUS_NOTES_BASELINE_DIR ?? join(import.meta.dirname, "..", "..", "..", "test-results", "baselines", "candidates");
export const approvedPath = (file: string): string => join(import.meta.dirname, "baselines", process.platform, file);
export const isApproved = (file: string): boolean => existsSync(approvedPath(file));
