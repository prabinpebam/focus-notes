/**
 * The desktop's first run in the app (FRE-01 to FRE-06, D-101, D-124): four steps, one card each,
 * in words anyone understands, that the keyboard alone can finish and that resume after quitting.
 * Welcome; Connect (Git checked silently, then the GitHub account through Git's own sign-in
 * helpers); Your notes (the workspaces the account has, or Create my notes); Ready. Technical
 * choices wait under Having trouble? and More options. The shell does the work through
 * `bridge.firstRun` (Git, Git's sign-in helpers, GitHub's API) and `bridge.setup` (Create my
 * notes); the app keeps where the person is and turns it into `vm.firstRun`. Also the desktop's
 * account state for the bottom-left pill (UI-12): the login Git is signed in as.
 */
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import { formatChord } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { isRepoName, DEFAULT_SETUP, type SetupReport } from "./setup.ts";
import type { SetupState } from "./setup-app.ts";
import {
  canContinue, FIRST_RUN_STEPS, looksLikeToken, nextStep, notesIdentity, prevStep, resumeStep,
  type AccountStatus, type FirstRunPage, type FirstRunStep, type GitCheck, type RepoChoice, type WorkspaceResult,
} from "./first-run.ts";

export * from "./first-run.ts";

export type SignInPhase = "idle" | "code" | "window" | "waiting" | "token";
/**
 * Why the card shows: a new install's first run; Run setup again (from Connect, FRE-07); signing in
 * again or switching account (the Connect step alone, FRE-07); or Open another workspace from
 * GitHub (the Your notes step alone, D-124).
 */
export type FirstRunScope = "install" | "setup" | "account" | "workspace";
/** Your notes: the workspaces found, Create my notes, any repository from GitHub, or a folder here. */
export type WorkspaceMode = "found" | "create" | "clone" | "local";

export interface FirstRunState {
  active: boolean;
  scope: FirstRunScope;
  step: FirstRunStep;
  /** A check or an action is under way. */
  busy: boolean;
  git?: GitCheck;
  account?: AccountStatus;
  /** Use a different account: the account found isn't offered. */
  other: boolean;
  /** Having trouble? is open on Connect. */
  trouble: boolean;
  signIn: { phase: SignInPhase; code: string; helper: "gcm" | "gh" | "" };
  /** A pasted token, only until it's sent to the shell. Never persisted. */
  token: string;
  tokenError: boolean;
  workspace: {
    mode: WorkspaceMode;
    /** More options is open on Your notes. */
    more: boolean;
    /** Show details (the setup checklist) is open. */
    details: boolean;
    instance: string;
    private: string;
    publish: boolean;
    /** The browser passphrase (the vault) and its confirmation, only until setup starts. Never persisted. */
    passphrase: string;
    confirm: string;
    /** A message key for what's wrong, or "". */
    error: string;
    folder: string;
    repos: RepoChoice[];
    reposLoaded: boolean;
    query: string;
    activeId: string;
    result?: WorkspaceResult;
  };
  /** Bumped to move focus to the step's field. */
  focus: number;
}

export const FIRST_RUN_INACTIVE: FirstRunState = {
  active: false, scope: "install", step: "welcome", busy: false, other: false, trouble: false,
  signIn: { phase: "idle", code: "", helper: "" }, token: "", tokenError: false,
  workspace: {
    mode: "create", more: false, details: false, instance: DEFAULT_SETUP.instance, private: DEFAULT_SETUP.private, publish: DEFAULT_SETUP.publish,
    passphrase: "", confirm: "", error: "", folder: "", repos: [], reposLoaded: false, query: "", activeId: "",
  },
  focus: 0,
};

/** The desktop's GitHub account, for the account pill. Only the login: never a token. */
export interface AccountState {
  login: string;
}
export const NO_ACCOUNT: AccountState = { login: "" };

interface S { firstRun: FirstRunState; account: AccountState; setup: SetupState; sync: { git: boolean; problem?: string }; appearance: { mode: "system" | "light" | "dark"; contentFont: string }; focusMode: boolean }

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  toast: (message: string, opts?: { tone?: "info" | "error" }) => unknown;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  /** Saves and puts away the open note while the card shows again over the canvas. False if it couldn't be saved. */
  hold?: () => Promise<boolean>;
  /** Opens the note put away again. False if there was none. */
  release?: () => Promise<boolean>;
  /** Now, for "Updated 3 days ago". */
  now?: () => number;
}

/** The setup has made the workspace on this computer: cloned and linked (Writing starts before setup finishes). */
export const workspaceMade = (r?: SetupReport) => Boolean(r && !r.running && ["clone", "link"].every((id) => r.steps.find((x) => x.id === id)?.state === "done"));

const DAY = 86_400_000;

/** The commands that still work while setup owns the window (D-126); every other one is held. */
/** An image the renderer may show: a data URL the shell made, never an address to fetch. */
const AVATAR = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
/** "Ada Lovelace" → "AL"; a login → its first letter. */
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

export const SETUP_COMMANDS = /^(firstRun\.|window\.|toast\.|setup\.|keys\.|ui\.scale|appearance\.(system|light|dark)$|notes\.import$|command\.run$|app\.ready$)/;

export function registerFirstRun<St extends S>({ store, bridge, catalog, commands, viewModels, toast, persistAppState, hold, release, now = Date.now }: Ctx<St>) {
  const fr = bridge.firstRun;
  const state = () => store.state.firstRun;
  const set = (patch: Partial<FirstRunState>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, ...patch } }));
  const setWs = (patch: Partial<FirstRunState["workspace"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, workspace: { ...s.firstRun.workspace, ...patch } } }));
  const setSignIn = (patch: Partial<FirstRunState["signIn"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, signIn: { ...s.firstRun.signIn, ...patch } } }));
  const setLogin = (login: string) => { if (store.state.account.login !== login) store.update((s) => ({ ...s, account: { login } })); };
  const bump = () => set({ focus: state().focus + 1 });
  /** Runs a shell call with the step marked busy; a call that throws counts as "didn't work". */
  const busy = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    set({ busy: true });
    try {
      return await fn();
    } catch {
      return undefined;
    } finally {
      set({ busy: false });
    }
  };
  /** The login the app is signed in as: Git's account, unless Focus Notes alone was signed out (FRE-07). */
  const signedInAs = (a: AccountStatus | undefined) => (a?.account && !a.signedOut ? a.account.login : "");
  const applyAccount = (a: AccountStatus | undefined) => {
    set({ account: a ?? { gcm: state().account?.gcm ?? false, gh: state().account?.gh ?? false, problem: "failed" } });
    if (signedInAs(a)) setLogin(signedInAs(a));
  };
  /** Your notes starts at the workspaces found, or at Create my notes (Open from GitHub when it's shown alone). */
  const baseMode = (): WorkspaceMode => (state().workspace.repos.some((r) => r.instance) ? "found" : state().scope === "workspace" ? "clone" : "create");
  const loadRepos = async () => {
    const repos = await busy(() => fr!.repositories());
    setWs({ repos: repos ?? [], reposLoaded: Boolean(repos), activeId: repos?.[0] ? `${repos[0].owner}/${repos[0].name}` : "", ...(repos ? {} : { error: "firstRun.notes.error.offline" }) });
  };

  // ---- what each step finds out on arrival ----
  const arrive: Partial<Record<FirstRunStep, () => Promise<void>>> = {
    // Git first, silently: it shows only when it's missing or too old. Then the account.
    connect: async () => {
      const { account: _gone, ...rest } = state();
      store.update((s) => ({ ...s, firstRun: { ...rest, other: rest.scope === "account" && rest.other, token: "", tokenError: false } }));
      setSignIn({ phase: "idle", code: "", helper: "" });
      const git = (await busy(() => fr!.git())) ?? { installed: false, ok: false, gcm: false, gh: false };
      set({ git });
      if (git.ok) applyAccount(await busy(() => fr!.account()));
      bump();
    },
    notes: async () => {
      const folder = await busy(() => fr!.folder());
      setWs({ folder: folder ?? "", error: "", more: false, details: false });
      if (store.state.setup.report?.options) return setWs({ mode: "create" });
      if (!state().workspace.reposLoaded) await loadRepos();
      setWs({ mode: baseMode(), query: "" });
      bump();
    },
  };
  const go = async (step: FirstRunStep) => {
    // Signing in again or switching account is the Connect step alone; Open another workspace, Your notes alone.
    if ((state().scope === "account" && step !== "connect") || (state().scope === "workspace" && step !== "notes")) return close(true);
    set({ step, trouble: false, focus: state().focus + 1 });
    await persistAppState({ firstRun: step });
    await arrive[step]?.();
  };
  /**
   * The card closes and writing carries on: the note put away comes back (Run setup again, Sign in,
   * Switch account, Open another workspace), or a new one on a new install. An account flow ends in
   * the shell, which puts the old sign-in back if no account signed in (FRE-07).
   */
  const close = async (finished: boolean) => {
    const { scope } = state();
    set({ active: false, scope: "install", other: false, trouble: false, busy: false });
    setSignIn({ phase: "idle", code: "" });
    if (scope === "account") {
      const a = (await fr?.endSwitch?.().catch(() => undefined)) ?? state().account;
      setLogin(signedInAs(a));
      if (finished && signedInAs(a)) toast(catalog.format("toast.signedIn", { login: signedInAs(a) }));
    } else await persistAppState({ firstRun: "done" });
    if (!(await release?.()) && scope === "install") await commands.run("note.new");
  };
  /** The first step of each scope, where Esc leaves instead of going back. */
  const firstStep = (scope: FirstRunScope): FirstRunStep | undefined => (scope === "setup" || scope === "account" ? "connect" : scope === "workspace" ? "notes" : undefined);

  /**
   * Leaves Connect signed in: the notes' name and email come from the account, for the notes only
   * (FRE-05, D-124). Not when only the account changes (Switch account).
   */
  const connected = async () => {
    const a = state().account?.account;
    if (!a || state().account?.signedOut) return;
    if (state().scope !== "account") await busy(() => fr!.setIdentity(notesIdentity(a), "workspace"));
    await go("notes");
  };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown, enabled?: (s: St) => boolean) =>
    commands.register<A>({ id, title: `command.${id}`, ...(enabled ? { enabled } : {}), run: async (a) => { await run(a); } });
  // Nothing outside setup works until it's done (D-126): only setup's own commands, the window's,
  // zoom, toasts, and what its steps run (Ready's look and import) are left.
  commands.setHold((id, s) => (s.firstRun.active && !SETUP_COMMANDS.test(id) ? "command.firstRun.held" : undefined));
  const value = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");

  // ---- moving between steps ----
  reg("firstRun.next", async () => {
    const s = state();
    if (!s.active || s.busy) return;
    if (s.step === "connect") return s.git && !s.git.ok ? arrive.connect!() : commands.run("firstRun.useExisting");
    if (s.step === "notes") return commands.run("firstRun.openWorkspace");
    if (s.step === "ready") return commands.run("firstRun.finish");
    const next = nextStep(s.step);
    if (next !== "done") await go(next);
  });
  // Esc goes back (Principles of the desktop first run): while focus is in the card.
  commands.register({ id: "firstRun.back", title: "command.firstRun.back", shortcut: { default: "Escape", handledBy: "firstRun" }, layer: "basic", group: "app", run: async () => {
    const s = state();
    // Esc in a sign-in that's waiting cancels it first.
    if (s.active && s.step === "connect" && s.signIn.phase !== "idle" && s.signIn.phase !== "token") return commands.run("firstRun.cancelSignIn");
    if (s.active && s.signIn.phase === "token") return (setSignIn({ phase: "idle" }), bump());
    if (!s.active || s.busy) return;
    // Open another repository or a folder goes back to where Your notes started.
    if (s.step === "notes" && !store.state.setup.report?.options && s.workspace.mode !== baseMode()) return (setWs({ mode: baseMode(), error: "" }), bump());
    if (firstStep(s.scope) === s.step) return close(false);
    const prev = prevStep(s.step);
    if (prev !== s.step) await go(prev);
  } });

  // ---- Welcome ----
  // Just use this computer for now: notes in the default folder with no account; Settings connects later (D-124).
  reg("firstRun.local", () => close(true));

  // ---- Connect ----
  reg("firstRun.checkGit", () => arrive.connect!());
  reg("firstRun.checkAccount", () => arrive.connect!());
  reg("firstRun.toggleTrouble", () => set({ trouble: !state().trouble }));
  reg("firstRun.useExisting", async () => {
    const a = state().account;
    if (state().other) return;
    if (a?.account && !a.signedOut) return connected();
    // The GitHub CLI's session, or the account Git kept when Focus Notes alone signed out (FRE-07).
    if (a?.cliAccount || a?.signedOut) {
      applyAccount(await busy(() => fr!.useExisting()));
      if (signedInAs(state().account)) await connected();
    }
  });
  reg("firstRun.otherAccount", () => set({ other: true, trouble: false, focus: state().focus + 1 }));
  const signIn = (device: boolean) => async () => {
    if (state().busy) return;
    const a = state().account;
    setSignIn({ phase: "waiting", code: "", helper: a?.gcm ? "gcm" : "gh" });
    set({ account: { gcm: a?.gcm ?? false, gh: a?.gh ?? false }, other: true });
    const r = await busy(() => fr!.signIn(device));
    if (state().signIn.phase === "idle") return; // Cancelled meanwhile.
    setSignIn({ phase: "idle", code: "" });
    applyAccount(r);
    set({ other: false, trouble: false, focus: state().focus + 1 });
  };
  reg("firstRun.signIn", signIn(false));
  reg("firstRun.signInDevice", signIn(true));
  reg("firstRun.cancelSignIn", async () => {
    setSignIn({ phase: "idle", code: "" });
    set({ busy: false, focus: state().focus + 1 });
    await fr?.cancelSignIn();
  });
  reg("firstRun.copyCode", async () => {
    const code = state().signIn.code;
    if (code) await bridge.copyText?.(code);
    fr?.openPage("device");
  });
  reg("firstRun.useToken", () => {
    setSignIn({ phase: "token" });
    set({ token: "", tokenError: false, focus: state().focus + 1 });
  });
  reg<{ value: string }>("firstRun.setToken", (a) => set({ token: value(a), tokenError: false }));
  reg("firstRun.submitToken", async () => {
    const token = state().token.trim();
    // The token leaves the app's state at once, whatever happens next.
    set({ token: "" });
    if (!looksLikeToken(token)) return set({ tokenError: true, focus: state().focus + 1 });
    const r = await busy(() => fr!.useToken(token));
    applyAccount(r);
    if (r?.account) setSignIn({ phase: "idle" });
    set({ other: false, trouble: false, focus: state().focus + 1 });
  });
  reg<{ page: FirstRunPage }>("firstRun.openPage", ({ page }) => fr?.openPage(page));

  // ---- Your notes ----
  reg<{ value: string }>("firstRun.setMode", async (a) => {
    if (a.value !== "found" && a.value !== "create" && a.value !== "clone" && a.value !== "local") return;
    setWs({ mode: a.value, error: "", query: "", more: false });
    if (a.value === "clone" && !state().workspace.reposLoaded) await loadRepos();
    bump();
  });
  reg("firstRun.findNotes", async () => {
    setWs({ error: "", reposLoaded: false });
    await loadRepos();
    if (state().workspace.reposLoaded) setWs({ mode: baseMode() });
    bump();
  });
  reg("firstRun.toggleMore", () => setWs({ more: !state().workspace.more }));
  reg("firstRun.toggleDetails", () => setWs({ details: !state().workspace.details }));
  reg<{ value: string }>("firstRun.setInstance", (a) => setWs({ instance: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setPrivate", (a) => setWs({ private: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setPublish", (a) => setWs({ publish: a.value !== "off" }));
  reg<{ value: string }>("firstRun.setPassphrase", (a) => setWs({ passphrase: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setConfirm", (a) => setWs({ confirm: value(a), error: "" }));
  reg("firstRun.chooseFolder", async () => {
    const folder = await busy(() => fr!.chooseFolder());
    if (folder) setWs({ folder, error: "" });
  });
  // Create my notes: with the browser passphrase only when one was typed under More options (D-124).
  reg("firstRun.create", async () => {
    const w = state().workspace;
    if (state().busy || !bridge.setup) return;
    const fail = (error: string) => (setWs({ error, more: true }), bump());
    if (!isRepoName(w.instance) || !isRepoName(w.private) || w.instance.toLowerCase() === w.private.toLowerCase()) return fail("firstRun.workspace.error.names");
    let passphrase: string | undefined;
    if (w.passphrase || w.confirm) {
      const strength = await busy(() => bridge.setup!.passphraseStrength(w.passphrase));
      if (!strength?.ok) return fail("setup.problem.weak");
      if (w.confirm !== w.passphrase) return fail("firstRun.workspace.error.confirm");
      passphrase = w.passphrase;
    }
    // The passphrase goes to the shell once, for the vault step, and leaves the app's state now.
    setWs({ passphrase: "", confirm: "", error: "", more: false });
    const r = await busy(() => bridge.setup!.start({ instance: w.instance, private: w.private, folder: w.folder, publish: w.publish }, passphrase));
    if (r) store.update((s) => ({ ...s, setup: { available: true, report: r } }));
    else setWs({ error: "firstRun.workspace.error.failed" });
    bump();
  });
  reg<{ value: string }>("firstRun.setQuery", (a) => {
    const query = value(a);
    const first = matches(state().workspace.repos, query)[0];
    setWs({ query, activeId: first ? `${first.owner}/${first.name}` : "" });
  });
  reg<{ id: string }>("firstRun.setActive", ({ id }) => { if (typeof id === "string") setWs({ activeId: id }); });
  const moveActive = (dir: 1 | -1) => () => {
    const list = matches(state().workspace.repos, state().workspace.query).map((r) => `${r.owner}/${r.name}`);
    const i = list.indexOf(state().workspace.activeId);
    const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    if (next) setWs({ activeId: next });
  };
  commands.register({ id: "firstRun.nextRepo", title: "command.firstRun.nextRepo", shortcut: { default: "Down", handledBy: "repoField" }, layer: "basic", group: "files", run: moveActive(1) });
  commands.register({ id: "firstRun.prevRepo", title: "command.firstRun.prevRepo", shortcut: { default: "Up", handledBy: "repoField" }, layer: "basic", group: "files", run: moveActive(-1) });
  const opened = async (r: WorkspaceResult | undefined) => {
    if (!r) return;
    if (!r.ok) return (setWs({ result: r, error: `firstRun.workspace.problem.${r.problem ?? "failed"}` }), bump());
    setWs({ result: r, error: "" });
    await commands.run("firstRun.openWorkspace");
  };
  // Open: a workspace found, or any repository from GitHub, cloned here and then opened.
  reg<{ id: string }>("firstRun.clone", async ({ id }) => {
    const target = typeof id === "string" && id ? id : state().workspace.activeId;
    const repo = state().workspace.repos.find((r) => `${r.owner}/${r.name}` === target);
    if (!repo || state().busy) return;
    await opened(await busy(() => fr!.clone(repo.owner, repo.name)) ?? { ok: false, problem: "failed" });
  });
  commands.register({ id: "firstRun.cloneActive", title: "command.firstRun.clone", shortcut: { default: "Enter", handledBy: "repoField" }, layer: "basic", group: "files", run: () => commands.run("firstRun.clone", { id: "" }) });
  reg("firstRun.openFolder", async () => {
    if (state().busy) return;
    await opened(await busy(() => fr!.openFolder()));
  });
  reg("firstRun.openWorkspace", async () => {
    const s = store.state;
    if (s.firstRun.busy || (!workspaceMade(s.setup.report) && !s.firstRun.workspace.result?.ok)) return;
    // The window starts again in the workspace: at Ready, or writing when Your notes was shown alone.
    const alone = s.firstRun.scope === "workspace";
    await persistAppState({ firstRun: alone ? "done" : "ready" });
    const r = await busy(() => fr!.openWorkspace());
    if (!r?.ok) {
      await persistAppState({ firstRun: alone ? "done" : "notes" });
      setWs({ error: `firstRun.workspace.problem.${r?.problem ?? "failed"}` });
    }
  });

  // ---- Ready ----
  reg<{ value: string }>("firstRun.setTheme", (a) => (["system", "light", "dark"].includes(value(a)) ? commands.run(`appearance.${value(a)}`) : undefined));
  // Start writing: a new note, private by default (D-05), or the note put away for Run setup again.
  reg("firstRun.finish", () => close(true));

  // ---- the account pill (UI-12): Sync now; Sign out is Settings' (settings-app.ts) ----
  commands.register({
    id: "sync.now", title: "command.sync.now", icon: "save",
    enabled: (s) => s.sync.git,
    run: (_a, c) => c.run("note.save"),
  });

  /** "Updated 3 days ago", from a repository's last push. */
  const updated = (iso: string | undefined) => {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return "";
    const days = Math.max(0, Math.floor((now() - t) / DAY));
    if (days < 1) return catalog.format("firstRun.notes.updated.today");
    if (days < 60) return catalog.format("firstRun.notes.updated.days", { count: days });
    if (days < 730) return catalog.format("firstRun.notes.updated.months", { count: Math.floor(days / 30) });
    return catalog.format("firstRun.notes.updated.years", { count: Math.floor(days / 365) });
  };

  const STEP_ENUM = [...FIRST_RUN_STEPS];
  const OPTION = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, description: { type: "string" as const }, icon: { type: "string" as const } } };
  const options = (prefix: string, ids: readonly string[]) => ids.map((id) => ({ id, label: catalog.format(`${prefix}.${id}`) }));
  viewModels.register({
    id: "vm.firstRun",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, step: { type: "string", enum: STEP_ENUM }, align: { type: "string", enum: ["start", "center"] }, title: { type: "string" }, progress: { type: "string" }, showProgress: { type: "boolean" },
        busy: { type: "boolean" }, focus: { type: "number" }, canContinue: { type: "boolean" },
        connect: { type: "string", enum: ["checking", "git", "found", "cli", "choose", "code", "window", "waiting", "token"] }, trouble: { type: "boolean" },
        isGit: { type: "boolean" }, isChoose: { type: "boolean" }, showTrouble: { type: "boolean" },
        gitState: { type: "string", enum: ["checking", "ok", "old", "missing"] }, gitText: { type: "string" }, installText: { type: "string" }, installCommand: { type: "string" },
        login: { type: "string" }, handle: { type: "string" }, accountName: { type: "string" }, avatar: { type: "string" }, initials: { type: "string" }, foundText: { type: "string" }, continueAs: { type: "string" }, code: { type: "string" },
        canHelper: { type: "boolean" }, noHelper: { type: "boolean" }, problem: { type: "string" }, hasProblem: { type: "boolean" }, offline: { type: "boolean" }, canOther: { type: "boolean" },
        token: { type: "string" }, tokenError: { type: "boolean" },
        panel: { type: "string", enum: ["checking", "found", "create", "clone", "local", "progress"] }, more: { type: "boolean" }, details: { type: "boolean" }, canCreate: { type: "boolean" },
        isCreate: { type: "boolean" }, showMore: { type: "boolean" }, working: { type: "boolean" },
        found: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, detail: { type: "string" }, badge: { type: "string" }, icon: { type: "string" }, first: { type: "boolean" } } } },
        instance: { type: "string" }, private: { type: "string" }, publish: { type: "string" }, publishOptions: { type: "array", items: OPTION },
        passphrase: { type: "string" }, confirm: { type: "string" }, folder: { type: "string" }, folderText: { type: "string" },
        error: { type: "string" }, hasError: { type: "boolean" }, started: { type: "boolean" }, made: { type: "boolean" }, progressText: { type: "string" },
        query: { type: "string" }, activeId: { type: "string" }, reposSummary: { type: "string" },
        repos: { type: "array", items: ITEM },
        theme: { type: "string" }, themeOptions: { type: "array", items: OPTION },
        canImport: { type: "boolean" }, searchHint: { type: "string" },
      },
    },
    setters: {
      token: "firstRun.setToken", instance: "firstRun.setInstance", private: "firstRun.setPrivate", publish: "firstRun.setPublish", passphrase: "firstRun.setPassphrase",
      confirm: "firstRun.setConfirm", query: "firstRun.setQuery", theme: "firstRun.setTheme",
    },
    // Ready's import button shows the import command's state, which depends on the shell (WP-3.4).
    reads: ["firstRun", "setup", "account", "appearance.mode"],
    select: (s) => {
      const f = s.firstRun;
      const i = FIRST_RUN_STEPS.indexOf(f.step);
      const a = f.account;
      const g = f.git;
      const gitState = !g ? "checking" : g.ok ? "ok" : g.installed ? "old" : "missing";
      // git: Git is missing or too old; found: Git is signed in (Continue as @login); cli: the GitHub CLI is;
      // choose: neither, or a different account. An account Git kept when Focus Notes alone signed out is offered like any found one (FRE-07).
      const connect = f.signIn.phase !== "idle" ? f.signIn.phase
        : !g ? "checking" : !g.ok ? "git"
        : !a ? "checking" : a.account && !f.other ? "found" : a.cliAccount && !f.other ? "cli" : "choose";
      const shown = connect === "cli" ? a?.cliAccount : a?.account;
      const problem = a?.problem && connect === "choose" ? catalog.format(`firstRun.signIn.problem.${a.problem}`) : "";
      const platform = bridge.platform === "macos" ? "macos" : bridge.platform === "linux" ? "linux" : "windows";
      const w = f.workspace;
      const started = Boolean(s.setup.report?.options);
      const panel = started ? "progress" : !w.reposLoaded && f.busy && w.mode !== "local" ? "checking" : w.mode;
      const failed = Boolean(s.setup.report?.steps.some((x) => x.state === "failed"));
      const made = workspaceMade(s.setup.report);
      const list = matches(w.repos, w.query);
      const login = shown?.login ?? "";
      return {
        // Welcome is the hero, centred; the steps after it read from the start (D-126).
        open: f.active, step: f.step, align: f.step === "welcome" ? "center" : "start",
        title: f.step === "notes" ? catalog.format(`firstRun.notes.title.${panel}`) : catalog.format(`firstRun.${f.step}.title`),
        progress: catalog.format("firstRun.progress", { n: i + 1, total: FIRST_RUN_STEPS.length }), showProgress: f.scope === "install" || f.scope === "setup",
        busy: f.busy, focus: f.focus, canContinue: canContinue(f.step, { ...(g ? { git: g } : {}), ...(a ? { account: a } : {}), workspaceReady: made }),
        connect, trouble: f.trouble,
        isGit: connect === "git", isChoose: connect === "choose", showTrouble: ["git", "found", "cli", "choose"].includes(connect),
        gitState, gitText: g?.version ? catalog.format(g.ok ? "firstRun.git.ok" : "firstRun.git.old", { version: g.version }) : catalog.format("firstRun.git.missing"),
        installText: catalog.format(`firstRun.git.install.${platform}`), installCommand: catalog.format(`firstRun.git.command.${platform}`),
        login, handle: login ? `@${login}` : "", accountName: shown?.name || login,
        // The account's picture, fetched by the shell and handed over as a data URL (no request from here), or its initials.
        avatar: shown?.avatar && AVATAR.test(shown.avatar) ? shown.avatar : "", initials: initials(shown?.name || login),
        foundText: login ? catalog.format("firstRun.connect.found", { login, name: shown?.name || login }) : "",
        continueAs: catalog.format("firstRun.signIn.continueAs", { name: (shown?.name || login).trim().split(/\s+/)[0] ?? login }),
        code: f.signIn.code,
        canHelper: Boolean(a?.gcm || a?.gh), noHelper: Boolean(a && !a.gcm && !a.gh), problem, hasProblem: Boolean(problem), offline: a?.problem === "offline",
        canOther: connect === "found" || connect === "cli",
        token: f.token, tokenError: f.tokenError,
        panel, more: w.more, details: w.details || failed, canCreate: f.scope !== "workspace",
        isCreate: panel === "create", showMore: panel === "create" || panel === "found", working: started && !made && !w.error && !failed,
        found: w.repos.filter((r) => r.instance).slice(0, 5).map((r, n) => ({
          id: `${r.owner}/${r.name}`, first: n === 0, label: !s.account.login || r.owner === s.account.login ? r.name : `${r.owner}/${r.name}`,
          icon: r.private ? "lock" : "folder", detail: updated(r.pushedAt), badge: catalog.format(r.private ? "firstRun.notes.private" : "firstRun.notes.public"),
        })),
        instance: w.instance, private: w.private, publish: w.publish ? "on" : "off", publishOptions: options("firstRun.workspace.publish", ["on", "off"]),
        passphrase: w.passphrase, confirm: w.confirm, folder: w.folder, folderText: catalog.format("firstRun.workspace.folder", { folder: w.folder }),
        error: w.error && catalog.has(w.error) ? catalog.format(w.error) : "", hasError: Boolean(w.error),
        started, made, progressText: catalog.format(made ? "firstRun.workspace.made" : failed ? "firstRun.notes.failed" : "firstRun.notes.creating"),
        query: w.query, activeId: w.activeId,
        reposSummary: !w.reposLoaded ? "" : list.length ? catalog.format("firstRun.workspace.repos", { count: list.length }) : catalog.format("firstRun.workspace.noRepos"),
        repos: list.map((r) => ({
          id: `${r.owner}/${r.name}`, label: `${r.owner}/${r.name}`, icon: r.private ? "lock" : "document",
          description: catalog.format(r.instance ? "firstRun.workspace.repo.instance" : r.private ? "firstRun.workspace.repo.private" : "firstRun.workspace.repo.public"),
        })),
        theme: s.appearance.mode, themeOptions: options("firstRun.ready.theme", ["system", "light", "dark"]),
        canImport: commands.has("notes.import") && commands.describe("notes.import").enabled,
        searchHint: catalog.format("firstRun.ready.search", { mod: formatChord("Mod+/", bridge.platform) }),
      };
    },
  });

  /** Fetches the login for the pill once the workspace is a Git repository, never on the first frame's path. */
  let accountAsked = false;
  const askAccount = () => {
    if (accountAsked || !fr || state().active || !store.state.sync.git) return;
    accountAsked = true;
    void fr.account().then((a) => setLogin(signedInAs(a)), () => {});
  };

  return {
    /** Starts the first run if this shell has one and it isn't done. Resolves to whether it's showing. */
    async begin(app: AppStateFile): Promise<boolean> {
      if (!fr) return false;
      fr.onSignIn((p) => { if (state().signIn.phase !== "idle") setSignIn({ phase: p.phase, code: p.code ?? "", helper: p.helper }); });
      store.subscribe(askAccount);
      // People who wrote with the app before it had a first run keep writing (D-101).
      if (app.firstRun === "done" || (app.firstRun === undefined && app.lastNotePath)) return false;
      // An earlier version's step resumes at the step that holds it now (D-124).
      const step = resumeStep(app.firstRun) ?? "welcome";
      set({ active: true, step, focus: state().focus + 1 });
      void arrive[step]?.();
      return true;
    },
    /**
     * Shows the card again over the canvas (FRE-07, D-124): Run setup again from Connect; the Connect
     * step alone to sign in again or switch account (`other` starts at "a different account"); or the
     * Your notes step alone to open another workspace from GitHub. The open note is saved and put away
     * until the card closes. Resolves to whether it's showing.
     */
    async again(scope: "setup" | "account" | "workspace", opts: { other?: boolean } = {}): Promise<boolean> {
      const step = firstStep(scope)!;
      if (!fr || state().active || (hold && !(await hold()))) return false;
      set({ active: true, scope, step, other: Boolean(opts.other), trouble: false, busy: false, focus: state().focus + 1 });
      setSignIn({ phase: "idle", code: "", helper: "" });
      if (scope === "workspace") setWs({ reposLoaded: false, repos: [], mode: "clone", error: "" });
      if (scope === "setup") await persistAppState({ firstRun: step });
      void arrive[step]?.();
      return true;
    },
    /** Whether the card is showing. */
    get active() {
      return state().active;
    },
  };
}

function matches(repos: RepoChoice[], query: string): RepoChoice[] {
  const q = query.trim().toLowerCase();
  return repos.filter((r) => !q || `${r.owner}/${r.name}`.toLowerCase().includes(q)).slice(0, 100);
}
