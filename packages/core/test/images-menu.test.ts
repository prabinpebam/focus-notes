/**
 * The image menus (IMG-11, D-334, D-pending): one image, several images, and text with images.
 * The menu shows what the selection offers: the text's own items, then the images' options.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";
import { textMenuEntries, type TextMenuParams } from "../src/text-menu.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
type Item = { id: string; label: string; checked?: boolean; mixed?: boolean; disabled?: boolean };
type Section = { id: string; label?: string; items: Item[] };

async function started(platform: "windows" | "macos" = "windows") {
  let open: (m: unknown) => void = () => {};
  const chosen: [number, string][] = [];
  const closed: number[] = [];
  const bridge: PlatformBridge = {
    platform, readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/My notes.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    textMenu: { drawn: platform !== "macos", onOpen: (l) => ((open = l), () => {}), choose: (id, item) => chosen.push([id, item]), closed: (id) => closed.push(id), onRun: () => () => {} },
  };
  const app = createApp(bridge, messages);
  await app.start();
  const actions: [string, Record<string, unknown> | undefined][] = [];
  app.onEditorAction((id, args) => actions.push([id, args]));
  const images = () => (app.viewModels.select("vm.images", app.store.state) as { menu: Section[] }).menu;
  const textMenu = () => (app.viewModels.select("vm.textMenu", app.store.state) as { sections: Section[]; request: number }).sections;
  const select = (p: Partial<{ pos: number; src: string; alt: string; rounded: boolean; fitHeight: boolean; mode: string; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean; text: boolean; announce: boolean }>) =>
    app.commands.run("image.select", { pos: 5, src: "red.png", alt: "Red square", rounded: false, fitHeight: true, mode: "column", width: 0, height: 0, from: 5, to: 6, count: 1, roundMixed: false, limitMixed: false, ...p });
  return { app, images, textMenu, select, actions, chosen, closed, open: (m: unknown) => open(m) };
}
const params: TextMenuParams = { isEditable: true, misspelledWord: "", dictionarySuggestions: [], selectionText: "Middle words", menuSourceType: "mouse", linkURL: "", editFlags: { canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true } };
const textEntries = textMenuEntries(params, { platform: "windows" });
const shape = (sections: Section[]) => sections.map((s) => ({ id: s.id, ...(s.label ? { label: s.label } : {}), items: s.items.map((i) => `${i.label}${i.mixed ? " (mixed)" : i.checked === true ? " (on)" : i.checked === false ? " (off)" : ""}`) }));

describe("one image's menu", () => {
  it("shows Edit image, the Display choices, then Rounded corners and Limit height as on/off items in their own group, as the approved mock does", async () => {
    const t = await started();
    await t.select({});
    expect(shape(t.images())).toEqual([
      { id: "pixels", items: ["Edit image"] },
      { id: "mode", label: "Display", items: ["Column (on)", "Wide (off)", "Actual size (off)"] },
      { id: "look", items: ["Rounded corners (off)", "Limit height (on)"] },
    ]);
  });

  it("turns Rounded corners on as one editor change to that image, shows it checked, and says so", async () => {
    const t = await started();
    await t.select({ pos: 12, from: 12, to: 13 });
    await t.app.commands.run("image.rounded");
    expect(t.actions).toEqual([["image.set", { pos: 12, src: "red.png", from: 12, to: 13, rounded: true }]]);
    expect(shape(t.images())[2]).toEqual({ id: "look", items: ["Rounded corners (on)", "Limit height (on)"] });
    expect(t.app.store.state.announcement.text).toBe("Rounded corners on");
    await t.app.commands.run("image.fitHeight");
    expect(t.actions[1]).toEqual(["image.set", { pos: 12, src: "red.png", from: 12, to: 13, fitHeight: false }]);
    expect(shape(t.images())[2]).toEqual({ id: "look", items: ["Rounded corners (on)", "Limit height (off)"] });
    expect(t.app.store.state.announcement.text).toBe("Limit height off");
  });

  it("says which image is selected, by its description", async () => {
    const t = await started();
    await t.select({ announce: true });
    expect(t.app.store.state.announcement.text).toBe("Image selected: Red square");
    await t.select({ announce: true, alt: "" });
    expect(t.app.store.state.announcement.text).toBe("Image selected");
  });
});

describe("several images selected", () => {
  it("shows only Rounded corners and Limit height under Images · 2 selected, with a mixed state where the images differ", async () => {
    const t = await started();
    await t.select({ count: 2, rounded: false, roundMixed: true, fitHeight: true, from: 0, to: 40 });
    expect(shape(t.images())).toEqual([{ id: "images", label: "Images · 2 selected", items: ["Rounded corners (mixed)", "Limit height (on)"] }]);
  });

  it("turns a mixed option on for every selected image first, in one change", async () => {
    const t = await started();
    await t.select({ count: 3, rounded: false, roundMixed: true, from: 0, to: 40 });
    await t.app.commands.run("image.rounded");
    expect(t.actions).toEqual([["image.set", { pos: 5, src: "red.png", from: 0, to: 40, rounded: true }]]);
    expect(shape(t.images())).toEqual([{ id: "images", label: "Images · 3 selected", items: ["Rounded corners (on)", "Limit height (on)"] }]);
  });
});

describe("text and images selected together", () => {
  it("shows the text's own items, then the images' options, and runs an image option as one editor change", async () => {
    const t = await started();
    await t.select({ text: true, count: 2, rounded: false, roundMixed: true, fitHeight: false, from: 1, to: 60 });
    t.open({ id: 7, x: 10, y: 20, entries: textEntries });
    const sections = t.textMenu();
    expect(sections.flatMap((s) => s.items).map((i) => i.label)).toEqual(["Rewrite…", "Undo", "Redo", "Cut", "Copy", "Paste", "Paste as plain text", "Delete", "Select all", "Emoji", "Rounded corners", "Limit height"]);
    expect(shape(sections).at(-1)).toEqual({ id: "images", label: "Images · 2 selected", items: ["Rounded corners (mixed)", "Limit height (off)"] });
    await t.app.commands.run("textMenu.choose", { id: "image.fitHeight" });
    expect(t.actions).toContainEqual(["image.set", { pos: 5, src: "red.png", from: 1, to: 60, fitHeight: true }]);
    // The image option is the page's own: the shell forgets its menu and acts on nothing.
    expect(t.chosen).toEqual([]);
    expect(t.closed).toEqual([7]);
  });

  it("names one image in the selection Image", async () => {
    const t = await started();
    await t.select({ text: true, count: 1, rounded: true });
    t.open({ id: 8, x: 0, y: 0, entries: textEntries });
    expect(shape(t.textMenu()).at(-1)).toEqual({ id: "images", label: "Image", items: ["Rounded corners (on)", "Limit height (on)"] });
  });

  it("leaves the text menu as it was when the selection has no images", async () => {
    const t = await started();
    await t.select({ text: true, count: 0, pos: -1, src: "" });
    t.open({ id: 9, x: 0, y: 0, entries: textEntries });
    expect(t.textMenu().flatMap((s) => s.items).map((i) => i.id)).toEqual(["rewrite", "undo", "redo", "cut", "copy", "paste", "pasteAsPlainText", "delete", "selectAll", "emoji"]);
    await t.app.commands.run("textMenu.choose", { id: "image.rounded" });
    expect(t.actions.filter(([id]) => id === "image.set")).toEqual([]);
  });

  it("doesn't add an image picked on its own to a later text menu", async () => {
    const t = await started();
    await t.select({ count: 1 });
    t.open({ id: 10, x: 0, y: 0, entries: textEntries });
    expect(t.textMenu().some((s) => s.id === "images")).toBe(false);
  });
});
