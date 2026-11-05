// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/react";
import { coreExtensions, MarkdownSession } from "@focus-notes/editor";
import { DocMinimap } from "../src/host/EditorSurface/DocMinimap.tsx";
import * as styles from "../src/host/EditorSurface/DocMinimap.css.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLElement | undefined;
let editor: Editor | undefined;
afterEach(() => {
  act(() => root?.unmount());
  editor?.destroy();
  host?.remove();
  vi.restoreAllMocks();
});

it("reads no dock lengths when neither Files nor contents asks to dock", () => {
  host = document.createElement("div");
  const scroller = document.createElement("main");
  const mount = document.createElement("div");
  host.append(scroller, mount);
  document.body.append(host);
  editor = new Editor({ extensions: coreExtensions(), content: new MarkdownSession("# Short note\n\nText.\n").doc as object });
  scroller.append(editor.view.dom);
  root = createRoot(mount);
  const probeRead = vi.fn();
  const measure = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains(styles.probe)) probeRead();
    return measure.call(this);
  });
  const onFilesFit = vi.fn();
  act(() => root!.render(createElement(DocMinimap, {
    editor: editor!, scroller: { current: scroller }, label: "Contents", untitled: "Untitled", onFilesFit,
  })));
  expect(probeRead).not.toHaveBeenCalled();
  expect(onFilesFit).toHaveBeenLastCalledWith(true);
});
