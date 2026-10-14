// @vitest-environment happy-dom
/**
 * DEF-4: closing a panel hands the caret back to the note a timer and a frame later. A panel opened
 * in between (Mod+O right after opening a note from Files) keeps focus: the late hand-back must not
 * take it.
 */
import { describe, expect, it } from "vitest";
import { REFOCUS_EVENT } from "@focus-notes/ui";
import type { AppState } from "@focus-notes/core";
import { refocusNote } from "../src/refocus.ts";

type Ui = AppState["ui"];
const closed = { toolbarOpen: false, shortcuts: { open: false }, files: { open: false }, theme: { open: false }, spotlight: { open: false }, findAll: { open: false } };

function wantedAfter(change: (ui: typeof closed) => typeof closed): boolean {
  let ui = closed;
  let wanted: (() => boolean) | undefined;
  const listen = (e: Event) => { wanted = (e as CustomEvent<{ wanted?: () => boolean }>).detail?.wanted; };
  window.addEventListener(REFOCUS_EVENT, listen);
  refocusNote(() => ui as unknown as Ui);
  window.removeEventListener(REFOCUS_EVENT, listen);
  ui = change(ui);
  expect(wanted).toBeTypeOf("function");
  return wanted!();
}

describe("handing the caret back to the note (DEF-4)", () => {
  it("is still wanted when nothing opened meanwhile", () => {
    expect(wantedAfter((ui) => ui)).toBe(true);
  });
  it("is no longer wanted once Files, the toolbar, Spotlight, or another panel opened meanwhile", () => {
    expect(wantedAfter((ui) => ({ ...ui, files: { open: true } }))).toBe(false);
    expect(wantedAfter((ui) => ({ ...ui, toolbarOpen: true }))).toBe(false);
    expect(wantedAfter((ui) => ({ ...ui, spotlight: { open: true } }))).toBe(false);
    expect(wantedAfter((ui) => ({ ...ui, shortcuts: { open: true } }))).toBe(false);
    expect(wantedAfter((ui) => ({ ...ui, theme: { open: true } }))).toBe(false);
  });
});
