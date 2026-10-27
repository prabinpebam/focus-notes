/**
 * The desktop's first run (FRE-01 to FRE-06, D-124): the step machine and its pure rules, then the
 * four steps in the app against an in-memory shell. Resuming after quitting (an earlier version's
 * steps too), Git checked silently and shown only when missing or too old, an existing sign-in
 * offered (FRE-04), declined, expired, and offline sign-ins that recover (FRE-02), a token that's
 * sent once and never kept (FRE-03, SEC-03), the notes' name and email set from the account with
 * no step (FRE-05), the workspaces found offered first and Create my notes with the passphrase
 * optional (FRE-06, FRE-08), Just use this computer for now, Open another workspace from Settings,
 * and the desktop's account pill (UI-12).
 */
import { describe, expect, it } from "vitest";
import {
  canContinue, createApp, deviceCode, FIRST_RUN_PAGES, FIRST_RUN_STEPS, gitIsNewEnough, identityProblem, INSTALL_PAGES, looksLikeToken, pageAllowed, nextStep, noreplyEmail, notesIdentity, parseGitVersion, prevStep,
  resumeStep, signInProblem, suggestIdentity, SETUP_PROBLEMS, SETUP_STEPS, TOKEN_PAGE,
  type AccountStatus, type AppStateFile, type FirstRunBridge, type FirstRunProgress, type GitCheck, type PlatformBridge, type RepoChoice, type SetupReport, type SignInProgress, type SyncReport, type WorkspaceResult,
} from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const ADA = { login: "ada", id: 583231, name: "Ada Lovelace" };

/** A clock the test moves by hand, so a wait's sign, words and elapsed time are checked at their times (PRF-13). */
interface ManualClock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void; advance(ms: number): Promise<void> }
function manualClock(): ManualClock {
  let t = 0, n = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => (timers.push({ at: t + ms, fn, id: ++n }), n),
    clearTimeout: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const x = timers[0];
        if (!x || x.at > end) break;
        timers.shift();
        t = x.at;
        x.fn();
      }
      t = end;
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const TOKEN = "github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz";

describe("FRE-01: the step machine (D-124)", () => {
  it("has four steps in order, and back never returns to Your notes once the workspace is open", () => {
    expect(FIRST_RUN_STEPS).toEqual(["welcome", "connect", "notes", "ready"]);
    expect(nextStep("welcome")).toBe("connect");
    expect(nextStep("ready")).toBe("done");
    expect(prevStep("connect")).toBe("welcome");
    expect(prevStep("welcome")).toBe("welcome");
    expect(prevStep("notes")).toBe("connect");
    expect(prevStep("ready")).toBe("ready");
  });
  it("resumes an earlier version's seven steps at the step that holds each one now", () => {
    expect(["git", "signIn", "identity", "workspace", "personalize", "ready", "notes", "nope", 3].map(resumeStep)).toEqual(["connect", "connect", "connect", "notes", "ready", "ready", "notes", undefined, undefined]);
  });
  it("continues only when the step's condition holds", () => {
    const git = { installed: true, version: "2.45.1", ok: true, gcm: true, gh: false };
    expect(canContinue("welcome", {})).toBe(true);
    expect(canContinue("connect", { git: { ...git, version: "2.30.1", ok: false }, account: { account: ADA, gcm: true, gh: false } })).toBe(false);
    expect(canContinue("connect", { git, account: { gcm: true, gh: false } })).toBe(false);
    expect(canContinue("connect", { git, account: { account: ADA, gcm: true, gh: false } })).toBe(true);
    expect(canContinue("notes", { workspaceReady: false })).toBe(false);
    expect(canContinue("notes", { workspaceReady: true })).toBe(true);
  });
});

describe("FRE-01: detecting Git (D-97)", () => {
  it("reads Git's version on every platform, and needs 2.31 or newer", () => {
    expect(parseGitVersion("git version 2.45.1.windows.1\n")).toEqual([2, 45, 1]);
    expect(parseGitVersion("git version 2.39.3 (Apple Git-146)")).toEqual([2, 39, 3]);
    expect(parseGitVersion("git version 2.31")).toEqual([2, 31, 0]);
    expect(parseGitVersion("command not found")).toBeUndefined();
    expect(gitIsNewEnough([2, 30, 9])).toBe(false);
    expect(gitIsNewEnough([2, 31, 0])).toBe(true);
    expect(gitIsNewEnough([3, 0, 0])).toBe(true);
    expect(gitIsNewEnough(undefined)).toBe(false);
  });
});

describe("FRE-02: reading the sign-in helpers' output", () => {
  it("finds the one-time code and says why a sign-in ended", () => {
    expect(deviceCode("! First copy your one-time code: WDJB-MJHT\nOpen this URL to continue")).toBe("WDJB-MJHT");
    expect(deviceCode("To complete authentication please visit https://github.com/login/device and enter the code: 1A2B-3C4D")).toBe("1A2B-3C4D");
    expect(deviceCode("nothing here")).toBeUndefined();
    expect(signInProblem("error: access_denied: The user has denied your application access.")).toBe("declined");
    expect(signInProblem("expired_token: the device code has expired")).toBe("expired");
    expect(signInProblem("dial tcp: lookup github.com: no such host")).toBe("offline");
    expect(signInProblem("something else")).toBe("failed");
  });
  it("pre-fills the fine-grained token page with what setup and sync need, and only on github.com", () => {
    const url = new URL(TOKEN_PAGE);
    expect(url.origin + url.pathname).toBe("https://github.com/settings/personal-access-tokens/new");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ name: "Focus Notes", contents: "write", administration: "write", pages: "write", secrets: "write", workflows: "write" });
    expect(looksLikeToken(TOKEN)).toBe(true);
    expect(looksLikeToken("ghp_short")).toBe(false);
    expect(looksLikeToken("two words pasted")).toBe(false);
  });
});

describe("FRE-05: the identity", () => {
  it("the notes' name and email come from the account, with the private noreply address (D-124)", () => {
    expect(noreplyEmail(ADA)).toBe("583231+ada@users.noreply.github.com");
    expect(notesIdentity(ADA)).toEqual({ name: "Ada Lovelace", email: "583231+ada@users.noreply.github.com" });
    expect(notesIdentity({ ...ADA, name: "" })).toEqual({ name: "ada", email: "583231+ada@users.noreply.github.com" });
  });
  it("keeps Git's own, or fills it in from GitHub with the private noreply address", () => {
    expect(suggestIdentity({ name: "A. L.", email: "al@example.com" }, ADA)).toEqual({ name: "A. L.", email: "al@example.com", source: "git" });
    expect(suggestIdentity({}, ADA)).toEqual({ name: "Ada Lovelace", email: "583231+ada@users.noreply.github.com", source: "github" });
    expect(suggestIdentity({}, { ...ADA, name: "" })).toMatchObject({ name: "ada" });
    expect(suggestIdentity({ name: "Ada" }, ADA)).toEqual({ name: "Ada", email: "583231+ada@users.noreply.github.com", source: "github" });
    expect(suggestIdentity({}, undefined)).toEqual({ name: "", email: "", source: "none" });
    expect(identityProblem({ name: "", email: "a@b.c" })).toBe("name");
    expect(identityProblem({ name: "Ada <x>", email: "a@b.c" })).toBe("name");
    expect(identityProblem({ name: "Ada", email: "a@b\nc" })).toBe("email");
    expect(identityProblem({ name: "Ada", email: "a@b.c" })).toBeUndefined();
  });
});

// ---- the steps in the app ----

const GIT_OK: GitCheck = { installed: true, version: "2.45.1", ok: true, gcm: true, gh: false };
const report = (states: Partial<Record<string, SetupReport["steps"][number]["state"]>> = {}, running = false): SetupReport => ({
  running, options: { instance: "notes", private: "notes-private", folder: "/home/ada/Documents/Focus Notes", publish: true },
  steps: SETUP_STEPS.map((id) => ({ id, state: states[id] ?? "pending" })),
});

function shell(opts: { state?: AppStateFile; git?: GitCheck; account?: AccountStatus; signIn?: () => Promise<AccountStatus>; useToken?: () => AccountStatus; repos?: RepoChoice[]; reposOffline?: boolean; clone?: (owner: string, name: string, where?: "new") => WorkspaceResult; platform?: PlatformBridge["platform"]; clock?: ManualClock; slowRepos?: Promise<void>; slowAccount?: Promise<void> } = {}) {
  const saved: AppStateFile[] = [];
  const calls: string[] = [];
  const tokens: string[] = [];
  const passphrases: (string | undefined)[] = [];
  let progress: ((p: SignInProgress) => void) | undefined;
  let firstRunProgress: ((p: FirstRunProgress) => void) | undefined;
  let syncListener: ((r: SyncReport) => void) | undefined;
  let account: AccountStatus = opts.account ?? { gcm: true, gh: false };
  const fr: FirstRunBridge = {
    git: async () => (calls.push("git"), opts.git ?? GIT_OK),
    account: async () => (calls.push("account"), await opts.slowAccount, account),
    useExisting: async () => (calls.push("useExisting"), (account = { ...account, account: account.cliAccount! })),
    signIn: async (device) => {
      calls.push(`signIn:${device}`);
      progress?.({ phase: "code", code: "WDJB-MJHT", helper: "gh" });
      return opts.signIn ? opts.signIn() : (account = { ...account, account: ADA });
    },
    cancelSignIn: async () => void calls.push("cancel"),
    onSignIn: (l) => ((progress = l), () => {}),
    useToken: async (t) => (tokens.push(t), (account = opts.useToken ? opts.useToken() : { ...account, account: ADA })),
    signOut: async () => (calls.push("signOut"), (account = { gcm: true, gh: false })),
    identity: async () => suggestIdentity({}, account.account),
    setIdentity: async (i, scope) => (calls.push(`identity:${i.name}:${i.email}:${scope}`), true),
    onProgress: (l) => ((firstRunProgress = l), () => {}),
    repositories: async () => { calls.push("repositories"); await opts.slowRepos; if (opts.reposOffline) throw new Error("offline"); return opts.repos ?? [{ owner: "ada", name: "notes", private: false, instance: true, pushedAt: "2026-10-12T09:00:00Z" }, { owner: "ada", name: "recipes", private: true, instance: false }]; },
    folder: async (instance) => `/home/ada/Documents/${instance ?? "Focus Notes"}`,
    chooseFolder: async () => (calls.push("chooseFolder"), "/home/ada/Elsewhere"),
    clone: async (owner, name, where) => (calls.push(`clone:${owner}/${name}${where ? `:${where}` : ""}`), opts.clone ? opts.clone(owner, name, where) : { ok: true, folder: "/x", privateNotes: false }),
    openFolder: async () => (calls.push("openFolder"), { ok: false, problem: "notWorkspace" }),
    openWorkspace: async () => (calls.push("openWorkspace"), { ok: true }),
    openPage: (p) => void calls.push(`page:${p}`),
  };
  let setupListener: ((r: SetupReport) => void) | undefined;
  const bridge: PlatformBridge = {
    platform: opts.platform ?? "windows",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => opts.state ?? { version: 1 },
    saveAppState: async (s) => void saved.push(s),
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    copyText: async (t) => void calls.push(`copy:${t}`),
    firstRun: fr,
    sync: {
      now: async () => (calls.push("sync"), { git: true, state: "idle", waiting: 0 }),
      status: async () => ({ git: true, state: "idle", waiting: 0 }),
      onStatus: (l) => ((syncListener = l), () => {}),
    },
    setup: {
      status: async () => ({ running: false, steps: SETUP_STEPS.map((id) => ({ id, state: "pending" as const })) }),
      start: async (_o, passphrase) => (passphrases.push(passphrase), report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "done", link: "done", vault: passphrase ? "done" : "skipped", pages: "running" }, true)),
      retry: async () => report(),
      reset: async () => report(),
      passphraseStrength: async (p) => ({ ok: p.length >= 12, bits: p.length * 4 }),
      onReport: (l) => ((setupListener = l), () => {}),
    },
  };
  const app = createApp(bridge, en, "en", { clock: opts.clock ?? { now: () => Date.parse("2026-10-15T09:00:00Z"), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) } });
  const vm = () => app.viewModels.select("vm.firstRun", app.store.state) as Record<string, unknown>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, vm, run, saved, calls, tokens, passphrases, last: () => saved.at(-1), pushSetup: (r: SetupReport) => setupListener!(r), pushSync: (r: SyncReport) => syncListener!(r), pushProgress: (p: FirstRunProgress) => firstRunProgress!(p) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("D-126: nothing outside setup works until it's done", () => {
  const key = (k: string) => ({ key: k, code: `Key${k.toUpperCase()}`, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
  it("holds the app's commands while setup is open: disabled with a reason, keys and runs do nothing; setup's own work", async () => {
    const t = shell();
    await t.app.start();
    for (const id of ["note.new", "note.open", "files.open", "spotlight.actions"].filter((i) => t.app.commands.has(i))) {
      expect(t.app.commands.describe(id)).toMatchObject({ enabled: false, disabledReason: "command.firstRun.held" });
    }
    expect(t.app.commands.match(key("o"))).toBeUndefined();
    expect(t.app.commands.match(key("n"))).toBeUndefined();
    await t.run("note.new");
    expect(t.app.store.state.note.path).toBeUndefined();
    expect(t.app.commands.describe("firstRun.next").enabled).toBe(true);
    await t.run("firstRun.local");
    expect(t.vm().open).toBe(false);
    expect(t.app.commands.describe("note.new").enabled).toBe(true);
    expect(t.app.commands.match(key("n"))).toBe("note.new");
  });
});

describe("FRE-01: the first run in the app (D-124)", () => {
  it("starts at Welcome on a new install, with no note opened behind it, in four steps", async () => {
    const t = shell();
    await t.app.start();
    expect(t.vm()).toMatchObject({ open: true, step: "welcome", title: "A quiet place to write", progress: "Step 1 of 4" });
    expect(t.app.store.state.note.path).toBeUndefined();
  });
  it("doesn't start once done, for people who already wrote with the app, or in a shell without one", async () => {
    for (const state of [{ version: 1 as const, firstRun: "done" as const }, { version: 1 as const, lastNotePath: "/n/a.md" }]) {
      const t = shell({ state });
      await t.app.start();
      expect(t.vm().open).toBe(false);
      expect(t.app.store.state.note.path).toBe("/n/a.md");
    }
  });
  it("Just use this computer for now finishes with a new note and no account", async () => {
    const t = shell();
    await t.app.start();
    await t.run("firstRun.local");
    expect(t.vm().open).toBe(false);
    expect(t.last()?.firstRun).toBe("done");
    expect(t.app.store.state.note.path).toBe("/n/Untitled.md");
    // Nothing about Git or signing in ran.
    expect(t.calls.filter((c) => c === "git" || c.startsWith("signIn") || c === "repositories")).toEqual([]);
  });
  it("Connect checks Git silently: with Git ready it never shows, and the account is checked", async () => {
    const t = shell();
    await t.app.start();
    await t.run("firstRun.next");
    expect(t.vm()).toMatchObject({ step: "connect", title: "Connect your GitHub account", connect: "choose", isGit: false, progress: "Step 2 of 4" });
    expect(t.calls.slice(0, 2)).toEqual(["git", "account"]);
    expect(t.last()?.firstRun).toBe("connect");
  });
  it("keeps the step, so quitting resumes there, and an earlier version's step resumes at the step that holds it", async () => {
    for (const saved of ["connect", "signIn", "git", "identity"] as const) {
      const again = shell({ state: { version: 1, firstRun: saved as AppStateFile["firstRun"] } });
      await again.app.start();
      await settle();
      expect(again.vm(), saved).toMatchObject({ open: true, step: "connect" });
      expect(again.calls).toContain("account");
    }
    const ws = shell({ state: { version: 1, firstRun: "workspace" as AppStateFile["firstRun"] }, account: { account: ADA, gcm: true, gh: false } });
    await ws.app.start();
    await settle();
    expect(ws.vm().step).toBe("notes");
    const made = shell({ state: { version: 1, firstRun: "personalize" as AppStateFile["firstRun"] } });
    await made.app.start();
    await settle();
    expect(made.vm().step).toBe("ready");
    // Esc goes back.
    const back = shell({ state: { version: 1, firstRun: "connect" } });
    await back.app.start();
    await settle();
    await back.run("firstRun.back");
    expect(back.vm().step).toBe("welcome");
  });
  it("Git missing or too old: one helper app to install and Check again; the details wait under Having trouble?", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: { installed: false, ok: false, gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "git", isGit: true, showTrouble: true, trouble: false, canContinue: false, installCommand: "winget install --id Git.Git -e", gitText: "Git isn't installed." });
    expect(t.calls).not.toContain("account");
    await t.run("firstRun.toggleTrouble");
    expect(t.vm().trouble).toBe(true);
    await t.run("firstRun.next");
    expect(t.vm().step).toBe("connect");
    expect(t.calls.filter((c) => c === "git")).toHaveLength(2);
    const old = shell({ state: { version: 1, firstRun: "connect" }, git: { installed: true, version: "2.25.1", ok: false, gcm: false, gh: false } });
    await old.app.start();
    await settle();
    expect(old.vm()).toMatchObject({ connect: "git", gitState: "old", gitText: "Git 2.25.1 is too old: 2.31 or newer is needed." });
  });
});

describe("FRE-02, FRE-04, FRE-05: connecting", () => {
  it("an existing working credential is offered as a profile card and Continue as <first name>, with no device code, and the notes' name comes from the account", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "found", login: "ada", foundText: "This computer is connected to GitHub as @ada (Ada Lovelace).", continueAs: "Continue as Ada", canContinue: true, canOther: true,
      // D-126: the profile card: the name, @login, and the initials while there's no picture.
      accountName: "Ada Lovelace", handle: "@ada", initials: "AL", avatar: "" });
    await t.run("firstRun.useExisting");
    expect(t.vm().step).toBe("notes");
    expect(t.calls.some((c) => c.startsWith("signIn"))).toBe(false);
    // FRE-05: for the notes only, never Git's global settings.
    expect(t.calls).toContain("identity:Ada Lovelace:583231+ada@users.noreply.github.com:workspace");
  });
  it("Having trouble? offers a different account", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    await t.run("firstRun.toggleTrouble");
    await t.run("firstRun.otherAccount");
    expect(t.vm()).toMatchObject({ connect: "choose", trouble: false, canHelper: true });
    await t.run("firstRun.useExisting");
    expect(t.vm().step).toBe("connect");
  });
  it("a GitHub CLI session is offered too, and Git starts using it", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { cliAccount: ADA, gcm: false, gh: true } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "cli", login: "ada", canContinue: false });
    await t.run("firstRun.next");
    expect(t.calls).toContain("useExisting");
    expect(t.vm().step).toBe("notes");
  });
  it("a device code shows in the app, Copy code and open GitHub copies it, and connecting ends with the login", async () => {
    let finish!: (a: AccountStatus) => void;
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { gcm: false, gh: true }, signIn: () => new Promise((r) => (finish = r)) });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "choose", isChoose: true, canHelper: true });
    const going = t.run("firstRun.signInDevice");
    await settle();
    expect(t.vm()).toMatchObject({ connect: "code", code: "WDJB-MJHT" });
    await t.run("firstRun.copyCode");
    expect(t.calls).toEqual(expect.arrayContaining(["signIn:true", "copy:WDJB-MJHT", "page:device"]));
    finish({ account: ADA, gcm: false, gh: true });
    await going;
    expect(t.vm()).toMatchObject({ connect: "found", login: "ada", canContinue: true });
  });
  it("D-142: Connect to GitHub is a device code; the browser sign-in and a token wait under Having trouble?, and the title names the state", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { gcm: true, gh: false, problem: "failed" }, signIn: () => new Promise(() => {}) });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "choose", title: "Connect your GitHub account", hasMark: true, mark: "github", stepNumber: 2, stepTotal: 4 });
    // A fresh token form never opens showing the last sign-in's problem.
    await t.run("firstRun.useToken");
    expect(t.vm()).toMatchObject({ connect: "token", title: "Use a token", hasTokenMessage: false, tokenMessage: "" });
    await t.run("firstRun.back");
    void t.run("firstRun.signIn");
    await settle();
    expect(t.calls).toContain("signIn:true");
    expect(t.vm()).toMatchObject({ connect: "code", title: "Enter the code on GitHub", markBusy: true });
    await t.run("firstRun.cancelSignIn");
    void t.run("firstRun.signInBrowser");
    await settle();
    expect(t.calls).toContain("signIn:false");
  });
  it("D-142: Git too old shows the version found and the one needed, and the install command copies", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: { installed: true, ok: false, version: "2.20.1", gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "git", isGitOld: true, gitFound: "2.20.1", gitNeeded: "2.31", title: "Update the helper app", installLabel: "Update the helper app", mark: "download" });
    await t.run("firstRun.copyCommand");
    expect(t.calls).toContain("copy:winget install --id Git.Git -e");
  });
  it("declined, expired, and offline say so in plain words, and connecting again works without restarting", async () => {
    for (const problem of ["declined", "expired", "offline"] as const) {
      let n = 0;
      const t = shell({ state: { version: 1, firstRun: "connect" }, signIn: async () => (n++ === 0 ? { gcm: true, gh: false, problem } : { account: ADA, gcm: true, gh: false }) });
      await t.app.start();
      await settle();
      await t.run("firstRun.signIn");
      expect(t.vm()).toMatchObject({ connect: "choose", hasProblem: true, offline: problem === "offline" });
      expect(t.vm().problem).toBe(en[`firstRun.signIn.problem.${problem}` as keyof typeof en]);
      expect(t.vm().problem).not.toMatch(/token|credential|Git\b|CLI/);
      await t.run("firstRun.signIn");
      expect(t.vm()).toMatchObject({ connect: "found", hasProblem: false });
    }
  });
  it("Cancel stops a sign-in that's waiting, and Esc does too", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, signIn: () => new Promise(() => {}) });
    await t.app.start();
    await settle();
    void t.run("firstRun.signIn");
    await settle();
    expect(t.vm().connect).toBe("code");
    await t.run("firstRun.back");
    expect(t.calls).toContain("cancel");
    expect(t.vm()).toMatchObject({ step: "connect", connect: "choose" });
  });
  it("FRE-03, SEC-03: a pasted token is sent to the shell once and never kept in the app's state or saved", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "choose", noHelper: true });
    await t.run("firstRun.useToken");
    expect(t.vm().connect).toBe("token");
    await t.run("firstRun.openPage", { page: "token" });
    expect(t.calls).toContain("page:token");
    await t.run("firstRun.setToken", { value: "not a token" });
    await t.run("firstRun.submitToken");
    expect(t.vm()).toMatchObject({ tokenError: true, token: "" });
    expect(t.tokens).toEqual([]);
    await t.run("firstRun.setToken", { value: ` ${TOKEN} ` });
    await t.run("firstRun.submitToken");
    expect(t.tokens).toEqual([TOKEN]);
    expect(t.vm()).toMatchObject({ connect: "found", login: "ada", token: "" });
    expect(JSON.stringify(t.app.store.state) + JSON.stringify(t.saved)).not.toContain(TOKEN);
  });

  it("D-135: a token GitHub rejects keeps the form, with the field saying why it was cleared, and focus on it", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, account: { gcm: true, gh: false }, useToken: () => ({ gcm: true, gh: false, problem: "invalid" }) });
    await t.app.start();
    await settle();
    await t.run("firstRun.useToken");
    await t.run("firstRun.setToken", { value: TOKEN });
    const focus = t.vm().focus as number;
    await t.run("firstRun.submitToken");
    expect(t.vm()).toMatchObject({ connect: "token", token: "", hasTokenMessage: true, tokenMessage: "GitHub didn't accept that token, so it was cleared. Make a new one and paste it.", mark: "lock", markTone: "danger" });
    expect(t.vm().focus).toBeGreaterThan(focus);
    // Typing again clears what GitHub said.
    await t.run("firstRun.setToken", { value: "g" });
    expect(t.vm()).toMatchObject({ hasTokenMessage: false, tokenMessage: "" });
    expect(JSON.stringify(t.app.store.state)).not.toContain(TOKEN);
  });
});

describe("FRE-06, FRE-08: Your notes", () => {
  const atNotes = async (opts: Omit<Parameters<typeof shell>[0] & object, "state" | "account"> = {}) => {
    const t = shell({ state: { version: 1, firstRun: "notes" }, account: { account: ADA, gcm: true, gh: false }, ...opts });
    await t.app.start();
    await settle();
    return t;
  };
  it("We found your notes: the account's workspaces first, with when they were updated and who can see them, and Open on each", async () => {
    const t = await atNotes();
    expect(t.vm()).toMatchObject({ panel: "found", title: "We found your notes", showMore: true, more: false });
    expect(t.vm().found).toEqual([{ id: "ada/notes", label: "notes", detail: "Updated 3 days ago", badge: "Public", icon: "folder", first: true, variant: "primary" }]);
    await t.run("firstRun.clone", { id: "ada/notes" });
    expect(t.calls).toEqual(expect.arrayContaining(["clone:ada/notes", "openWorkspace"]));
    expect(t.last()?.firstRun).toBe("ready");
  });
  it("Create new notes instead, and Esc comes back to the notes found", async () => {
    const t = await atNotes();
    await t.run("firstRun.setMode", { value: "create" });
    expect(t.vm()).toMatchObject({ panel: "create", title: "Create your notes" });
    await t.run("firstRun.back");
    expect(t.vm()).toMatchObject({ step: "notes", panel: "found" });
  });
  it("with no notes yet, Create my notes uses the defaults, needs no passphrase, and opens the notes once they're on this computer", async () => {
    const t = await atNotes({ repos: [{ owner: "ada", name: "recipes", private: true, instance: false }] });
    expect(t.vm()).toMatchObject({ panel: "create", isCreate: true, instance: "notes", private: "notes-private", publish: "on", folder: "/home/ada/Documents/notes", made: false, canContinue: false });
    await t.run("firstRun.create");
    expect(t.passphrases).toEqual([undefined]);
    expect(t.vm()).toMatchObject({ panel: "progress", started: true, made: false, working: true, title: "Creating your notes" });
    // Downloaded and linked: writing can start while Pages and the push carry on.
    t.pushSetup(report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "done", link: "done", vault: "skipped", pages: "running" }));
    expect(t.vm()).toMatchObject({ made: true, canContinue: true, working: false, details: false, title: "Your notes are ready", progressText: "Backing up carries on in the background." });
    await t.run("firstRun.next");
    expect(t.calls).toContain("openWorkspace");
    expect(t.last()?.firstRun).toBe("ready");
  });
  it("D-135: a part that fails says why in one sentence, with a warning mark and Try again on that part; the details stay closed", async () => {
    const t = await atNotes({ repos: [] });
    await t.run("firstRun.create");
    expect(t.vm()).toMatchObject({ hasMark: true, mark: "cloudUp", markTone: "accent", markBusy: true, progressText: "This takes about a minute." });
    t.pushSetup(report({ account: "done", instance: "failed" }));
    expect(t.vm()).toMatchObject({ details: false, working: false, failed: true, failedId: "instance", mark: "warning", markTone: "danger", markBusy: false, progressText: "That didn't work. Retry, or check GitHub." });
  });
  // D-154: no dead ends. Every part's every failure offers something that changes what happens next
  // (not only the same call again) and a way back; transient failures keep Try again first.
  it("D-154: every setup failure offers an action that changes something, and Back", async () => {
    for (const step of SETUP_STEPS) {
      for (const problem of SETUP_PROBLEMS) {
        const t = await atNotes({ repos: [] });
        await t.run("firstRun.create");
        const before = Object.fromEntries(SETUP_STEPS.slice(0, SETUP_STEPS.indexOf(step)).map((id) => [id, "done" as const]));
        const r = report({ ...before, [step]: "failed" });
        r.steps = r.steps.map((s) => (s.id === step ? { ...s, problem } : s));
        t.pushSetup(r);
        const actions = t.vm().failActions as { id: string; label: string; variant: string; first: boolean }[];
        const where = `${step}/${problem}`;
        expect(actions.length, where).toBeGreaterThan(1);
        expect(actions[0], where).toMatchObject({ variant: "primary", first: true });
        expect(actions.every((a) => a.label && !a.label.startsWith("firstRun.")), where).toBe(true);
        expect(actions.some((a) => a.id !== "retry" && a.id !== "back"), `${where}: an action that changes something`).toBe(true);
        expect(actions.at(-1)?.id, `${where}: a way back`).toBe("back");
        if (["offline", "auth", "rateLimited"].includes(problem)) expect(actions[0]!.id, where).toBe("retry");
        if (problem === "folderTaken") expect(actions.map((a) => a.id), where).toEqual(["chooseFolder", "newFolder", "back"]);
        // Back leaves the failed part: to Connect, where the person can come back to it.
        await t.run("firstRun.failAction", { id: "back" });
        expect(t.vm().step, where).toBe("connect");
      }
    }
  });
  it("D-154: a folder that's taken: Choose another folder… downloads there and carries on; Use a new folder too; Start over brings back the form", async () => {
    const t = await atNotes({ repos: [] });
    const used: string[] = [];
    const retried: string[] = [];
    const setup = t.app.bridge.setup!;
    const taken = () => {
      const r = report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "failed" });
      r.steps = r.steps.map((s) => (s.id === "clone" ? { ...s, problem: "folderTaken" as const } : s));
      return r;
    };
    setup.useFolder = async (how) => (used.push(how), how === "choose" ? undefined : report({ account: "done", instance: "done", private: "done", deployKey: "done" }));
    setup.retry = async (id) => (retried.push(id), report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "done" }));
    await t.run("firstRun.create");
    t.pushSetup(taken());
    expect(t.vm()).toMatchObject({ failed: true, progressText: "That folder already has other files, so your notes can't go there." });
    // Cancelled dialog: nothing changes, nothing runs.
    await t.run("firstRun.failAction", { id: "chooseFolder" });
    expect(used).toEqual(["choose"]);
    expect(retried).toEqual([]);
    await t.run("firstRun.failAction", { id: "newFolder" });
    expect(used).toEqual(["choose", "new"]);
    expect(retried).toEqual(["clone"]);
    // Start over (names GitHub can't use): setup forgets its progress (nothing on GitHub or on disk goes) and the form is back.
    const named = report({ account: "done", instance: "failed" });
    named.steps = named.steps.map((s) => (s.id === "instance" ? { ...s, problem: "notInstance" as const } : s));
    t.pushSetup(named);
    expect((t.vm().failActions as { id: string }[]).map((a) => a.id)).toEqual(["startOver", "back"]);
    setup.reset = async () => ({ running: false, steps: SETUP_STEPS.map((id) => ({ id, state: "pending" as const })) });
    await t.run("firstRun.failAction", { id: "startOver" });
    expect(t.vm()).toMatchObject({ step: "notes", panel: "create", started: false });
    // An action the failure doesn't offer does nothing.
    t.pushSetup(taken());
    await t.run("firstRun.failAction", { id: "retry" });
    expect(retried).toEqual(["clone"]);
  });
  // Errors belong to what produced them (the owner's report: "Your notes are ready" under "Can't reach
  // GitHub to look for your notes."): a lookup's error is the lookup panels' only, and goes when the step changes.
  it("D-154: a stale lookup error never shows once setup is under way or done, and goes when the step changes", async () => {
    const t = await atNotes({ reposOffline: true });
    expect(t.vm()).toMatchObject({ panel: "create", hasError: true, error: "Can't reach GitHub to look for your notes." });
    t.pushSetup(report({ account: "done", instance: "running" }, true));
    expect(t.vm()).toMatchObject({ panel: "progress", hasError: false, error: "", working: true, mark: "cloudUp" });
    t.pushSetup(report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "done", link: "done", vault: "skipped", pages: "done", push: "done" }));
    expect(t.vm()).toMatchObject({ made: true, title: "Your notes are ready", hasError: false, error: "", mark: "cloudCheck", markTone: "success" });
    // Back to Connect and on again: the old error went with the step.
    const u = await atNotes({ reposOffline: true });
    await u.run("firstRun.back");
    expect(u.app.store.state.firstRun.workspace.error).toBe("");
  });
  // D-154: Open from GitHub into a folder the person chose that's taken: the same real actions as setup.
  it("D-154: Open from GitHub into a taken folder offers Choose another folder…, Use a new folder, and Back", async () => {
    let taken = true;
    const t = await atNotes({ clone: (_o, _n, where) => (taken && where !== "new" ? { ok: false, problem: "folderTaken" } : { ok: true, folder: "/x", privateNotes: false }) });
    await t.run("firstRun.clone", { id: "ada/notes" });
    expect(t.vm()).toMatchObject({ hasError: true, error: "That folder already has other files, so your notes can't go there." });
    const ids = () => (t.vm().errorActions as { id: string }[]).map((a) => a.id);
    expect(ids()).toEqual(["chooseFolder", "newFolder", "back"]);
    expect((t.vm().errorActions as { variant: string; first: boolean }[])[0]).toMatchObject({ variant: "primary", first: true });
    // Choose another folder…: the dialog, then Open again there.
    await t.run("firstRun.errorAction", { id: "chooseFolder" });
    expect(t.calls.filter((c) => c.startsWith("clone") || c === "chooseFolder")).toEqual(["clone:ada/notes", "chooseFolder", "clone:ada/notes"]);
    expect(ids()).toEqual(["chooseFolder", "newFolder", "back"]);
    // Use a new folder: the next free folder beside the default; it opens.
    await t.run("firstRun.errorAction", { id: "newFolder" });
    expect(t.calls).toContain("clone:ada/notes:new");
    expect(t.calls).toContain("openWorkspace");
    // Back: the error goes, and so do its actions.
    const u = await atNotes({ clone: () => ({ ok: false, problem: "folderTaken" }) });
    await u.run("firstRun.clone", { id: "ada/notes" });
    await u.run("firstRun.errorAction", { id: "back" });
    expect(u.vm()).toMatchObject({ hasError: false, errorActions: [] });
    taken = false;
  });
  // D-155: the folder is named after the notes' repository, and follows the name as it's typed.
  it("D-155: Saved on this computer in Documents/<the name typed>", async () => {
    const t = await atNotes({ repos: [] });
    expect(t.vm().folder).toBe("/home/ada/Documents/notes");
    await t.run("firstRun.setInstance", { value: "prabins-notes" });
    await settle();
    expect(t.vm().folder).toBe("/home/ada/Documents/prabins-notes");
    // A name GitHub can't use leaves the folder as it was.
    await t.run("firstRun.setInstance", { value: "no spaces" });
    await settle();
    expect(t.vm().folder).toBe("/home/ada/Documents/prabins-notes");
  });
  it("More options: names, the folder, publishing, and the browser passphrase, checked and sent once only when typed", async () => {
    const t = await atNotes({ repos: [] });
    await t.run("firstRun.toggleMore");
    expect(t.vm().more).toBe(true);
    await t.run("firstRun.setPrivate", { value: "notes" });
    await t.run("firstRun.create");
    expect(t.vm().error).toBe("Use two different names.");
    // D-142: the field at fault says why on itself, and only that one.
    expect(t.vm()).toMatchObject({ privateError: "Choose another name.", instanceError: "" });
    await t.run("firstRun.setPrivate", { value: "notes-private" });
    expect(t.vm().privateError).toBe("");
    await t.run("firstRun.setPassphrase", { value: "short" });
    await settle();
    // The meter follows the typing.
    expect(t.vm()).toMatchObject({ hasStrength: true, strength: 1, strengthText: "Weak" });
    await t.run("firstRun.create");
    expect(t.vm().error).toBe("Use four or more random words.");
    expect(t.vm()).toMatchObject({ passphraseInvalid: true, passphraseError: "", confirmInvalid: false });
    await t.run("firstRun.setPassphrase", { value: "quiet maple lantern orbit" });
    await t.run("firstRun.setConfirm", { value: "quiet maple lantern" });
    await t.run("firstRun.create");
    expect(t.vm()).toMatchObject({ error: "The passphrases don't match.", more: true, confirmError: "Doesn't match.", strength: 4 });
    expect(t.passphrases).toEqual([]);
    await t.run("firstRun.setConfirm", { value: "quiet maple lantern orbit" });
    await t.run("firstRun.setPublish", { value: "off" });
    await t.run("firstRun.chooseFolder");
    expect(t.vm().folderText).toBe("Saved on this computer in /home/ada/Elsewhere");
    await t.run("firstRun.create");
    expect(t.passphrases).toEqual(["quiet maple lantern orbit"]);
    expect(t.vm()).toMatchObject({ passphrase: "", confirm: "", started: true });
    expect(JSON.stringify(t.saved)).not.toContain("lantern");
  });
  it("Open another repository from GitHub lists every repository, Focus Notes workspaces marked, and clones the one chosen", async () => {
    const t = await atNotes();
    await t.run("firstRun.setMode", { value: "clone" });
    expect(t.vm()).toMatchObject({ panel: "clone", activeId: "ada/notes", reposSummary: "2 repositories" });
    expect((t.vm().repos as { description: string }[])[0]!.description).toBe("Focus Notes workspace");
    await t.run("firstRun.nextRepo");
    expect(t.vm().activeId).toBe("ada/recipes");
    await t.run("firstRun.setQuery", { value: "note" });
    expect(t.vm()).toMatchObject({ activeId: "ada/notes", reposSummary: "1 repository" });
    await t.run("firstRun.cloneActive");
    expect(t.calls).toEqual(expect.arrayContaining(["clone:ada/notes", "openWorkspace"]));
  });
  it("Open a folder on this computer says why a folder can't be used", async () => {
    const t = await atNotes();
    await t.run("firstRun.setMode", { value: "local" });
    await t.run("firstRun.openFolder");
    expect(t.vm().error).toMatch(/isn't a Focus Notes workspace/);
    expect(t.calls).not.toContain("openWorkspace");
  });
  it("Settings → Open another workspace from GitHub shows Your notes alone, opens the one chosen, and Esc goes back to writing", async () => {
    const t = shell({ state: { version: 1, firstRun: "done", lastNotePath: "/n/a.md" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    await settle();
    expect(t.app.store.state.account.login).toBe("ada");
    expect((t.app.viewModels.select("vm.settings", t.app.store.state) as { workspace: { canOpenOther: boolean } }).workspace.canOpenOther).toBe(true);
    await t.run("workspace.openFromGitHub");
    await settle();
    expect(t.vm()).toMatchObject({ open: true, step: "notes", panel: "found", showProgress: false, canCreate: false });
    await t.run("firstRun.back");
    expect(t.vm().open).toBe(false);
    expect(t.app.store.state.note.path).toBe("/n/a.md");
    await t.run("workspace.openFromGitHub");
    await settle();
    await t.run("firstRun.clone", { id: "ada/notes" });
    expect(t.calls).toContain("openWorkspace");
    // The window starts again in it, writing: not at Ready.
    expect(t.last()?.firstRun).toBe("done");
  });
});

describe("FRE-01: Ready", () => {
  it("applies the look at once, and Start writing finishes with a new note", async () => {
    const t = shell({ state: { version: 1, firstRun: "ready" } });
    await t.app.start();
    await settle();
    await t.run("firstRun.setTheme", { value: "dark" });
    expect(t.app.store.state.appearance).toMatchObject({ mode: "dark" });
    expect(t.vm()).toMatchObject({ theme: "dark" });
    await t.run("firstRun.back");
    expect(t.vm().step).toBe("ready");
    await t.run("firstRun.next");
    expect(t.vm().open).toBe(false);
    expect(t.last()?.firstRun).toBe("done");
    expect(t.app.store.state.note.path).toBe("/n/Untitled.md");
  });
  it("D-144: features focus mode with its toggle's keys, read from the keymap, in each platform's own keys", async () => {
    for (const [platform, keys, spoken] of [["windows", ["Ctrl", "Shift", "D"], "Control Shift D"], ["macos", ["⇧", "⌘", "D"], "Shift Command D"]] as const) {
      const t = shell({ state: { version: 1, firstRun: "ready" }, platform });
      await t.app.start();
      await settle();
      const chord = t.app.commands.describe("focus.toggle").shortcut;
      expect(chord).toBeTruthy();
      expect(t.vm()).toMatchObject({ focusHint: "Focus mode keeps only your current line bright.", focusKeys: keys, focusSpoken: spoken });
    }
  });
});

describe("UI-12: the desktop's account pill", () => {
  it("keeps the desktop username out of the corner while save and sign-out commands still work (D-132)", async () => {
    const t = shell({ state: { version: 1, firstRun: "done" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    await settle();
    const pill = () => t.app.viewModels.select("vm.account", t.app.store.state) as { visible: boolean; mode: string; text: string; label: string; sections: { label: string; items: { id: string }[] }[] };
    expect(pill()).toMatchObject({ visible: false, mode: "none", text: "", sections: [] });
    t.pushSync({ git: true, state: "problem", problem: "offline", waiting: 1 });
    expect(pill().text).toBe("");
    await t.run("sync.now");
    expect(t.calls).toContain("sync");
    // Sign out asks first (FRE-07): Git's sign-in goes too unless it's kept for the terminal.
    await t.run("account.signOut");
    expect(t.calls).not.toContain("signOut");
    expect(t.app.viewModels.select("vm.signOut", t.app.store.state)).toMatchObject({ open: true, git: "remove" });
    await t.run("account.signOutNow");
    expect(t.calls).toContain("signOut");
    expect(pill().visible).toBe(false);
  });
  it("vm.firstRun declares what it reads (PRF-11)", () => {
    const t = shell();
    expect(t.app.viewModels.get("vm.firstRun")!.reads).not.toBe("*");
  });
});

describe("PRF-13, D-149: no step waits in silence", () => {
  it("reading the account: nothing for 300 ms, then the profile card's skeleton and its words, then the elapsed time", async () => {
    const clock = manualClock();
    const slow = deferred();
    const t = shell({ clock, slowAccount: slow.promise });
    await t.app.start();
    void t.run("firstRun.next");
    await clock.advance(0);
    expect(t.vm()).toMatchObject({ connect: "checking", hasWait: false, accountSkeleton: false, waitText: "" });
    await clock.advance(299);
    expect(t.vm().hasWait).toBe(false);
    await clock.advance(1);
    expect(t.vm()).toMatchObject({ hasWait: true, accountSkeleton: true, waitText: "Connecting to your account…" });
    await clock.advance(2700);
    expect(t.vm().waitText).toBe("Connecting to your account… · 3 s");
    slow.resolve();
    await clock.advance(0);
    expect(t.vm()).toMatchObject({ connect: "choose", hasWait: false, accountSkeleton: false });
  });
  it("prefetches the notes as soon as Connect has the account, and counts them with three skeleton rows while it looks", async () => {
    const clock = manualClock();
    const slow = deferred();
    const t = shell({ clock, slowRepos: slow.promise, account: { gcm: true, gh: false, account: ADA } });
    await t.app.start();
    await t.run("firstRun.next");
    await clock.advance(0);
    // Still on Connect: the list is already being asked (prefetch on intent).
    expect(t.vm().step).toBe("connect");
    expect(t.calls.filter((c) => c === "repositories")).toHaveLength(1);
    t.pushProgress({ op: "findNotes", done: 3, total: 12 });
    void t.run("firstRun.useExisting");
    await clock.advance(0);
    expect(t.vm()).toMatchObject({ step: "notes", panel: "checking", hasWait: false });
    await clock.advance(300);
    expect(t.vm()).toMatchObject({ notesSkeleton: true, waitText: "Looking for your notes on GitHub… 3 of 12" });
    t.pushProgress({ op: "findNotes", done: 12, total: 12 });
    await clock.advance(3000);
    expect(t.vm().waitText).toBe("Looking for your notes on GitHub… 12 of 12 · 3 s");
    slow.resolve();
    await clock.advance(0);
    expect(t.calls.filter((c) => c === "repositories")).toHaveLength(1);
    expect(t.vm()).toMatchObject({ panel: "found", notesSkeleton: false, hasWait: false });
  });
  it("signing in says it's getting a code until the code shows, then counts the time it has waited for approval", async () => {
    const clock = manualClock();
    const slow = deferred();
    const t = shell({ clock, account: { gcm: false, gh: true }, signIn: async () => (await slow.promise, { gcm: false, gh: true, account: ADA }) });
    await t.app.start();
    await t.run("firstRun.next");
    await clock.advance(0);
    t.app.store.update((s) => ({ ...s, firstRun: { ...s.firstRun, signIn: { ...s.firstRun.signIn } } }));
    void t.run("firstRun.signIn");
    await clock.advance(0);
    expect(t.vm()).toMatchObject({ approvalText: "Waiting for you to approve on GitHub…" });
    await clock.advance(3000);
    expect(t.vm().approvalText).toBe("Waiting for you to approve on GitHub… · 3 s");
    slow.resolve();
    await clock.advance(0);
  });
  it("downloading names its part with its number, and Git's percentage", async () => {
    const clock = manualClock();
    const slow = deferred();
    const t = shell({ clock, clone: () => ({ ok: true, folder: "/x", privateNotes: true }) });
    await t.app.start();
    t.app.bridge.firstRun!.clone = async () => (await slow.promise, { ok: true, folder: "/x", privateNotes: true });
    await t.run("firstRun.next");
    await t.run("firstRun.useExisting").catch(() => {});
    await clock.advance(0);
    t.app.store.update((s) => ({ ...s, firstRun: { ...s.firstRun, step: "notes", workspace: { ...s.firstRun.workspace, repos: [{ owner: "ada", name: "notes", private: false, instance: true }], reposLoaded: true, mode: "found" } } }));
    void t.run("firstRun.clone", { id: "ada/notes" });
    await clock.advance(300);
    expect(t.vm().waitText).toBe("Downloading your notes · 1 of 3");
    t.pushProgress({ op: "clone", part: "download", percent: 45 });
    expect(t.vm().waitText).toBe("Downloading your notes · 45%");
    expect(t.vm()).toMatchObject({ hasOpenPercent: true, openPercent: 45, hasOpenParts: true });
    expect((t.vm().openParts as { label: string; state: string }[]).map((p) => `${p.label}:${p.state}`)).toEqual(["Download to this computer:running", "Get the private notes:pending", "Link them:pending"]);
    t.pushProgress({ op: "clone", part: "private" });
    expect(t.vm().waitText).toBe("Getting the private notes · 2 of 3");
    expect(t.vm().hasOpenPercent).toBe(false);
    expect((t.vm().openParts as { state: string }[]).map((p) => p.state)).toEqual(["done", "running", "pending"]);
    await clock.advance(3000);
    expect(t.vm().waitText).toBe("Getting the private notes · 2 of 3 · 3 s");
    slow.resolve();
    await clock.advance(0);
  });
  it("creating shows the part it's on with its number, and every part in plain words, without Show details", async () => {
    const t = shell();
    await t.app.start();
    t.app.store.update((s) => ({ ...s, setup: { available: true, report: report({ account: "done", instance: "running" }, true) } }));
    expect(t.vm()).toMatchObject({ partText: "Making your notes on GitHub · 2 of 9", hasPart: true });
    const parts = t.vm().parts as { label: string; state: string }[];
    expect(parts.map((p) => p.label)).toEqual(["Sign in to GitHub", "Make your notes on GitHub", "Make a place for private notes", "Let your website read them", "Download to this computer", "Link them", "Save the browser key", "Turn on your website", "Save to GitHub"]);
    t.app.store.update((s) => ({ ...s, setup: { available: true, report: { ...report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "running" }, true), steps: report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "running" }, true).steps.map((x) => (x.id === "clone" ? { ...x, percent: 45 } : x)) } } }));
    expect(t.vm()).toMatchObject({ partText: "Downloading to this computer · 5 of 9 · 45%", hasSetupPercent: true, setupPercent: 45 });
    expect(parts.map((p) => p.label).join(" ")).not.toMatch(/\b(repositor(y|ies)|Git|commits?|tokens?|credentials?|CLI|instances?|Pages)\b/);
  });
});

describe("PKG-13, D-228: Git that comes with Focus Notes (the Microsoft Store package)", () => {
  const BUNDLED_OK: GitCheck = { installed: true, version: "2.56.0", ok: true, gcm: true, gh: false, bundled: true };
  const BUNDLED_BROKEN: GitCheck = { installed: false, ok: false, gcm: false, gh: false, bundled: true };
  const install = /\binstall\b|download|winget|xcode-select|apt |helper app|git-scm|cli\.github/i;

  it("never opens a page that offers other software, and still opens every other page", () => {
    expect(INSTALL_PAGES).toEqual(["git", "gcm", "gh"]);
    for (const page of Object.keys(FIRST_RUN_PAGES)) {
      expect(pageAllowed(page, false), page).toBe(true);
      expect(pageAllowed(page, true), page).toBe(!INSTALL_PAGES.includes(page as never));
    }
    expect(pageAllowed("constructor", false)).toBe(false);
    expect(pageAllowed("https://example.com", false)).toBe(false);
  });

  it("with Git ready, nothing about Git shows and connecting goes on as usual", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: BUNDLED_OK, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "found", canInstall: false, installCommand: "", installText: "" });
  });

  it("when it doesn't start, says so, offers Check again as the only way forward, and no install route", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: BUNDLED_BROKEN });
    await t.app.start();
    await settle();
    const vm = t.vm();
    expect(vm).toMatchObject({
      connect: "git", isGit: true, canInstall: false, isGitOld: false, canContinue: false,
      title: en["firstRun.connect.title.broken"], gitCardTitle: en["firstRun.connect.bundledTitle"], gitCardDetail: en["firstRun.connect.repair"], gitCardIcon: "warning",
      gitText: en["firstRun.git.broken"], installCommand: "", installText: "", mark: "warning",
    });
    for (const k of ["title", "gitCardTitle", "gitCardDetail", "gitText"] as const) expect(vm[k], k).not.toMatch(install);
    // Check again looks again; Copy and every install page do nothing.
    await t.run("firstRun.checkGit");
    expect(t.calls.filter((c) => c === "git")).toHaveLength(2);
    expect(t.app.commands.describe("firstRun.copyCommand").enabled).toBe(false);
    await t.run("firstRun.copyCommand");
    for (const page of INSTALL_PAGES) await t.run("firstRun.openPage", { page });
    expect(t.calls.filter((c) => c.startsWith("copy:") || c.startsWith("page:"))).toEqual([]);
    // A page that isn't an install route still opens.
    await t.run("firstRun.openPage", { page: "token" });
    expect(t.calls).toContain("page:token");
  });

  it("an old Git is never the bundled one's problem: no version compare, no Update", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: { ...BUNDLED_BROKEN, installed: true, version: "2.20.1" } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ connect: "git", isGitOld: false, canInstall: false, title: en["firstRun.connect.title.broken"], gitText: en["firstRun.git.broken"] });
  });

  it("with the sign-in helper turned off, asks to turn it back on rather than install it", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: { ...BUNDLED_OK, gcm: false }, account: { gcm: false, gh: false } });
    await t.app.start();
    await settle();
    const vm = t.vm();
    expect(vm).toMatchObject({ connect: "choose", noHelper: true, canInstall: false, title: en["firstRun.connect.title.helperOff"], noHelperText: en["firstRun.connect.helperOff"], mark: "lock" });
    expect(vm.noHelperText).not.toMatch(install);
    await t.run("firstRun.openPage", { page: "gcm" });
    expect(t.calls).not.toContain("page:gcm");
  });

  it("a sign-in that has nowhere to keep the credential names the setting, not an install", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: BUNDLED_OK, account: { gcm: true, gh: false }, signIn: async () => ({ gcm: false, gh: false, problem: "noHelper" }) });
    await t.app.start();
    await settle();
    await t.run("firstRun.signIn");
    expect(t.vm().problem).toBe(en["firstRun.signIn.problem.helperOff"]);
    expect(t.vm().problem).not.toMatch(install);
  });

  it("without the bundle, the installer and portable keep their install routes", async () => {
    const t = shell({ state: { version: 1, firstRun: "connect" }, git: { installed: false, ok: false, gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ canInstall: true, gitCardTitle: en["firstRun.connect.helperTitle"], gitCardIcon: "download", installCommand: "winget install --id Git.Git -e" });
    await t.run("firstRun.openPage", { page: "git" });
    expect(t.calls).toContain("page:git");
  });
});
