// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { coreExtensions, EDITOR_OPTIONS, insertImageAssets, requestImageCommand, cancelImageImport, MarkdownSession, type PMNode } from "../src/index.ts";

const editors: Editor[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });
function setup(markdown = "Keep this text.\n") {
  const session = new MarkdownSession(markdown), requests = vi.fn();
  const editor = new Editor({ ...EDITOR_OPTIONS, extensions: coreExtensions([], { onImageImport: requests }), content: session.doc as object });
  editors.push(editor);
  return { editor, requests, md: () => session.serialize(editor.getJSON() as PMNode) };
}
it("maps a pending insertion through typing and round-trips intrinsic image dimensions", async () => {
  const { editor, requests, md } = setup();
  editor.commands.setTextSelection(16);
  expect(editor.commands.command(requestImageCommand)).toBe(true);
  await Promise.resolve();
  const request = requests.mock.calls[0]![0].request;
  editor.commands.insertContent(" More text.");
  expect(insertImageAssets(editor, request, [{ src: "Plan.md.assets/images/example.png", width: 640, height: 360 }])).toBe(true);
  expect(md()).toContain("Keep this text. More text.");
  expect(md()).toContain("size=640x360");
  expect(new MarkdownSession(md()).doc.content?.some((node) => node.type === "image" && node.attrs?.width === 640 && node.attrs?.height === 360)).toBe(true);
  editor.commands.undo();
  expect(editor.getText()).toContain("Keep this text. More text.");
  expect(editor.getJSON().content?.some((node) => node.type === "image")).toBe(false);
});
it("cancellation and deleting the insertion block never insert in a different place", async () => {
  const { editor, requests } = setup("First\n\nTarget\n\nLast\n");
  editor.commands.setTextSelection(11);
  editor.commands.command(requestImageCommand);
  await Promise.resolve();
  const request = requests.mock.calls[0]![0].request;
  editor.commands.deleteRange({ from: 7, to: 15 });
  expect(insertImageAssets(editor, request, [{ src: "x.png", width: 1, height: 1 }])).toBe(false);
  editor.commands.command(requestImageCommand);
  await Promise.resolve();
  const next = requests.mock.calls[1]![0].request;
  cancelImageImport(editor, next);
  expect(insertImageAssets(editor, next, [{ src: "x.png", width: 1, height: 1 }])).toBe(false);
});
it("leaves non-image files to existing paste handling and reports image paste in code", async () => {
  const { editor, requests } = setup("```\ncode\n```\n");
  editor.commands.setTextSelection(2);
  const paste = (file: File) => {
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { files: [file], getData: () => "" } });
    return editor.view.someProp("handleDOMEvents", (handlers) => handlers.paste?.(editor.view, event as ClipboardEvent));
  };
  expect(paste(new File(["x"], "notes.txt", { type: "text/plain" }))).toBeFalsy();
  expect(paste(new File(["x"], "photo.png", { type: "image/png" }))).toBe(true);
  await Promise.resolve();
  expect(requests).toHaveBeenCalledWith(expect.objectContaining({ error: "unavailable" }));
  expect(editor.getText()).toContain("code");
});
