import type { App, AppState } from "./app.ts";
import { opErrorCode, type OpErrorCode, type PlatformBridge, type ProjectEntry } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectOpen(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"];
  bridge: PlatformBridge; catalog: MessageCatalog; load: (path: string) => Promise<void>;
  flush: () => Promise<boolean>; toast: (message: string) => void;
}) {
  const { store, commands, viewModels, bridge } = ctx;
  const state = { open: false, full: false, query: "", active: "", pending: false, loading: false, retrying: false, searchFocus: 0, error: "", details: "", entries: [] as ProjectEntry[] };
  const github = { open: false, loading: false, pending: "", error: "", repos: [] as { owner: string; name: string; private: boolean }[] };
  const localImport = { open: false, pending: false, retrying: false, error: "", targets: [] as {id: string; label: string; description: string}[] };
  let importRecovery: { command: string; args: Record<string, unknown> } | undefined;
  let importReceipt: { path: string; folder: string; request: string } | undefined;
  const changed = () => store.update((s) => ({ ...s }));
  let recovery: { command: string; args: Record<string, unknown> } | undefined;
  let listing = 0;
  const clearFailure = () => { state.error = ""; state.details = ""; recovery = undefined; };
  const begin = () => { if (!state.retrying) clearFailure(); changed(); };
  const fail = (message: string, command: string, error: unknown, args: Record<string, unknown> = {}) => {
    const code = opErrorCode(error);
    const details: Partial<Record<OpErrorCode, string>> = {
      notFound: "project.open.details.notFound", readOnly: "project.open.details.readOnly",
      invalid: "project.open.details.invalid", changed: "project.open.details.changed",
    };
    state.error = ctx.catalog.format(message);
    state.details = details[code] ? ctx.catalog.format(details[code]) : "";
    recovery = { command, args };
    console.error("Project action failed", command, code);
  };
  const close = () => { listing++; clearFailure(); state.open = false; state.loading = false; github.open = false; changed(); };
  async function refresh(full = false) {
    // The last list stays on screen while the new one loads (no blank frame); a first load shows placeholders.
    const request = ++listing;
    state.open = true; state.full = full; state.loading = true; begin();
    try {
      const entries = await bridge.projects!.list();
      if (request !== listing || !state.open) return;
      state.entries = entries; clearFailure();
    }
    catch (error) { if (request === listing && state.open) fail("project.open.listFailed", "projects.refresh", error); }
    finally { if (request === listing) { state.loading = false; changed(); } }
  }
  commands.register({ id: "projects.refresh", title: "commit.retry", run: () => refresh(state.full) });
  commands.register({
    id: "projects.retry", title: "commit.retry", enabled: () => state.open && Boolean(recovery) && !state.retrying,
    run: async () => {
      const failed = recovery;
      if (!failed) throw new Error("No project action to retry");
      state.retrying = true; changed();
      try { await commands.run(failed.command, failed.args); }
      finally {
        state.retrying = false;
        if (!state.error && state.open) state.searchFocus++;
        changed();
      }
    },
  });
  commands.register({ id: "projects.open", title: "project.open.button", icon: "open", group: "app", layer: "basic", shortcut: { default: "Ctrl+Alt+O", macos: "Mod+Alt+O" }, enabled: () => Boolean(bridge.projects), run: () => refresh(!store.state.note.path) });
  commands.register({ id: "projects.close", title: "project.cancel", run: close });
  commands.register({
    id: "projects.newLocal", title: "project.open.newLocal", icon: "quickNote", group: "app", enabled: () => Boolean(bridge.projects),
    run: async () => {
      begin();
      try { await bridge.projects!.localNote(); close(); }
      catch { clearFailure(); state.error = ctx.catalog.format("quick.saveFailed"); changed(); }
    },
  });
  commands.register({
    id: "local.import", title: "quick.import.button", group: "app", icon: "folder", enabled: () => Boolean(bridge.projects?.local && store.state.note.path),
    run: async () => {
      localImport.open = true; localImport.pending = true;
      if (!localImport.retrying) { localImport.error = ""; importRecovery = undefined; importReceipt = undefined; }
      changed();
      try {
        const entries = await bridge.projects!.list();
        localImport.targets = entries.filter(e => !e.localNotes).map(e => ({id: e.folder, label: e.name, description: e.folder}));
        localImport.error = ""; importRecovery = undefined;
      } catch (error) {
        localImport.error = ctx.catalog.format("quick.import.listFailed");
        importRecovery = { command: "local.import", args: {} };
        console.error("Local import failed", "list", opErrorCode(error));
      }
      finally { localImport.pending = false; changed(); }
    },
  });
  commands.register({id: "local.importClose", title: "project.cancel", enabled: () => !localImport.pending, run: () => {localImport.open = false; changed();}});
  commands.register<{id: string}>({
    id: "local.copyTo", title: "quick.import.button", enabled: () => localImport.open && !localImport.pending,
    run: async ({id}) => {
      localImport.pending = true;
      if (!localImport.retrying) localImport.error = "";
      changed();
      try {
        if (!await ctx.flush()) throw new Error("Local note is not saved");
        const path = localImport.retrying ? importReceipt?.path ?? store.state.note.path : store.state.note.path;
        if (!path) throw new Error("No local note");
        if (!importReceipt || importReceipt.path !== path || importReceipt.folder !== id) {
          importReceipt = { path, folder: id, request: globalThis.crypto.randomUUID() };
        }
        const copied = await bridge.projects!.importLocal(path, id, importReceipt.request);
        localImport.open = false;
        localImport.error = ""; importRecovery = undefined;
        ctx.toast(ctx.catalog.format("quick.import.saved", {name: copied.split(/[\\/]/).at(-1) ?? ""}));
      } catch (error) {
        localImport.error = ctx.catalog.format("quick.import.failed");
        importRecovery = { command: "local.copyTo", args: { id } };
        console.error("Local import failed", "copy", opErrorCode(error));
      }
      finally { localImport.pending = false; changed(); }
    },
  });
  commands.register({
    id: "local.importRetry", title: "commit.retry", enabled: () => localImport.open && Boolean(importRecovery) && !localImport.pending,
    run: async () => {
      const failed = importRecovery;
      if (!failed) throw new Error("No Local import to retry");
      localImport.retrying = true; changed();
      try { await commands.run(failed.command, failed.args); }
      finally { localImport.retrying = false; changed(); }
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
      state.pending = true; begin();
      try {
        if (entry.folder === store.state.workspace.folder) {
          if (note) await ctx.load(note);
        } else await bridge.projects!.open(entry.folder, note);
        close();
      } catch (error) { fail("project.open.failed", "projects.launch", error, { id }); }
      finally { state.pending = false; changed(); }
    },
  });
  commands.register<{id: string}>({
    id: "projects.pin", title: "recent.pinned",
    run: async ({id}) => {
      const [folder, path] = id.split("|");
      if (!folder) throw new Error("Unknown project");
      begin();
      try {
        await bridge.projects!.pin(folder, path);
      } catch (error) {
        fail("project.open.pinFailed", "projects.pin", error, { id }); changed(); return;
      }
      try { state.entries = await bridge.projects!.list(); clearFailure(); }
      catch (error) { fail("project.open.pinRefreshFailed", "projects.refresh", error); }
      changed();
    },
  });
  commands.register<{id: string}>({
    id: "projects.reveal", title: "project.open.reveal", enabled: () => Boolean(bridge.projects?.reveal),
    run: async ({id}) => {
      begin();
      try { await bridge.projects!.reveal!(id); clearFailure(); }
      catch (error) { fail("project.open.revealFailed", "projects.reveal", error, { id }); }
      changed();
    },
  });
  commands.register({
    id: "projects.openFile", title: "project.openFile", enabled: () => Boolean(bridge.projects?.openFile),
    run: async () => {
      begin();
      try {
        const r = await bridge.projects!.openFile!();
        if (!r) { clearFailure(); changed(); return; }
        if (r.here) await ctx.load(r.file);
        close();
      } catch (error) { fail("project.open.fileFailed", "projects.openFile", error); changed(); }
    },
  });
  commands.register({
    id: "projects.github", title: "project.openFromGitHub", enabled: () => Boolean(bridge.projects?.githubRepos),
    run: async () => {
      github.open = true; github.loading = true; github.error = ""; github.pending = ""; changed();
      try { github.repos = await bridge.projects!.githubRepos!(); }
      catch (e) { github.error = ctx.catalog.format(String(e).includes("signedOut") ? "project.github.signedOut" : "project.github.failed"); }
      finally { github.loading = false; changed(); }
    },
  });
  commands.register({ id: "projects.githubBack", title: "project.github.back", enabled: () => !github.pending, run: () => { github.open = false; changed(); } });
  commands.register<{id: string}>({
    id: "projects.githubOpen", title: "project.openFromGitHub", enabled: () => github.open && !github.pending,
    run: async ({id}) => {
      const repo = github.repos.find((r) => `${r.owner}/${r.name}` === id);
      if (!repo) throw new Error("Unknown repository");
      github.pending = repo.name; github.error = ""; changed();
      try { await bridge.projects!.openGitHub!(repo.owner, repo.name); close(); }
      catch (e) { github.error = ctx.catalog.format(String(e).includes("notWorkspace") ? "project.github.notWorkspace" : "project.github.cloneFailed", { name: repo.name }); }
      finally { github.pending = ""; changed(); }
    },
  });
  commands.register({
    id: "projects.choose", title: "project.openProject", run: async () => {
      begin();
      try {
        const folder = await bridge.projects!.choose();
        if (!folder) { clearFailure(); changed(); return; }
        await bridge.projects!.open(folder);
        close();
      } catch (error) { fail("project.open.failed", "projects.choose", error); changed(); }
    },
  });
  const text = { type: "string" as const };
  viewModels.register({
    id: "vm.localImport", reads: "*",
    schema: {type: "object", properties: {open: {type: "boolean"}, pending: {type: "boolean"}, retrying: {type: "boolean"}, recoveryAction: text, error: text, targets: {type: "array", items: {type: "object", properties: {id: text, label: text, description: text}}}}},
    select: () => ({...localImport, recoveryAction: importRecovery ? ctx.catalog.format("commit.retry") : ""}),
  });
  const menu = { type: "array" as const, items: { type: "object" as const, properties: { id: text, items: { type: "array" as const, items: { type: "object" as const, properties: { id: text, label: text, icon: text } } } } } };
  const item = { type: "object" as const, properties: { id: text, label: text, description: text, icon: text, pinned: { type: "boolean" as const }, menu } };
  const pinMenu = (id: string, pinned: boolean) => [{ id: "pin", items: [{ id, label: ctx.catalog.format(pinned ? "project.open.unpin" : "project.open.pin"), icon: "pin" }] }];
  viewModels.register({
    id: "vm.projects", reads: "*", setters: { query: "projects.query" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, full: { type: "boolean" }, dialog: { type: "boolean" }, pending: { type: "boolean" }, loading: { type: "boolean" }, recentWaiting: { type: "boolean" }, entriesWaiting: { type: "boolean" }, error: text,
      retrying: { type: "boolean" }, searchFocus: { type: "number" }, details: text, recoveryAction: text,
      emptyTitle: text, emptyDetail: text, emptyAction: text, emptyRecentTitle: text, emptyRecentDetail: text, emptyRecentAction: text,
      githubOpen: { type: "boolean" }, githubLoading: { type: "boolean" }, githubWaiting: { type: "boolean" }, githubPending: { type: "boolean" }, githubStatus: text, githubError: text,
      repos: { type: "array", items: { type: "object", properties: { id: text, label: text, description: text, busy: { type: "boolean" } } } }, query: text, active: text,
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
      return { ...state, recoveryAction: recovery ? ctx.catalog.format("commit.retry") : "", dialog: state.open && !state.full, entries: entries.map((e) => ({ ...e, id: e.folder, menu: pinMenu(e.folder, Boolean(e.pinned)) })),
        recent,
        recentWaiting: state.loading && recent.length === 0,
        entriesWaiting: state.loading && entries.length === 0,
        emptyTitle: ctx.catalog.format(query ? "uiStates.empty.matches" : "uiStates.empty.projects"),
        emptyDetail: ctx.catalog.format(query ? "uiStates.empty.matchesDetail" : "uiStates.empty.projectsDetail"),
        emptyAction: ctx.catalog.format(query ? "uiStates.empty.clearSearch" : "uiStates.empty.openProject"),
        emptyRecentTitle: ctx.catalog.format(query ? "uiStates.empty.matches" : "uiStates.empty.recent"),
        emptyRecentDetail: ctx.catalog.format(query ? "uiStates.empty.matchesDetail" : "uiStates.empty.recentDetail"),
        emptyRecentAction: ctx.catalog.format(query ? "uiStates.empty.clearSearch" : "uiStates.empty.openProject"),
        githubOpen: github.open, githubLoading: github.loading, githubWaiting: github.loading && github.repos.length === 0, githubPending: Boolean(github.pending),
        githubStatus: github.pending ? ctx.catalog.format("project.github.cloning", { name: github.pending }) : "", githubError: github.error,
        repos: github.repos.map((r) => ({ id: `${r.owner}/${r.name}`, label: r.name, description: ctx.catalog.format("project.github.repo", { owner: r.owner, private: String(r.private) }), busy: github.pending === r.name })),
      };
    },
  });
  commands.register({
    id: "projects.emptyAction", title: "project.openProject",
    run: async () => {
      if (state.query) { state.query = ""; changed(); }
      else await commands.run("projects.choose");
    },
  });
  return { start: () => refresh(true) };
}
