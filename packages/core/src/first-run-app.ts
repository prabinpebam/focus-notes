/**
 * The desktop's first run in the app (FRE-01 to FRE-06, D-101): seven steps, one card each, that
 * the keyboard alone can finish and that resume after quitting. The shell does the work through
 * `bridge.firstRun` (Git, Git's sign-in helpers, GitHub's API) and `bridge.setup` (Create my
 * workspace); the app keeps where the person is and turns it into `vm.firstRun`. Also the
 * desktop's account state for the bottom-left pill (UI-12): the login Git is signed in as.
 */
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import { formatChord } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { CONTENT_FONTS } from "./themes.ts";
import { isRepoName, DEFAULT_SETUP, type SetupReport } from "./setup.ts";
import type { SetupState } from "./setup-app.ts";
import {
  canContinue, FIRST_RUN_STEPS, identityProblem, isFirstRunStep, looksLikeToken, nextStep, prevStep,
  type AccountStatus, type FirstRunPage, type FirstRunStep, type GitCheck, type Identity, type IdentityScope, type RepoChoice, type WorkspaceResult,
} from "./first-run.ts";

export * from "./first-run.ts";

export type SignInPhase = "idle" | "code" | "window" | "waiting" | "token";
export type WorkspaceMode = "create" | "clone" | "local";

export interface FirstRunState {
  active: boolean;
  step: FirstRunStep;
  /** A check or an action is under way. */
  busy: boolean;
  git?: GitCheck;
  account?: AccountStatus;
  /** Use a different account: the account found isn't offered. */
  other: boolean;
  signIn: { phase: SignInPhase; code: string; helper: "gcm" | "gh" | "" };
  /** A pasted token, only until it's sent to the shell. Never persisted. */
  token: string;
  tokenError: boolean;
  identity: { name: string; email: string; source: Identity["source"]; scope: IdentityScope; error: "" | "name" | "email" | "refused" };
  workspace: {
    mode: WorkspaceMode;
    instance: string;
    private: string;
    publish: boolean;
    /** The vault passphrase and its confirmation, only until setup starts. Never persisted. */
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
  active: false, step: "welcome", busy: false, other: false,
  signIn: { phase: "idle", code: "", helper: "" }, token: "", tokenError: false,
  identity: { name: "", email: "", source: "none", scope: "global", error: "" },
  workspace: {
    mode: "create", instance: DEFAULT_SETUP.instance, private: DEFAULT_SETUP.private, publish: DEFAULT_SETUP.publish,
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
}

/** The setup has made the workspace on this computer: cloned and linked (Writing starts before setup finishes). */
export const workspaceMade = (r?: SetupReport) => Boolean(r && !r.running && ["clone", "link"].every((id) => r.steps.find((x) => x.id === id)?.state === "done"));

const FONTS = CONTENT_FONTS.slice(0, 4);

export function registerFirstRun<St extends S>({ store, bridge, catalog, commands, viewModels, toast, persistAppState }: Ctx<St>) {
  const fr = bridge.firstRun;
  const state = () => store.state.firstRun;
  const set = (patch: Partial<FirstRunState>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, ...patch } }));
  const setWs = (patch: Partial<FirstRunState["workspace"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, workspace: { ...s.firstRun.workspace, ...patch } } }));
  const setId = (patch: Partial<FirstRunState["identity"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, identity: { ...s.firstRun.identity, ...patch } } }));
  const setSignIn = (patch: Partial<FirstRunState["signIn"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, signIn: { ...s.firstRun.signIn, ...patch } } }));
  const setLogin = (login: string) => { if (store.state.account.login !== login) store.update((s) => ({ ...s, account: { login } })); };
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
  const applyAccount = (a: AccountStatus | undefined) => {
    set({ account: a ?? { gcm: state().account?.gcm ?? false, gh: state().account?.gh ?? false, problem: "failed" } });
    if (a?.account) setLogin(a.account.login);
  };

  // ---- what each step finds out on arrival ----
  const arrive: Partial<Record<FirstRunStep, () => Promise<void>>> = {
    git: async () => { set({ git: await busy(() => fr!.git()) ?? { installed: false, ok: false, gcm: false, gh: false } }); },
    signIn: async () => {
      set({ other: false, token: "", tokenError: false });
      setSignIn({ phase: "idle", code: "", helper: "" });
      applyAccount(await busy(() => fr!.account()));
    },
    identity: async () => {
      const i = await busy(() => fr!.identity());
      if (i) setId({ name: i.name, email: i.email, source: i.source, error: "" });
    },
    workspace: async () => {
      const folder = await busy(() => fr!.folder());
      setWs({ folder: folder ?? "", error: "", ...(store.state.setup.report?.options ? { mode: "create" as const } : {}) });
    },
  };
  const go = async (step: FirstRunStep) => {
    set({ step, focus: state().focus + 1 });
    await persistAppState({ firstRun: step });
    await arrive[step]?.();
  };

  const ready = () => {
    const s = store.state;
    return canContinue(s.firstRun.step, { ...(s.firstRun.git ? { git: s.firstRun.git } : {}), ...(s.firstRun.account ? { account: s.firstRun.account } : {}), identity: s.firstRun.identity, workspaceReady: workspaceMade(s.setup.report) });
  };
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown, enabled?: (s: St) => boolean) =>
    commands.register<A>({ id, title: `command.${id}`, ...(enabled ? { enabled } : {}), run: async (a) => { await run(a); } });
  const value = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");

  // ---- moving between steps ----
  reg("firstRun.next", async () => {
    const s = state();
    if (!s.active || s.busy) return;
    if (s.step === "identity") return commands.run("firstRun.saveIdentity");
    if (s.step === "workspace") return commands.run("firstRun.openWorkspace");
    if (s.step === "ready") return commands.run("firstRun.finish");
    if (!ready()) return s.step === "git" ? arrive.git!() : undefined;
    const next = nextStep(s.step);
    if (next !== "done") await go(next);
  });
  // Esc goes back (Principles of the desktop first run): while focus is in the card.
  commands.register({ id: "firstRun.back", title: "command.firstRun.back", shortcut: { default: "Escape", handledBy: "firstRun" }, layer: "basic", group: "app", run: async () => {
    const s = state();
    // Esc in a sign-in that's waiting cancels it first.
    if (s.active && s.step === "signIn" && s.signIn.phase !== "idle" && s.signIn.phase !== "token") return commands.run("firstRun.cancelSignIn");
    if (s.active && s.signIn.phase === "token") return setSignIn({ phase: "idle" });
    if (!s.active || s.busy) return;
    const prev = prevStep(s.step);
    if (prev !== s.step) await go(prev);
  } });

  // ---- Git ----
  reg("firstRun.checkGit", () => arrive.git!());

  // ---- Sign in ----
  reg("firstRun.checkAccount", () => arrive.signIn!());
  reg("firstRun.useExisting", async () => {
    const a = state().account;
    if (a?.account) return go("identity");
    if (a?.cliAccount) {
      applyAccount(await busy(() => fr!.useExisting()));
      if (state().account?.account) await go("identity");
    }
  });
  reg("firstRun.otherAccount", () => set({ other: true, focus: state().focus + 1 }));
  const signIn = (device: boolean) => async () => {
    if (state().busy) return;
    const a = state().account;
    setSignIn({ phase: "waiting", code: "", helper: a?.gcm ? "gcm" : "gh" });
    set({ account: { gcm: a?.gcm ?? false, gh: a?.gh ?? false }, other: true });
    const r = await busy(() => fr!.signIn(device));
    if (state().signIn.phase === "idle") return; // Cancelled meanwhile.
    setSignIn({ phase: "idle", code: "" });
    applyAccount(r);
    set({ other: false, focus: state().focus + 1 });
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
    set({ other: false, focus: state().focus + 1 });
  });
  reg<{ page: FirstRunPage }>("firstRun.openPage", ({ page }) => fr?.openPage(page));

  // ---- Identity ----
  reg<{ value: string }>("firstRun.setName", (a) => setId({ name: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setEmail", (a) => setId({ email: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setScope", (a) => { if (a.value === "global" || a.value === "workspace") setId({ scope: a.value }); });
  reg("firstRun.saveIdentity", async () => {
    const i = state().identity;
    const problem = identityProblem(i);
    if (problem) return set({ identity: { ...i, error: problem }, focus: state().focus + 1 });
    const ok = await busy(() => fr!.setIdentity({ name: i.name.trim(), email: i.email.trim() }, i.scope));
    if (!ok) return setId({ error: "refused" });
    await go("workspace");
  });

  // ---- Workspace ----
  reg<{ value: string }>("firstRun.setMode", async (a) => {
    if (a.value !== "create" && a.value !== "clone" && a.value !== "local") return;
    setWs({ mode: a.value, error: "" });
    if (a.value === "clone" && !state().workspace.reposLoaded) {
      const repos = await busy(() => fr!.repositories());
      setWs({ repos: repos ?? [], reposLoaded: Boolean(repos), activeId: repos?.[0] ? `${repos[0].owner}/${repos[0].name}` : "", ...(repos ? {} : { error: "firstRun.workspace.error.offline" }) });
    }
  });
  reg<{ value: string }>("firstRun.setInstance", (a) => setWs({ instance: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setPrivate", (a) => setWs({ private: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setPublish", (a) => setWs({ publish: a.value !== "off" }));
  reg<{ value: string }>("firstRun.setPassphrase", (a) => setWs({ passphrase: value(a), error: "" }));
  reg<{ value: string }>("firstRun.setConfirm", (a) => setWs({ confirm: value(a), error: "" }));
  reg("firstRun.chooseFolder", async () => {
    const folder = await busy(() => fr!.chooseFolder());
    if (folder) setWs({ folder, error: "" });
  });
  const create = (withVault: boolean) => async () => {
    const w = state().workspace;
    if (state().busy || !bridge.setup) return;
    const fail = (error: string) => set({ workspace: { ...w, error }, focus: state().focus + 1 });
    if (!isRepoName(w.instance) || !isRepoName(w.private) || w.instance.toLowerCase() === w.private.toLowerCase()) return fail("firstRun.workspace.error.names");
    let passphrase: string | undefined;
    if (withVault) {
      if (!w.passphrase) return fail("firstRun.workspace.error.passphrase");
      const strength = await busy(() => bridge.setup!.passphraseStrength(w.passphrase));
      if (!strength?.ok) return fail("setup.problem.weak");
      if (w.confirm !== w.passphrase) return fail("firstRun.workspace.error.confirm");
      passphrase = w.passphrase;
    }
    // The passphrase goes to the shell once, for the vault step, and leaves the app's state now.
    setWs({ passphrase: "", confirm: "", error: "" });
    const r = await busy(() => bridge.setup!.start({ instance: w.instance, private: w.private, folder: w.folder, publish: w.publish }, passphrase));
    if (r) store.update((s) => ({ ...s, setup: { available: true, report: r } }));
    else setWs({ error: "firstRun.workspace.error.failed" });
    set({ focus: state().focus + 1 });
  };
  reg("firstRun.create", create(true));
  reg("firstRun.createWithoutVault", create(false));
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
    if (!r.ok) return setWs({ result: r, error: `firstRun.workspace.problem.${r.problem ?? "failed"}` });
    setWs({ result: r, error: "" });
    await commands.run("firstRun.openWorkspace");
  };
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
    // The window starts again in the new workspace, at the next step.
    await persistAppState({ firstRun: "personalize" });
    const r = await busy(() => fr!.openWorkspace());
    if (!r?.ok) {
      await persistAppState({ firstRun: "workspace" });
      setWs({ error: `firstRun.workspace.problem.${r?.problem ?? "failed"}` });
    }
  });

  // ---- Make it yours ----
  reg<{ value: string }>("firstRun.setTheme", (a) => (["system", "light", "dark"].includes(value(a)) ? commands.run(`appearance.${value(a)}`) : undefined));
  reg<{ value: string }>("firstRun.setFont", (a) => ((FONTS as readonly string[]).includes(value(a)) ? commands.run(`font.content.${value(a)}`) : undefined));
  reg<{ value: string }>("firstRun.setFocus", (a) => ((a.value === "on") !== store.state.focusMode ? commands.run("focus.toggle") : undefined));

  // ---- Ready ----
  reg("firstRun.finish", async () => {
    set({ active: false });
    await persistAppState({ firstRun: "done" });
    // Start writing: a new note, private by default (D-05).
    await commands.run("note.new");
  });

  // ---- the account pill (UI-12): Sync now and Sign out ----
  commands.register({
    id: "sync.now", title: "command.sync.now", icon: "save",
    enabled: (s) => s.sync.git,
    run: (_a, c) => c.run("note.save"),
  });
  commands.register({
    id: "account.signOut", title: "command.account.signOut", icon: "dismiss",
    enabled: (s) => Boolean(s.account.login),
    run: async () => {
      const r = await fr?.signOut().catch(() => undefined);
      if (!r || r.account) return void toast(catalog.format("toast.signOutFailed"), { tone: "error" });
      setLogin("");
      toast(catalog.format("toast.signedOut"));
    },
  });

  const STEP_ENUM = [...FIRST_RUN_STEPS];
  const OPTION = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const } } };
  const options = (prefix: string, ids: readonly string[]) => ids.map((id) => ({ id, label: catalog.format(`${prefix}.${id}`) }));
  viewModels.register({
    id: "vm.firstRun",
    schema: {
      type: "object",
      properties: {
        open: { type: "boolean" }, step: { type: "string", enum: STEP_ENUM }, title: { type: "string" }, progress: { type: "string" },
        busy: { type: "boolean" }, focus: { type: "number" }, canContinue: { type: "boolean" },
        gitState: { type: "string", enum: ["checking", "ok", "old", "missing"] }, gitText: { type: "string" }, installText: { type: "string" }, installCommand: { type: "string" },
        signIn: { type: "string", enum: ["checking", "found", "cli", "choose", "code", "window", "waiting", "token"] },
        login: { type: "string" }, accountName: { type: "string" }, code: { type: "string" }, helperName: { type: "string" },
        canHelper: { type: "boolean" }, noHelper: { type: "boolean" }, problem: { type: "string" }, hasProblem: { type: "boolean" }, offline: { type: "boolean" },
        token: { type: "string" }, tokenError: { type: "boolean" },
        name: { type: "string" }, email: { type: "string" }, scope: { type: "string" }, scopeOptions: { type: "array", items: OPTION },
        identityNote: { type: "string" }, identityError: { type: "string" }, nameInvalid: { type: "boolean" }, emailInvalid: { type: "boolean" },
        mode: { type: "string" }, panel: { type: "string", enum: ["create", "clone", "local", "progress"] }, modeOptions: { type: "array", items: OPTION },
        instance: { type: "string" }, private: { type: "string" }, publish: { type: "string" }, publishOptions: { type: "array", items: OPTION },
        passphrase: { type: "string" }, confirm: { type: "string" }, folder: { type: "string" },
        error: { type: "string" }, hasError: { type: "boolean" }, started: { type: "boolean" }, made: { type: "boolean" },
        query: { type: "string" }, activeId: { type: "string" }, reposSummary: { type: "string" },
        repos: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" } } } },
        theme: { type: "string" }, themeOptions: { type: "array", items: OPTION }, font: { type: "string" }, fontOptions: { type: "array", items: OPTION },
        focusMode: { type: "string" }, focusOptions: { type: "array", items: OPTION },
        canImport: { type: "boolean" }, searchHint: { type: "string" },
      },
    },
    setters: {
      token: "firstRun.setToken", name: "firstRun.setName", email: "firstRun.setEmail", scope: "firstRun.setScope", mode: "firstRun.setMode",
      instance: "firstRun.setInstance", private: "firstRun.setPrivate", publish: "firstRun.setPublish", passphrase: "firstRun.setPassphrase",
      confirm: "firstRun.setConfirm", query: "firstRun.setQuery", theme: "firstRun.setTheme", font: "firstRun.setFont", focusMode: "firstRun.setFocus",
    },
    // Ready's import button shows the import command's state, which depends on the shell (WP-3.4).
    reads: ["firstRun", "setup", "appearance.mode", "appearance.contentFont", "focusMode"],
    select: (s) => {
      const f = s.firstRun;
      const i = FIRST_RUN_STEPS.indexOf(f.step);
      const a = f.account;
      const helperName = a?.gcm ? catalog.format("firstRun.helper.gcm") : catalog.format("firstRun.helper.gh");
      // found: Git is signed in (Continue as @login); cli: the GitHub CLI is; choose: neither, or a different account.
      const signIn = f.signIn.phase !== "idle" ? f.signIn.phase
        : !a || (f.busy && f.step === "signIn") ? "checking" : a.account && !f.other ? "found" : a.cliAccount && !f.other ? "cli" : "choose";
      const shown = signIn === "cli" ? a?.cliAccount : a?.account;
      const problem = a?.problem && signIn === "choose" ? catalog.format(`firstRun.signIn.problem.${a.problem}`) : "";
      const g = f.git;
      const gitState = !g ? "checking" : g.ok ? "ok" : g.installed ? "old" : "missing";
      const platform = bridge.platform === "macos" ? "macos" : bridge.platform === "linux" ? "linux" : "windows";
      const w = f.workspace;
      const list = matches(w.repos, w.query);
      const id = f.identity;
      return {
        open: f.active, step: f.step, title: catalog.format(`firstRun.${f.step}.title`),
        progress: catalog.format("firstRun.progress", { n: i + 1, total: FIRST_RUN_STEPS.length }),
        busy: f.busy, focus: f.focus, canContinue: canContinue(f.step, { ...(g ? { git: g } : {}), ...(a ? { account: a } : {}), identity: id, workspaceReady: workspaceMade(s.setup.report) }),
        gitState, gitText: g?.version ? catalog.format(g.ok ? "firstRun.git.ok" : "firstRun.git.old", { version: g.version }) : "",
        installText: catalog.format(`firstRun.git.install.${platform}`), installCommand: catalog.format(`firstRun.git.command.${platform}`),
        signIn, login: shown?.login ?? "", accountName: shown?.name || shown?.login || "", code: f.signIn.code, helperName,
        canHelper: Boolean(a?.gcm || a?.gh), noHelper: Boolean(a && !a.gcm && !a.gh), problem, hasProblem: Boolean(problem), offline: a?.problem === "offline",
        token: f.token, tokenError: f.tokenError,
        name: id.name, email: id.email, scope: id.scope, scopeOptions: options("firstRun.identity.scope", ["global", "workspace"]),
        identityNote: catalog.format(id.source === "github" ? "firstRun.identity.fromGitHub" : id.source === "git" ? "firstRun.identity.fromGit" : "firstRun.identity.none"),
        identityError: id.error ? catalog.format(`firstRun.identity.error.${id.error}`) : "", nameInvalid: id.error === "name", emailInvalid: id.error === "email",
        mode: w.mode, panel: s.setup.report?.options ? "progress" : w.mode, modeOptions: options("firstRun.workspace.mode", ["create", "clone", "local"]),
        instance: w.instance, private: w.private, publish: w.publish ? "on" : "off", publishOptions: options("firstRun.workspace.publish", ["on", "off"]),
        passphrase: w.passphrase, confirm: w.confirm, folder: w.folder,
        error: w.error && catalog.has(w.error) ? catalog.format(w.error) : "", hasError: Boolean(w.error),
        started: Boolean(s.setup.report?.options), made: workspaceMade(s.setup.report),
        query: w.query, activeId: w.activeId,
        reposSummary: !w.reposLoaded ? "" : list.length ? catalog.format("firstRun.workspace.repos", { count: list.length }) : catalog.format("firstRun.workspace.noRepos"),
        repos: list.map((r) => ({
          id: `${r.owner}/${r.name}`, label: `${r.owner}/${r.name}`, icon: r.private ? "lock" : "document",
          description: catalog.format(r.instance ? "firstRun.workspace.repo.instance" : r.private ? "firstRun.workspace.repo.private" : "firstRun.workspace.repo.public"),
        })),
        theme: s.appearance.mode, themeOptions: options("firstRun.personalize.theme", ["system", "light", "dark"]),
        font: (FONTS as readonly string[]).includes(s.appearance.contentFont) ? s.appearance.contentFont : "", fontOptions: options("firstRun.personalize.font", FONTS),
        focusMode: s.focusMode ? "on" : "off", focusOptions: options("firstRun.personalize.focus", ["on", "off"]),
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
    void fr.account().then((a) => setLogin(a.account?.login ?? ""), () => {});
  };

  return {
    /** Starts the first run if this shell has one and it isn't done. Resolves to whether it's showing. */
    async begin(app: AppStateFile): Promise<boolean> {
      if (!fr) return false;
      fr.onSignIn((p) => { if (state().signIn.phase !== "idle") setSignIn({ phase: p.phase, code: p.code ?? "", helper: p.helper }); });
      store.subscribe(askAccount);
      // People who wrote with the app before it had a first run keep writing (D-101).
      if (app.firstRun === "done" || (app.firstRun === undefined && app.lastNotePath)) return false;
      const step = isFirstRunStep(app.firstRun) ? app.firstRun : "welcome";
      set({ active: true, step, focus: state().focus + 1 });
      void arrive[step]?.();
      return true;
    },
  };
}

function matches(repos: RepoChoice[], query: string): RepoChoice[] {
  const q = query.trim().toLowerCase();
  return repos.filter((r) => !q || `${r.owner}/${r.name}`.toLowerCase().includes(q)).slice(0, 100);
}
