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

/** Asks for the caret back; `wanted` is the note's frame-later check, undefined when it wasn't asked at all. */
function ask(start: typeof closed, still?: () => boolean): { wanted: (() => boolean) | undefined; set: (next: typeof closed) => void } {
  let ui = start;
  let wanted: (() => boolean) | undefined;
  const listen = (e: Event) => { wanted = (e as CustomEvent<{ wanted?: () => boolean }>).detail?.wanted; };
  window.addEventListener(REFOCUS_EVENT, listen);
  refocusNote(() => ui as unknown as Ui, still);
  window.removeEventListener(REFOCUS_EVENT, listen);
  return { wanted, set: (next) => { ui = next; } };
}

function wantedAfter(change: (ui: typeof closed) => typeof closed): boolean {
  const { wanted, set } = ask(closed);
  set(change(closed));
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
  it("isn't asked at all when a panel is already open", () => {
    expect(ask({ ...closed, files: { open: true } }).wanted).toBeUndefined();
  });
});

describe("handing the caret back after Find in all notes closes (FND-04)", () => {
  it("is still wanted when the find bar's focus state is unchanged", () => {
    const focusFind = 0;
    const { wanted } = ask(closed, () => focusFind === 0);
    expect(wanted!()).toBe(true);
  });
  it("is no longer wanted once a match opened and focused the find bar meanwhile", () => {
    let focusFind = 0;
    const { wanted } = ask(closed, () => focusFind === 0);
    focusFind = 1;
    expect(wanted!()).toBe(false);
  });
  it("isn't asked at all when the find bar's focus state already changed", () => {
    expect(ask(closed, () => false).wanted).toBeUndefined();
  });
  it("needs both: a panel opened meanwhile still keeps focus with the find bar unchanged", () => {
    const { wanted, set } = ask(closed, () => true);
    set({ ...closed, spotlight: { open: true } });
    expect(wanted!()).toBe(false);
  });
});
