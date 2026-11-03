import type { App, AppState } from "./app.ts";
import type { PlatformBridge, ProjectEntry } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectOpen(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"];
  bridge: PlatformBridge; catalog: MessageCatalog; load: (path: string) => Promise<void>;
  flush: () => Promise<boolean>; toast: (message: string) => void;
}) {
  const { store, commands, viewModels, bridge } = ctx;
  const state = { open: false, full: false, query: "", active: "", pending: false, error: "", entries: [] as ProjectEntry[] };
  const localImport = { open: false, pending: false, error: "", targets: [] as {id: string; label: string; description: string}[] };
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
  commands.register({
    id: "projects.newLocal", title: "project.open.newLocal", icon: "quickNote", group: "app", enabled: () => Boolean(bridge.projects),
    run: async () => {
      try { await bridge.projects!.localNote(); close(); }
      catch { state.error = ctx.catalog.format("quick.saveFailed"); changed(); }
    },
  });
  commands.register({
    id: "local.import", title: "quick.import.button", group: "app", icon: "folder", enabled: () => Boolean(bridge.projects?.local && store.state.note.path),
    run: async () => {
      localImport.open = true; localImport.pending = true; localImport.error = ""; changed();
      try {
        const entries = await bridge.projects!.list();
        localImport.targets = entries.filter(e => !e.localNotes).map(e => ({id: e.folder, label: e.name, description: e.folder}));
      } catch { localImport.error = ctx.catalog.format("project.open.failed"); }
      finally { localImport.pending = false; changed(); }
    },
  });
  commands.register({id: "local.importClose", title: "project.cancel", enabled: () => !localImport.pending, run: () => {localImport.open = false; changed();}});
  commands.register<{id: string}>({
    id: "local.copyTo", title: "quick.import.button", enabled: () => !localImport.pending,
    run: async ({id}) => {
      localImport.pending = true; localImport.error = ""; changed();
      try {
        if (!await ctx.flush()) throw new Error("Local note is not saved");
        const path = store.state.note.path;
        if (!path) throw new Error("No local note");
        const copied = await bridge.projects!.importLocal(path, id);
        localImport.open = false;
        ctx.toast(ctx.catalog.format("quick.import.saved", {name: copied.split(/[\\/]/).at(-1) ?? ""}));
      } catch { localImport.error = ctx.catalog.format("quick.import.failed"); }
      finally { localImport.pending = false; changed(); }
    },
  });
  commands.register<{value: string}>({ id: "projects.query", title: "project.open.search", run: ({value}) => { state.query = value; changed(); } });
  commands.register<{id: string}>({ id: "projects.active", title: "recent.title", run: ({id}) => { state.active = id; changed(); } });
  bridge.projects?.onNote?.((path) => { void ctx.load(path); });
  store.subscribe(() => { if (state.open && state.full && store.state.note.path && store.state.note.status === "ready") close(); });
  commands.register<{id: string}>({
    id: "projects.launch", title: "project.open", run: async ({ id }) => {
      const [entryId, kind] = id.split("|");
      const entry = state.entries.find((e) => e.folder === entryId);
      if (!entry) throw new Error("Unknown project");
      const note = kind === "note" ? entry.lastNote : kind;
      if (note && note !== entry.lastNote && !entry.recent?.some(n => n.path === note)) throw new Error("Unknown recent note");
      state.pending = true; state.error = ""; changed();
      try {
        if (entry.folder === store.state.workspace.folder) {
          if (note) await ctx.load(note);
        } else await bridge.projects!.open(entry.folder, note);
        close();
      } catch { state.error = ctx.catalog.format("project.open.failed"); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register<{id: string}>({
    id: "projects.pin", title: "recent.pinned",
    run: async ({id}) => {
      const [folder, path] = id.split("|");
      if (!folder) throw new Error("Unknown project");
      try {
        await bridge.projects!.pin(folder, path);
        state.entries = await bridge.projects!.list();
      } catch { state.error = ctx.catalog.format("project.open.failed"); }
      changed();
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
  viewModels.register({
    id: "vm.localImport", reads: "*",
    schema: {type: "object", properties: {open: {type: "boolean"}, pending: {type: "boolean"}, error: text, targets: {type: "array", items: {type: "object", properties: {id: text, label: text, description: text}}}}},
    select: () => ({...localImport}),
  });
  const menu = { type: "array" as const, items: { type: "object" as const, properties: { id: text, items: { type: "array" as const, items: { type: "object" as const, properties: { id: text, label: text, icon: text } } } } } };
  const item = { type: "object" as const, properties: { id: text, label: text, description: text, icon: text, pinned: { type: "boolean" as const }, menu } };
  const pinMenu = (id: string, pinned: boolean) => [{ id: "pin", items: [{ id, label: ctx.catalog.format(pinned ? "project.open.unpin" : "project.open.pin"), icon: "pin" }] }];
  viewModels.register({
    id: "vm.projects", reads: "*", setters: { query: "projects.query" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, full: { type: "boolean" }, dialog: { type: "boolean" }, pending: { type: "boolean" }, error: text, query: text, active: text,
      recent: { type: "array", items: item },
      entries: { type: "array", items: { type: "object", properties: { id: text, name: text, folder: text, accent: text, logo: text, logoSrc: text, pinned: { type: "boolean" }, menu } } },
    } },
    select: (_s: AppState) => {
      const query = state.query.toLowerCase();
      const entries = state.entries.filter((e) => !e.localNotes && `${e.name} ${e.folder}`.toLowerCase().includes(query))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.rank ?? 0) - (a.rank ?? 0));
      const recent = state.entries.flatMap(e => (e.recent?.length ? e.recent : e.lastNote ? [{path: e.lastNote, rank: 0, pinned: false}] : []).map(n => {
        const parts = n.path.slice(e.folder.length).split(/[\\/]/).filter(Boolean);
        const label = parts.pop()!.replace(/\.(md|markdown)$/i, "");
        const id = `${e.folder}|${n.path}`;
        return {...n, id, label, description: `${e.name}${e.localNotes ? " · " + ctx.catalog.format("project.localOnly") : ""} · ${parts.join(" / ") || ctx.catalog.format("project.root")}`, icon: "newNote", menu: pinMenu(id, n.pinned)};
      })).filter(n => `${n.label} ${n.description}`.toLowerCase().includes(query))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.rank - a.rank).slice(0, 50);
      return { ...state, dialog: state.open && !state.full, entries: entries.map((e) => ({ ...e, id: e.folder, menu: pinMenu(e.folder, Boolean(e.pinned)) })),
        recent,
      };
    },
  });
  return { start: () => refresh(true) };
}
