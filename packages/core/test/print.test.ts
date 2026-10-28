/**
 * Print (SHR-12, D-230): the open note goes to the system's print dialog, laid out for paper first:
 * its blocks without front matter, page breaks as their own blocks, and the note's title as the job's
 * name. It's in the ⋯ menu's Note group, the command list and the macOS File menu; without a print
 * bridge, or before a note is open, it's disabled with a plain reason. A failed print says so.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, MORE_MENU, MENU_BAR, type AppStateFile, type PlatformBridge } from "../src/index.ts";
import { isPageBreak, printBlocks, PAGE_BREAK } from "../src/print-app.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const NOTE = "C:\\notes\\Trip.md";

function desktop(print?: PlatformBridge["print"]) {
  let state: AppStateFile = { version: 1, lastNotePath: NOTE };
  const files: Record<string, string> = { [NOTE]: "---\nid: 7\n---\n# Trip to Lisbon\n\nDay one.\n\n<!-- pagebreak -->\n\nDay two.\n" };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files).writeNote,
    chooseNote: async () => undefined, newNotePath: async () => "C:\\notes\\untitled.md",
    defaultNotePath: async () => NOTE,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    ...(print ? { print } : {}),
  };
  return bridge;
}

async function started(print?: PlatformBridge["print"]) {
  const app = createApp(desktop(print), messages);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.note.status).toBe("ready"));
  return app;
}

describe("isPageBreak", () => {
  it("knows the page breaks Markdown editors write", () => {
    for (const s of [
      "<!-- pagebreak -->", "<!--page-break-->", '<div style="page-break-after: always;"></div>', "<div style='page-break-before:always'></div>",
      '<div style="break-after: page"></div>', '<p style="page-break-after: always"></p>', '<br style="page-break-before: always" />',
    ]) expect(isPageBreak(s), s).toBe(true);
  });
  it("leaves any other HTML alone", () => {
    for (const s of ["<!-- note to self -->", '<div style="color: red"></div>', '<div style="page-break-after: always">Text</div>', "<div></div>", "\\pagebreak"])
      expect(isPageBreak(s), s).toBe(false);
  });
});

describe("printBlocks", () => {
  it("drops front matter and turns page breaks into their own blocks", () => {
    const blocks = printBlocks("---\nid: 7\n---\n# Title\n\nOne.\n\n<!-- pagebreak -->\n\nTwo.\n");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", PAGE_BREAK, "paragraph"]);
  });
  it("keeps a rule, and raw HTML that isn't a page break, as they are", () => {
    expect(printBlocks("One.\n\n***\n\n<!-- aside -->\n").map((b) => b.type)).toEqual(["paragraph", "horizontalRule", "rawMarkdown"]);
  });
});

describe("Print (SHR-12)", () => {
  it("is in the ⋯ menu's Note group, after the note's history, and in the macOS File menu", () => {
    expect(MORE_MENU.find((g) => g.id === "note")!.items.at(-1)).toBe("note.print");
    const file = MENU_BAR.find((m) => m.id === "file");
    expect(file?.items).toContain("note.print");
  });

  it("lays the note out for paper, prints it under its title, then puts the layout away", async () => {
    let seen: { open: boolean; types: string[] } | undefined;
    const print = vi.fn(async () => {
      seen = { open: app.store.state.ui.print.open, types: app.store.state.ui.print.blocks.map((b) => b.type) };
    });
    const app = await started(print);
    expect(app.commands.describe("note.print")).toMatchObject({ enabled: true, title: "command.note.print" });
    await app.commands.run("note.print");
    expect(print).toHaveBeenCalledWith({ title: "Trip to Lisbon" });
    expect(seen).toEqual({ open: true, types: ["heading", "paragraph", PAGE_BREAK, "paragraph"] });
    expect(app.store.state.ui.print.open).toBe(false);
    expect(app.viewModels.select("vm.print", app.store.state)).toEqual({ open: false, blocks: [] });
  });

  it("says when printing failed, and puts the layout away", async () => {
    const app = await started(async () => { throw new Error("The printer is offline"); });
    await app.commands.run("note.print");
    expect(app.store.state.ui.toasts.at(-1)).toMatchObject({ message: messages["toast.printFailed"], tone: "error" });
    expect(app.store.state.ui.print.open).toBe(false);
  });

  it("is disabled where there's no printing, saying why in plain words", async () => {
    const app = await started();
    const d = app.commands.describe("note.print");
    expect(d.enabled).toBe(false);
    expect(messages[d.disabledReason!]).toBe("Printing isn't available here");
  });
});
