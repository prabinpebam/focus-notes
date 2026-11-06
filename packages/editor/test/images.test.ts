// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { coreExtensions, MarkdownSession, setImageOptions, setImageWords, closeImageTyping, type PMNode } from "../src/index.ts";

const editors: Editor[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });

function open() {
  const markdown = "# Images\n\n![Red](red.png)\n\nWords.\n\n<!-- image: rounded -->\n![Blue](blue.png)\n";
  const session = new MarkdownSession(markdown);
  const editor = new Editor({ extensions: coreExtensions(), content: session.doc as object });
  editors.push(editor);
  const images: { pos: number; src: string }[] = [];
  editor.state.doc.descendants((node, pos) => { if (node.type.name === "image") images.push({ pos, src: String(node.attrs.src) }); });
  const md = () => session.serialize(editor.getJSON() as PMNode);
  return { editor, markdown, md, images };
}

it("keeps immediate consecutive image choices and following typing as separate Undo steps", () => {
  const { editor, md, markdown, images } = open();
  const image = { ...images[0]!, from: images[0]!.pos, to: images[0]!.pos + 1 };
  setImageOptions(editor, image, { rounded: true });
  const rounded = md();
  expect(rounded).toContain("<!-- image: rounded -->\n![Red]");
  setImageOptions(editor, image, { fitHeight: false });
  const unlimited = md();
  expect(unlimited).toContain("<!-- image: rounded unlimited -->\n![Red]");
  editor.commands.setTextSelection(2);
  editor.commands.insertContent("!");
  expect(md()).not.toBe(unlimited);
  editor.commands.undo();
  expect(md()).toBe(unlimited);
  editor.commands.undo();
  expect(md()).toBe(rounded);
  editor.commands.undo();
  expect(md()).toBe(markdown);
});

it("changes all selected images in one step without changing the text, and Undo restores mixed values", () => {
  const { editor, md, markdown, images } = open();
  setImageOptions(editor, { ...images[0]!, from: 0, to: editor.state.doc.content.size }, { rounded: true, fitHeight: false });
  expect(md()).toBe(markdown.replace("![Red]", "<!-- image: rounded unlimited -->\n![Red]").replace("<!-- image: rounded -->", "<!-- image: rounded unlimited -->"));
  editor.commands.undo();
  expect(md()).toBe(markdown);
});

it("Escape leaves the image selection at adjacent text", () => {
  const { editor, images } = open();
  editor.commands.setNodeSelection(images[0]!.pos);
  expect(editor.state.selection.toJSON().type).toBe("node");
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  expect(editor.view.someProp("handleKeyDown", (handle) => handle(editor.view, event))).toBe(true);
  expect(editor.state.selection.toJSON().type).toBe("text");
  expect(editor.state.selection.from).toBeGreaterThan(images[0]!.pos);
});

it("edits alt and caption together as one Undo and preserves other image bytes", () => {
  const { editor, md, markdown, images } = open();
  expect(setImageWords(editor, images[0]!, { alt: 'Red "square"', title: "A red square" })).toBe(true);
  expect(md()).toContain('](red.png "A red square")');
  expect(md()).toContain('<!-- image: rounded -->\n![Blue](blue.png)');
  editor.commands.undo();
  expect(md()).toBe(markdown);
  expect(setImageWords(editor, { ...images[0]!, src: "replaced.png" }, { title: "Wrong image" })).toBe(false);
  expect(md()).toBe(markdown);
});

it("caption typing groups as ordinary editing, clears the title, and restores it with Undo", () => {
  const { editor, md, images } = open();
  setImageWords(editor, images[0]!, { title: "Before" });
  const before = md();
  closeImageTyping(editor);
  setImageWords(editor, images[0]!, { title: "B" }, true);
  setImageWords(editor, images[0]!, { title: null }, true);
  closeImageTyping(editor);
  expect(md()).toContain("![Red](red.png)");
  expect(md()).not.toContain('"Before"');
  editor.commands.undo();
  expect(md()).toBe(before);
});
