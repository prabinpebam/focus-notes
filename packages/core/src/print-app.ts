/**
 * Print (SHR-12, D-230): the open note on paper, through the system's own print dialog, which keeps
 * the printer, paper, orientation, copies, pages and Save as PDF. The app lays the note out for paper
 * first: its blocks read-only on the Paper palette whatever the theme on screen, its title as the
 * job's name, page numbers (`n / N`, bottom center) only when turned on (D-231), and pages that never break after
 * a heading or inside a table row, a list item or a quote's paragraph. A line with only a page
 * break (`<!-- pagebreak -->`, or `<div style="page-break-after: always"></div>` as Typora and
 * Obsidian write it) starts a new page.
 */
import { parseMarkdown, type PMNode } from "@focus-notes/markdown";
import type { AppState, ToastState } from "./app.ts";
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { BLOCK_LIST_SCHEMA } from "./public-page.ts";
import { titleOrName } from "./history.ts";

export const PRINT_NOTE = "note.print";
export const PRINT_PAGE_NUMBERS = "print.pageNumbers";
/** The block a page break becomes on paper (NoteContent's PageBreak). */
export const PAGE_BREAK = "pageBreak";

export interface PrintUiState {
  /** The note is laid out for paper while the system's print dialog is open. */
  open: boolean;
  blocks: PMNode[];
}
export const PRINT_CLOSED: PrintUiState = { open: false, blocks: [] };

/**
 * A raw block that only breaks the page: an empty `div` (or `p`, `span`, `br`) whose style is
 * `page-break-before|after: always` or `break-before|after: page`, or the `<!-- pagebreak -->` comment.
 */
const BREAK_STYLE = /^(?:page-)?break-(?:before|after)\s*:\s*(?:always|page)\s*;?\s*$/i;
export function isPageBreak(source: string): boolean {
  const s = source.trim();
  if (/^<!--\s*page-?break\s*-->$/i.test(s)) return true;
  const m = /^<(div|p|span|br)\s+style\s*=\s*(["'])([^"']*)\2\s*\/?>(?:\s*<\/\1>)?$/i.exec(s);
  return Boolean(m && BREAK_STYLE.test(m[3]!.trim()));
}

/** The note's blocks for paper: front matter is the note's data, not its text, and page breaks break pages. */
export function printBlocks(markdown: string): PMNode[] {
  const blocks = [...(parseMarkdown(markdown).doc.content ?? [])];
  const first = blocks[0];
  if (first?.type === "rawMarkdown" && /^---\r?\n/.test(String(first.attrs?.source ?? ""))) blocks.shift();
  return blocks.map((b) => (b.type === "rawMarkdown" && isPageBreak(String(b.attrs?.source ?? "")) ? { type: PAGE_BREAK } : b));
}

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  tracker: TaskTracker;
  toast: (message: string, opts?: { tone?: ToastState["tone"] }) => number;
  /** Hands over text the editor hasn't sent yet, so what prints is what's on screen. */
  handOver: () => void;
  afterPaint: (fn: () => void) => void;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
}

export function registerPrint(ctx: Ctx): void {
  const { store, commands, viewModels, catalog, bridge, tracker } = ctx;
  const set = (print: PrintUiState) => store.update((s) => ({ ...s, ui: { ...s.ui, print } }));
  let printing = false;

  commands.register({
    id: PRINT_NOTE, title: "command.note.print", icon: "print", group: "app",
    enabled: (s) => Boolean(bridge.print) && s.note.status === "ready" && !s.ui.print.open,
    disabledReason: (s) => (!bridge.print ? "command.note.print.unavailable" : "command.note.print.notReady"),
    run: async () => {
      if (printing || !bridge.print) return;
      printing = true;
      try {
        ctx.handOver();
        const { markdown, path } = store.state.note;
        const title = titleOrName(markdown, path ?? "");
        // Laying the note out for paper is the app's wait; the dialog after it is the person's own time.
        await tracker.run("note.print", "task.printPreparing", async () => {
          set({ open: true, blocks: printBlocks(markdown) });
          await new Promise<void>((done) => ctx.afterPaint(done));
        });
        await bridge.print({ title });
      } catch {
        ctx.toast(catalog.format("toast.printFailed"), { tone: "error" });
      } finally {
        set(PRINT_CLOSED);
        printing = false;
      }
    },
  });

  // Page numbers are off until asked for (D-231), as in Typora, Craft and Ulysses; kept on this device.
  commands.register({
    id: PRINT_PAGE_NUMBERS, title: "command.print.pageNumbers", icon: "numberedList", group: "app",
    enabled: () => Boolean(bridge.print),
    disabledReason: "command.note.print.unavailable",
    checked: (s) => s.printPageNumbers,
    run: async (_a, c) => {
      const on = !c.state.printPageNumbers;
      c.update((s) => ({ ...s, printPageNumbers: on }));
      await ctx.persistAppState({ printPageNumbers: on ? true : undefined });
    },
  });

  viewModels.register({
    id: "vm.print",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean", description: "The note is laid out for paper (the system's print dialog is open)." },
        blocks: { ...BLOCK_LIST_SCHEMA, description: "The note's blocks for paper: no front matter, page breaks as pageBreak blocks." },
        pageNumbers: { type: "boolean", description: "Each page carries its number and the count (D-231)." },
      },
    },
    reads: ["ui.print", "printPageNumbers"],
    select: (s) => ({ open: s.ui.print.open, blocks: s.ui.print.blocks, pageNumbers: s.printPageNumbers }),
  });
}
