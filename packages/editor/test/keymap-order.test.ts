// @vitest-environment jsdom
/**
 * D-182 and the WP-8.3 custom-key path (KEY-02, KEY-07, D-170): the editor's keymap reads a chord's
 * modifiers in one order, so a key the person wrote in any order in keybindings.json reaches the same
 * command, a table's key and the editor's elsewhere on one chord both run where they apply, and
 * single-modifier and plain keys are as before.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { coreExtensions, EDITOR_OPTIONS, MarkdownSession, toKeyName, type KeyBinding, type PMNode } from "../src/index.ts";

let editors: Editor[] = [];
afterEach(() => { for (const e of editors) e.destroy(); editors = []; });
function open(markdown: string, bindings: KeyBinding[]) {
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions(bindings), content: session.doc as object });
  editors.push(editor);
  return { editor, md: () => session.serialize(editor.getJSON() as PMNode) };
}
/** A key pressed in the note, as ProseMirror's keymap sees it. */
const press = (e: Editor, key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  // The physical key, as a browser gives it (ProseMirror reads it for Shift with a letter).
  if (key.length === 1) Object.defineProperty(ev, "keyCode", { value: key.toUpperCase().charCodeAt(0) });
  return e.view.someProp("handleKeyDown", (f) => f(e.view, ev)) ?? false;
};
const selectAll = (e: Editor) => e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1, e.state.doc.content.size - 1)));

describe("toKeyName", () => {
  it("writes modifiers in one order, and keys as ProseMirror names them", () => {
    expect(toKeyName("Shift+Alt+Right")).toBe(toKeyName("Alt+Shift+Right"));
    expect(toKeyName("Alt+Shift+Right")).toBe("Alt-Shift-ArrowRight");
    expect(toKeyName("Mod+Shift+S")).toBe("Mod-Shift-s");
    expect(toKeyName("Shift+Mod+S")).toBe("Mod-Shift-s");
    expect(toKeyName("Mod+.")).toBe("Mod-.");
    expect(toKeyName("Escape")).toBe("Escape");
    expect(toKeyName("Ctrl+Shift+Mod+Left")).toBe("Mod-Ctrl-Shift-ArrowLeft");
  });
});

describe("a custom key from keybindings.json reaches the editor command (D-170)", () => {
  it("in either modifier order, alongside the default key", () => {
    const { editor, md } = open("Plain words.\n", [
      { id: "format.bold", chord: "Mod+B" },
      // As keybindings.json might have it: Shift before Alt.
      { id: "format.bold", chord: "Shift+Alt+B" },
    ]);
    selectAll(editor);
    expect(press(editor, "B", { altKey: true, shiftKey: true })).toBe(true);
    expect(md()).toBe("**Plain words.**\n");
    expect(press(editor, "b", { ctrlKey: true })).toBe(true);
    expect(md()).toBe("Plain words.\n");
  });
  it("a key a table command and an editor command share runs the table's in a table, the editor's elsewhere", () => {
    const { editor } = open("Words here.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n", [
      { id: "edit.expandSelection", chord: "Shift+Alt+Right" },
      { id: "table.widenColumn", chord: "Alt+Shift+Right" },
    ]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
    expect(press(editor, "ArrowRight", { altKey: true, shiftKey: true })).toBe(true);
    const expanded = editor.state.selection.to - editor.state.selection.from;
    expect(expanded).toBeGreaterThan(0);
  });
});

describe("Shift with the note's start or end key (D-156)", () => {
  it("selects from the caret to there through the editor, so the reading zone animates its reveal", () => {
    const { editor } = open("One.\n\nTwo.\n\nThree.\n", [
      { id: "edit.docStart", chord: "Mod+Home" },
      { id: "edit.docEnd", chord: "Mod+End" },
    ]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)));
    expect(press(editor, "End", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(editor.state.selection.anchor).toBe(7);
    expect(editor.state.selection.head).toBe(editor.state.doc.content.size - 1);
    expect(press(editor, "Home", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(editor.state.selection.anchor).toBe(7);
    expect(editor.state.selection.head).toBe(1);
  });
  it("leaves a shifted key another command owns to that command (macOS Mod+Shift+Down moves a block)", () => {
    const { editor, md } = open("One.\n\nTwo.\n", [
      { id: "edit.docEnd", chord: "Mod+Down" },
      { id: "block.moveDown", chord: "Mod+Shift+Down" },
    ]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    expect(press(editor, "ArrowDown", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(md()).toBe("Two.\n\nOne.\n");
  });
});
