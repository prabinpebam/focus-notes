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
import { chordParts, shortcutFor, spokenChord } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { TaskTracker, TaskView } from "./tasks.ts";
import { isRepoName, DEFAULT_SETUP, setupFailureActions, type SetupFailureAction, type SetupReport } from "./setup.ts";
import type { SetupState } from "./setup-app.ts";
import {
  canContinue, FIRST_RUN_STEPS, looksLikeToken, nextStep, notesIdentity, pageAllowed, prevStep, resumeStep,
  type AccountStatus, type FirstRunPage, type FirstRunStep, type GitCheck, type RepoChoice, type WorkspaceResult,
} from "./first-run.ts";

export * from "./first-run.ts";

export type SignInPhase = "idle" | "code" | "window" | "waiting" | "token";
/**
 * The first run's waits (PRF-13, D-149), each with its words (`firstRun.wait.<op>`) unless it's
 * silent: checking Git and the folder on arrival are responsive and show nothing (the inventory).
 */
export type FirstRunWaitOp = "" | "git" | "prepare" | "account" | "signIn" | "identity" | "findNotes" | "folder" | "chooseFolder" | "clone" | "create" | "open" | "strength";
/** The waits that name themselves under the step's title; signing in has its own place, the code card. */
const SAID: readonly FirstRunWaitOp[] = ["account", "identity", "findNotes", "folder", "clone", "open"];
/** Waits that only read, which Back and Esc may leave (PRF-13): never a download, a creation, or a sign-in (those have Cancel). */
const LEAVABLE: readonly FirstRunWaitOp[] = ["git", "prepare", "account", "findNotes"];
const NO_PROGRESS = { op: "", done: 0, total: 0, part: "", percent: -1 };
/** Each wait's tracker target: fixed IDs, measured as `focus-notes:<target>` and allow-listed for the report (QLT-04). */
export const FIRST_RUN_WAITS = {
  git: "firstRun.git", prepare: "firstRun.prepare", account: "firstRun.account", signIn: "firstRun.signIn", identity: "firstRun.identity", findNotes: "firstRun.findNotes",
  folder: "firstRun.folder", chooseFolder: "firstRun.chooseFolder", clone: "firstRun.clone", create: "firstRun.create", open: "firstRun.open", strength: "firstRun.strength",
} as const satisfies Record<Exclude<FirstRunWaitOp, "">, string>;
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
  /** A check or an action is under way: the step's controls hold. What it is, `wait` names. */
  busy: boolean;
  /**
   * The work the step is waiting for (PRF-13, D-149), named so the screen can say it: "" when none.
   * Its sign and elapsed time come from the task tracker (`firstRun.<op>`); `progress` is what the
   * shell streams (repositories checked, a download's part and percentage).
   */
  wait: FirstRunWaitOp;
  progress: { op: string; done: number; total: number; part: string; percent: number };
  git?: GitCheck;
  account?: AccountStatus;
  /** Use a different account: the account found isn't offered. */
  other: boolean;
  /** Having trouble? is open on Connect. */
  trouble: boolean;
  signIn: { phase: SignInPhase; code: string; helper: "gcm" | "gh" | ""; device?: boolean; reported?: boolean };
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
    /** The field at fault, marked invalid with its own short error (D-142), or "". */
    field: "" | "instance" | "private" | "passphrase" | "confirm";
    /** The passphrase's strength as it's typed: 0 (nothing typed) to 4 (strong), for the meter (D-142). */
    strength: number;
    folder: string;
    repos: RepoChoice[];
    reposLoaded: boolean;
    query: string;
    activeId: string;
    /** The repository Open was last pressed on, for its folder actions (D-154), or "". */
    cloneId: string;
    result?: WorkspaceResult;
  };
  /** Bumped to move focus to the step's field. */
  focus: number;
}

export const FIRST_RUN_INACTIVE: FirstRunState = {
  active: false, scope: "install", step: "welcome", busy: false, wait: "", progress: NO_PROGRESS, other: false, trouble: false,
  signIn: { phase: "idle", code: "", helper: "" }, token: "", tokenError: false,
  workspace: {
    mode: "create", more: false, details: false, instance: DEFAULT_SETUP.instance, private: DEFAULT_SETUP.private, publish: DEFAULT_SETUP.publish,
    passphrase: "", confirm: "", error: "", field: "", strength: 0, folder: "", repos: [], reposLoaded: false, query: "", activeId: "", cloneId: "",
  },
  focus: 0,
};

/** The desktop's GitHub account, for the account pill. Only the login: never a token. */
export interface AccountState {
  login: string;
}
export const NO_ACCOUNT: AccountState = { login: "" };

interface S { firstRun: FirstRunState; account: AccountState; setup: SetupState; sync: { git: boolean; problem?: string }; appearance: { mode: "system" | "light" | "dark"; contentFont: string }; focusMode: boolean; tasks: TaskView[] }

interface Ctx<St extends S> {
  store: Store<St>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  /** Every wait goes through the tracker (PRF-08, PRF-13): its sign, its announcement and its elapsed time. */
  tracker?: TaskTracker;
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
/** The oldest Git setup works with (D-22). */
const GIT_NEEDED = "2.31";

export const workspaceMade = (r?: SetupReport) => Boolean(r && !r.running && ["clone", "link"].every((id) => r.steps.find((x) => x.id === id)?.state === "done"));

const DAY = 86_400_000;

/** The commands that still work while setup owns the window (D-126); every other one is held. */
/** An image the renderer may show: a data URL the shell made, never an address to fetch. */
const AVATAR = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
/** "Ada Lovelace" → "AL"; a login → its first letter. */
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
/** A failed part's action labels (D-154). */
const FAIL_LABEL: Record<SetupFailureAction, string> = {
  retry: "firstRun.retry", chooseFolder: "firstRun.fail.chooseFolder", newFolder: "firstRun.fail.newFolder", startOver: "firstRun.fail.startOver", back: "firstRun.back",
};

export const SETUP_COMMANDS = /^(firstRun\.|window\.|toast\.|setup\.|keys\.|ui\.scale|appearance\.(system|light|dark)$|notes\.import$|command\.run$|app\.ready$)/;

export function registerFirstRun<St extends S>({ store, bridge, catalog, commands, viewModels, tracker, toast, persistAppState, hold, release, now = Date.now }: Ctx<St>) {
  const fr = bridge.firstRun;
  const state = () => store.state.firstRun;
  const set = (patch: Partial<FirstRunState>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, ...patch } }));
  const setWs = (patch: Partial<FirstRunState["workspace"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, workspace: { ...s.firstRun.workspace, ...patch } } }));
  const setSignIn = (patch: Partial<FirstRunState["signIn"]>) => store.update((s) => ({ ...s, firstRun: { ...s.firstRun, signIn: { ...s.firstRun.signIn, ...patch } } }));
  const setLogin = (login: string) => { if (store.state.account.login !== login) store.update((s) => ({ ...s, account: { login } })); };
  const bump = () => set({ focus: state().focus + 1 });
  const platformOf = () => (bridge.platform === "macos" ? "macos" : bridge.platform === "linux" ? "linux" : "windows");
  /** The latest wait's turn: only it clears the step's wait when it ends. */
  let waitTurn = 0;
  /**
   * Runs a shell call as a named wait (PRF-13, D-149): the step holds its controls, the tracker gives
   * it its sign, announcement and elapsed time, and the screen says what it's waiting for. A call
   * that throws counts as "didn't work".
   */
  const busy = async <T,>(op: Exclude<FirstRunWaitOp, "">, fn: () => Promise<T>): Promise<T | undefined> => {
    // A download starts counting afresh; finding the notes keeps the count the prefetch has.
    const mine = ++waitTurn;
    set({ busy: true, wait: op, ...(op === "clone" ? { progress: { ...NO_PROGRESS, op } } : {}) });
    try {
      return await (tracker ? tracker.run(FIRST_RUN_WAITS[op], `firstRun.wait.${op}`, fn) : fn());
    } catch {
      return undefined;
    } finally {
      // A call left behind (a cancelled sign-in ending later) never clears the wait that came after it.
      if (waitTurn === mine) set({ busy: false, wait: "" });
    }
  };
  /**
   * The account's repositories, asked as soon as Connect has the account (prefetch on intent,
   * PRF-13), so Your notes usually has them on arrival. Kept until asked again (Find my notes again).
   */
  let repoAsk: Promise<RepoChoice[] | undefined> | undefined;
  let repoLogin = "";
  /** When the list was last asked: a prefetch from Settings (on intent) is used if it's this fresh. */
  let repoAskedAt = -Infinity;
  const PREFETCH_FRESH_MS = 30_000;
  const askRepos = () => {
    if (!repoAsk) {
      repoAskedAt = now();
      set({ progress: { ...NO_PROGRESS, op: "findNotes" } });
    }
    return (repoAsk ??= fr!.repositories().catch(() => {
      repoAsk = undefined;
      return undefined;
    }));
  };
  /** The list is asked again: another account, Find my notes again, Open another workspace. */
  const forgetRepos = () => void (repoAsk = undefined);
  /** The login the app is signed in as: Git's account, unless Focus Notes alone was signed out (FRE-07). */
  const signedInAs = (a: AccountStatus | undefined) => (a?.account && !a.signedOut ? a.account.login : "");
  const applyAccount = (a: AccountStatus | undefined) => {
    set({ account: a ?? { gcm: state().account?.gcm ?? false, gh: state().account?.gh ?? false, problem: "failed" } });
    if (signedInAs(a)) setLogin(signedInAs(a));
    // The account is known: Your notes' list starts now, while the person reads Connect (not for Switch account alone).
    if (signedInAs(a) && state().scope !== "account" && !state().workspace.reposLoaded) {
      if (repoLogin !== signedInAs(a)) forgetRepos();
      repoLogin = signedInAs(a);
      void askRepos();
    }
  };
  /** Your notes starts at the workspaces found, or at Create my notes (Open from GitHub when it's shown alone). */
  const baseMode = (): WorkspaceMode => (state().workspace.repos.some((r) => r.instance) ? "found" : state().scope === "workspace" ? "clone" : "create");
  const loadRepos = async () => {
    const repos = await busy("findNotes", askRepos);
    setWs({ repos: repos ?? [], reposLoaded: Boolean(repos), activeId: repos?.[0] ? `${repos[0].owner}/${repos[0].name}` : "", ...(repos ? {} : { error: "firstRun.notes.error.offline" }) });
  };

  // ---- what each step finds out on arrival ----
  const arrive: Partial<Record<FirstRunStep, () => Promise<void>>> = {
    // Git first, silently: it shows only when it's missing or too old. Then the account.
    connect: async () => {
      const { account: _gone, ...rest } = state();
      store.update((s) => ({ ...s, firstRun: { ...rest, other: rest.scope === "account" && rest.other, token: "", tokenError: false } }));
      setSignIn({ phase: "idle", code: "", helper: "" });
      const git = (await busy("git", () => fr!.git())) ?? { installed: false, ok: false, gcm: false, gh: false };
      set({ git });
      if (git.ok) applyAccount(await busy("account", () => fr!.account()));
      bump();
    },
    notes: async () => {
      const folder = await busy("prepare", () => fr!.folder(state().workspace.instance));
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
    // An error belongs to the step that made it (D-154).
    setWs({ error: "", field: "" });
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
    if (state().scope !== "account") await busy("identity", () => fr!.setIdentity(notesIdentity(a), "workspace"));
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
    if (s.active && s.signIn.phase === "token") return (setSignIn({ phase: "idle" }), set({ trouble: false }), bump());
    if (!s.active || (s.busy && !LEAVABLE.includes(s.wait))) return;
    // A wait that only reads can be left (PRF-13): the step stops waiting for it, and its answer, when it comes, changes nothing shown.
    if (s.busy) {
      waitTurn++;
      set({ busy: false, wait: "" });
    }
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
      applyAccount(await busy("account", () => fr!.useExisting()));
      if (signedInAs(state().account)) await connected();
    }
  });
  reg("firstRun.otherAccount", () => set({ other: true, trouble: false, focus: state().focus + 1 }));
  const signIn = (device: boolean) => async () => {
    if (state().busy) return;
    const a = state().account;
    setSignIn({ phase: "waiting", code: "", helper: a?.gcm ? "gcm" : "gh", device, reported: false });
    set({ account: { gcm: a?.gcm ?? false, gh: a?.gh ?? false }, other: true });
    const r = await busy("signIn", () => fr!.signIn(device));
    if (state().signIn.phase === "idle") return; // Cancelled meanwhile.
    setSignIn({ phase: "idle", code: "" });
    applyAccount(r);
    set({ other: false, trouble: false, focus: state().focus + 1 });
  };
  // Connect to GitHub is a device code through Git's own helper (D-142): the code shows here when the
  // helper prints it. The helper's browser sign-in waits under Having trouble?.
  reg("firstRun.signIn", signIn(true));
  reg("firstRun.signInDevice", signIn(true));
  reg("firstRun.signInBrowser", signIn(false));
  // The install command, never when Git came with the app (PKG-13, D-228).
  reg("firstRun.copyCommand", async () => {
    const g = state().git;
    if (g && !g.ok && !g.bundled) await bridge.copyText?.(catalog.format(`firstRun.git.command.${platformOf()}`));
  }, (s) => !s.firstRun.git?.bundled);
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
  // The code card's own Copy: the code alone, nothing opened.
  reg("firstRun.copyCodeOnly", async () => {
    const code = state().signIn.code;
    if (code) await bridge.copyText?.(code);
  });
  reg("firstRun.useToken", () => {
    setSignIn({ phase: "token" });
    // A fresh form: what the last sign-in said isn't about a token yet (D-142).
    const { problem: _said, ...rest } = state().account ?? { gcm: false, gh: false };
    set({ token: "", tokenError: false, trouble: false, focus: state().focus + 1, ...(state().account ? { account: rest } : {}) });
  });
  reg<{ value: string }>("firstRun.setToken", (a) => {
    // Typing again clears what GitHub said about the last token.
    const { problem: _said, ...rest } = state().account ?? { gcm: false, gh: false };
    set({ token: value(a), tokenError: false, ...(state().account?.problem ? { account: rest } : {}) });
  });
  reg("firstRun.submitToken", async () => {
    const token = state().token.trim();
    // The token leaves the app's state at once, whatever happens next; the form says so (D-135).
    set({ token: "" });
    if (!looksLikeToken(token)) return set({ tokenError: true, focus: state().focus + 1 });
    const r = await busy("account", () => fr!.useToken(token));
    applyAccount(r);
    if (signedInAs(r)) {
      setSignIn({ phase: "idle" });
      set({ other: false, trouble: false });
    }
    // Rejected: the form stays, its field says why and takes focus.
    set({ focus: state().focus + 1 });
  });
  reg<{ page: FirstRunPage }>("firstRun.openPage", ({ page }) => {
    if (pageAllowed(page, state().git?.bundled === true)) fr?.openPage(page);
  });

  // ---- Your notes ----
  reg<{ value: string }>("firstRun.setMode", async (a) => {
    if (a.value !== "found" && a.value !== "create" && a.value !== "clone" && a.value !== "local") return;
    setWs({ mode: a.value, error: "", query: "", more: false });
    if (a.value === "clone" && !state().workspace.reposLoaded) await loadRepos();
    bump();
  });
  reg("firstRun.findNotes", async () => {
    setWs({ error: "", reposLoaded: false });
    forgetRepos();
    await loadRepos();
    if (state().workspace.reposLoaded) setWs({ mode: baseMode() });
    bump();
  });
  reg("firstRun.toggleMore", () => setWs({ more: !state().workspace.more }));
  reg("firstRun.toggleDetails", () => setWs({ details: !state().workspace.details }));
  // The folder follows the name as it's typed (D-155): Documents/<name>, or the folder chosen.
  let folderAsk = 0;
  reg<{ value: string }>("firstRun.setInstance", async (a) => {
    const name = value(a);
    setWs({ instance: name, error: "", field: "" });
    if (!isRepoName(name) || !fr) return;
    const ask = ++folderAsk;
    const folder = await fr.folder(name).catch(() => undefined);
    if (ask === folderAsk && folder) setWs({ folder });
  });
  reg<{ value: string }>("firstRun.setPrivate", (a) => setWs({ private: value(a), error: "", field: "" }));
  reg<{ value: string }>("firstRun.setPublish", (a) => setWs({ publish: a.value !== "off" }));
  // The meter follows the typing (D-142): the shell rates it with the same check setup uses.
  let rated = 0;
  reg<{ value: string }>("firstRun.setPassphrase", async (a) => {
    const p = value(a);
    setWs({ passphrase: p, error: "", field: "", ...(p ? {} : { strength: 0 }) });
    const ask = ++rated;
    if (!p || !bridge.setup) return;
    const r = await bridge.setup.passphraseStrength(p).catch(() => undefined);
    if (ask === rated && r) setWs({ strength: strengthLevel(r) });
  });
  reg<{ value: string }>("firstRun.setConfirm", (a) => setWs({ confirm: value(a), error: "", field: "" }));
  reg("firstRun.chooseFolder", async () => {
    const folder = await busy("chooseFolder", () => fr!.chooseFolder());
    if (folder) setWs({ folder, error: "" });
  });
  // A failed part's actions (D-154): only those it offers; each changes something or goes back.
  reg<{ id: string }>("firstRun.failAction", async ({ id }) => {
    const failed = store.state.setup.report?.steps.find((x) => x.state === "failed");
    if (!failed || state().busy || !setupFailureActions(failed.problem).includes(id as SetupFailureAction)) return;
    if (id === "back") return commands.run("firstRun.back");
    if (id === "retry") await busy("create", () => commands.run("setup.retry", { id: failed.id }));
    else if (id === "startOver") await busy("create", () => commands.run("setup.startOver"));
    else await busy("create", () => commands.run("setup.useFolder", { how: id === "chooseFolder" ? "choose" : "new" }));
    bump();
  });
  // Create my notes: with the browser passphrase only when one was typed under More options (D-124).
  reg("firstRun.create", async () => {
    const w = state().workspace;
    if (state().busy || !bridge.setup) return;
    const fail = (error: string, field: FirstRunState["workspace"]["field"]) => (setWs({ error, field, more: true }), bump());
    if (!isRepoName(w.instance)) return fail("firstRun.workspace.error.names", "instance");
    if (!isRepoName(w.private)) return fail("firstRun.workspace.error.names", "private");
    // The same name twice says only that: the field shows which (D-142).
    if (w.instance.toLowerCase() === w.private.toLowerCase()) return fail("firstRun.workspace.error.same", "private");
    let passphrase: string | undefined;
    if (w.passphrase || w.confirm) {
      const strength = await busy("strength", () => bridge.setup!.passphraseStrength(w.passphrase));
      if (strength) setWs({ strength: strengthLevel(strength) });
      if (!strength?.ok) return fail("firstRun.workspace.error.weak", "passphrase");
      if (w.confirm !== w.passphrase) return fail("firstRun.workspace.error.confirm", "confirm");
      passphrase = w.passphrase;
    }
    // The passphrase goes to the shell once, for the vault step, and leaves the app's state now.
    setWs({ passphrase: "", confirm: "", error: "", field: "", strength: 0, more: false });
    const r = await busy("create", () => bridge.setup!.start({ instance: w.instance, private: w.private, folder: w.folder, publish: w.publish }, passphrase));
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
    setWs({ cloneId: `${repo.owner}/${repo.name}` });
    await opened(await busy("clone", () => fr!.clone(repo.owner, repo.name)) ?? { ok: false, problem: "failed" });
  });
  // Open into a folder that's taken (D-154): another folder, a new one beside the default, or Back.
  reg<{ id: string }>("firstRun.errorAction", async ({ id }) => {
    const w = state().workspace;
    const [owner, name] = w.cloneId.split("/");
    if (state().busy || !owner || !name || w.result?.ok !== false || w.result.problem !== "folderTaken") return;
    if (id === "back") return (setWs({ error: "" }), commands.run("firstRun.back"));
    if (id === "chooseFolder") {
      const folder = await busy("chooseFolder", () => fr!.chooseFolder());
      if (!folder) return;
      setWs({ folder });
      await opened(await busy("clone", () => fr!.clone(owner, name)) ?? { ok: false, problem: "failed" });
    } else if (id === "newFolder") await opened(await busy("clone", () => fr!.clone(owner, name, "new")) ?? { ok: false, problem: "failed" });
  });
  commands.register({ id: "firstRun.cloneActive", title: "command.firstRun.clone", shortcut: { default: "Enter", handledBy: "repoField" }, layer: "basic", group: "files", run: () => commands.run("firstRun.clone", { id: "" }) });
  reg("firstRun.openFolder", async () => {
    if (state().busy) return;
    await opened(await busy("folder", () => fr!.openFolder()));
  });
  reg("firstRun.openWorkspace", async () => {
    const s = store.state;
    if (s.firstRun.busy || (!workspaceMade(s.setup.report) && !s.firstRun.workspace.result?.ok)) return;
    // The window starts again in the workspace: at Ready, or writing when Your notes was shown alone.
    const alone = s.firstRun.scope === "workspace";
    await persistAppState({ firstRun: alone ? "done" : "ready" });
    const r = await busy("open", () => fr!.openWorkspace());
    if (!r?.ok) {
      await persistAppState({ firstRun: alone ? "done" : "notes" });
      setWs({ error: `firstRun.workspace.problem.${r?.problem ?? "failed"}` });
    }
  });

  // ---- Ready ----
  reg<{ value: string }>("firstRun.setTheme", (a) => (["system", "light", "dark"].includes(value(a)) ? commands.run(`appearance.${value(a)}`) : undefined));
  // Start writing: a new note, private by default (D-05), or the note put away for Run setup again.
  reg("firstRun.finish", () => close(true));

  // The account pill's Save to cloud is `sync.now` (app.ts, D-132); Sign out is Settings' (settings-app.ts).

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
        // PKG-13, D-228: Git came with the app, so nothing is offered to install; a Git that won't start is repaired with the app.
        canInstall: { type: "boolean" }, gitCardTitle: { type: "string" }, gitCardDetail: { type: "string" }, gitCardIcon: { type: "string" }, noHelperText: { type: "string" },
        login: { type: "string" }, handle: { type: "string" }, accountName: { type: "string" }, avatar: { type: "string" }, initials: { type: "string" }, foundText: { type: "string" }, continueAs: { type: "string" }, code: { type: "string" },
        canHelper: { type: "boolean" }, noHelper: { type: "boolean" }, problem: { type: "string" }, hasProblem: { type: "boolean" }, offline: { type: "boolean" }, canOther: { type: "boolean" },
        token: { type: "string" }, tokenError: { type: "boolean" },
        panel: { type: "string", enum: ["checking", "found", "create", "clone", "local", "progress"] }, more: { type: "boolean" }, details: { type: "boolean" }, canCreate: { type: "boolean" },
        isCreate: { type: "boolean" }, showMore: { type: "boolean" }, working: { type: "boolean" },
        found: { type: "array", items: { type: "object", properties: { variant: { type: "string" }, id: { type: "string" }, label: { type: "string" }, detail: { type: "string" }, badge: { type: "string" }, icon: { type: "string" }, first: { type: "boolean" } } } },
        instance: { type: "string" }, private: { type: "string" }, publish: { type: "string" }, publishOptions: { type: "array", items: OPTION },
        passphrase: { type: "string" }, confirm: { type: "string" }, folder: { type: "string" }, folderText: { type: "string" },
        error: { type: "string" }, hasError: { type: "boolean" }, started: { type: "boolean" }, made: { type: "boolean" }, progressText: { type: "string" },
        query: { type: "string" }, activeId: { type: "string" }, noMatch: { type: "boolean" }, reposSummary: { type: "string" },
        repos: { type: "array", items: ITEM },
        theme: { type: "string" }, themeOptions: { type: "array", items: OPTION },
        canImport: { type: "boolean" },
        // D-144: Ready features focus mode with its toggle's keys, as key caps and in words.
        focusHint: { type: "string" }, focusKeys: { type: "array", items: { type: "string" } }, focusSpoken: { type: "string" }, hasFocusKeys: { type: "boolean" },
        // D-135: the step's hero mark, the token form's problem, a failed setup step, a lookup that couldn't reach GitHub.
        hasMark: { type: "boolean" }, mark: { type: "string" }, markTone: { type: "string", enum: ["neutral", "accent", "danger", "success"] }, markBusy: { type: "boolean" },
        tokenMessage: { type: "string" }, hasTokenMessage: { type: "boolean" },
        failed: { type: "boolean" }, failedId: { type: "string" }, lookupFailed: { type: "boolean" }, canCreateNow: { type: "boolean" }, createDetail: { type: "string" },
        failActions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, variant: { type: "string" }, first: { type: "boolean" }, busy: { type: "boolean" } } } },
        errorActions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, variant: { type: "string" }, first: { type: "boolean" }, busy: { type: "boolean" } } } },
        folderShort: { type: "string" },
        // D-142: the stepper, the state's own title, the helper to install, versions, field errors, the passphrase meter.
        stepNumber: { type: "number" }, stepTotal: { type: "number" }, needHelper: { type: "boolean" }, helperText: { type: "boolean" }, problemIcon: { type: "string" }, notesIcon: { type: "string" },
        installLabel: { type: "string" }, gitFound: { type: "string" }, gitNeeded: { type: "string" }, isGitOld: { type: "boolean" },
        instanceInvalid: { type: "boolean" }, privateInvalid: { type: "boolean" }, passphraseInvalid: { type: "boolean" }, confirmInvalid: { type: "boolean" },
        instanceError: { type: "string" }, privateError: { type: "string" }, passphraseError: { type: "string" }, confirmError: { type: "string" },
        hasStrength: { type: "boolean" }, strength: { type: "number" },
        instanceFocus: { type: "number" }, privateFocus: { type: "number" }, passphraseFocus: { type: "number" }, confirmFocus: { type: "number" }, strengthText: { type: "string" },
        // PRF-13, D-149: what the step waits for, in words, with a count or percentage and the elapsed time;
        // the sign-in's own wait on the code card; and the part creating is on.
        waitText: { type: "string" }, hasWait: { type: "boolean" }, approvalText: { type: "string" }, partText: { type: "string" }, hasPart: { type: "boolean" },
        parts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, state: { type: "string", enum: ["pending", "running", "done", "failed", "skipped"] }, label: { type: "string" } } } },
        accountSkeleton: { type: "boolean" }, notesSkeleton: { type: "boolean" },
        openParts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, state: { type: "string", enum: ["pending", "running", "done"] }, label: { type: "string" } } } },
        hasOpenParts: { type: "boolean" }, openPercent: { type: "number" }, hasOpenPercent: { type: "boolean" },
        setupPercent: { type: "number" }, hasSetupPercent: { type: "boolean" }, percentLabel: { type: "string" },
      },
    },
    setters: {
      token: "firstRun.setToken", instance: "firstRun.setInstance", private: "firstRun.setPrivate", publish: "firstRun.setPublish", passphrase: "firstRun.setPassphrase",
      confirm: "firstRun.setConfirm", query: "firstRun.setQuery", theme: "firstRun.setTheme",
    },
    // Ready's import button shows the import command's state, which depends on the shell (WP-3.4).
    reads: ["firstRun", "setup", "account", "appearance.mode", "tasks"],
    select: (s) => {
      const f = s.firstRun;
      // ---- waits (PRF-13, D-149): named at their place, a count or percentage, the elapsed time past wait.elapsedDelay ----
      const taskOf = (op: FirstRunWaitOp) => (op ? s.tasks.find((t) => t.target === FIRST_RUN_WAITS[op]) : undefined);
      const withElapsed = (words: string, op: FirstRunWaitOp) => {
        const t = taskOf(op);
        return t?.elapsed ? catalog.format("firstRun.wait.elapsed", { words, seconds: t.elapsed }) : words;
      };
      const pr = f.progress;
      const waitWords = (op: FirstRunWaitOp): string => {
        if (op === "findNotes") return pr.op === "findNotes" && pr.total ? catalog.format("firstRun.wait.findNotesCount", { done: pr.done, total: pr.total }) : catalog.format("firstRun.wait.findNotes");
        if (op === "clone" && pr.op === "clone" && pr.part) {
          return pr.part === "download" ? (pr.percent >= 0 ? catalog.format("firstRun.wait.downloadPercent", { percent: pr.percent }) : catalog.format("firstRun.wait.clone"))
            : catalog.format(`firstRun.wait.part.${pr.part}`, { n: pr.part === "private" ? 2 : 3, total: 3 });
        }
        return catalog.format(`firstRun.wait.${op}`);
      };
      const waiting = f.wait && SAID.includes(f.wait) ? taskOf(f.wait) : undefined;
      const hasWait = Boolean(waiting && waiting.phase === "on");
      const waitText = hasWait ? withElapsed(waitWords(f.wait), f.wait) : "";
      // Signing in: "Getting a code from GitHub…" until the helper says the code, then the approval wait.
      const gettingCode = f.signIn.phase === "waiting" && f.signIn.device === true && !f.signIn.reported && !f.signIn.code;
      const approvalText = withElapsed(catalog.format(gettingCode ? "firstRun.wait.code" : "firstRun.signIn.waiting"), "signIn");
      // Creating: the part it's on, its number, and the elapsed time ("Copying the template · 2 of 9 · 14 s").
      const setupSteps = s.setup.report?.running ? s.setup.report.steps : [];
      const at = setupSteps.findIndex((x) => x.state === "running");
      const cur = at < 0 ? undefined : setupSteps[at]!;
      const partText = !cur ? "" : withElapsed(catalog.format(typeof cur.percent === "number" ? "firstRun.wait.setupPartPercent" : "firstRun.wait.setupPart", { part: catalog.format(`firstRun.wait.step.${cur.id}`), n: at + 1, total: setupSteps.length, percent: cur.percent ?? 0 }), "create");
      const setupPercent = typeof cur?.percent === "number" ? cur.percent : -1;
      // Opening (after Open): its three parts, the one it's on, and Git's percentage for the download (PRF-13).
      const opening = f.wait === "clone" && hasWait;
      const OPEN_PARTS = ["download", "private", "link"] as const;
      const openAt = Math.max(0, OPEN_PARTS.indexOf((pr.op === "clone" && pr.part ? pr.part : "download") as (typeof OPEN_PARTS)[number]));
      const openParts = opening ? OPEN_PARTS.map((id, n) => ({ id, state: n < openAt ? "done" : n === openAt ? "running" : "pending", label: catalog.format(`firstRun.openPart.${id}`) })) : [];
      const openPercent = opening && openAt === 0 && pr.op === "clone" && pr.percent >= 0 ? pr.percent : -1;
      // The parts, always shown while creating (PRF-13), named in the main path's plain words (D-124).
      const parts = (s.setup.report?.steps ?? []).map((x) => ({ id: x.id, state: x.state, label: catalog.format(`firstRun.part.${x.id}`) }));
      const i = FIRST_RUN_STEPS.indexOf(f.step);
      const a = f.account;
      const g = f.git;
      const gitState = !g ? "checking" : g.ok ? "ok" : g.installed ? "old" : "missing";
      // The Store package's own Git (PKG-13, D-228): never an install route, and its problems are its own.
      const bundled = g?.bundled === true;
      // git: Git is missing or too old; found: Git is signed in (Continue as @login); cli: the GitHub CLI is;
      // choose: neither, or a different account. An account Git kept when Focus Notes alone signed out is offered like any found one (FRE-07).
      const connect = f.signIn.phase !== "idle" ? f.signIn.phase
        : !g ? "checking" : !g.ok ? "git"
        : !a ? "checking" : a.account && !f.other ? "found" : a.cliAccount && !f.other ? "cli" : "choose";
      const shown = connect === "cli" ? a?.cliAccount : a?.account;
      const problemKey = (prefix: string, p: string) => (bundled && p === "noHelper" ? `${prefix}.helperOff` : `${prefix}.${p}`);
      const problem = a?.problem && connect === "choose" ? catalog.format(problemKey("firstRun.signIn.problem", a.problem)) : "";
      const platform = bridge.platform === "macos" ? "macos" : bridge.platform === "linux" ? "linux" : "windows";
      const focusChord = shortcutFor(commands.shortcut("focus.toggle"), bridge.platform);
      const w = f.workspace;
      const started = Boolean(s.setup.report?.options);
      const panel = started ? "progress" : !w.reposLoaded && f.busy && w.mode !== "local" ? "checking" : w.mode;
      const failed = Boolean(s.setup.report?.steps.some((x) => x.state === "failed"));
      const made = workspaceMade(s.setup.report);
      const list = matches(w.repos, w.query);
      const login = shown?.login ?? "";
      const failedStep = s.setup.report?.steps.find((x) => x.state === "failed");
      const lookupFailed = w.error === "firstRun.notes.error.offline";
      // An error shows only where it belongs (D-154): a lookup's on the lookup panels, never while setup runs or once it's done.
      const err = panel === "progress" && w.error.startsWith("firstRun.notes.") ? "" : w.error;
      // The token form says what GitHub (or the helper) said about the token it just cleared.
      const tokenKey = f.tokenError ? "firstRun.signIn.tokenInvalid"
        : connect === "token" && a?.problem ? (catalog.has(problemKey("firstRun.signIn.tokenProblem", a.problem)) ? problemKey("firstRun.signIn.tokenProblem", a.problem) : "firstRun.signIn.tokenProblem.failed") : "";
      // No helper to keep a sign-in: the step's action is installing one (D-142).
      const needHelper = connect === "choose" && Boolean(a && ((!a.gcm && !a.gh) || a.problem === "noHelper"));
      // The step's hero mark (D-135): one anchor, the same size and place in every state of a step,
      // its icon and tone saying the state (D-142). Waits ring it.
      const mark: [string, "neutral" | "accent" | "danger" | "success", boolean] | undefined =
        f.step === "connect"
          ? connect === "checking" ? ["github", "neutral", true]
          : connect === "git" ? (bundled ? ["warning", "danger", false] : ["download", "neutral", false])
          : needHelper ? (bundled ? ["lock", "neutral", false] : ["download", "neutral", false])
          : connect === "waiting" || connect === "window" || connect === "code" ? ["github", "accent", true]
          : connect === "token" ? ["lock", tokenKey ? "danger" : "neutral", false]
          : connect === "found" ? ["github", "success", false]
          : ["github", problem ? "danger" : "neutral", false]
        : f.step === "notes"
          ? panel === "checking" ? ["search", "neutral", true]
          : panel === "clone" ? ["github", "neutral", false]
          : panel === "local" ? ["folder", "neutral", false]
          : panel === "create" && lookupFailed ? ["cloudOff", "danger", false]
          : panel === "progress" ? (made ? ["cloudCheck", "success", false] : failed || err ? ["warning", "danger", false] : ["cloudUp", "accent", true])
          : ["cloud", w.error ? "danger" : "neutral", false]
        : undefined;
      // The title names the state, not just the step (D-142).
      const titleKey = f.step === "connect"
        ? connect === "git" ? (bundled ? "firstRun.connect.title.broken" : gitState === "old" ? "firstRun.connect.title.old" : "firstRun.connect.title.missing")
        : needHelper ? (bundled ? "firstRun.connect.title.helperOff" : "firstRun.connect.title.helper")
        : `firstRun.connect.title.${connect}`
        : f.step === "notes" ? (panel === "progress" && made ? "firstRun.notes.title.made" : `firstRun.notes.title.${panel}`)
        : `firstRun.${f.step}.title`;
      // A problem says what happened with its own icon (D-142).
      const problemIcon = a?.problem === "offline" ? "cloudOff" : a?.problem === "expired" ? "history" : a?.problem === "noHelper" ? "lock" : "error";
      // The field at fault says why on itself (D-142).
      // A passphrase too easy to guess says so with its meter, not more words (D-142).
      const fieldError = (name: string) => (w.error && w.field === name && w.error !== "firstRun.workspace.error.weak" ? catalog.format(`firstRun.workspace.field.${w.error === "firstRun.workspace.error.confirm" ? "confirm" : "names"}`) : "");
      const invalid = (name: string) => Boolean(w.error && w.field === name);
      return {
        // Welcome is the hero, centred; the steps after it read from the start (D-126).
        open: f.active, step: f.step, align: f.step === "welcome" ? "center" : "start",
        title: catalog.format(catalog.has(titleKey) ? titleKey : `firstRun.${f.step}.title`),
        progress: catalog.format("firstRun.progress", { n: i + 1, total: FIRST_RUN_STEPS.length }), showProgress: f.scope === "install" || f.scope === "setup",
        stepNumber: i + 1, stepTotal: FIRST_RUN_STEPS.length,
        needHelper, helperText: needHelper && !problem, problemIcon, notesIcon: lookupFailed ? "cloudOff" : "error",
        installLabel: catalog.format(gitState === "old" ? "firstRun.connect.update" : "firstRun.connect.install"), gitFound: g?.version ?? "", gitNeeded: GIT_NEEDED, isGitOld: gitState === "old" && !bundled,
        canInstall: !bundled,
        gitCardTitle: catalog.format(bundled ? "firstRun.connect.bundledTitle" : "firstRun.connect.helperTitle"),
        gitCardDetail: catalog.format(bundled ? "firstRun.connect.repair" : "firstRun.connect.helperWhy"), gitCardIcon: bundled ? "warning" : "download",
        noHelperText: catalog.format(bundled ? "firstRun.connect.helperOff" : "firstRun.connect.noHelper"),
        instanceInvalid: invalid("instance"), privateInvalid: invalid("private"), passphraseInvalid: invalid("passphrase"), confirmInvalid: invalid("confirm"),
        instanceError: fieldError("instance"), privateError: fieldError("private"), passphraseError: fieldError("passphrase"), confirmError: fieldError("confirm"),
        hasStrength: Boolean(w.passphrase), strength: w.strength,
        instanceFocus: !w.field || w.field === "instance" ? f.focus : 0, privateFocus: w.field === "private" ? f.focus : 0,
        passphraseFocus: w.field === "passphrase" ? f.focus : 0, confirmFocus: w.field === "confirm" ? f.focus : 0,
        strengthText: w.strength ? catalog.format(`firstRun.workspace.strength.${w.strength}`) : "",
        busy: f.busy, focus: f.focus, canContinue: canContinue(f.step, { ...(g ? { git: g } : {}), ...(a ? { account: a } : {}), workspaceReady: made }),
        connect, trouble: f.trouble,
        isGit: connect === "git", isChoose: connect === "choose", showTrouble: ["git", "found", "cli", "choose"].includes(connect),
        gitState, gitText: bundled && !g?.ok ? catalog.format("firstRun.git.broken") : g?.version ? catalog.format(g.ok ? "firstRun.git.ok" : "firstRun.git.old", { version: g.version }) : catalog.format("firstRun.git.missing"),
        installText: bundled ? "" : catalog.format(`firstRun.git.install.${platform}`), installCommand: bundled ? "" : catalog.format(`firstRun.git.command.${platform}`),
        login, handle: login ? `@${login}` : "", accountName: shown?.name || login,
        // The account's picture, fetched by the shell and handed over as a data URL (no request from here), or its initials.
        avatar: shown?.avatar && AVATAR.test(shown.avatar) ? shown.avatar : "", initials: initials(shown?.name || login),
        foundText: login ? catalog.format("firstRun.connect.found", { login, name: shown?.name || login }) : "",
        continueAs: catalog.format("firstRun.signIn.continueAs", { name: (shown?.name || login).trim().split(/\s+/)[0] ?? login }),
        code: f.signIn.code,
        canHelper: Boolean(a?.gcm || a?.gh), noHelper: Boolean(a && !a.gcm && !a.gh), problem, hasProblem: Boolean(problem), offline: a?.problem === "offline",
        canOther: connect === "found" || connect === "cli",
        token: f.token, tokenError: f.tokenError,
        panel, more: w.more, details: w.details, canCreate: f.scope !== "workspace",
        isCreate: panel === "create", showMore: panel === "create" || panel === "found", working: started && !made && !err && !failed,
        found: w.repos.filter((r) => r.instance).slice(0, 5).map((r, n) => ({
          id: `${r.owner}/${r.name}`, first: n === 0, variant: n === 0 ? "primary" : "secondary", label: !s.account.login || r.owner === s.account.login ? r.name : `${r.owner}/${r.name}`,
          icon: r.private ? "lock" : "folder", detail: updated(r.pushedAt), badge: catalog.format(r.private ? "firstRun.notes.private" : "firstRun.notes.public"),
        })),
        instance: w.instance, private: w.private, publish: w.publish ? "on" : "off", publishOptions: options("firstRun.workspace.publish", ["on", "off"]),
        passphrase: w.passphrase, confirm: w.confirm, folder: w.folder, folderText: catalog.format("firstRun.workspace.folder", { folder: w.folder }),
        error: err && catalog.has(err) ? catalog.format(err) : "", hasError: Boolean(err),
        started, made, progressText: made ? catalog.format("firstRun.workspace.made") : failedStep ? catalog.format(`setup.problem.${failedStep.problem ?? "failed"}`) : catalog.format("firstRun.notes.creating"),
        query: w.query, activeId: w.activeId,
        noMatch: w.reposLoaded && !list.length, reposSummary: !w.reposLoaded ? "" : list.length ? catalog.format("firstRun.workspace.repos", { count: list.length }) : catalog.format("firstRun.workspace.noRepos"),
        repos: list.map((r) => ({
          id: `${r.owner}/${r.name}`, label: `${r.owner}/${r.name}`, icon: r.private ? "lock" : "document",
          description: catalog.format(r.instance ? "firstRun.workspace.repo.instance" : r.private ? "firstRun.workspace.repo.private" : "firstRun.workspace.repo.public"),
        })),
        theme: s.appearance.mode, themeOptions: options("firstRun.ready.theme", ["system", "light", "dark"]),
        canImport: commands.has("notes.import") && commands.describe("notes.import").enabled,
        // D-144: focus mode is the app's signature, so Ready features it with its toggle's keys, from the keymap.
        focusHint: catalog.format("firstRun.ready.focus"), focusKeys: focusChord ? chordParts(focusChord, bridge.platform) : [],
        focusSpoken: focusChord ? spokenChord(focusChord, bridge.platform) : "", hasFocusKeys: Boolean(focusChord),
        hasMark: Boolean(mark) || f.step === "connect" || f.step === "notes", mark: mark?.[0] ?? "github", markTone: mark?.[1] ?? "neutral", markBusy: Boolean(mark?.[2]),
        tokenMessage: tokenKey ? catalog.format(tokenKey) : "", hasTokenMessage: Boolean(tokenKey),
        failed: Boolean(failedStep), failedId: failedStep?.id ?? "", lookupFailed, canCreateNow: !lookupFailed,
        // D-154: the failed part's own way on, then Back (D-131's action row: one primary, Back subtle).
        failActions: failedStep ? setupFailureActions(failedStep.problem).map((id, n, all) => ({
          id, label: catalog.format(FAIL_LABEL[id]), first: n === 0, busy: n === 0 && f.busy, variant: n === 0 ? "primary" : id === "back" || n === all.length - 1 ? "subtle" : "secondary",
        })) : [],
        // D-154: Open into a folder that's taken offers the same real actions as setup.
        errorActions: err && w.result?.ok === false && w.result.problem === "folderTaken" && w.cloneId ? (["chooseFolder", "newFolder", "back"] as const).map((id, n) => ({
          id, label: catalog.format(FAIL_LABEL[id]), first: n === 0, busy: n === 0 && f.busy, variant: n === 0 ? "primary" : n === 1 ? "secondary" : "subtle",
        })) : [],
        createDetail: catalog.format(lookupFailed ? "firstRun.notes.createOffline" : "firstRun.notes.createWhy"),
        folderShort: shortPath(w.folder),
        waitText, hasWait, approvalText, partText, hasPart: Boolean(partText), parts,
        openParts, hasOpenParts: openParts.length > 0, openPercent: Math.max(0, openPercent), hasOpenPercent: openPercent >= 0,
        setupPercent: Math.max(0, setupPercent), hasSetupPercent: setupPercent >= 0, percentLabel: catalog.format("firstRun.wait.clone"),
        // The skeletons while their content is on its way (PRF-13): the profile card, and three rows of notes.
        accountSkeleton: hasWait && f.wait === "account" && connect === "checking",
        notesSkeleton: hasWait && f.wait === "findNotes" && panel === "checking",
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
      fr.onSignIn((p) => { if (state().signIn.phase !== "idle") setSignIn({ phase: p.phase, code: p.code ?? "", helper: p.helper, reported: true }); });
      // Long calls stream their progress: repositories checked, a download's part and percentage (PRF-13).
      fr.onProgress?.((p) => set({ progress: { op: p.op, done: p.done ?? 0, total: p.total ?? 0, part: p.part ?? "", percent: typeof p.percent === "number" ? p.percent : -1 } }));
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
      if (scope === "workspace") {
        // A list asked on intent (Settings → Workspace, PRF-13) is used while it's fresh.
        if (now() - repoAskedAt > PREFETCH_FRESH_MS) forgetRepos();
        setWs({ reposLoaded: false, repos: [], mode: "clone", error: "" });
      }
      if (scope === "setup") await persistAppState({ firstRun: step });
      void arrive[step]?.();
      return true;
    },
    /**
     * Prefetch on intent (PRF-13): Settings → Workspace is open, so Open another workspace from
     * GitHub… is likely; its list is asked now and used if it's opened within 30 s.
     */
    prefetchRepos(): void {
      if (!fr || state().active || !store.state.account.login) return;
      if (now() - repoAskedAt > PREFETCH_FRESH_MS) forgetRepos();
      void askRepos();
    },
    /** Whether the card is showing. */
    get active() {
      return state().active;
    },
  };
}

/** The meter's level (D-142): too weak (1, 2), fair (3: accepted), or strong (4). */
export function strengthLevel(r: { ok: boolean; bits: number }): number {
  if (r.ok) return r.bits >= 80 ? 4 : 3;
  return r.bits >= 40 ? 2 : 1;
}

function matches(repos: RepoChoice[], query: string): RepoChoice[] {
  const q = query.trim().toLowerCase();
  return repos.filter((r) => !q || `${r.owner}/${r.name}`.toLowerCase().includes(q)).slice(0, 100);
}

/**
 * A long folder path shortened in the middle (D-135), so it never wraps mid-name: its root and first
 * folder, an ellipsis, and its last two folders ("C:\Users\…\Documents\Focus Notes"). The full path
 * is the tooltip.
 */
export function shortPath(path: string, max = 40): string {
  if (path.length <= max) return path;
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(sep);
  if (parts.length <= 4) return path;
  return [...parts.slice(0, 2), "…", ...parts.slice(-2)].join(sep);
}
