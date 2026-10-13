/**
 * Bringing browser notes to the desktop (FRE-10, D-90). *Import notes* asks for an export bundle
 * with the system's open dialog, and only the shell reads and checks it. Then the person says where
 * its notes go: **Private**, unless they choose Public. They're added as one batch, which is one
 * commit in that root's repository; nothing here is replaced, and the browser keeps its copies.
 * The desktop's first run (WP-3.2) runs the same command.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { buildTree } from "./workspace.ts";

export interface ImportState {
  open: boolean;
  /** The shell's handle for the bundle it read; the renderer never sees the file. */
  id: string;
  name: string;
  notes: number;
  to: "private" | "public";
  busy: boolean;
}
export const IMPORT_CLOSED: ImportState = { open: false, id: "", name: "", notes: 0, to: "private", busy: false };

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  tracker: TaskTracker;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => number;
  menu: { id: string; label: string; items: (string | { submenu: string; label: string; items: string[] })[] }[];
}

/** Registers the desktop's Import notes. Its command and menu exist only where the shell can import into a workspace. */
export function registerImport(ctx: Ctx): void {
  const { store, commands, viewModels, catalog, bridge, toast } = ctx;
  const ws = bridge.workspace;
  const set = (patch: Partial<ImportState>) => store.update((s) => ({ ...s, ui: { ...s.ui, importNotes: { ...s.ui.importNotes, ...patch } } }));
  const both = (s: AppState) => ["private", "public"].every((id) => s.workspace.tree.roots.some((r) => r.id === id && !r.readOnly));

  if (ws?.chooseBundle && ws.importBundle) commands.register({
    id: "notes.import", title: "command.notes.importHere", icon: "import", group: "files",
    enabled: (s) => s.workspace.access === "write" && both(s),
    run: async () => {
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } }));
      try {
        const chosen = await ws.chooseBundle!();
        if (!chosen) return;
        if (chosen.notes === 0) return void toast(catalog.format("toast.imported", { count: 0, renamed: 0 }));
        set({ open: true, id: chosen.id, name: chosen.name, notes: chosen.notes, to: "private", busy: false });
      } catch (e) {
        // Too large, or not an export: refused before anything is written.
        toast(catalog.format(/tooLarge\s*$/.test(e instanceof Error ? e.message : "") ? "toast.importTooLarge" : "toast.importFailed"), { tone: "error" });
      }
    },
  });
  commands.register<{ value: string }>({
    id: "import.setTo", title: "command.notes.importHere",
    run: ({ value }) => set({ to: value === "public" ? "public" : "private" }),
  });
  commands.register<{ open: boolean }>({
    id: "import.setOpen", title: "command.notes.importHere",
    run: ({ open }) => { if (!open && !store.state.ui.importNotes.busy) set({ ...IMPORT_CLOSED }); },
  });
  commands.register({
    id: "import.confirm", title: "command.notes.importHere",
    run: async () => {
      const i = store.state.ui.importNotes;
      if (!i.open || i.busy || !ws?.importBundle) return;
      set({ busy: true });
      try {
        const r = await ctx.tracker.run("import.confirm", "task.importing", () => ws.importBundle!(i.id, i.to), "task.imported");
        set({ ...IMPORT_CLOSED });
        // The new notes show in Files at once, without waiting for the file watcher.
        const scan = await ws.scan().catch(() => undefined);
        if (scan) store.update((s) => ({ ...s, workspace: { ...s.workspace, tree: buildTree(scan) } }));
        toast(catalog.format(i.to === "public" ? "toast.importedPublic" : "toast.importedPrivate", { count: r.added, renamed: r.renamed }));
      } catch {
        set({ busy: false });
        toast(catalog.format("toast.importNotWritten"), { tone: "error" });
      }
    },
  });
  // The ⋯ menu's Notes group on the desktop: who can see the open note, and Import notes.
  if (ws?.chooseBundle) ctx.menu.push({ id: "notes", label: "menu.notes", items: ["files.makePublic", "files.makePrivate", "notes.import"] });

  viewModels.register({
    id: "vm.import",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, message: { type: "string" }, to: { type: "string" }, hint: { type: "string" }, busy: { type: "boolean" },
        options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
      },
    },
    setters: { to: "import.setTo" },
    reads: ["ui.importNotes"],
    select: (s) => {
      const i = s.ui.importNotes;
      if (!i.open) return { open: false, message: "", to: "private", hint: "", busy: false, options: [] };
      return {
        open: true, to: i.to, busy: i.busy,
        message: catalog.format("import.message", { count: i.notes, name: i.name }),
        // Private by default; Public says who will read them (SHR-01, Files and sharing → Public and private).
        hint: catalog.format(i.to === "public" ? "import.hintPublic" : "import.hintPrivate"),
        options: [{ id: "private", label: catalog.format("files.root.private") }, { id: "public", label: catalog.format("files.root.public") }],
      };
    },
  });
}
