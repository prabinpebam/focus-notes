/**
 * The desktop's first run (FRE-01 to FRE-06): the step machine and its pure rules, then the steps
 * in the app against an in-memory shell. Resuming after quitting, Git found or missing, an existing
 * sign-in offered (FRE-04), declined, expired, and offline sign-ins that recover (FRE-02), a token
 * that's sent once and never kept (FRE-03, SEC-03), the identity filled in from GitHub with the
 * private noreply address (FRE-05), Create my workspace through the setup (FRE-06), and the
 * desktop's account pill (UI-12).
 */
import { describe, expect, it } from "vitest";
import {
  canContinue, createApp, deviceCode, FIRST_RUN_STEPS, gitIsNewEnough, identityProblem, looksLikeToken, nextStep, noreplyEmail, parseGitVersion, prevStep,
  signInProblem, suggestIdentity, SETUP_STEPS, TOKEN_PAGE,
  type AccountStatus, type AppStateFile, type FirstRunBridge, type GitCheck, type PlatformBridge, type SetupReport, type SignInProgress, type SyncReport,
} from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const ADA = { login: "ada", id: 583231, name: "Ada Lovelace" };
const TOKEN = "github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz";

describe("FRE-01: the step machine", () => {
  it("has seven steps in order, and back never returns to Workspace once the workspace is open", () => {
    expect(FIRST_RUN_STEPS).toEqual(["welcome", "git", "signIn", "identity", "workspace", "personalize", "ready"]);
    expect(nextStep("welcome")).toBe("git");
    expect(nextStep("ready")).toBe("done");
    expect(prevStep("git")).toBe("welcome");
    expect(prevStep("welcome")).toBe("welcome");
    expect(prevStep("personalize")).toBe("personalize");
    expect(prevStep("ready")).toBe("personalize");
  });
  it("continues only when the step's condition holds", () => {
    expect(canContinue("welcome", {})).toBe(true);
    expect(canContinue("git", { git: { installed: true, version: "2.30.1", ok: false, gcm: false, gh: false } })).toBe(false);
    expect(canContinue("git", { git: { installed: true, version: "2.45.1", ok: true, gcm: true, gh: false } })).toBe(true);
    expect(canContinue("signIn", { account: { gcm: true, gh: false } })).toBe(false);
    expect(canContinue("signIn", { account: { account: ADA, gcm: true, gh: false } })).toBe(true);
    expect(canContinue("identity", { identity: { name: "Ada", email: "nope" } })).toBe(false);
    expect(canContinue("identity", { identity: { name: "Ada", email: "ada@example.com" } })).toBe(true);
    expect(canContinue("workspace", { workspaceReady: false })).toBe(false);
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
  it("keeps Git's own, or fills it in from GitHub with the private noreply address", () => {
    expect(noreplyEmail(ADA)).toBe("583231+ada@users.noreply.github.com");
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

function shell(opts: { state?: AppStateFile; git?: GitCheck; account?: AccountStatus; signIn?: () => Promise<AccountStatus> } = {}) {
  const saved: AppStateFile[] = [];
  const calls: string[] = [];
  const tokens: string[] = [];
  const passphrases: (string | undefined)[] = [];
  let progress: ((p: SignInProgress) => void) | undefined;
  let syncListener: ((r: SyncReport) => void) | undefined;
  let account: AccountStatus = opts.account ?? { gcm: true, gh: false };
  const fr: FirstRunBridge = {
    git: async () => (calls.push("git"), opts.git ?? GIT_OK),
    account: async () => (calls.push("account"), account),
    useExisting: async () => (calls.push("useExisting"), (account = { ...account, account: account.cliAccount! })),
    signIn: async (device) => {
      calls.push(`signIn:${device}`);
      progress?.({ phase: "code", code: "WDJB-MJHT", helper: "gh" });
      return opts.signIn ? opts.signIn() : (account = { ...account, account: ADA });
    },
    cancelSignIn: async () => void calls.push("cancel"),
    onSignIn: (l) => ((progress = l), () => {}),
    useToken: async (t) => (tokens.push(t), (account = { ...account, account: ADA })),
    signOut: async () => (calls.push("signOut"), (account = { gcm: true, gh: false })),
    identity: async () => suggestIdentity({}, account.account),
    setIdentity: async (i, scope) => (calls.push(`identity:${i.name}:${i.email}:${scope}`), true),
    repositories: async () => [{ owner: "ada", name: "notes", private: false, instance: true }, { owner: "ada", name: "recipes", private: true, instance: false }],
    folder: async () => "/home/ada/Documents/Focus Notes",
    chooseFolder: async () => "/home/ada/Elsewhere",
    clone: async (owner, name) => (calls.push(`clone:${owner}/${name}`), { ok: true, folder: "/x", privateNotes: false }),
    openFolder: async () => (calls.push("openFolder"), { ok: false, problem: "notWorkspace" }),
    openWorkspace: async () => (calls.push("openWorkspace"), { ok: true }),
    openPage: (p) => void calls.push(`page:${p}`),
  };
  let setupListener: ((r: SetupReport) => void) | undefined;
  const bridge: PlatformBridge = {
    platform: "windows",
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
  const app = createApp(bridge, en);
  const vm = () => app.viewModels.select("vm.firstRun", app.store.state) as Record<string, unknown>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, vm, run, saved, calls, tokens, passphrases, last: () => saved.at(-1), pushSetup: (r: SetupReport) => setupListener!(r), pushSync: (r: SyncReport) => syncListener!(r) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("FRE-01: the first run in the app", () => {
  it("starts at Welcome on a new install, with no note opened behind it", async () => {
    const t = shell();
    await t.app.start();
    expect(t.vm()).toMatchObject({ open: true, step: "welcome", title: "A quiet place to write", progress: "Step 1 of 7" });
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
  it("keeps the step, so quitting resumes there, and finds out what the step needs again", async () => {
    const t = shell();
    await t.app.start();
    await t.run("firstRun.next");
    expect(t.vm()).toMatchObject({ step: "git", gitState: "ok", gitText: "Git 2.45.1 is ready.", canContinue: true });
    expect(t.last()?.firstRun).toBe("git");
    await t.run("firstRun.next");
    expect(t.last()?.firstRun).toBe("signIn");
    // Quit and start again: the same step, checked again.
    const again = shell({ state: { version: 1, firstRun: "signIn" } });
    await again.app.start();
    await settle();
    expect(again.vm()).toMatchObject({ open: true, step: "signIn", progress: "Step 3 of 7" });
    expect(again.calls).toContain("account");
    // Esc goes back.
    await again.run("firstRun.back");
    expect(again.vm().step).toBe("git");
  });
  it("Git missing or too old: the install path for the platform and Check again; Continue waits for it", async () => {
    const t = shell({ state: { version: 1, firstRun: "git" }, git: { installed: false, ok: false, gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ gitState: "missing", canContinue: false, installCommand: "winget install --id Git.Git -e" });
    await t.run("firstRun.next");
    expect(t.vm().step).toBe("git");
    const old = shell({ state: { version: 1, firstRun: "git" }, git: { installed: true, version: "2.25.1", ok: false, gcm: false, gh: false } });
    await old.app.start();
    await settle();
    expect(old.vm()).toMatchObject({ gitState: "old", gitText: "Git 2.25.1 is too old. Focus Notes needs Git 2.31 or newer." });
  });
});

describe("FRE-02, FRE-04: signing in", () => {
  it("an existing working credential is offered as Continue as @login, with no device code", async () => {
    const t = shell({ state: { version: 1, firstRun: "signIn" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ signIn: "found", login: "ada", accountName: "Ada Lovelace", canContinue: true });
    await t.run("firstRun.useExisting");
    expect(t.vm().step).toBe("identity");
    expect(t.calls.some((c) => c.startsWith("signIn"))).toBe(false);
  });
  it("a GitHub CLI session is offered too, and Git starts using it", async () => {
    const t = shell({ state: { version: 1, firstRun: "signIn" }, account: { cliAccount: ADA, gcm: false, gh: true } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ signIn: "cli", login: "ada", canContinue: false });
    await t.run("firstRun.useExisting");
    expect(t.calls).toContain("useExisting");
    expect(t.vm().step).toBe("identity");
  });
  it("a device code shows in the app, Copy code and open GitHub copies it, and the sign-in ends with the login", async () => {
    let finish!: (a: AccountStatus) => void;
    const t = shell({ state: { version: 1, firstRun: "signIn" }, account: { gcm: false, gh: true }, signIn: () => new Promise((r) => (finish = r)) });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ signIn: "choose", canHelper: true, helperName: "the GitHub CLI" });
    const going = t.run("firstRun.signInDevice");
    await settle();
    expect(t.vm()).toMatchObject({ signIn: "code", code: "WDJB-MJHT" });
    await t.run("firstRun.copyCode");
    expect(t.calls).toEqual(expect.arrayContaining(["signIn:true", "copy:WDJB-MJHT", "page:device"]));
    finish({ account: ADA, gcm: false, gh: true });
    await going;
    expect(t.vm()).toMatchObject({ signIn: "found", login: "ada", canContinue: true });
  });
  it("declined, expired, and offline say so, and Try again works without restarting", async () => {
    for (const problem of ["declined", "expired", "offline"] as const) {
      let n = 0;
      const t = shell({ state: { version: 1, firstRun: "signIn" }, signIn: async () => (n++ === 0 ? { gcm: true, gh: false, problem } : { account: ADA, gcm: true, gh: false }) });
      await t.app.start();
      await settle();
      await t.run("firstRun.signIn");
      expect(t.vm()).toMatchObject({ signIn: "choose", hasProblem: true, offline: problem === "offline" });
      expect(t.vm().problem).toBe(en[`firstRun.signIn.problem.${problem}` as keyof typeof en]);
      await t.run("firstRun.signIn");
      expect(t.vm()).toMatchObject({ signIn: "found", hasProblem: false });
    }
  });
  it("Cancel stops a sign-in that's waiting, and Esc does too", async () => {
    const t = shell({ state: { version: 1, firstRun: "signIn" }, signIn: () => new Promise(() => {}) });
    await t.app.start();
    await settle();
    void t.run("firstRun.signIn");
    await settle();
    expect(t.vm().signIn).toBe("code");
    await t.run("firstRun.back");
    expect(t.calls).toContain("cancel");
    expect(t.vm()).toMatchObject({ step: "signIn", signIn: "choose" });
  });
  it("FRE-03, SEC-03: a pasted token is sent to the shell once and never kept in the app's state or saved", async () => {
    const t = shell({ state: { version: 1, firstRun: "signIn" }, account: { gcm: false, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ signIn: "choose", noHelper: true });
    await t.run("firstRun.useToken");
    expect(t.vm().signIn).toBe("token");
    await t.run("firstRun.openPage", { page: "token" });
    expect(t.calls).toContain("page:token");
    await t.run("firstRun.setToken", { value: "not a token" });
    await t.run("firstRun.submitToken");
    expect(t.vm()).toMatchObject({ tokenError: true, token: "" });
    expect(t.tokens).toEqual([]);
    await t.run("firstRun.setToken", { value: ` ${TOKEN} ` });
    await t.run("firstRun.submitToken");
    expect(t.tokens).toEqual([TOKEN]);
    expect(t.vm()).toMatchObject({ signIn: "found", login: "ada", token: "" });
    expect(JSON.stringify(t.app.store.state) + JSON.stringify(t.saved)).not.toContain(TOKEN);
  });
});

describe("FRE-05: the identity step", () => {
  it("fills in the name and the private noreply address from GitHub, and applies them where chosen", async () => {
    const t = shell({ state: { version: 1, firstRun: "identity" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    expect(t.vm()).toMatchObject({ name: "Ada Lovelace", email: "583231+ada@users.noreply.github.com", scope: "global" });
    expect(t.vm().identityNote).toMatch(/private noreply address/);
    await t.run("firstRun.setEmail", { value: "" });
    await t.run("firstRun.next");
    expect(t.vm()).toMatchObject({ step: "identity", emailInvalid: true });
    await t.run("firstRun.setEmail", { value: "583231+ada@users.noreply.github.com" });
    await t.run("firstRun.setScope", { value: "workspace" });
    await t.run("firstRun.next");
    expect(t.calls).toContain("identity:Ada Lovelace:583231+ada@users.noreply.github.com:workspace");
    expect(t.vm().step).toBe("workspace");
  });
});

describe("FRE-06: the workspace step", () => {
  const atWorkspace = async () => {
    const t = shell({ state: { version: 1, firstRun: "workspace" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    return t;
  };
  it("Create my workspace checks the names and the passphrase, sends the passphrase once, and opens the workspace once it's on this computer", async () => {
    const t = await atWorkspace();
    expect(t.vm()).toMatchObject({ mode: "create", instance: "notes", private: "notes-private", folder: "/home/ada/Documents/Focus Notes", made: false, canContinue: false });
    await t.run("firstRun.setPrivate", { value: "notes" });
    await t.run("firstRun.create");
    expect(t.vm().error).toMatch(/two different repository names/);
    await t.run("firstRun.setPrivate", { value: "notes-private" });
    await t.run("firstRun.setPassphrase", { value: "short" });
    await t.run("firstRun.create");
    expect(t.vm().error).toMatch(/too easy to guess/);
    await t.run("firstRun.setPassphrase", { value: "quiet maple lantern orbit" });
    await t.run("firstRun.setConfirm", { value: "quiet maple lantern" });
    await t.run("firstRun.create");
    expect(t.vm().error).toBe("The passphrases don't match.");
    expect(t.passphrases).toEqual([]);
    await t.run("firstRun.setConfirm", { value: "quiet maple lantern orbit" });
    await t.run("firstRun.create");
    expect(t.passphrases).toEqual(["quiet maple lantern orbit"]);
    expect(t.vm()).toMatchObject({ passphrase: "", confirm: "", started: true, made: false });
    expect(JSON.stringify(t.saved)).not.toContain("lantern");
    // Downloaded and linked: writing can start while Pages and the push carry on.
    t.pushSetup(report({ account: "done", instance: "done", private: "done", deployKey: "done", clone: "done", link: "done", vault: "done", pages: "running" }));
    expect(t.vm()).toMatchObject({ made: true, canContinue: true });
    await t.run("firstRun.next");
    expect(t.calls).toContain("openWorkspace");
    expect(t.last()?.firstRun).toBe("personalize");
  });
  it("Skip the passphrase for now creates the workspace without a vault", async () => {
    const t = await atWorkspace();
    await t.run("firstRun.createWithoutVault");
    expect(t.passphrases).toEqual([undefined]);
  });
  it("Open from GitHub lists the account's repositories, Focus Notes workspaces marked, and clones the one chosen", async () => {
    const t = await atWorkspace();
    await t.run("firstRun.setMode", { value: "clone" });
    expect(t.vm()).toMatchObject({ activeId: "ada/notes", reposSummary: "2 repositories" });
    expect((t.vm().repos as { description: string }[])[0]!.description).toBe("Focus Notes workspace");
    await t.run("firstRun.nextRepo");
    expect(t.vm().activeId).toBe("ada/recipes");
    await t.run("firstRun.setQuery", { value: "note" });
    expect(t.vm()).toMatchObject({ activeId: "ada/notes", reposSummary: "1 repository" });
    await t.run("firstRun.cloneActive");
    expect(t.calls).toEqual(expect.arrayContaining(["clone:ada/notes", "openWorkspace"]));
  });
  it("Open a folder says why a folder can't be used", async () => {
    const t = await atWorkspace();
    await t.run("firstRun.setMode", { value: "local" });
    await t.run("firstRun.openFolder");
    expect(t.vm().error).toMatch(/isn't a Focus Notes workspace/);
    expect(t.calls).not.toContain("openWorkspace");
  });
});

describe("FRE-01: Make it yours and Ready", () => {
  it("applies the theme, font, and focus mode at once, and Start writing finishes with a new note", async () => {
    const t = shell({ state: { version: 1, firstRun: "personalize" } });
    await t.app.start();
    await settle();
    await t.run("firstRun.setTheme", { value: "dark" });
    await t.run("firstRun.setFont", { value: "serif" });
    await t.run("firstRun.setFocus", { value: "off" });
    expect(t.app.store.state.appearance).toMatchObject({ mode: "dark", contentFont: "serif" });
    expect(t.vm()).toMatchObject({ theme: "dark", font: "serif", focusMode: "off" });
    await t.run("firstRun.back");
    expect(t.vm().step).toBe("personalize");
    await t.run("firstRun.next");
    expect(t.vm()).toMatchObject({ step: "ready", searchHint: "Press Ctrl+/ to search or act." });
    await t.run("firstRun.next");
    expect(t.vm().open).toBe(false);
    expect(t.last()?.firstRun).toBe("done");
    expect(t.app.store.state.note.path).toBe("/n/Untitled.md");
  });
});

describe("UI-12: the desktop's account pill", () => {
  it("shows the GitHub login with the sync status, Sync now, and Sign out", async () => {
    const t = shell({ state: { version: 1, firstRun: "done" }, account: { account: ADA, gcm: true, gh: false } });
    await t.app.start();
    await settle();
    await settle();
    const pill = () => t.app.viewModels.select("vm.account", t.app.store.state) as { visible: boolean; mode: string; text: string; label: string; sections: { label: string; items: { id: string }[] }[] };
    expect(pill()).toMatchObject({ visible: true, mode: "owner", text: "@ada", label: "Signed in to GitHub as @ada. Saved to GitHub" });
    expect(pill().sections[0]!.items.map((i) => i.id)).toEqual(["sync.now", "account.signOut"]);
    t.pushSync({ git: true, state: "problem", problem: "offline", waiting: 1 });
    expect(pill().text).toBe("@ada · Not synced");
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
