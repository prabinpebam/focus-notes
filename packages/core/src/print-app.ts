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
import type { AppState } from "./app.ts";
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { BLOCK_LIST_SCHEMA } from "./public-page.ts";
import { titleOrName } from "./history.ts";
import { opErrorCode } from "./bridge.ts";
import type { NotificationOptions } from "./notifications.ts";

export const PRINT_NOTE = "note.print";
export const PRINT_PAGE_NUMBERS = "print.pageNumbers";
export const PRINT_CANCEL = "print.cancel";
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

/** Only the shell's bounded local image reader supplies print pixels; the Markdown stays untouched. */
export async function preparePrintBlocks(blocks: PMNode[], note: string | null | undefined, read: PlatformBridge["readImage"], missingDescription = ""): Promise<PMNode[]> {
  const images = new Map<string, Promise<string>>();
  const pixels = (src: string): Promise<string> => {
    let pending = images.get(src);
    if (!pending) {
      pending = (async () => {
        if (!read || !note) return "";
        try {
          return await read(note, src);
        } catch (error) {
          console.error("Print image could not be read", opErrorCode(error));
          return "";
        }
      })();
      images.set(src, pending);
    }
    return pending;
  };
  const prepare = async (node: PMNode): Promise<PMNode> => {
    if (node.type === "image") return { ...node, attrs: { ...node.attrs, print: true, printDescription: node.attrs?.alt || missingDescription, printSrc: await pixels(String(node.attrs?.src ?? "")) } };
    return node.content ? { ...node, content: await Promise.all(node.content.map(prepare)) } : node;
  };
  return Promise.all(blocks.map(prepare));
}

const hasImages = (blocks: PMNode[]): boolean => blocks.some(node => node.type === "image" || Boolean(node.content && hasImages(node.content)));

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  tracker: TaskTracker;
  toast: (message: string, opts?: NotificationOptions) => number;
  dismissToast: (id: number) => void;
  /** Hands over text the editor hasn't sent yet, so what prints is what's on screen. */
  handOver: () => void;
  afterPaint: (fn: () => void) => void;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
}

export function registerPrint(ctx: Ctx): void {
  const { store, commands, viewModels, catalog, bridge, tracker } = ctx;
  const set = (print: PrintUiState) => store.update((s) => ({ ...s, ui: { ...s.ui, print } }));
  let printing = false;
  let cancelPreparation: (() => void) | undefined;

  commands.register({
    id: PRINT_NOTE, title: "command.note.print", icon: "print", group: "app",
    enabled: (s) => Boolean(bridge.print) && s.note.status === "ready" && !printing,
    disabledReason: (s) => (!bridge.print ? "command.note.print.unavailable" : "command.note.print.notReady"),
    run: async () => {
      if (printing || !bridge.print) return;
      printing = true;
      let cancelled = false;
      let progress: number | undefined;
      const cancelledWait = new Promise<void>(resolve => {
        cancelPreparation = () => { cancelled = true; resolve(); };
      });
      const stopWatching = store.subscribe(() => {
        const task = store.state.tasks.find(t => t.target === PRINT_NOTE && t.phase === "on");
        if (task && progress === undefined) {
          progress = -1;
          progress = ctx.toast(catalog.format(task.message), {
            tone: "progress", sticky: true, mustReadReason: "operation-control",
            action: { command: PRINT_CANCEL, label: catalog.format("command.print.cancel") },
          });
        }
      });
      const clearProgress = () => {
        stopWatching();
        if (progress !== undefined && progress > 0) ctx.dismissToast(progress);
      };
      try {
        ctx.handOver();
        const { markdown, path } = store.state.note;
        const title = titleOrName(markdown, path ?? "");
        // Laying the note out for paper is the app's wait; the dialog after it is the person's own time.
        const blocks = printBlocks(markdown);
        const prepare = async () => {
          const prepared = await preparePrintBlocks(blocks, path, bridge.readImage, catalog.format("image.print.unavailable"));
          if (cancelled) return;
          set({ open: true, blocks: prepared });
          await new Promise<void>((done) => ctx.afterPaint(done));
          if (!cancelled) await bridge.preparePrintImages?.();
        };
        await tracker.run("note.print", hasImages(blocks) ? "task.printImagesPreparing" : "task.printPreparing",
          () => Promise.race([prepare(), cancelledWait]), undefined, "fn:image.print");
        clearProgress();
        cancelPreparation = undefined;
        if (cancelled) return;
        await bridge.print({ title });
      } catch (error) {
        console.error("Printing failed", opErrorCode(error));
        ctx.toast(catalog.format("toast.printFailed"), { tone: "error" });
      } finally {
        clearProgress();
        cancelPreparation = undefined;
        set(PRINT_CLOSED);
        printing = false;
      }
    },
  });

  commands.register({
    id: PRINT_CANCEL, title: "command.print.cancel", icon: "dismiss", group: "app",
    enabled: () => Boolean(cancelPreparation),
    run: () => cancelPreparation?.(),
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
