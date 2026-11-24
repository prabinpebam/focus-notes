import type { App, AppState } from "./app.ts";
import { opErrorCode, type OpErrorCode, type PlatformBridge, type ProjectEntry, type ProjectStats } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import { busyProps, type TaskTracker } from "./tasks.ts";
import { atOrUnder } from "./journal.ts";
import type { ExistingCopy } from "./first-run.ts";
import { updatedLabel } from "./first-run-app.ts";

/** A count quicker than this shows no placeholder: the line just appears (perceived performance, D-346). */
export const STATS_PLACEHOLDER_MS = 300;
/** A placeholder, once shown, stays at least this long, so it never flickers. */
export const STATS_PLACEHOLDER_HOLD_MS = 500;

/** A folder's size in decimal units: one decimal below 10 ("2.4 MB"), whole numbers above ("37 KB"). */
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  let shown = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (shown >= 1000 && unit < units.length - 1) { shown = 1; unit++; }
  return `${shown} ${units[unit]}`;
}

export function registerProjectOpen(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"];
  bridge: PlatformBridge; catalog: MessageCatalog; load: (path: string, keepCurrent?: boolean) => Promise<boolean>; tracker: TaskTracker;
  flush: () => Promise<boolean>; toast: (message: string) => void;
}) {
  const { store, commands, viewModels, bridge } = ctx;
  const state = { open: false, full: false, query: "", active: "", pending: false, loading: false, retrying: false, searchFocus: 0, error: "", details: "", entries: [] as ProjectEntry[] };
  const github = { open: false, loading: false, pending: "", error: "", repos: [] as { owner: string; name: string; private: boolean }[], copiesFor: "", copies: [] as ExistingCopy[], waitKey: "project.github.cloning", retry: undefined as (() => Promise<void>) | undefined, retrying: false };
  const localImport = { open: false, pending: false, retrying: false, error: "", targets: [] as {id: string; label: string; description: string}[] };
  let importRecovery: { command: string; args: Record<string, unknown> } | undefined;
  let importReceipt: { path: string; folder: string; request: string } | undefined;
  const changed = () => store.update((s) => ({ ...s }));
  let recovery: { command: string; args: Record<string, unknown> } | undefined;
  let listing = 0;
  let action = 0;
  const clearFailure = () => { state.error = ""; state.details = ""; recovery = undefined; };
  const begin = () => { const request = ++action; state.pending = false; if (!state.retrying) clearFailure(); changed(); return request; };
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
  const close = () => { listing++; action++; clearFailure(); clearPinFailures(); state.open = false; state.loading = false; state.pending = false; github.open = false; changed(); };
  // Each card's size line (D-346): the last count shows at once while the folder is recounted; a count that
  // takes longer than STATS_PLACEHOLDER_MS with nothing to show holds the line's place with a placeholder.
  // A failed count leaves no line and no error: the card still opens.
  const counts = new Map<string, { value?: ProjectStats; counting: boolean; slow: boolean; shownAt: number }>();
  bridge.onPrivacyCleared?.(() => {
    listing++;
    action++;
    counts.clear();
    state.entries = [];
    state.loading = false;
    state.pending = false;
    changed();
  });
  bridge.onPrivacyFiltered?.(roots => {
    listing++;
    action++;
    state.entries = state.entries.filter(entry => !roots.some(root => atOrUnder(entry.folder, root))).map(entry => ({
      ...entry,
      recent: entry.recent?.filter(note => !roots.some(root => atOrUnder(note.path, root))),
      lastNote: entry.lastNote && roots.some(root => atOrUnder(entry.lastNote!, root)) ? undefined : entry.lastNote,
    }));
    changed();
  });
  const count = (entries: ProjectEntry[]) => {
    const stats = bridge.projects?.stats;
    if (!stats) return;
    for (const entry of entries) {
      if (entry.localNotes) continue;
      const c = counts.get(entry.folder) ?? { counting: false, slow: false, shownAt: 0 };
      counts.set(entry.folder, c);
      if (entry.stats && !c.value) c.value = entry.stats;
      if (c.counting) continue;
      c.counting = true; c.slow = false;
      const timer = setTimeout(() => { if (c.counting) { c.slow = true; c.shownAt = performance.now(); changed(); } }, STATS_PLACEHOLDER_MS);
      const started = performance.now();
      let counted: ProjectStats | undefined;
      void stats(entry.folder).then(
        (value) => { counted = value; },
        (error: unknown) => { console.error("Project count failed", opErrorCode(error)); },
      ).finally(() => {
        clearTimeout(timer);
        performance.measure("fn:project.stats", { start: started, end: performance.now() });
        const settle = () => { if (counted) c.value = counted; c.counting = false; c.slow = false; changed(); };
        const held = c.slow && !c.value ? STATS_PLACEHOLDER_HOLD_MS - (performance.now() - c.shownAt) : 0;
        if (held > 0) setTimeout(settle, held); else settle();
      });
    }
  };
  const statsOf = (e: ProjectEntry) => {
    const c = counts.get(e.folder);
    const value = c?.value ?? e.stats;
    return {
      stats: value ? ctx.catalog.format("project.open.stats", { size: formatSize(value.bytes), files: value.files, media: value.media, folders: value.folders }) : "",
      statsBusy: Boolean(c?.counting && c.slow && !value),
    };
  };
  async function refresh(full = false) {
    // The last list stays on screen while the new one loads (no blank frame); a first load shows placeholders.
    const request = ++listing;
    state.open = true; state.full = full; state.loading = true; const operation = begin();
    try {
      const entries = await ctx.tracker.section("project.list", "project.open.listing", () => bridge.projects!.list(), "fn:project.list");
      if (request !== listing || operation !== action || !state.open) return;
      state.entries = entries; clearFailure(); clearPinFailures(); count(entries);
    }
    catch (error) { if (request === listing && operation === action && state.open) fail("project.open.listFailed", "projects.refresh", error); }
    finally { if (request === listing) { state.loading = false; changed(); } }
  }
  commands.register({ id: "projects.refresh", title: "commit.retry", run: () => refresh(state.full) });
  commands.register({
    id: "projects.retry", title: "commit.retry", enabled: () => state.open && Boolean(recovery) && !state.retrying,
    run: async () => {
      const failed = recovery;
      if (!failed) throw new Error("No project action to retry");
      const before = action;
      state.retrying = true; changed();
      try { await commands.run(failed.command, failed.args); }
      finally {
        state.retrying = false;
        if (action === before + 1 && !state.error && state.open) state.searchFocus++;
        changed();
      }
    },
  });
  commands.register({ id: "projects.open", title: "project.open.button", icon: "open", group: "app", layer: "basic", shortcut: { default: "Ctrl+Alt+O", macos: "Mod+Alt+O" }, enabled: () => Boolean(bridge.projects), run: () => refresh(!store.state.note.path) });
  commands.register({ id: "projects.close", title: "project.cancel", run: close });
  commands.register({
    id: "projects.newLocal", title: "project.open.newLocal", icon: "quickNote", group: "app", enabled: () => Boolean(bridge.projects),
    run: async () => {
      const request = begin();
      try { await bridge.projects!.localNote(); if (request === action) close(); }
      catch { if (request === action) { clearFailure(); state.error = ctx.catalog.format("quick.saveFailed"); changed(); } }
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
    id: "projects.launch", title: "project.open", enabled: () => !state.pending, run: async ({ id }) => {
      const [entryId, kind] = id.split("|");
      const entry = state.entries.find((e) => e.folder === entryId);
      if (!entry) throw new Error("Unknown project");
      const note = kind === "note" ? entry.lastNote : kind;
      if (note && note !== entry.lastNote && !entry.recent?.some(n => n.path === note)) throw new Error("Unknown recent note");
      const request = begin(); state.pending = true; changed();
      try {
        await ctx.tracker.run("project.open", "project.open.preparing", async () => {
          if (entry.folder === store.state.workspace.folder) {
            if (note && !await ctx.load(note, true)) throw new Error("Project note was not accepted");
          } else await bridge.projects!.open(entry.folder, note);
        }, undefined, "fn:project.open");
        if (request === action) close();
      } catch (error) { if (request === action) fail("project.open.failed", "projects.launch", error, { id }); }
      finally { if (request === action) { state.pending = false; changed(); } }
    },
  });
  // Pin and unpin are commits on the pin button itself (ui-states; owner, 5 November): its own border is the pending arc,
  // then a success or danger outline for at least the confirm minimum; Retry stays in the dialog's status row.
  const pinTarget = (id: string) => `vm.projects.pin:${id}`;
  const pinPending = (s: AppState, id: string) => s.commits.some((c) => c.target === pinTarget(id) && c.phase === "pending");
  class PinListFailed extends Error { readonly reason: unknown; constructor(reason: unknown) { super("Pin list failed"); this.reason = reason; } }
  commands.register<{value: {id: string; request: number}}>({
    id: "projects.savePin", title: "recent.pinned",
    run: async ({value}) => {
      const { id, request } = value;
      const [folder, path] = id.split("|");
      if (!folder) throw new Error("Unknown project");
      await ctx.tracker.run("project.pin", "project.open.pinning", () => bridge.projects!.pin(folder, path), undefined, "fn:project.pin");
      // The pin is stored; it's confirmed only once the list shows it. A failed list never repeats the toggle.
      if (request !== action) return;
      try {
        const entries = await ctx.tracker.section("project.list", "project.open.listing", () => bridge.projects!.list(), "fn:project.list");
        if (request !== action) return;
        state.entries = entries; changed();
      } catch (error) { if (request === action) throw new PinListFailed(error); }
    },
  });
  commands.register<{id: string}>({
    id: "projects.pin", title: "recent.pinned",
    run: async ({id}) => {
      if (!id.split("|")[0]) throw new Error("Unknown project");
      if (pinPending(store.state, id)) return;
      const request = begin();
      try {
        await commands.run("commit.run", { target: pinTarget(id), command: "projects.savePin", value: { id, request } });
        if (request === action) clearFailure();
      } catch (error) {
        if (request === action) {
          if (error instanceof PinListFailed) fail("project.open.pinRefreshFailed", "projects.refresh", error.reason);
          else fail("project.open.pinFailed", "projects.pin", error, { id });
        }
      }
      changed();
    },
  });
  /** A failed pin's outline stays until it's resolved: a Retry, a refreshed list, or Open closing. */
  const clearPinFailures = () => {
    for (const c of store.state.commits) if (c.target.startsWith("vm.projects.pin:") && c.phase === "failed") void commands.run("commit.revert", { target: c.target });
  };
  commands.register<{id: string}>({
    id: "projects.reveal", title: "project.open.showFolder", enabled: () => Boolean(bridge.projects?.reveal),
    run: async ({id}) => {
      const request = begin();
      try { await ctx.tracker.run("project.reveal", "project.open.revealing", () => bridge.projects!.reveal!(id), undefined, "fn:project.reveal"); if (request === action) clearFailure(); }
      catch (error) { if (request === action) fail("project.open.revealFailed", "projects.reveal", error, { id }); }
      changed();
    },
  });
  commands.register<{id: string}>({
    id: "projects.openRepo", title: "project.open.repoCommand", enabled: () => Boolean(bridge.projects?.openRepo),
    run: async ({id}) => {
      const request = begin();
      try { await bridge.projects!.openRepo!(id); if (request === action) clearFailure(); }
      catch (error) { if (request === action) fail("project.open.repoFailed", "projects.openRepo", error, { id }); }
      changed();
    },
  });
  commands.register({
    id: "projects.openFile", title: "project.openFile", enabled: () => Boolean(bridge.projects?.openFile),
    run: async () => {
      const request = begin();
      try {
        const r = await ctx.tracker.run("project.open", "project.open.preparing", async () => {
          const result = await bridge.projects!.openFile!();
          if (result?.here && !await ctx.load(result.file, true)) throw new Error("Project note was not accepted");
          return result;
        }, undefined, "fn:project.open");
        if (request !== action) return;
        if (!r) { clearFailure(); changed(); return; }
        close();
      } catch (error) { if (request === action) { fail("project.open.fileFailed", "projects.openFile", error); changed(); } }
    },
  });
  commands.register({
    id: "projects.github", title: "project.openFromGitHub", enabled: () => Boolean(bridge.projects?.githubRepos),
    run: async () => {
      github.open = true; github.loading = true; github.error = ""; github.retry = undefined; github.pending = ""; changed();
      const load = async () => {
        try { github.repos = await ctx.tracker.run("project.githubRepos", "project.github.checking", () => bridge.projects!.githubRepos!(), undefined, "fn:project.githubRepos"); github.error = ""; github.retry = undefined; }
        catch (e) {
          const signedOut = String(e).includes("signedOut");
          github.error = ctx.catalog.format(signedOut ? "project.github.signedOut" : "project.github.failed");
          github.retry = signedOut ? undefined : async () => { github.loading = true; changed(); await load(); };
        }
        finally { github.loading = false; changed(); }
      };
      await load();
    },
  });
  // Every failure keeps the list and the choice made, and Retry runs that same step again.
  commands.register({ id: "projects.githubRetry", title: "commit.retry", enabled: () => Boolean(github.retry) && !github.pending && !github.retrying, run: async () => {
    const again = github.retry;
    if (!again) return;
    github.retrying = true; github.error = ""; changed();
    try { await again(); } finally { github.retrying = false; changed(); }
  } });
  commands.register({ id: "projects.githubBack", title: "project.github.back", enabled: () => !github.pending, run: () => {
    // From the copies already here, Back is the list again (D-415).
    if (github.copiesFor) { github.copiesFor = ""; github.copies = []; github.error = ""; github.retry = undefined; }
    else github.open = false;
    changed();
  } });
  const openRepo = async (repo: { owner: string; name: string }, use?: string) => {
    github.pending = repo.name; github.error = ""; github.retry = undefined; github.waitKey = use ? "project.github.updating" : "project.github.cloning"; changed();
    try {
      await (use ? ctx.tracker.run("project.useCopy", "project.github.updating", () => bridge.projects!.openGitHub!(repo.owner, repo.name, use), undefined, "fn:project.useCopy") : bridge.projects!.openGitHub!(repo.owner, repo.name));
      github.copiesFor = ""; github.copies = [];
      close();
    }
    catch (e) {
      const notProject = String(e).includes("notWorkspace");
      github.error = ctx.catalog.format(notProject ? "project.github.notWorkspace" : use ? "project.github.useFailed" : "project.github.cloneFailed", { name: repo.name });
      github.retry = notProject ? undefined : () => openRepo(repo, use);
    }
    finally { github.pending = ""; changed(); }
  };
  commands.register<{id: string}>({
    id: "projects.githubOpen", title: "project.openFromGitHub", enabled: () => github.open && !github.pending,
    run: async ({id}) => {
      const repo = github.repos.find((r) => `${r.owner}/${r.name}` === id);
      if (!repo) throw new Error("Unknown repository");
      // A copy already here is offered before another download (D-415); none, or the look failed: as before.
      if (bridge.projects?.githubCopies) {
        github.pending = repo.name; github.error = ""; github.retry = undefined; github.waitKey = "project.github.lookingForCopies"; changed();
        let copies: ExistingCopy[];
        try { copies = await ctx.tracker.run("project.copies", "project.github.lookingForCopies", () => bridge.projects!.githubCopies!(repo.owner, repo.name), undefined, "fn:project.copies"); }
        catch {
          // Never a silent second download when the look failed: say so, and Retry looks again.
          github.pending = ""; github.error = ctx.catalog.format("project.github.copiesFailed", { name: repo.name });
          github.retry = () => commands.run("projects.githubOpen", { id }) as Promise<void>;
          changed(); return;
        }
        github.pending = "";
        if (copies.length && github.open) { github.copiesFor = id; github.copies = copies; changed(); return; }
      }
      await openRepo(repo);
    },
  });
  commands.register<{id: string}>({
    id: "projects.githubUseCopy", title: "project.github.useCopy", enabled: () => Boolean(github.copiesFor) && !github.pending,
    run: async ({id}) => {
      const repo = github.repos.find((r) => `${r.owner}/${r.name}` === github.copiesFor);
      const copy = github.copies.find((c) => c.folder === id);
      if (!repo || !copy || github.pending) return;
      await openRepo(repo, copy.folder);
    },
  });
  commands.register({
    id: "projects.githubNewCopy", title: "project.github.newCopy", enabled: () => Boolean(github.copiesFor) && !github.pending,
    run: async () => {
      const repo = github.repos.find((r) => `${r.owner}/${r.name}` === github.copiesFor);
      if (!repo || github.pending) return;
      await openRepo(repo);
    },
  });
  commands.register({
    id: "projects.choose", title: "project.openProject", run: async () => {
      const request = begin();
      try {
        const folder = await ctx.tracker.run("project.open", "project.open.preparing", async () => {
          const chosen = await bridge.projects!.choose();
          if (chosen) await bridge.projects!.open(chosen);
          return chosen;
        }, undefined, "fn:project.open");
        if (request !== action) return;
        if (!folder) { clearFailure(); changed(); return; }
        close();
      } catch (error) { if (request === action) { fail("project.open.failed", "projects.choose", error); changed(); } }
    },
  });
  const text = { type: "string" as const };
  viewModels.register({
    id: "vm.localImport", reads: "*",
    schema: {type: "object", properties: {open: {type: "boolean"}, pending: {type: "boolean"}, retrying: {type: "boolean"}, recoveryAction: text, error: text, targets: {type: "array", items: {type: "object", properties: {id: text, label: text, description: text}}}}},
    select: () => ({...localImport, recoveryAction: importRecovery ? ctx.catalog.format("commit.retry") : ""}),
  });
  const menu = { type: "array" as const, items: { type: "object" as const, properties: { id: text, items: { type: "array" as const, items: { type: "object" as const, properties: { id: text, label: text, icon: text } } } } } };
  const pinCommit = { type: "string" as const, enum: ["rest", "pending", "confirmed", "failed"] };
  const item = { type: "object" as const, properties: { id: text, label: text, description: text, icon: text, pinned: { type: "boolean" as const }, pinCommit, menu } };
  const pinMenu = (id: string, pinned: boolean) => [{ id: "pin", items: [{ id, label: ctx.catalog.format(pinned ? "project.open.unpin" : "project.open.pin"), icon: "pin" }] }];
  viewModels.register({
    id: "vm.projects", reads: "*", setters: { query: "projects.query" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, full: { type: "boolean" }, dialog: { type: "boolean" }, pending: { type: "boolean" }, loading: { type: "boolean" }, recentWaiting: { type: "boolean" }, entriesWaiting: { type: "boolean" }, error: text,
      retrying: { type: "boolean" }, searchFocus: { type: "number" }, details: text, recoveryAction: text, pendingLabel: text,
      emptyTitle: text, emptyDetail: text, emptyAction: text, emptyRecentTitle: text, emptyRecentDetail: text, emptyRecentAction: text,
      githubOpen: { type: "boolean" }, githubLoading: { type: "boolean" }, githubWaiting: { type: "boolean" }, githubPending: { type: "boolean" }, githubStatus: text, githubError: text, githubCanRetry: { type: "boolean" }, githubRetrying: { type: "boolean" },
      githubChoosing: { type: "boolean" }, githubCopiesWhy: text, githubCopies: { type: "array", items: { type: "object", properties: { id: text, label: text, detail: text, badge: text, variant: text, first: { type: "boolean" } } } },
      repos: { type: "array", items: { type: "object", properties: { id: text, owner: text, label: text, description: text, busy: { type: "boolean" } } } }, query: text, active: text,
      recent: { type: "array", items: item },
      entries: { type: "array", items: { type: "object", properties: { id: text, name: text, folder: text, accent: text, logo: text, logoSrc: text, repo: text, stats: text, statsBusy: { type: "boolean" }, pinned: { type: "boolean" }, pinCommit, menu } } },
    } },
    select: (_s: AppState) => {
      const query = state.query.toLowerCase();
      const commitOf = (id: string) => _s.commits.find((c) => c.target === pinTarget(id))?.phase ?? "rest";
      const entries = state.entries.filter((e) => !e.localNotes && `${e.name} ${e.folder}`.toLowerCase().includes(query))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.rank ?? 0) - (a.rank ?? 0));
      const recent = state.entries.flatMap(e => (e.recent?.length ? e.recent : e.lastNote ? [{path: e.lastNote, rank: 0, pinned: false}] : []).map(n => {
        const parts = n.path.slice(e.folder.length).split(/[\\/]/).filter(Boolean);
        const label = parts.pop()!.replace(/\.(md|markdown)$/i, "");
        const id = `${e.folder}|${n.path}`;
        return {...n, id, label, description: `${e.name}${e.localNotes ? " · " + ctx.catalog.format("project.localOnly") : ""} · ${parts.join(" / ") || ctx.catalog.format("project.root")}`, icon: "newNote", pinCommit: commitOf(id), menu: pinMenu(id, n.pinned)};
      })).filter(n => `${n.label} ${n.description}`.toLowerCase().includes(query))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.rank - a.rank).slice(0, 50);
      return { ...state, recoveryAction: recovery ? ctx.catalog.format("commit.retry") : "", pendingLabel: busyProps(_s.tasks, "project.open", (key, args) => ctx.catalog.format(key, args)).busyLabel ?? ctx.catalog.format("project.open.preparing"), dialog: state.open && !state.full, entries: entries.map((e) => ({ ...e, id: e.folder, repo: e.repo ?? "", ...statsOf(e), pinCommit: commitOf(e.folder), menu: pinMenu(e.folder, Boolean(e.pinned)) })),
        recent,
        recentWaiting: state.loading && _s.tasks.findLast(t => t.target === "project.list")?.phase === "on" && recent.length === 0,
        entriesWaiting: state.loading && _s.tasks.findLast(t => t.target === "project.list")?.phase === "on" && entries.length === 0,
        emptyTitle: ctx.catalog.format(query ? "uiStates.empty.matches" : "uiStates.empty.projects"),
        emptyDetail: ctx.catalog.format(query ? "uiStates.empty.matchesDetail" : "uiStates.empty.projectsDetail"),
        emptyAction: ctx.catalog.format(query ? "uiStates.empty.clearSearch" : "uiStates.empty.openProject"),
        emptyRecentTitle: ctx.catalog.format(query ? "uiStates.empty.matches" : "uiStates.empty.recent"),
        emptyRecentDetail: ctx.catalog.format(query ? "uiStates.empty.matchesDetail" : "uiStates.empty.recentDetail"),
        emptyRecentAction: ctx.catalog.format(query ? "uiStates.empty.clearSearch" : "uiStates.empty.openProject"),
        githubOpen: github.open, githubLoading: github.loading, githubWaiting: github.loading && github.repos.length === 0, githubPending: Boolean(github.pending),
        githubStatus: github.pending ? ctx.catalog.format(github.waitKey, { name: github.pending }) : "", githubError: github.error, githubCanRetry: Boolean(github.retry), githubRetrying: github.retrying,
        githubChoosing: Boolean(github.copiesFor),
        githubCopiesWhy: ctx.catalog.format("firstRun.copies.why", { count: github.copies.length }),
        githubCopies: github.copies.map((c, n) => ({ id: c.folder, label: c.name, detail: c.folder, badge: updatedLabel(ctx.catalog, Date.now(), c.updated), first: n === 0, variant: n === 0 ? "primary" : "secondary" })),
        repos: github.repos.map((r) => ({ id: `${r.owner}/${r.name}`, owner: r.owner, label: r.name, description: ctx.catalog.format("project.github.repo", { owner: r.owner, private: String(r.private) }), busy: github.pending === r.name })),
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
