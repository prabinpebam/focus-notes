import type { App, AppState } from "./app.ts";
import type { PlatformBridge, ProjectEntry } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectOpen(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"];
  bridge: PlatformBridge; catalog: MessageCatalog; load: (path: string) => Promise<void>;
}) {
  const { store, commands, viewModels, bridge } = ctx;
  const state = { open: false, full: false, query: "", active: "", pending: false, error: "", entries: [] as ProjectEntry[] };
  const changed = () => store.update((s) => ({ ...s }));
  const close = () => { state.open = false; changed(); };
  async function refresh(full = false) {
    state.open = true; state.full = full; state.pending = true; state.error = ""; changed();
    try { state.entries = await bridge.projects!.list(); }
    catch { state.error = ctx.catalog.format("project.open.failed"); }
    finally { state.pending = false; changed(); }
  }
  commands.register({ id: "projects.open", title: "project.open.button", icon: "open", group: "app", layer: "basic", shortcut: { default: "Ctrl+Alt+O", macos: "Mod+Alt+O" }, enabled: () => Boolean(bridge.projects), run: () => refresh(!store.state.note.path) });
  commands.register({ id: "projects.close", title: "project.cancel", run: close });
  commands.register<{value: string}>({ id: "projects.query", title: "project.open.search", run: ({value}) => { state.query = value; changed(); } });
  commands.register<{id: string}>({ id: "projects.active", title: "recent.title", run: ({id}) => { state.active = id; changed(); } });
  bridge.projects?.onNote?.((path) => { void ctx.load(path); });
  store.subscribe(() => { if (state.open && state.full && store.state.note.path && store.state.note.status === "ready") close(); });
  commands.register<{id: string}>({
    id: "projects.launch", title: "project.open", run: async ({ id }) => {
      const [entryId, kind] = id.split("|");
      const entry = state.entries.find((e) => e.folder === entryId);
      if (!entry) throw new Error("Unknown project");
      state.pending = true; state.error = ""; changed();
      try {
        if (entry.folder === store.state.workspace.folder) {
          if (kind === "note" && entry.lastNote) await ctx.load(entry.lastNote);
        } else await bridge.projects!.open(entry.folder, kind === "note" ? entry.lastNote : undefined);
        close();
      } catch { state.error = ctx.catalog.format("project.open.failed"); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register({
    id: "projects.choose", title: "project.openProject", run: async () => {
      try {
        const folder = await bridge.projects!.choose();
        if (!folder) return;
        await bridge.projects!.open(folder);
        close();
      } catch { state.error = ctx.catalog.format("project.open.failed"); changed(); }
    },
  });
  const text = { type: "string" as const };
  const item = { type: "object" as const, properties: { id: text, label: text, description: text, icon: text } };
  viewModels.register({
    id: "vm.projects", reads: "*", setters: { query: "projects.query" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, full: { type: "boolean" }, dialog: { type: "boolean" }, pending: { type: "boolean" }, error: text, query: text, active: text,
      recent: { type: "array", items: item },
      entries: { type: "array", items: { type: "object", properties: { id: text, name: text, folder: text, accent: text, logo: text, logoSrc: text } } },
    } },
    select: (s: AppState) => {
      const entries = state.entries.filter((e) => `${e.name} ${e.folder} ${e.lastNote ?? ""}`.toLowerCase().includes(state.query.toLowerCase()));
      return { ...state, dialog: state.open && !state.full, entries: entries.map((e) => ({ ...e, id: e.folder })),
        recent: entries.filter((e) => e.folder !== s.workspace.folder && e.lastNote).map((e) => ({
          id: `${e.folder}|note`, label: e.lastNote!.split(/[\\/]/).at(-1)!.replace(/\.(md|markdown)$/i, ""), description: e.name, icon: "newNote",
        })),
      };
    },
  });
  return { start: () => refresh(true) };
}
