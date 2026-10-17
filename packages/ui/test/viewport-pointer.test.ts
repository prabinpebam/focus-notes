// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import { coreExtensions, MarkdownSession, selectedBlocks } from "@focus-notes/editor";
import { trackViewportPointer } from "../src/host/EditorSurface/viewport-pointer.ts";

let editor: Editor | undefined;
let scroller: HTMLElement | undefined;
let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  editor?.destroy();
  scroller?.remove();
  vi.restoreAllMocks();
});

const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);
function setup() {
  scroller = document.createElement("main");
  document.body.append(scroller);
  editor = new Editor({ extensions: coreExtensions(), content: new MarkdownSession("One\n\nTwo\n").doc as object });
  scroller.append(editor.view.dom);
  Object.defineProperties(scroller, { clientWidth: { value: 784 }, clientHeight: { value: 600 } });
  scroller.getBoundingClientRect = () => rect(0, 0, 800, 600);
  editor.view.dom.getBoundingClientRect = () => rect(200, 100, 400, 140);
  [...editor.view.dom.children].forEach((el, i) => {
    el.getBoundingClientRect = () => rect(200, 100 + i * 100, 400, 40);
  });
  const hit = vi.spyOn(editor.view, "posAtCoords").mockImplementation(({ left, top }) => ({
    pos: (top >= 200 ? 6 : 1) + (left > 400 ? 3 : 0), inside: top >= 200 ? 5 : 0,
  }));
  off = trackViewportPointer(editor, scroller);
  const click = (x: number, y: number, opts: PointerEventInit = {}, target: Element = scroller!) => {
    const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", clientX: x, clientY: y, ...opts });
    target.dispatchEvent(event);
    return event;
  };
  return { editor, hit, click };
}

it("projects a margin click onto the corresponding visual row and selects the right-margin block", () => {
  const { editor, hit, click } = setup();
  expect(click(40, 220).defaultPrevented).toBe(true);
  expect(hit).toHaveBeenLastCalledWith({ left: 201, top: 220 });
  expect(editor.state.selection.head).toBe(6);
  expect(selectedBlocks(editor.state)).toBeNull();
  expect(click(760, 220).defaultPrevented).toBe(true);
  expect(hit).toHaveBeenLastCalledWith({ left: 599, top: 220 });
  expect(editor.state.selection.head).toBe(9);
  expect(selectedBlocks(editor.state)?.blocks).toEqual([5]);
  click(760, 120);
  expect(selectedBlocks(editor.state)?.blocks).toEqual([0]);
});

it("clamps above and below the document without creating a new block", () => {
  const { editor, click } = setup();
  const before = editor.getJSON();
  click(760, 40);
  expect(editor.state.selection.head).toBe(1);
  click(760, 500);
  expect(editor.state.selection.head).toBe(9);
  expect(selectedBlocks(editor.state)).toBeNull();
  expect(editor.getJSON()).toEqual(before);
});

it("keeps an empty document editable without inserting paragraphs for blank-space clicks", () => {
  const { editor, click } = setup();
  editor.commands.clearContent();
  const before = editor.getJSON();
  click(760, 500);
  expect(editor.state.selection.head).toBe(1);
  expect(editor.state.doc.childCount).toBe(1);
  expect(editor.getJSON()).toEqual(before);
});

it("extends text selection with Shift instead of selecting a block", () => {
  const { editor, click } = setup();
  click(40, 120);
  click(760, 220, { shiftKey: true });
  expect(editor.state.selection.anchor).toBe(1);
  expect(editor.state.selection.head).toBe(9);
  expect(selectedBlocks(editor.state)).toBeNull();
});

it("leaves text, controls, scrollbar, secondary buttons, modifiers and touch scrolling alone", () => {
  const { editor, hit, click } = setup();
  const button = document.createElement("button");
  scroller!.append(button);
  for (const event of [
    click(300, 120, {}, editor.view.dom.firstElementChild!),
    click(760, 220, {}, button),
    click(795, 220),
    click(760, 220, { button: 2 }),
    click(760, 220, { ctrlKey: true }),
    click(760, 220, { pointerType: "touch" }),
  ]) expect(event.defaultPrevented).toBe(false);
  expect(hit).not.toHaveBeenCalled();
  editor.setEditable(false);
  expect(click(760, 220).defaultPrevented).toBe(false);
  off?.();
  editor.setEditable(true);
  expect(click(760, 220).defaultPrevented).toBe(false);
});
