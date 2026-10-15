/**
 * Settings (IA-VIEW-SETTINGS) on the desktop: a dialog whose categories are a list on the left. As
 * built it has Account, Workspace (FRE-07, PRV-02), and Appearance (a summary that opens the theme
 * manager, the interface size, and Sync appearance, DD-SET-02); the other categories join with the
 * work packages that build them (Agents, Sharing). Changes apply at
 * once (DD-SET-01). The shell does the work: Git's helpers for the account (`bridge.firstRun`), Git
 * for the workspace (`bridge.workspace.removal` and `remove`); signing in again, switching account,
 * and Run setup again show the first run's card (first-run-app.ts).
 */
import type { AppStateFile, PlatformBridge, RemovalCheck } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { AccountStatus } from "./first-run.ts";
import type { AccountState } from "./first-run-app.ts";
import { RECENT_STATE_KEYS } from "./inventory.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { SyncState } from "./sync-app.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { UI_SCALES, themeById } from "./themes.ts";
import { DIAGNOSTICS_IDLE, registerDiagnostics, type DiagnosticsState } from "./diagnostics-app.ts";

/** Settings' categories, in order, as built so far. */
// Sharing only where the shell keeps access.json (the desktop, WP-5.3); About only where it builds diagnostics (WP-5.7).
export const SETTINGS_SECTIONS = ["account", "workspace", "sharing", "appearance", "about"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SettingsState {
  open: boolean;
  section: SettingsSection;
  /** The account as the shell found it when Settings opened, or after a change. */
  account?: AccountStatus;
  checking: boolean;
  /** Sign out of GitHub?, and whether Git's sign-in goes too (FRE-07). */
  signOut: { open: boolean; git: boolean; busy: boolean };
  /** Remove this workspace from this computer (FRE-07, PRV-02). */
  remove: { open: boolean; busy: boolean; check?: RemovalCheck };
  /** About's diagnostics: the report's preview (QLT-04). */
  diagnostics: DiagnosticsState;
}
export const SETTINGS_CLOSED: SettingsState = {
  open: false, section: "account", checking: false,
  signOut: { open: false, git: true, busy: false },
  remove: { open: false, busy: false },
  diagnostics: DIAGNOSTICS_IDLE,
};

interface S {
  ui: { settings: SettingsState; toolbarOpen: boolean };
  account: AccountState;
  sync: SyncState;
  workspace: { folder?: string };
  firstRun: { active: boolean };
  appearance: { mode: "system" | "light" | "dark"; lightTheme: string; darkTheme: string; fontSize: number; contentFont: string; uiScale: number };
  settingsSync: "unavailable" | "off" | "on";
}

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => unknown;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  /** The app state as last loaded or persisted, for putting it back if removing fails. */
  appState: () => AppStateFile;
  /** Writes pending edits. False if the note couldn't be saved. */
  flush: () => Promise<boolean>;
  /** Shows the first run's card again: Run setup again, the Connect step alone, or Your notes alone (D-124). */
  again: (scope: "setup" | "account" | "workspace", opts?: { other?: boolean }) => Promise<boolean>;
}

export function registerSettings<St extends S>({ store, bridge, catalog, commands, viewModels, toast, persistAppState, appState, flush, again }: Ctx<St>) {
  const fr = bridge.firstRun;
  const ws = bridge.workspace;
  const state = () => store.state.ui.settings;
  const set = (patch: Partial<SettingsState>) => store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, ...patch } } }));
  const setSignOut = (patch: Partial<SettingsState["signOut"]>) => set({ signOut: { ...state().signOut, ...patch } });
  const setRemove = (patch: Partial<SettingsState["remove"]>) => set({ remove: { ...state().remove, ...patch } });
  const setLogin = (login: string) => { if (store.state.account.login !== login) store.update((s) => ({ ...s, account: { login } })); };
  const available = () => Boolean(fr);
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown, enabled?: (s: St) => boolean) =>
    commands.register<A>({ id, title: `command.${id}`, ...(enabled ? { enabled } : {}), run: async (a) => { await run(a); } });
  const value = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");

  /** Asks the shell where the account stands (Git's helper, checked with the API). */
  const checkAccount = async () => {
    if (!fr) return;
    set({ checking: true });
    const a = await fr.account().catch(() => undefined);
    set({ checking: false, ...(a ? { account: a } : {}) });
  };

  // ---- the dialog ----
  commands.register({
    id: "settings.open", title: "command.settings.open", icon: "settings",
    shortcut: { default: "Mod+," }, layer: "basic", group: "app",
    // Where there's no account to manage (the browser), it isn't in the cheat sheet either.
    ...(fr ? {} : { planned: true }),
    enabled: available,
    disabledReason: "command.settings.open.reason",
    run: async () => {
      store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, settings: { ...s.ui.settings, open: true } } }));
      await checkAccount();
    },
  });
  reg<{ open: boolean }>("settings.setOpen", ({ open }) => { if (!open) set({ open: false }); });
  const sections = () => SETTINGS_SECTIONS.filter((id) => (id !== "sharing" || bridge.access) && (id !== "about" || bridge.diagnostics));
  reg<{ value: string }>("settings.setSection", async (a) => {
    const v = value(a);
    if (!sections().includes(v as SettingsSection)) return;
    set({ section: v as SettingsSection });
    if (v === "sharing") await commands.run("share.manage.load");
    if (v === "about") await commands.run("diagnostics.load");
  });
  registerDiagnostics({ store, bridge, catalog, commands, viewModels, toast });

  // ---- Account (FRE-07) ----
  reg("account.openGitHub", () => fr?.openPage(state().account?.via === "helper" ? "tokens" : "authorizations"));
  // Sign out asks first: Git's sign-in goes too unless the person keeps it for the terminal.
  commands.register({
    id: "account.signOut", title: "command.account.signOut", icon: "dismiss",
    enabled: (s) => Boolean(s.account.login),
    run: () => set({ open: false, signOut: { open: true, git: true, busy: false } }),
  });
  reg<{ open: boolean }>("account.setSignOutOpen", ({ open }) => { if (!open && !state().signOut.busy) setSignOut({ open: false }); });
  reg<{ value: string }>("account.setSignOutGit", (a) => { if (a.value === "remove" || a.value === "keep") setSignOut({ git: a.value === "remove" }); });
  reg("account.signOutNow", async () => {
    const { git, busy } = state().signOut;
    if (!fr || busy) return;
    setSignOut({ busy: true });
    const before = store.state.account.login || state().account?.account?.login || "";
    const r = await fr.signOut({ git }).catch(() => undefined);
    setSignOut({ busy: false });
    if (!r || (r.account && !r.signedOut)) return void toast(catalog.format("toast.signOutFailed"), { tone: "error" });
    setSignOut({ open: false });
    set({ account: r });
    setLogin("");
    // The recent note goes with the account (PRV-02); the shell deletes its own files.
    await persistAppState(Object.fromEntries(RECENT_STATE_KEYS.map((k) => [k, undefined])) as Partial<AppStateFile>);
    toast(git ? catalog.format("toast.signedOut") : catalog.format("toast.signedOutApp", { login: `@${r.account?.login ?? before}` }));
  }, available);
  /** Sign in again: the Sign in step alone, which offers the account Git still has. */
  reg("account.signIn", async () => {
    set({ open: false });
    await again("account");
  }, available);
  /** Switch account: the shell takes the current credential out of Git's helper, then the Sign in step signs in as someone else. */
  reg("account.switch", async () => {
    if (!fr?.beginSwitch) return;
    set({ open: false });
    if (!(await flush())) return void toast(catalog.format("toast.saveFailed"), { tone: "error" });
    const a = await fr.beginSwitch().catch(() => undefined);
    if (a) set({ account: a });
    setLogin("");
    if (!(await again("account", { other: true }))) await fr.endSwitch?.().then((r) => setLogin(r.account && !r.signedOut ? r.account.login : ""), () => {});
  }, (s) => available() && Boolean(s.account.login));

  // ---- Workspace (FRE-07, PRV-02) ----
  reg("setup.runAgain", async () => {
    if (!bridge.setup) return;
    set({ open: false });
    if (!(await again("setup"))) return;
    // Forgets setup's progress: new names, a new folder, or publishing turned on later (D-98).
    await bridge.setup.reset().then((report) => store.update((s) => ({ ...s, setup: { available: true, report } })), () => {});
  }, () => Boolean(bridge.setup));
  /** Open another workspace from GitHub: the first run's Your notes step alone, for a signed-in person (D-124). */
  reg("workspace.openFromGitHub", async () => {
    set({ open: false });
    await again("workspace");
  }, (s) => available() && Boolean(s.account.login));
  const check = async () => {
    if (!ws?.removal) return;
    setRemove({ busy: true });
    const c = await ws.removal().catch((): RemovalCheck => ({ state: "failed", waiting: 0, folder: store.state.workspace.folder ?? "", repositories: [] }));
    setRemove({ busy: false, check: c });
  };
  reg("workspace.remove", async () => {
    set({ open: false, remove: { open: true, busy: true } });
    // What's typed is written first, so it counts as a change not on GitHub yet.
    await flush();
    await check();
  }, () => Boolean(ws?.removal));
  reg<{ open: boolean }>("workspace.setRemoveOpen", ({ open }) => { if (!open && !state().remove.busy) setRemove({ open: false }); });
  reg("workspace.removeSync", async () => {
    setRemove({ busy: true });
    await commands.run("sync.now");
    await check();
  });
  reg("workspace.removeConfirm", async () => {
    const r = state().remove;
    if (!ws?.remove || r.busy || r.check?.state !== "ready") return;
    setRemove({ busy: true });
    // The app's own part first: the recent note, and the first run at Your notes when the window starts again.
    const before = appState();
    await persistAppState({ firstRun: "notes", ...(Object.fromEntries(RECENT_STATE_KEYS.map((k) => [k, undefined])) as Partial<AppStateFile>) });
    const done = await ws.remove().catch((): RemovalCheck => ({ ...r.check!, state: "failed" }));
    if (done.state === "removed") return; // The window starts again.
    await persistAppState({ firstRun: before.firstRun, ...Object.fromEntries(RECENT_STATE_KEYS.map((k) => [k, before[k]])) });
    setRemove({ busy: false, check: done });
  });

  // ---- view models ----
  const OPTION = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  viewModels.register({
    id: "vm.settings",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, title: { type: "string" }, section: { type: "string", enum: [...SETTINGS_SECTIONS] }, sections: { type: "array", items: OPTION },
        account: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["checking", "signedIn", "signedOut"] }, signedIn: { type: "boolean" }, signedOut: { type: "boolean" }, checking: { type: "boolean" },
            login: { type: "string" }, name: { type: "string" }, via: { type: "string" }, gitLogin: { type: "string" }, hasGitLogin: { type: "boolean" }, canSwitch: { type: "boolean" },
          },
        },
        workspace: {
          type: "object",
          properties: {
            folder: { type: "string" }, folderText: { type: "string" }, git: { type: "boolean" }, canRemove: { type: "boolean" }, canRunSetup: { type: "boolean" }, gitNote: { type: "string" },
            setupLabel: { type: "string" }, canOpenOther: { type: "boolean" },
          },
        },
        appearance: {
          type: "object",
          properties: { summary: { type: "string" }, scale: { type: "string" }, scales: { type: "array", items: OPTION }, canSync: { type: "boolean" }, syncOn: { type: "boolean" } },
        },
      },
    },
    setters: { section: "settings.setSection", "appearance.scale": "ui.setScale" },
    reads: ["ui.settings", "account", "sync.git", "workspace.folder", "appearance", "settingsSync"],
    select: (s) => {
      const st = s.ui.settings;
      const a = st.account;
      const signedIn = Boolean(a?.account && !a.signedOut && s.account.login);
      const astate = signedIn ? "signedIn" : st.checking && !a ? "checking" : "signedOut";
      const via = a?.via ?? (a?.gcm ? "gcm" : "helper");
      const folder = s.workspace.folder ?? "";
      return {
        open: st.open, title: catalog.format("settings.title"), section: st.section,
        sections: sections().map((id) => ({ id, label: catalog.format(`settings.section.${id}`) })),
        account: {
          state: astate, signedIn: astate === "signedIn", signedOut: astate === "signedOut", checking: astate === "checking",
          login: signedIn ? `@${a!.account!.login}` : "", name: signedIn ? a!.account!.name || a!.account!.login : "",
          via: signedIn ? catalog.format(`settings.account.via.${via}`) : "",
          gitLogin: a?.signedOut && a.account ? `@${a.account.login}` : "", hasGitLogin: Boolean(a?.signedOut && a.account),
          canSwitch: signedIn && Boolean(fr?.beginSwitch),
        },
        workspace: {
          folder, folderText: catalog.format("settings.workspace.folder", { folder }), git: s.sync.git,
          canRemove: s.sync.git && Boolean(ws?.remove), canRunSetup: Boolean(bridge.setup),
          gitNote: catalog.format(s.sync.git ? "settings.workspace.git" : "settings.workspace.local"),
          // A folder used on this computer only connects to GitHub through the same setup (D-124).
          setupLabel: catalog.format(s.sync.git ? "command.setup.runAgain" : "settings.workspace.connect"),
          canOpenOther: available() && Boolean(s.account.login),
        },
        // A summary that opens the theme manager: theme choice has one home (DD-SET-02).
        appearance: {
          summary: catalog.format("settings.appearance.summary", {
            mode: catalog.format(`command.appearance.${s.appearance.mode}`),
            light: catalog.format(themeById(s.appearance.lightTheme)?.title ?? "theme.paper"),
            dark: catalog.format(themeById(s.appearance.darkTheme)?.title ?? "theme.ink"),
            size: s.appearance.fontSize, font: catalog.format(`font.${s.appearance.contentFont}`),
          }),
          scale: String(s.appearance.uiScale),
          scales: UI_SCALES.map((v) => ({ id: String(v), label: catalog.format("settings.appearance.percent", { value: Math.round(v * 100) }) })),
          canSync: s.settingsSync !== "unavailable", syncOn: s.settingsSync === "on",
        },
      };
    },
  });
  viewModels.register({
    id: "vm.signOut",
    schema: {
      type: "object",
      properties: { open: { type: "boolean" }, git: { type: "string", enum: ["remove", "keep"] }, gitOptions: { type: "array", items: OPTION }, busy: { type: "boolean" }, gitNote: { type: "string" } },
    },
    setters: { git: "account.setSignOutGit" },
    reads: ["ui.settings.signOut"],
    select: (s) => {
      const o = s.ui.settings.signOut;
      return {
        open: o.open, git: o.git ? "remove" : "keep", busy: o.busy,
        gitOptions: ["remove", "keep"].map((id) => ({ id, label: catalog.format(`signOut.git.${id}`) })),
        gitNote: catalog.format(o.git ? "signOut.git.removeNote" : "signOut.git.keepNote"),
      };
    },
  });
  viewModels.register({
    id: "vm.removeWorkspace",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, busy: { type: "boolean" }, state: { type: "string", enum: ["checking", "ready", "unpushed", "notGit", "notWorkspace", "failed", "removed"] },
        message: { type: "string" }, canRemove: { type: "boolean" }, canSync: { type: "boolean" }, checking: { type: "boolean" },
      },
    },
    reads: ["ui.settings.remove"],
    select: (s) => {
      const r = s.ui.settings.remove;
      const c = r.check;
      const st = !c || (r.busy && c.state !== "ready" && c.state !== "unpushed") ? "checking" : c.state;
      const repos = c?.repositories ?? [];
      const message = st === "checking" ? catalog.format("remove.checking")
        : st === "unpushed" ? catalog.format("remove.unpushed", { count: c!.waiting })
          : st === "ready" ? catalog.format("remove.ready", { repos: repos.length > 1 ? catalog.format("remove.repos", { first: repos[0]!, second: repos[1]! }) : repos[0] ?? "", folder: c!.folder })
            : catalog.format(`remove.${st}`);
      return { open: r.open, busy: r.busy, state: st, message, canRemove: st === "ready", canSync: st === "unpushed", checking: st === "checking" };
    },
  });
}
