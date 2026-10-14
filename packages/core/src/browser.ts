/**
 * Features of the web app on an instance's own Pages site (D-90): Open… as an in-app dialog over the
 * notes written in this browser and the instance's public and private notes; Unlock, Lock, and the
 * account corner; Copy to my notes; export and import; and Use this app for yourself. The browser
 * never signs in to GitHub and never writes to a repository.
 */
import type { AppState } from "./app.ts";
import type { AppStateFile, NoteSummary, PlatformBridge } from "./bridge.ts";
import { UnlockError } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import { freePath, innerPath, isReadOnlyPath, safeLocalPath, sourceOf, titleOfPath } from "./notes.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { noteReadOnly } from "./workspace-app.ts";

export interface PickerState {
  open: boolean;
  query: string;
  activeId: string;
  notes: NoteSummary[];
  focus: number;
}
export const PICKER_CLOSED: PickerState = { open: false, query: "", activeId: "", notes: [], focus: 0 };

export interface UnlockState {
  open: boolean;
  passphrase: string;
  busy: boolean;
  /** A message key for what went wrong, if anything. */
  error: string;
  focus: number;
}
export const UNLOCK_CLOSED: UnlockState = { open: false, passphrase: "", busy: false, error: "", focus: 0 };

/** What this browser knows about its instance (PKG-08, PKG-10). */
export interface InstanceState {
  present: boolean;
  publicNotes: number;
  hasVault: boolean;
  vault: "none" | "locked" | "unlocked";
  owner: string;
  remembered: boolean;
}
export const NO_INSTANCE: InstanceState = { present: false, publicNotes: 0, hasVault: false, vault: "none", owner: "", remembered: false };

/** Where Use this app for yourself sends people (DST-01, D-87). Both are GitHub's own pages. */
export const TEMPLATE_URL = "https://github.com/prabinpebam/focus-notes-workspace";
export const RELEASES_URL = "https://github.com/prabinpebam/focus-notes/releases/latest";

export interface BrowserContext {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  load(path: string): Promise<void>;
  flush(): Promise<boolean>;
  toast(message: string, opts?: { tone?: "info" | "error"; action?: { command: string; label: string } }): number;
  tracker: TaskTracker;
  menu: { id: string; label: string; items: (string | { submenu: string; label: string; items: string[] })[] }[];
  appState(): AppStateFile;
  persistAppState(patch: Partial<AppStateFile>): Promise<void>;
  /** The schema of a menu item, shared with the toolbar's view model. */
  itemSchema: Record<string, unknown>;
  describeItem(id: string): Record<string, unknown>;
}

export function registerBrowserFeatures(ctx: BrowserContext): { start(): Promise<void> } {
  const { store, commands, viewModels, catalog, bridge } = ctx;
  const instance = bridge.instance;
  const setPicker = (patch: Partial<PickerState>) => store.update((s) => ({ ...s, ui: { ...s.ui, picker: { ...s.ui.picker, ...patch } } }));
  const setUnlock = (patch: Partial<UnlockState>) => store.update((s) => ({ ...s, ui: { ...s.ui, unlock: { ...s.ui.unlock, ...patch } } }));
  const setInstance = (patch: Partial<InstanceState>) => store.update((s) => ({ ...s, instance: { ...s.instance, ...patch } }));
  const setAbout = (open: boolean) => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, aboutOpen: open } }));

  // ---- Open… (notes kept by the shell, and the instance's) ----
  const titleFor = (n: NoteSummary) => n.title || titleOfPath(n.path);
  const matches = (s: PickerState) => {
    const q = s.query.trim().toLowerCase();
    return s.notes.filter((n) => !q || titleFor(n).toLowerCase().includes(q) || innerPath(n.path).toLowerCase().includes(q)).slice(0, 200);
  };
  commands.register({
    // Quick open (FIL-04 arrives with Spotlight in M4): the shell's own notes by name, Mod+P (D-94).
    id: "picker.open", title: "command.picker.open",
    ...(bridge.listNotes ? { shortcut: { default: "Mod+P" }, layer: "power" as const, group: "files" as const } : {}),
    run: async () => {
      const notes = ((await bridge.listNotes?.()) ?? []).sort((a, b) => b.updated - a.updated);
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, picker: { open: true, query: "", activeId: notes[0]?.path ?? "", notes, focus: s.ui.picker.focus + 1 } } }));
    },
  });
  commands.register<{ open: boolean }>({ id: "picker.setOpen", title: "command.note.open", run: ({ open }) => { if (!open) setPicker({ open: false }); } });
  commands.register<{ value: string }>({
    id: "picker.setQuery", title: "command.picker.setQuery",
    run: ({ value }) => {
      const query = typeof value === "string" ? value : "";
      const next = { ...store.state.ui.picker, query };
      setPicker({ query, activeId: matches(next)[0]?.path ?? "" });
    },
  });
  const move = (dir: 1 | -1) => () => {
    const list = matches(store.state.ui.picker);
    if (!list.length) return;
    const i = list.findIndex((n) => n.path === store.state.ui.picker.activeId);
    setPicker({ activeId: list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!.path });
  };
  commands.register({ id: "picker.next", title: "command.picker.next", shortcut: { default: "Down", handledBy: "pickerField" }, layer: "basic", group: "files", run: move(1) });
  commands.register({ id: "picker.prev", title: "command.picker.prev", shortcut: { default: "Up", handledBy: "pickerField" }, layer: "basic", group: "files", run: move(-1) });
  commands.register<{ id: string }>({
    id: "picker.choose", title: "command.picker.choose",
    run: async ({ id }) => {
      const path = typeof id === "string" && id ? id : store.state.ui.picker.activeId;
      if (!path || !store.state.ui.picker.notes.some((n) => n.path === path)) return;
      setPicker({ open: false });
      await ctx.load(path);
    },
  });
  commands.register({ id: "picker.chooseActive", title: "command.picker.choose", shortcut: { default: "Enter", handledBy: "pickerField" }, layer: "basic", group: "files", run: (_a, c) => c.run("picker.choose", { id: "" }) });
  commands.register<{ id: string }>({ id: "picker.setActive", title: "command.picker.next", run: ({ id }) => { if (typeof id === "string") setPicker({ activeId: id }); } });

  viewModels.register({
    id: "vm.picker",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, query: { type: "string" }, activeId: { type: "string" }, focus: { type: "number" },
        items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" } } } },
        summary: { type: "string" },
      },
    },
    setters: { query: "picker.setQuery" },
    reads: ["ui.picker"],
    select: (s) => {
      const p = s.ui.picker;
      if (!p.open) return { open: false, query: "", activeId: "", focus: p.focus, items: [], summary: "" };
      const list = matches(p);
      return {
        open: true, query: p.query, activeId: p.activeId, focus: p.focus,
        items: list.map((n) => {
          const inner = innerPath(n.path);
          const folder = inner.includes("/") ? inner.slice(0, inner.lastIndexOf("/")) : "";
          const source = sourceOf(n.path);
          const label = source === "local" ? "" : catalog.format(`picker.source.${source}`);
          const where = label && folder ? catalog.format("picker.where", { source: label, folder }) : label || folder;
          return { id: n.path, label: titleFor(n), description: where, icon: source === "private" ? "lock" : "document" };
        }),
        summary: list.length ? catalog.format("picker.count", { count: list.length }) : catalog.format("picker.none"),
      };
    },
  });

  // ---- Copy to my notes (PKG-08) ----
  commands.register({
    id: "note.copyToLocal", title: "command.note.copyToLocal", icon: "copy",
    enabled: (s) => isReadOnlyPath(s.note.path) && s.note.status === "ready",
    disabledReason: "command.note.copyToLocal.reason",
    run: async () => {
      const { path, markdown } = store.state.note;
      if (!path || !isReadOnlyPath(path)) return;
      const taken = new Set(((await bridge.listNotes?.()) ?? []).filter((n) => !isReadOnlyPath(n.path)).map((n) => n.path));
      const target = freePath(safeLocalPath(path), taken);
      await bridge.writeNote(target, markdown);
      await ctx.load(target);
      ctx.toast(catalog.format("toast.copiedToLocal", { note: titleOfPath(target) }));
    },
  });

  // ---- Export and import (PKG-11) ----
  commands.register({
    id: "notes.export", title: "command.notes.export", icon: "export",
    enabled: () => Boolean(bridge.exportNotes),
    run: async () => {
      if (!(await ctx.flush())) return;
      const count = await ctx.tracker.run("notes.export", "task.exporting", () => bridge.exportNotes!(), "task.exported").catch(() => -1);
      ctx.toast(count < 0 ? catalog.format("toast.exportFailed") : catalog.format("toast.exported", { count }), count < 0 ? { tone: "error" } : {});
    },
  });
  // The desktop imports into its workspace instead (import-app.ts, FRE-10).
  if (!bridge.workspace?.chooseBundle) commands.register({
    id: "notes.import", title: "command.notes.import", icon: "import",
    enabled: () => Boolean(bridge.importNotes),
    run: async () => {
      try {
        const r = await bridge.importNotes!();
        if (!r) return;
        ctx.toast(catalog.format("toast.imported", { count: r.added, renamed: r.renamed }));
      } catch {
        ctx.toast(catalog.format("toast.importFailed"), { tone: "error" });
      }
    },
  });

  // ---- Unlock, Lock, and Forget this browser (PKG-10, SEC-08) ----
  if (instance) instance.onVault((v) => setInstance({ vault: v.state, owner: v.owner ?? "", remembered: Boolean(v.remembered) }));
  commands.register({
    id: "vault.unlock", title: "command.vault.unlock", icon: "lock",
    enabled: (s) => s.instance.hasVault && s.instance.vault === "locked",
    disabledReason: "command.vault.unlock.reason",
    run: () => store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, unlock: { open: true, passphrase: "", busy: false, error: "", focus: s.ui.unlock.focus + 1 } } })),
  });
  commands.register<{ open: boolean }>({ id: "unlock.setOpen", title: "command.vault.unlock", run: ({ open }) => { if (!open) setUnlock({ open: false, passphrase: "", error: "" }); } });
  commands.register<{ value: string }>({ id: "unlock.setPassphrase", title: "command.unlock.setPassphrase", run: ({ value }) => setUnlock({ passphrase: typeof value === "string" ? value : "", error: "" }) });
  const submit = (remember: boolean) => async () => {
    const u = store.state.ui.unlock;
    if (!instance || u.busy) return;
    if (!u.passphrase.trim()) return setUnlock({ error: "unlock.error.empty", focus: u.focus + 1 });
    setUnlock({ busy: true, error: "" });
    try {
      await ctx.tracker.run(remember ? "unlock.remember" : "unlock.submit", "task.unlocking", () => instance.unlock(u.passphrase, remember), "task.unlocked");
      setUnlock({ open: false, busy: false, passphrase: "" });
      ctx.toast(catalog.format(remember ? "toast.unlockedRemembered" : "toast.unlocked", { count: (await bridge.listNotes?.() ?? []).filter((n) => sourceOf(n.path) === "private").length }));
    } catch (e) {
      const code = e instanceof UnlockError ? e.code : "unavailable";
      setUnlock({ busy: false, passphrase: code === "wrong" ? "" : store.state.ui.unlock.passphrase, error: `unlock.error.${code}`, focus: store.state.ui.unlock.focus + 1 });
    }
  };
  commands.register({ id: "unlock.submit", title: "command.unlock.submit", run: submit(false) });
  commands.register({ id: "unlock.remember", title: "command.unlock.remember", run: submit(true) });
  const lockAndLeave = async (messageKey: string) => {
    if (!instance) return;
    await instance.lock();
    // A private note can't stay open once the key is gone.
    if (sourceOf(store.state.note.path) === "private") await ctx.load(await bridge.defaultNotePath());
    ctx.toast(catalog.format(messageKey));
  };
  commands.register({
    id: "vault.lock", title: "command.vault.lock", icon: "lock",
    enabled: (s) => s.instance.vault === "unlocked" && !s.instance.remembered,
    run: () => lockAndLeave("toast.locked"),
  });
  commands.register({
    id: "vault.forget", title: "command.vault.forget", icon: "lock",
    enabled: (s) => s.instance.vault === "unlocked" && s.instance.remembered,
    run: () => lockAndLeave("toast.forgotten"),
  });
  viewModels.register({
    id: "vm.unlock",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, passphrase: { type: "string" }, busy: { type: "boolean" }, error: { type: "string" }, hasError: { type: "boolean" },
        focus: { type: "number" }, rememberNote: { type: "string" },
      },
    },
    setters: { passphrase: "unlock.setPassphrase" },
    reads: ["ui.unlock"],
    select: (s) => {
      const u = s.ui.unlock;
      return {
        open: u.open, passphrase: u.passphrase, busy: u.busy, focus: u.focus, hasError: Boolean(u.error),
        error: u.error ? catalog.format(catalog.has(u.error) ? u.error : "unlock.error.unavailable") : "",
        rememberNote: instance ? catalog.format("unlock.rememberNote", { origin: instance.origin() }) : "",
      };
    },
  });

  // ---- Use this app for yourself (DST-01) ----
  commands.register({ id: "about.open", title: "command.about.open", icon: "info", enabled: (s) => s.instance.present, run: () => setAbout(true) });
  commands.register<{ open: boolean }>({ id: "about.setOpen", title: "command.about.open", run: ({ open }) => { if (!open) setAbout(false); } });
  commands.register({ id: "about.template", title: "command.about.template", run: () => bridge.openExternal?.(TEMPLATE_URL) });
  commands.register({ id: "about.download", title: "command.about.download", run: () => bridge.openExternal?.(RELEASES_URL) });
  viewModels.register({
    id: "vm.about",
    schema: { type: "object", properties: { open: { type: "boolean" } } },
    reads: ["ui.aboutOpen"],
    select: (s) => ({ open: s.ui.aboutOpen }),
  });

  if (instance || bridge.exportNotes) {
    ctx.menu.push({ id: "notes", label: "menu.notes", items: ["note.copyToLocal", "notes.export", "notes.import", ...(instance ? ["vault.unlock", "about.open"] : [])] });
  }

  // ---- The bottom-left corner: the account pill, Use this app for yourself, and Read only (UI-12) ----
  viewModels.register({
    id: "vm.account",
    schema: {
      type: "object",
      properties: {
        visible: { type: "boolean" },
        mode: { type: "string", enum: ["none", "unlock", "owner"] },
        text: { type: "string" }, label: { type: "string" },
        sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
        about: { type: "boolean" },
        readOnly: { type: "boolean" }, readOnlyText: { type: "string" },
      },
    },
    // Its menu shows command states, which can depend on anything (PRF-11).
    reads: "*",
    select: (s) => {
      const i = s.instance;
      const readOnly = noteReadOnly(s) && s.note.status === "ready";
      const about = i.present && i.vault !== "unlocked";
      // An instance note can be copied; a workspace that can't be written says why (DST-05).
      const why = isReadOnlyPath(s.note.path) ? "account.readOnly" : s.workspace.access === "migrate" ? "account.readOnlyOlder"
        : s.workspace.access === "newer" ? "account.readOnlyNewer" : "account.readOnlyUnreadable";
      const base = { about, readOnly, readOnlyText: readOnly ? catalog.format(why) : "" };
      // The desktop: the GitHub login Git is signed in as, with the sync status, Sync now, and Sign out (UI-12, D-89).
      if (s.account.login) {
        const status = catalog.format(s.sync.problem ? "account.syncProblem" : "account.synced");
        return {
          ...base, visible: true, mode: "owner", text: catalog.format(s.sync.problem ? "account.loginProblem" : "account.login", { login: s.account.login }),
          label: catalog.format("account.signedIn", { login: s.account.login, status }),
          sections: [{ id: "github", label: status, items: ["sync.now", "account.signOut"].map(ctx.describeItem) }],
        };
      }
      if (i.vault === "unlocked") {
        return {
          ...base, visible: true, mode: "owner", text: i.owner, label: catalog.format("account.owner", { owner: i.owner }),
          sections: [{
            id: "vault", label: catalog.format(i.remembered ? "account.remembered" : "account.unlocked"),
            items: [i.remembered ? "vault.forget" : "vault.lock"].map(ctx.describeItem),
          }],
        };
      }
      const mode = i.hasVault ? "unlock" : "none";
      return {
        ...base, visible: mode !== "none" || about || readOnly, mode,
        text: mode === "unlock" ? catalog.format("account.unlock") : "", label: mode === "unlock" ? catalog.format("account.unlockLabel") : "", sections: [],
      };
    },
  });

  return {
    async start() {
      const info = await instance?.info().catch(() => undefined);
      if (info && instance) {
        const v = instance.vault();
        setInstance({ present: true, publicNotes: info.publicNotes, hasVault: info.hasVault, vault: v.state, owner: v.owner ?? "", remembered: Boolean(v.remembered) });
      }
      if (!ctx.appState().webWelcomed && bridge.listNotes) await ctx.persistAppState({ webWelcomed: true });
    },
  };
}
