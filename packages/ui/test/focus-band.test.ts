// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import { coreExtensions, MarkdownSession } from "@focus-notes/editor";
import { trackFocusBand } from "../src/host/EditorSurface/focus-band.ts";

let editor: Editor | undefined;
let column: HTMLElement | undefined;
let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  editor?.destroy();
  column?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(markdown: string) {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  column = document.createElement("main");
  document.body.append(column);
  column.getBoundingClientRect = () => new DOMRect(0, 20, 600, 800);
  editor = new Editor({ extensions: coreExtensions(), content: new MarkdownSession(markdown).doc as object });
  column.append(editor.view.dom);
  const blocks: { pos: number; el: HTMLElement; measure: ReturnType<typeof vi.fn> }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const el = editor!.view.nodeDOM(pos);
    if (!(el instanceof HTMLElement)) throw new Error("Missing text block");
    const top = 100 + blocks.length * 100;
    const measure = vi.fn(() => new DOMRect(40, top, 400, 72));
    el.getBoundingClientRect = measure;
    blocks.push({ pos: pos + 1, el, measure });
  });
  vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ top: 124, bottom: 144, left: 40, right: 40 });
  off = trackFocusBand(editor, column, { top: "var(--band-top)", bottom: "var(--band-bottom)" });
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn(0);
  };
  const band = () => [column!.style.getPropertyValue("--band-top"), column!.style.getPropertyValue("--band-bottom")];
  return { editor, column, blocks, frames, flush, band };
}

it.each([
  ["paragraph with inline formatting", "First **bold** words and more words."],
  ["paragraph with a hard break", "First line  \nSecond line"],
  ["heading", "# A heading that wraps"],
  ["list paragraph", "- First item\n- Second item"],
  ["quote paragraph", "> First paragraph\n>\n> Second paragraph"],
  ["table cell paragraph", "| First | Second |\n| --- | --- |\n| One | Two |"],
  ["code block", "```\nfirst line\nsecond line\n```"],
  ["empty paragraph", ""],
])("covers the whole %s, not just the caret's line", (_name, markdown) => {
  const { editor, blocks, flush, band } = setup(markdown);
  editor.commands.setTextSelection(blocks[0]!.pos);
  flush();
  expect(band()).toEqual(["80px", "152px"]);
});

it("keeps the same band within a paragraph and moves it to the next paragraph", () => {
  const { editor, blocks, flush, band } = setup("First paragraph.\n\nSecond paragraph.");
  flush();
  editor.commands.setTextSelection(blocks[0]!.pos + 8);
  flush();
  expect(band()).toEqual(["80px", "152px"]);
  editor.commands.setTextSelection(blocks[1]!.pos);
  flush();
  expect(band()).toEqual(["180px", "252px"]);
});

it("includes complete endpoint paragraphs in forward and backward selections", () => {
  const { editor, blocks, flush, band } = setup("First paragraph.\n\nMiddle paragraph.\n\nLast paragraph.");
  for (const [from, to] of [[blocks[0]!.pos + 3, blocks[2]!.pos + 4], [blocks[2]!.pos + 4, blocks[0]!.pos + 3]]) {
    editor.commands.setTextSelection({ from: from!, to: to! });
    flush();
    expect(band()).toEqual(["80px", "352px"]);
  }
});

it("batches typing and composition and remeasures paragraph growth and resize", () => {
  const { editor, column, blocks, frames, flush, band } = setup("First paragraph.");
  flush();
  blocks[0]!.measure.mockReturnValue(new DOMRect(40, 100, 400, 96));
  editor.commands.insertContent("More ");
  editor.commands.insertContent("words ");
  editor.view.dom.dispatchEvent(new CompositionEvent("compositionupdate"));
  expect(frames.size).toBe(1);
  flush();
  expect(band()).toEqual(["80px", "176px"]);
  blocks[0]!.measure.mockReturnValue(new DOMRect(40, 100, 300, 120));
  window.dispatchEvent(new Event("resize"));
  flush();
  expect(band()).toEqual(["80px", "200px"]);
  expect(column.hasAttribute("data-band-live")).toBe(true);
});

it("removes the band and cancels pending measurement when focus mode stops", () => {
  const { column, frames, flush, band } = setup("First paragraph.");
  flush();
  window.dispatchEvent(new Event("resize"));
  off!();
  off = undefined;
  expect(frames.size).toBe(0);
  expect(band()).toEqual(["", ""]);
  expect(column.hasAttribute("data-band-live")).toBe(false);
});
