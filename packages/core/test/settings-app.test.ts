/**
 * Settings (IA-VIEW-SETTINGS) and its Account and Workspace categories (FRE-07, PRV-02), in the app
 * against an in-memory shell: opening it from ⋯ and Mod+, (desktop only), the account as Git's
 * helper holds it, signing out with or without Git's sign-in (the recent note forgotten either
 * way), switching account and signing in again through the first run's Sign in card, running setup
 * again, and removing the workspace only once everything is on GitHub.
 */
import { describe, expect, it } from "vitest";
import {
  createApp, SETUP_STEPS,
  type AccountStatus, type AppStateFile, type FirstRunBridge, type PlatformBridge, type RemovalCheck, type SetupReport, type SyncReport,
} from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const ADA = { login: "ada", id: 583231, name: "Ada Lovelace" };
const GRACE = { login: "grace", id: 99, name: "Grace Hopper" };
const settle = () => new Promise((r) => setTimeout(r, 0));

function shell(opts: { state?: AppStateFile; account?: AccountStatus; removal?: RemovalCheck[]; desktop?: boolean } = {}) {
  const saved: AppStateFile[] = [];
  const calls: string[] = [];
  let account: AccountStatus = opts.account ?? { account: ADA, gcm: true, gh: false, via: "gcm" };
  let previous: AccountStatus | undefined;
  const removal = [...(opts.removal ?? [{ state: "ready", waiting: 0, folder: "/home/ada/Documents/Focus Notes", repositories: ["ada/notes", "ada/notes-private"] }])];
  const fr: FirstRunBridge = {
    git: async () => ({ installed: true, version: "2.45.1", ok: true, gcm: true, gh: false }),
    account: async () => (calls.push("account"), account),
    useExisting: async () => (calls.push("useExisting"), (account = { ...account, signedOut: false })),
    signIn: async () => (calls.push("signIn"), (account = { ...account, account: GRACE, signedOut: false })),
    cancelSignIn: async () => void calls.push("cancel"),
    onSignIn: () => () => {},
    useToken: async () => account,
    signOut: async (o) => {
      calls.push(`signOut:git=${o?.git !== false}`);
      return (account = o?.git === false ? { ...account, signedOut: true } : { gcm: true, gh: false });
    },
    // Like the shell: the credential leaves Git's helper, and comes back if no one signed in meanwhile.
    beginSwitch: async () => (calls.push("beginSwitch"), (previous = account), (account = { gcm: true, gh: false })),
    endSwitch: async () => (calls.push("endSwitch"), account.account ? account : (account = previous ?? account)),
    identity: async () => ({ name: "Ada", email: "a@b.c", source: "git" }),
    setIdentity: async () => true,
    repositories: async () => [],
    folder: async () => "/home/ada/Documents/Focus Notes",
    chooseFolder: async () => undefined,
    clone: async () => ({ ok: false }),
    openFolder: async () => undefined,
    openWorkspace: async () => ({ ok: true }),
    openPage: (p) => void calls.push(`page:${p}`),
  };
  let sync: SyncReport = { git: true, state: "idle", waiting: 0 };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => (calls.push(`read:${p}`), "# A\n"),
    writeNote: async (p) => void calls.push(`write:${p}`),
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => opts.state ?? { version: 1, firstRun: "done", lastNotePath: "/n/a.md" },
    saveAppState: async (s) => void saved.push(s),
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...(opts.desktop === false ? {} : {
      firstRun: fr,
      sync: {
        now: async () => (calls.push("sync"), (sync = { git: true, state: "idle", waiting: 0 })),
        status: async () => sync,
        onStatus: () => () => {},
      },
      setup: {
        status: async () => ({ running: false, steps: SETUP_STEPS.map((id) => ({ id, state: "pending" as const })) }),
        start: async () => ({ running: false, steps: [] }),
        retry: async () => ({ running: false, steps: [] }),
        reset: async (): Promise<SetupReport> => (calls.push("setupReset"), { running: false, steps: SETUP_STEPS.map((id) => ({ id, state: "pending" as const })) }),
        passphraseStrength: async () => ({ ok: true, bits: 80 }),
        onReport: () => () => {},
      },
      workspace: {
        info: async () => ({ folder: "/home/ada/Documents/Focus Notes" }),
        scan: async () => ({ folder: "/home/ada/Documents/Focus Notes", roots: [{ id: "local", path: "/n", readOnly: false }], entries: [] }),
        writeFormat: async () => {},
        renameNote: async () => {},
        removal: async () => (calls.push("removal"), removal.length > 1 ? removal.shift()! : removal[0]!),
        remove: async () => {
          calls.push("remove");
          const r = removal.length > 1 ? removal.shift()! : removal[0]!;
          return r.state === "ready" ? { ...r, state: "removed" as const } : r;
        },
      },
    }),
  };
  const app = createApp(bridge, en);
  const vm = (id = "vm.settings") => app.viewModels.select(id, app.store.state) as Record<string, any>;
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, vm, run, calls, saved, last: () => saved.at(-1), setAccount: (a: AccountStatus) => (account = a) };
}

describe("IA-VIEW-SETTINGS: opening Settings", () => {
  it("opens from the ⋯ menu's App group and with Mod+, on the desktop, at Account", async () => {
    const t = shell();
    await t.app.start();
    const more = t.app.viewModels.select("vm.toolbar", t.app.store.state) as { more: { id: string; items: { id: string; shortcut?: string; disabled?: boolean }[] }[] };
    const help = more.more.find((g) => g.items.some((i) => i.id === "settings.open"))!;
    expect(help.items.map((i) => i.id)).toEqual(["settings.open", "shortcuts.open", "help.open"]);
    expect(help.items[0]).toMatchObject({ shortcut: "Ctrl+,", label: "Settings…" });
    expect(help.items[0]!.disabled).toBeUndefined();
    expect(t.app.commands.match({ key: ",", code: "Comma", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, altGraph: false }, [])).toBe("settings.open");
    await t.run("settings.open");
    await settle();
    expect(t.vm()).toMatchObject({ open: true, section: "account", title: "Settings" });
    expect(t.vm().sections.map((s: { id: string }) => s.id)).toEqual(["account", "workspace", "appearance"]);
    await t.run("settings.setSection", { value: "workspace" });
    expect(t.vm().section).toBe("workspace");
    await t.run("settings.setOpen", { open: false });
    expect(t.vm().open).toBe(false);
  });
  it("is unavailable, and says why, in a shell without an account (the browser)", async () => {
    const t = shell({ desktop: false, state: { version: 1 } });
    await t.app.start();
    const more = t.app.viewModels.select("vm.toolbar", t.app.store.state) as { more: { items: { id: string; disabled?: boolean; reason?: string }[] }[] };
    // UI-07: ⋯ always holds Settings; where it can't work it's unavailable with its reason (D-100).
    expect(more.more.flatMap((g) => g.items).find((i) => i.id === "settings.open")).toMatchObject({ disabled: true, reason: "Settings manage your GitHub account, so they're in the desktop app" });
    expect(t.app.commands.describe("settings.open").enabled).toBe(false);
    await t.run("shortcuts.open");
    const sheet = t.app.viewModels.select("vm.shortcuts", t.app.store.state) as { groups: { rows: { id: string }[] }[] };
    expect(sheet.groups.flatMap((g) => g.rows.map((r) => r.id))).not.toContain("settings.open");
  });
  it("lists the setting in the cheat sheet under App", async () => {
    const t = shell();
    await t.app.start();
    await t.run("shortcuts.open");
    const sheet = t.app.viewModels.select("vm.shortcuts", t.app.store.state) as { groups: { id: string; rows: { id: string }[] }[] };
    expect(sheet.groups.find((g) => g.id === "app")!.rows.map((r) => r.id)).toContain("settings.open");
  });
  it("vm.settings declares what it reads (PRF-11)", () => {
    const t = shell();
    expect(t.app.viewModels.get("vm.settings")!.reads).not.toBe("*");
  });
});

describe("FRE-07: Settings → Account", () => {
  it("shows the account, which helper holds the sign-in, and that the terminal shares it", async () => {
    const t = shell();
    await t.app.start();
    await t.run("settings.open");
    await settle();
    expect(t.vm().account).toMatchObject({
      state: "signedIn", login: "@ada", name: "Ada Lovelace",
      via: "Signed in through Git Credential Manager. Git uses the same sign-in in your terminal.",
    });
    await t.run("account.openGitHub");
    expect(t.calls).toContain("page:authorizations");
  });
  it("sign out asks first, removes Git's sign-in by default, and forgets the recent note (PRV-02)", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    expect(t.app.store.state.account.login).toBe("ada");
    await t.run("settings.open");
    await t.run("account.signOut");
    expect(t.vm("vm.signOut")).toMatchObject({ open: true, git: "remove" });
    await t.run("account.signOutNow");
    expect(t.calls).toContain("signOut:git=true");
    expect(t.vm("vm.signOut").open).toBe(false);
    expect(t.app.store.state.account.login).toBe("");
    expect(t.last()).not.toHaveProperty("lastNotePath");
    expect(t.last()).toMatchObject({ firstRun: "done" });
    expect(t.vm().account).toMatchObject({ state: "signedOut" });
    expect(t.app.store.state.ui.toasts.at(-1)!.message).toBe("Signed out of GitHub on this computer, in the app and in the terminal.");
  });
  it("can keep Git's sign-in for the terminal: Focus Notes alone signs out, and Sign in offers it again", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("account.signOut");
    await t.run("account.setSignOutGit", { value: "keep" });
    await t.run("account.signOutNow");
    expect(t.calls).toContain("signOut:git=false");
    expect(t.app.store.state.account.login).toBe("");
    expect(t.last()).not.toHaveProperty("lastNotePath");
    expect(t.vm().account).toMatchObject({ state: "signedOut", gitLogin: "@ada" });
    expect(t.app.store.state.ui.toasts.at(-1)!.message).toBe("Signed out of Focus Notes. Git on this computer is still signed in as @ada.");
    // Sign in: the first run's Sign in card, alone, offering the account Git still has.
    await t.run("account.signIn");
    await settle();
    expect(t.vm().open).toBe(false);
    expect(t.vm("vm.firstRun")).toMatchObject({ open: true, step: "signIn", signIn: "found", login: "ada", showProgress: false });
    await t.run("firstRun.useExisting");
    await settle();
    expect(t.calls).toContain("useExisting");
    expect(t.vm("vm.firstRun").open).toBe(false);
    expect(t.app.store.state.account.login).toBe("ada");
    // The note held while the card showed is open again.
    expect(t.app.store.state.note).toMatchObject({ path: "/n/a.md", status: "ready" });
  });
  it("switch account signs in again through the same helper, and Esc keeps the old account", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("account.switch");
    await settle();
    expect(t.calls).toContain("beginSwitch");
    expect(t.vm("vm.firstRun")).toMatchObject({ open: true, step: "signIn", signIn: "choose" });
    // Esc: nothing changes; the shell puts the old sign-in back.
    await t.run("firstRun.back");
    await settle();
    expect(t.calls.filter((c) => c === "endSwitch")).toHaveLength(1);
    expect(t.vm("vm.firstRun").open).toBe(false);
    // Again, and through: Grace signs in, then continues.
    await t.run("account.switch");
    await settle();
    await t.run("firstRun.signIn");
    await settle();
    expect(t.vm("vm.firstRun")).toMatchObject({ signIn: "found", login: "grace" });
    await t.run("firstRun.useExisting");
    await settle();
    expect(t.calls.filter((c) => c === "endSwitch")).toHaveLength(2);
    expect(t.app.store.state.account.login).toBe("grace");
    expect(t.app.store.state.ui.toasts.at(-1)!.message).toBe("Signed in to GitHub as @grace.");
  });
  it("run setup again forgets setup's progress and walks the first run from Git; Esc there goes back to writing", async () => {
    const t = shell();
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("settings.setSection", { value: "workspace" });
    await t.run("setup.runAgain");
    await settle();
    expect(t.calls).toContain("setupReset");
    expect(t.vm().open).toBe(false);
    expect(t.vm("vm.firstRun")).toMatchObject({ open: true, step: "git", showProgress: true, progress: "Step 2 of 7" });
    expect(t.app.store.state.note.status).toBe("loading");
    await t.run("firstRun.back");
    await settle();
    expect(t.vm("vm.firstRun").open).toBe(false);
    expect(t.last()?.firstRun).toBe("done");
    expect(t.app.store.state.note).toMatchObject({ path: "/n/a.md", status: "ready" });
  });
});

describe("PRV-02, FRE-07: Settings → Workspace → Remove this workspace from this computer", () => {
  it("refuses while changes aren't on GitHub, offers to sync first, then removes once they are", async () => {
    const t = shell({ removal: [
      { state: "unpushed", waiting: 2, folder: "/home/ada/Documents/Focus Notes", repositories: ["ada/notes", "ada/notes-private"] },
      { state: "ready", waiting: 0, folder: "/home/ada/Documents/Focus Notes", repositories: ["ada/notes", "ada/notes-private"] },
    ] });
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("settings.setSection", { value: "workspace" });
    expect(t.vm().workspace).toMatchObject({ folder: "/home/ada/Documents/Focus Notes", canRemove: true });
    await t.run("workspace.remove");
    expect(t.vm("vm.removeWorkspace")).toMatchObject({ open: true, state: "unpushed", canRemove: false, canSync: true });
    expect(t.vm("vm.removeWorkspace").message).toBe("2 changes aren't on GitHub yet. Sync first, so nothing is lost.");
    expect(t.calls).not.toContain("remove");
    await t.run("workspace.removeSync");
    expect(t.calls).toContain("sync");
    expect(t.vm("vm.removeWorkspace")).toMatchObject({ state: "ready", canRemove: true });
    expect(t.vm("vm.removeWorkspace").message).toBe("Your notes stay on GitHub, in ada/notes and ada/notes-private. This deletes the folder /home/ada/Documents/Focus Notes from this computer, and what Focus Notes keeps about it here.");
    await t.run("workspace.removeConfirm");
    expect(t.calls).toContain("remove");
    // Before the shell removes it, the app forgets the recent note and starts again at Your workspace.
    expect(t.last()).toMatchObject({ firstRun: "workspace" });
    expect(t.last()).not.toHaveProperty("lastNotePath");
  });
  it("never removes a workspace that isn't on GitHub, and puts things back if the shell refuses", async () => {
    const t = shell({ removal: [
      { state: "ready", waiting: 0, folder: "/w", repositories: ["ada/notes"] },
      { state: "unpushed", waiting: 1, folder: "/w", repositories: ["ada/notes"] },
    ] });
    await t.app.start();
    await settle();
    await t.run("settings.open");
    await t.run("workspace.remove");
    expect(t.vm("vm.removeWorkspace").state).toBe("ready");
    // Something changed meanwhile: the shell checks again and refuses.
    await t.run("workspace.removeConfirm");
    expect(t.vm("vm.removeWorkspace")).toMatchObject({ open: true, state: "unpushed" });
    expect(t.last()).toMatchObject({ firstRun: "done", lastNotePath: "/n/a.md" });

    const local = shell({ removal: [{ state: "notGit", waiting: 0, folder: "/w", repositories: [] }] });
    await local.app.start();
    await local.run("workspace.remove");
    expect(local.vm("vm.removeWorkspace")).toMatchObject({ state: "notGit", canRemove: false, canSync: false });
    expect(local.vm("vm.removeWorkspace").message).toBe("This workspace isn't saved to GitHub, so removing it would delete your only copy of its notes. Focus Notes won't remove it.");

    const other = shell({ removal: [{ state: "notWorkspace", waiting: 0, folder: "/w", repositories: [] }] });
    await other.app.start();
    await other.run("workspace.remove");
    expect(other.vm("vm.removeWorkspace")).toMatchObject({ state: "notWorkspace", canRemove: false, canSync: false });
    expect(other.vm("vm.removeWorkspace").message).toBe("This folder isn't a Focus Notes workspace, so Focus Notes won't remove it.");
  });
});
