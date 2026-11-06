// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { coreExtensions, EDITOR_OPTIONS, insertImageAssets, requestImageCommand, cancelImageImport, trackImageCut, finishImageCut, trackImageReplacement, trackImageCaption, applyImageCaption, setImageWords, MarkdownSession, type PMNode } from "../src/index.ts";

const editors: Editor[] = [];
it("caption applies to the captured image through typing, preserves its description, and is one Undo", async () => {
  const { editor, md, requests } = setup('Before\n\n![Description](same.png "Old")\n\n![Other](same.png)\n');
  const pos = editor.state.doc.child(0).nodeSize;
  trackImageCaption(editor, "caption", pos, "same.png");
  editor.commands.setTextSelection(2);
  editor.commands.insertContent("typed ");
  const before = md();
  expect(applyImageCaption(editor, "caption", "Plain **caption**")).toBe(true);
  expect(md()).toContain('![Description](same.png "Plain **caption**")');
  expect(md()).toContain("![Other](same.png)");
  editor.commands.undo();
  expect(md()).toBe(before);
  await Promise.resolve();
  expect(requests).not.toHaveBeenCalled();
});
it("caption never applies after editing or deleting the exact image, even with duplicate sources", () => {
  const { editor, md } = setup('Before\n\n![Description](same.png "Old")\n\n![Other](same.png)\n');
  const pos = editor.state.doc.child(0).nodeSize;
  trackImageCaption(editor, "changed", pos, "same.png");
  setImageWords(editor, { pos, src: "same.png" }, { title: "Manual" });
  expect(applyImageCaption(editor, "changed", "AI")).toBe(false);
  trackImageCaption(editor, "deleted", pos, "same.png");
  editor.commands.deleteRange({ from: pos, to: pos + 1 });
  expect(applyImageCaption(editor, "deleted", "AI")).toBe(false);
  expect(md()).toContain("![Other](same.png)");
});
it("Cut follows the captured image through typing, keeps duplicate sources, and is one Undo", async () => {
  const { editor, requests, md } = setup('Before\n\n![One](same.png "Caption")\n\n![Two](same.png)\n');
  const pos = editor.state.doc.child(0).nodeSize;
  trackImageCut(editor, "cut", pos, "same.png");
  editor.commands.setTextSelection(2);
  editor.commands.insertContent("typed ");
  const beforeCut = md();
  expect(finishImageCut(editor, "cut")).toBe(true);
  expect(md()).not.toContain("![One]");
  expect(md()).toContain("![Two]");
  editor.commands.undo();
  expect(md()).toBe(beforeCut);
  await Promise.resolve();
  expect(requests).not.toHaveBeenCalled();
});
it("Cut never removes a replacement or another image after the target was deleted", () => {
  const { editor, md } = setup("Before\n\n![One](same.png)\n\n![Two](same.png)\n");
  const pos = editor.state.doc.child(0).nodeSize;
  trackImageCut(editor, "cut", pos, "same.png");
  editor.commands.deleteRange({ from: pos, to: pos + 1 });
  expect(finishImageCut(editor, "cut")).toBe(false);
  expect(md()).toContain("![Two]");
});
it("Replace follows typing, retains words and display choices, and Undo restores the reference", async () => {
  const { editor, requests, md } = setup('Before\n\n<!-- image: rounded unlimited wide -->\n![One](old.png "Caption")\n\nAfter\n');
  const pos = editor.state.doc.child(0).nodeSize;
  trackImageReplacement(editor, "replace", pos, "old.png");
  editor.commands.setTextSelection(2);
  editor.commands.insertContent("typed ");
  const before = md();
  expect(insertImageAssets(editor, "replace", [{ src: "managed.png", width: 120, height: 80 }])).toBe(true);
  expect(md()).toContain('![One](managed.png "Caption")');
  expect(md()).toContain("rounded unlimited wide");
  editor.commands.undo();
  expect(md()).toBe(before);
  await Promise.resolve();
  expect(requests).not.toHaveBeenCalled();
});
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
it("uses the drop target rather than an unrelated caret inside code", async () => {
  const { editor, requests } = setup("```\ncode\n```\n\nDrop here\n");
  editor.commands.setTextSelection(2);
  const pos = editor.state.doc.content.size - 1;
  expect(editor.commands.command(props => requestImageCommand(props, undefined, pos))).toBe(true);
  await Promise.resolve();
  expect(insertImageAssets(editor, requests.mock.calls[0]![0].request, [{ src: "x.png", width: 1, height: 1 }])).toBe(true);
  expect(editor.getText()).toContain("code");
  expect(editor.getText()).toContain("Drop here");
});
