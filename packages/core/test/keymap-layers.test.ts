/**
 * KEY-03: the Basic, Writer, and Power layers are complete. Every row of those layers in
 * Keyboard shortcuts is bound to a registered command with that layer, left to the platform or a
 * native text key, or explicitly planned for a later work package (D-115).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, NATIVE_KEYS, type KeyLayer, type PlatformBridge } from "../src/index.ts";

type Cover = string[] | { planned: string } | { system: string };

/** Each documented row, by its Action text (links reduced to their text), and what covers it. */
const COVERAGE: Record<string, Cover> = {
  // App and window
  "Open Spotlight": ["spotlight.open"],
  "Spotlight: commands only": ["spotlight.commands"],
  "Quick open a note": ["spotlight.quickOpen"],
  "Open… (Files panel)": ["note.open"],
  "New note": ["note.new"],
  "New window (desktop)": { planned: "WP-8.5 (multiple windows)" },
  "Save to cloud (write, commit, push)": ["sync.now", "note.save"],
  "Close note / window": { planned: "WP-8.5 (notes in their own windows); Alt+F4 and the macOS menu bar's Close until then" },
  "Reopen closed note": { planned: "WP-8.5 (closing a note)" },
  "Back / forward between notes": ["note.back", "note.forward"],
  "Open the trigger toolbar": ["toolbar.toggle"],
  "Settings": ["settings.open"],
  "Keyboard shortcut cheat sheet": ["shortcuts.open"],
  "Toggle focus mode": ["focus.toggle"],
  "Toggle light / dark": ["appearance.toggle"],
  "Larger / smaller / reset font size": ["font.larger", "font.smaller", "font.reset"],
  "Full screen": ["window.fullScreen"],
  "Minimize": { system: "the OS (⌘M, Win+↓)" },
  "Window menu: Restore, Move, Size, Minimize, Maximize, Snap left and right, Close": { system: "the desktop shell's Alt+Space (D-104)" },
  "Hide app": { system: "macOS" },
  "Cycle windows": { system: "macOS (⌘`)" },
  "Quit": { system: "the OS" },
  // Everyday editing
  "Undo / redo": ["edit.undo", "edit.redo"],
  "Cut / copy / paste": ["keys.cutCopyPaste"],
  "Go to the start / end of the note": ["edit.docStart", "edit.docEnd"],
  "Paste as plain text": ["keys.pastePlain"],
  "Select all (once: the block; twice: the note)": ["keys.selectAll"],
  // Inline formatting
  "Bold": ["format.bold"],
  "Italic": ["format.italic"],
  "Strikethrough": ["format.strike"],
  "Inline code": ["format.code"],
  "Add or edit link": ["link.edit"],
  "Clear formatting": ["format.clear"],
  "Move focus into the formatting toolbar": ["format.focusToolbar"],
  "Leave the formatting toolbar, back to the text with the selection kept": ["format.exitToolbar"],
  "Close the link editor, keeping the selection": ["link.cancel"],
  "Underline": ["format.underline"],
  // Blocks
  "Insert block menu": ["keys.slashMenu"],
  "Turn into paragraph": ["block.paragraph"],
  "Turn into heading 1 / 2 / 3": ["block.heading1", "block.heading2", "block.heading3"],
  "Bulleted / numbered / task list": ["block.bulletList", "block.orderedList", "block.taskList"],
  "Quote": ["block.quote"],
  "Code block": ["block.codeBlock"],
  "Check / uncheck a task": ["task.toggle"],
  "Indent / outdent list item": ["keys.indent"],
  "Line break within a block": ["keys.lineBreak"],
  "Move block up / down": ["block.moveUp", "block.moveDown"],
  "Duplicate block": ["block.duplicate"],
  "Delete block": ["block.delete"],
  "Go to heading in this note": ["spotlight.headings"],
  // Tables
  "Next / previous cell (Tab in the last cell adds a row)": ["table.nextCell", "table.prevCell"],
  "Cell below / above (Enter in the last row leaves the table onto a new line)": ["table.cellBelow", "table.cellAbove"],
  "Add row below / above": ["table.addRowBelow", "table.addRowAbove"],
  "Move row up / down": ["table.moveRowUp", "table.moveRowDown"],
  "Delete row": ["table.deleteRow"],
  // Find and replace
  "Find in note": ["find.open"],
  "Next / previous match": ["find.next", "find.prev", "find.nextInField", "find.prevInField"],
  "Replace in note": ["find.replace"],
  "Replace current (in the replace field)": ["find.replaceNext"],
  "Replace all": ["find.replaceAll"],
  "Find in all notes": ["find.allNotes"],
  "Close the find bar": ["find.close"],
  // Spotlight
  "Move through results": ["spotlight.next", "spotlight.prev"],
  "Run the default action": ["spotlight.run"],
  "Alternative action (for example, open in a new window)": ["spotlight.runAlt"],
  "Show the actions for the selected result": ["spotlight.actions", "spotlight.actionsRight"],
  "Back out of the action list": ["spotlight.back"],
  "Back to All from another mode, in an empty field": ["spotlight.all"],
  "Close": { system: "the Spotlight dialog's own Esc (packages/ui Dialog)" },
  // Files panel
  "Move / expand / collapse": { system: "the Files tree's arrow keys (packages/ui Tree)" },
  "Open": ["files.openItem"],
  "Rename": ["files.rename"],
  "Jump to an item by typing its name": { system: "the Files tree's type-ahead (packages/ui Tree)" },
  "Select a range / add or remove one": { system: "the Files tree's selection keys (packages/ui Tree)" },
  "Select everything shown": ["files.selectAll"],
  "New note in this folder / new folder": ["note.new", "files.newFolder"],
  "Delete (with confirmation and Undo)": ["files.delete"],
  "Move: cut, then paste in the destination": { planned: "the Files panel's cut and paste (Files → What's built); Move to… covers it" },
  "Move to… picker": ["files.moveTo"],
  "Show the current note in the panel": ["files.reveal"],
};

const LAYERS: Record<string, KeyLayer> = { Basic: "basic", Writer: "writer", Power: "power" };

/** The doc's Basic, Writer, and Power rows: [action, layer]. Pro rows and P1 rows aren't KEY-03's. */
function documentedRows(): [string, KeyLayer][] {
  const md = readFileSync(new URL("../../../documentations/experience/keyboard-shortcuts.md", import.meta.url), "utf8");
  const rows: [string, KeyLayer][] = [];
  let layerAt = -1;
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      layerAt = -1;
      continue;
    }
    const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
    if (cells.includes("Layer") && cells[0] === "Action") {
      layerAt = cells.indexOf("Layer");
      continue;
    }
    const layer = LAYERS[cells[layerAt] ?? ""];
    if (layerAt < 0 || !layer) continue;
    const action = cells[0]!.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<kbd>([^<]*)<\/kbd>/g, "$1");
    rows.push([action, layer]);
  }
  return rows;
}

function app(overrides: Partial<PlatformBridge> = {}) {
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => "",
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
  return createApp(bridge, en);
}

describe("the Basic, Writer, and Power layers are complete (KEY-03)", () => {
  const rows = documentedRows();
  const { commands } = app();
  const bound = new Map(commands.bindings("windows").map((b) => [b.id, b] as const));
  const native = new Map(NATIVE_KEYS.map((k) => [k.id, k] as const));

  it("reads every layered table in the doc", () => {
    expect(rows.length).toBeGreaterThan(75);
    expect(rows.filter(([, l]) => l === "power").length).toBeGreaterThan(25);
  });
  it("covers every documented row, and lists no row the doc doesn't have", () => {
    const documented = new Set(rows.map(([a]) => a));
    expect([...documented].filter((a) => !(a in COVERAGE)), "rows with no coverage").toEqual([]);
    expect(Object.keys(COVERAGE).filter((a) => !documented.has(a)), "coverage for rows not in the doc").toEqual([]);
  });
  for (const [action, layer] of rows) {
    const cover = COVERAGE[action];
    if (!Array.isArray(cover)) continue;
    it(`${layer}: ${action}`, () => {
      for (const id of cover) {
        // Settings is planned in shells with no account, like this one; the desktop binds it.
        if (id === "settings.open") {
          expect(commands.shortcut(id)?.default).toBe("Mod+,");
          continue;
        }
        const b = bound.get(id) ?? native.get(id);
        expect(b, `${id} has keys`).toBeDefined();
        // A row's commands sit in its layer; the Files panel's New note is the app's New note (Basic).
        if (id !== "note.new") expect(b!.layer, id).toBe(layer);
      }
    });
  }
  it("Spotlight lists every Power command it can run (it lists registered commands with their keys)", () => {
    for (const [action, layer] of rows) {
      const cover = COVERAGE[action];
      if (layer !== "power" || !Array.isArray(cover)) continue;
      for (const id of cover) expect(commands.has(id), id).toBe(true);
    }
  });
});

describe("back and forward between notes (KEY-03, Power)", () => {
  it("steps along the notes opened, and opening a note drops the ones ahead", async () => {
    const picks = ["/n/a.md", "/n/b.md", "/n/c.md"];
    const a = app({ chooseNote: async () => picks.shift() });
    await a.start();
    const path = () => a.store.state.note.path;
    const first = path();
    await a.commands.run("note.open");
    await a.commands.run("note.open");
    expect(path()).toBe("/n/b.md");
    expect(a.commands.describe("note.forward").enabled).toBe(false);
    await a.commands.run("note.back");
    expect(path()).toBe("/n/a.md");
    await a.commands.run("note.back");
    expect(path()).toBe(first);
    expect(a.commands.describe("note.back")).toMatchObject({ enabled: false, disabledReason: "command.note.back.none" });
    await a.commands.run("note.forward");
    expect(path()).toBe("/n/a.md");
    await a.commands.run("note.open");
    expect(path()).toBe("/n/c.md");
    expect(a.commands.describe("note.forward").enabled).toBe(false);
    await a.commands.run("note.back");
    expect(path()).toBe("/n/a.md");
  });
  it("binds Alt+←/→ on Windows and ⌘[ / ⌘] on macOS", () => {
    const { commands } = app();
    expect(commands.match({ key: "ArrowLeft", code: "ArrowLeft", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe("note.back");
    expect(commands.shortcut("note.forward")).toMatchObject({ macos: "Mod+]", default: "Alt+Right" });
  });
});

describe("Underline (KEY-03, Basic)", () => {
  it("says once that Markdown has no underline", async () => {
    const a = app();
    await a.start();
    await a.commands.run("format.underline");
    expect(a.store.state.ui.toasts.at(-1)?.message).toMatch(/no underline/);
    await a.commands.run("format.underline");
    expect(a.store.state.ui.toasts).toHaveLength(1);
  });
});