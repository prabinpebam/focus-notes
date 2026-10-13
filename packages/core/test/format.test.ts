/**
 * EDT-12, EDT-13, UI-06: the formatting toolbar's state and keys, the link editor's commands, and
 * opening links through the shell only for web addresses.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, normalizeLink, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "views", "messages", "en.json"), "utf8")) as Record<string, string>;

function setup(overrides: Partial<PlatformBridge> = {}) {
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "Hello\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...overrides,
  };
  const app = createApp(bridge, messages);
  const actions: [string, Record<string, unknown> | undefined][] = [];
  app.onEditorAction((id, args) => actions.push([id, args]));
  const vm = () => app.viewModels.select("vm.format", app.store.state) as Record<string, any>;
  return { app, actions, vm };
}
const SELECTED = { toolbar: true, card: false, bold: "on", italic: "mixed", strike: "off", code: "off", block: "block.heading2", codeBlock: false, inlineCode: false, oneBlock: true, href: "" };

describe("link addresses (EDT-13)", () => {
  it("accepts web addresses and mail, adds https to bare domains, and refuses everything else", () => {
    expect(normalizeLink(" https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
    expect(normalizeLink("http://example.com")).toBe("http://example.com");
    expect(normalizeLink("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(normalizeLink("example.com/guide")).toBe("https://example.com/guide");
    expect(normalizeLink("me@example.com")).toBe("mailto:me@example.com");
    for (const bad of ["", "   ", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "not a link", "https://"]) expect(normalizeLink(bad)).toBeUndefined();
  });
});

describe("the formatting toolbar (EDT-12, UI-06)", () => {
  it("shows only while the editor reports a selection, with each mark's state and the block type", async () => {
    const { app, vm } = setup();
    await app.start();
    expect(vm().toolbar).toBe(false);
    await app.commands.run("format.setState", SELECTED);
    expect(vm()).toMatchObject({
      toolbar: true, card: false, showMarks: true, showCode: true, showLink: true, linkEnabled: true,
      blockLabel: "Heading 2", turnIntoLabel: "Turn into: Heading 2",
      bold: { pressed: true, mixed: false, label: "Bold", shortcut: "Ctrl+B" },
      italic: { pressed: false, mixed: true },
    });
    const items = vm().turnInto[0].items as { id: string; label: string; checked: boolean; shortcut: string }[];
    expect(items.map((i) => i.label)).toEqual(["Text", "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list", "To-do list", "Quote", "Code block"]);
    expect(items.find((i) => i.checked)?.id).toBe("block.heading2");
    expect(items[0]!.shortcut).toBe("Ctrl+Alt+0");
    await app.commands.run("format.setState", { ...SELECTED, toolbar: false });
    expect(vm().toolbar).toBe(false);
  });

  it("offers only what Markdown can hold: no marks or link in code, only Code in inline code, no link across blocks", async () => {
    const { app, vm } = setup();
    await app.start();
    await app.commands.run("format.setState", { ...SELECTED, codeBlock: true, block: "block.codeBlock" });
    expect(vm()).toMatchObject({ showMarks: false, showCode: false, showLink: false });
    await app.commands.run("format.setState", { ...SELECTED, inlineCode: true, code: "on" });
    expect(vm()).toMatchObject({ showMarks: false, showCode: true, showLink: false });
    await app.commands.run("format.setState", { ...SELECTED, oneBlock: false, block: "mixed" });
    expect(vm()).toMatchObject({ showLink: true, linkEnabled: false, blockLabel: "Mixed" });
  });

  it("Alt+F10 moves focus into it, and Esc inside it hands focus back to the note", async () => {
    const { app, vm, actions } = setup();
    await app.start();
    expect(app.commands.match({ key: "F10", code: "F10", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe("format.focusToolbar");
    await app.commands.run("format.setState", SELECTED);
    const before = vm().focusToolbar;
    await app.commands.run("format.focusToolbar");
    expect(vm().focusToolbar).toBe(before + 1);
    expect(app.commands.match({ key: "Escape", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, ["formatToolbar"])).toBe("format.exitToolbar");
    await app.commands.run("format.exitToolbar");
    expect(actions.at(-1)).toEqual(["edit.focus", undefined]);
  });

  it("its keys are in the documented layers", async () => {
    const { app } = setup();
    const b = (id: string) => app.commands.bindings().find((x) => x.id === id);
    expect(b("link.edit")).toMatchObject({ chords: ["Mod+K"], layer: "writer", group: "formatting" });
    expect(b("format.focusToolbar")).toMatchObject({ chords: ["Alt+F10"], layer: "power", group: "formatting" });
  });
});

describe("the link editor and hover card (EDT-13)", () => {
  it("Mod+K asks the editor about the selection, then opens the editor on it", async () => {
    const { app, vm, actions } = setup();
    await app.start();
    expect(app.commands.match({ key: "k", code: "KeyK", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false })).toBe("link.edit");
    await app.commands.run("link.edit");
    expect(actions.at(-1)).toEqual(["link.edit", undefined]);
    await app.commands.run("format.setState", SELECTED);
    await app.commands.run("link.openEditor", { href: "", selected: true });
    expect(vm()).toMatchObject({ toolbar: false, linkOpen: true, url: "", withText: false, hasError: false });
    expect(vm().focusUrl).toBeGreaterThan(0);
  });

  it("refuses an invalid address inline and keeps the editor open", async () => {
    const { app, vm, actions } = setup();
    await app.start();
    await app.commands.run("link.openEditor", { href: "", selected: true });
    await app.commands.run("link.setUrl", { value: "javascript:alert(1)" });
    await app.commands.run("link.apply");
    expect(vm()).toMatchObject({ linkOpen: true, hasError: true, error: "Use a full web address, like https://example.com." });
    expect(actions.some(([id]) => id === "link.apply")).toBe(false);
    // Typing again clears the message.
    await app.commands.run("link.setUrl", { value: "example.com" });
    expect(vm().hasError).toBe(false);
  });

  it("applies a valid address, normalized, with the text for a new link, and closes", async () => {
    const { app, vm, actions } = setup();
    await app.start();
    await app.commands.run("link.openEditor", { href: "", selected: false });
    expect(vm().withText).toBe(true);
    await app.commands.run("link.setUrl", { value: "example.com" });
    await app.commands.run("link.setText", { value: "Example" });
    await app.commands.run("link.apply");
    expect(actions.at(-1)).toEqual(["link.apply", { href: "https://example.com", text: "Example" }]);
    expect(vm().linkOpen).toBe(false);
  });

  it("Esc cancels and puts the caret back with the selection kept", async () => {
    const { app, vm, actions } = setup();
    await app.start();
    await app.commands.run("link.openEditor", { href: "https://a.com", selected: true });
    expect(vm().url).toBe("https://a.com");
    expect(app.commands.match({ key: "Escape", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, ["linkEditor"])).toBe("link.cancel");
    await app.commands.run("link.cancel");
    expect(vm().linkOpen).toBe(false);
    expect(actions.at(-1)).toEqual(["edit.focus", undefined]);
  });

  it("the hover card shows the shortened address, and opens only web links, through the shell", async () => {
    const openLink = vi.fn();
    const copyText = vi.fn(async () => {});
    const { app, vm, actions } = setup({ openLink, copyText });
    await app.start();
    await app.commands.run("format.setState", { ...SELECTED, toolbar: false, card: true, href: "https://www.example.com/a/very/long/path/to/a/page?with=query" });
    expect(vm()).toMatchObject({ card: true, canOpen: true });
    expect(vm().shortHref).toBe("example.com/a/very/long/path/to/a…");
    await app.commands.run("link.open");
    expect(openLink).toHaveBeenCalledWith("https://www.example.com/a/very/long/path/to/a/page?with=query");
    await app.commands.run("link.open", { href: "javascript:alert(1)" });
    await app.commands.run("link.open", { href: "file:///c:/x" });
    expect(openLink).toHaveBeenCalledTimes(1);
    await app.commands.run("link.copy");
    expect(copyText).toHaveBeenCalledWith("https://www.example.com/a/very/long/path/to/a/page?with=query");
    expect(app.store.state.ui.toasts.at(-1)?.message).toBe("Link copied.");
    await app.commands.run("link.remove");
    expect(actions.at(-1)).toEqual(["link.remove", undefined]);
    await app.commands.run("format.setState", { ...SELECTED, toolbar: false, card: true, href: "./Other note.md" });
    expect(vm()).toMatchObject({ canOpen: false });
  });
});
