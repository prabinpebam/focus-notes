/**
 * Print (SHR-12, D-230): the open note goes to the system's print dialog, laid out for paper first:
 * its blocks without front matter, page breaks as their own blocks, and the note's title as the job's
 * name. It's in the ⋯ menu's Note group, the command list and the macOS File menu; without a print
 * bridge, or before a note is open, it's disabled with a plain reason. A failed print says so.
 * Page numbers are off until turned on beside Print…, and the choice is kept on the device (D-231).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, MORE_MENU, MENU_BAR, type AppStateFile, type PlatformBridge } from "../src/index.ts";
import { isPageBreak, printBlocks, preparePrintBlocks, PAGE_BREAK } from "../src/print-app.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const NOTE = "C:\\notes\\Trip.md";

const saved: { state?: AppStateFile } = {};

function desktop(print?: PlatformBridge["print"], initial: Partial<AppStateFile> = {}) {
  let state: AppStateFile = { version: 1, lastNotePath: NOTE, ...initial };
  const files: Record<string, string> = { [NOTE]: "---\nid: 7\n---\n# Trip to Lisbon\n\nDay one.\n\n<!-- pagebreak -->\n\nDay two.\n" };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files).writeNote,
    chooseNote: async () => undefined, newNotePath: async () => "C:\\notes\\untitled.md",
    defaultNotePath: async () => NOTE,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; saved.state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    ...(print ? { print } : {}),
  };
  return bridge;
}

async function started(print?: PlatformBridge["print"], initial: Partial<AppStateFile> = {}) {
  const app = createApp(desktop(print, initial), messages);
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
  it("prepares local images once per source, preserves their modes/captions and exposes missing descriptions", async () => {
    const blocks = printBlocks('<!-- image: actual unlimited -->\n![A heron](bird.png "At the lake")\n\n![The same heron](bird.png)\n\n![Missing photo](missing.png)\n');
    const read = vi.fn(async (_note: string, src: string) => {
      if (src === "missing.png") throw new Error("missing");
      return "data:image/png;base64,AAAA";
    });
    const prepared = await preparePrintBlocks(blocks, NOTE, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(NOTE, "bird.png");
    expect(prepared[0]?.attrs).toMatchObject({ mode: "actual", fitHeight: false, title: "At the lake", print: true, printSrc: "data:image/png;base64,AAAA" });
    expect(prepared[2]?.attrs).toMatchObject({ alt: "Missing photo", print: true, printSrc: "" });
    expect(blocks[0]?.attrs).not.toHaveProperty("printSrc");
  });
  it("keeps nested images and supplies a printable fallback when a missing image has no description", async () => {
    const blocks = [{ type: "blockquote", content: [{ type: "image", attrs: { src: "missing.png", alt: "" } }] }];
    const prepared = await preparePrintBlocks(blocks, NOTE, undefined, "Image unavailable");
    expect(prepared[0]?.content?.[0]?.attrs).toMatchObject({ printSrc: "", printDescription: "Image unavailable" });
    expect(blocks[0]?.content[0]?.attrs).not.toHaveProperty("print");
  });
});

describe("Print (SHR-12)", () => {
  it("is in the ⋯ menu's Note group, after the note's history, and in the macOS File menu, with page numbers beside it", () => {
    expect(MORE_MENU.find((g) => g.id === "note")!.items.slice(-2)).toEqual(["note.print", "print.pageNumbers"]);
    const items = MENU_BAR.find((m) => m.id === "file")!.items;
    expect(items.indexOf("print.pageNumbers")).toBe(items.indexOf("note.print") + 1);
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
    expect(app.viewModels.select("vm.print", app.store.state)).toEqual({ open: false, blocks: [], pageNumbers: false });
  });

  it("says when printing failed, and puts the layout away", async () => {
    const app = await started(async () => { throw new Error("The printer is offline"); });
    await app.commands.run("note.print");
    expect(app.store.state.ui.toasts.at(-1)).toMatchObject({ message: messages["toast.printFailed"], tone: "error" });
    expect(app.store.state.ui.print.open).toBe(false);
  });

  it("prints without page numbers until they're turned on, and keeps the choice on this device (D-231)", async () => {
    const app = await started(vi.fn(async () => {}));
    expect(app.commands.describe("print.pageNumbers")).toMatchObject({ enabled: true, checked: false, title: "command.print.pageNumbers" });
    expect(messages["command.print.pageNumbers"]).toBe("Page numbers when printing");
    await app.commands.run("print.pageNumbers");
    expect(app.commands.describe("print.pageNumbers").checked).toBe(true);
    expect(app.viewModels.select("vm.print", app.store.state)).toMatchObject({ pageNumbers: true });
    await vi.waitFor(() => expect(saved.state?.printPageNumbers).toBe(true));
    await app.commands.run("print.pageNumbers");
    expect(app.viewModels.select("vm.print", app.store.state)).toMatchObject({ pageNumbers: false });
    await vi.waitFor(() => expect(saved.state?.printPageNumbers).toBeUndefined());
  });

  it("starts with page numbers on when they were left on", async () => {
    const app = await started(vi.fn(async () => {}), { printPageNumbers: true });
    expect(app.commands.describe("print.pageNumbers").checked).toBe(true);
  });

  it("is disabled where there's no printing, saying why in plain words", async () => {
    const app = await started();
    const d = app.commands.describe("note.print");
    expect(d.enabled).toBe(false);
    expect(messages[d.disabledReason!]).toBe("Printing isn't available here");
    expect(app.commands.describe("print.pageNumbers").enabled).toBe(false);
  });

  it("keeps the tracked image-preparation pill until decoding finishes, then prints", async () => {
    let done!: () => void;
    const decode = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
    const print = vi.fn(async () => {});
    const app = createApp({
      ...desktop(print),
      readNote: async () => '# Images\n\n![Heron](bird.png "Lake")\n',
      readImage: async () => "data:image/png;base64,AAAA",
      preparePrintImages: decode,
    }, messages);
    await app.start();
    await vi.waitFor(() => expect(app.store.state.note.status).toBe("ready"));
    const run = app.commands.run("note.print");
    await vi.waitFor(() => expect(decode).toHaveBeenCalled());
    expect(print).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(app.store.state.ui.toasts.at(-1)).toMatchObject({
      message: "Preparing images for print…", tone: "progress", action: { command: "print.cancel" },
    }));
    done();
    await run;
    expect(print).toHaveBeenCalledOnce();
    expect(app.store.state.ui.toasts).toEqual([]);
    expect(app.store.state.ui.print.open).toBe(false);
  });

  it("cancels preparation without printing or changing the note, even if decoding finishes later", async () => {
    let done!: () => void;
    const decode = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
    const print = vi.fn(async () => {});
    const app = createApp({ ...desktop(print), preparePrintImages: decode }, messages);
    await app.start();
    await vi.waitFor(() => expect(app.store.state.note.status).toBe("ready"));
    const markdown = app.store.state.note.markdown;
    const run = app.commands.run("note.print");
    await vi.waitFor(() => expect(decode).toHaveBeenCalled());
    await app.commands.run("print.cancel");
    await run;
    done();
    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
    expect(app.store.state.note.markdown).toBe(markdown);
    expect(app.store.state.ui.print.open).toBe(false);
    expect(app.store.state.ui.toasts).toEqual([]);
  });
});
