/**
 * M3 journeys for the desktop's first run (WP-3.2: FRE-01 to FRE-06, SEC-03, UI-12), keyboard only.
 * GitHub is the in-memory fake behind a local HTTP port, its repositories are local bare remotes,
 * and Git's sign-in helpers are fakes on PATH (a credential helper, Git Credential Manager, the
 * GitHub CLI), so nothing touches the network or a real account. Every program the app starts is
 * logged, and no token may appear in any of their arguments.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { card, existingInstance, heading, noTokenInArgs, opened, press, start, tabTo, world } from "./github-world.ts";

const PASSPHRASE = "quiet maple lantern orbit seven";

test.describe.configure({ mode: "serial" });

// M3 demo, step 1 (first run with a fake GitHub; a clean machine without Git is the owner's check).
test("FRE-01, FRE-04, FRE-05, FRE-08: a new install creates its workspace by keyboard alone, with the existing credential, and the account pill shows the login", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(card(page).getByText("Step 1 of 7")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "Git");
    await expect(card(page).getByText(/^Git \d+\.\d+\.\d+ is ready\.$/)).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Continue" })).toBeFocused();
    await press(page, "Enter");

    // FRE-04: the credential Git already has is offered; no device code, no sign-in helper started.
    await heading(page, "Sign in to GitHub");
    await expect(card(page).getByText("You're signed in to GitHub as @ada (Ada) on this computer.")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused();
    await press(page, "Enter");
    expect(w.fakes.argv()).not.toContain('"login"');

    // FRE-05: Git had no identity: filled in from GitHub with the private noreply address.
    await heading(page, "Your name on commits");
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("583231+ada@users.noreply.github.com");
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(page, "Enter");

    // FRE-08 through the setup engine: the vault passphrase, then the checklist.
    await heading(page, "Your workspace");
    await expect(page.getByRole("textbox", { name: "Instance repository (public)" })).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);
    await tabTo(page, page.getByLabel("Vault passphrase"));
    await page.keyboard.type(PASSPHRASE);
    await press(page, "Tab");
    await page.keyboard.type(PASSPHRASE);
    await press(page, "Enter");
    await expect(card(page).getByText("Your workspace is on this computer. Anything still running carries on in the background.")).toBeVisible({ timeout: 60_000 });
    await expect(card(page).getByText("Your site: https://ada.github.io/notes/")).toBeVisible({ timeout: 30_000 });
    await expect(card(page).getByRole("button", { name: "Continue" })).toBeEnabled();
    await tabTo(page, card(page).getByRole("button", { name: "Continue" }));
    await press(page, "Enter");

    // The window starts again in the new workspace (D-98).
    await heading(page, "Make it yours");
    await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Ready");
    await expect(page.getByRole("button", { name: "Start writing" })).toBeFocused();
    await press(page, "Enter");

    await expect(card(page)).toHaveCount(0);
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("# First private note\n\nWritten after the first run.");
    const priv = join(w.dirs.docs, "private", "notes");
    await expect.poll(() => readdirSync(priv).filter((f) => f.endsWith(".md")).length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(w.git(w.dirs.docs, "config", "--get", "push.recurseSubmodules")).toBe("check");
    expect(w.git(w.fakes.home, "config", "--global", "user.email")).toBe("583231+ada@users.noreply.github.com");
    expect(w.gh.repo("notes")?.pages?.build_type).toBe("workflow");
    expect(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).toContain("Focus Notes");

    // UI-12: the account pill shows the login with Sync now and Sign out.
    const pill = page.getByRole("button", { name: /Signed in to GitHub as @ada/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveText("@ada");
    await pill.click();
    await expect(page.getByRole("menuitem", { name: "Sync now" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign out of GitHub" })).toBeVisible();
    await press(page, "Escape");
    expect(await axeViolations(page)).toEqual([]);
    noTokenInArgs(w, l);
    expect(readFileSync(join(w.dirs.userData, "setup.json"), "utf8") + readFileSync(join(w.dirs.userData, "state.json"), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

// M3 demo, step 3: a second computer opens the existing workspace.
test("FRE-02, FRE-06: sign in with the GitHub CLI's code, then open the workspace from GitHub with its private notes", async () => {
  test.setTimeout(150_000);
  const w = await world({ gh: true, delayMs: 2500 });
  existingInstance(w);
  w.git(w.fakes.home, "config", "--global", "user.name", "Ada");
  w.git(w.fakes.home, "config", "--global", "user.email", "ada@example.com");
  const l = await start(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    await press(page, "Enter");
    // The CLI's one-time code, shown in the app.
    await expect(card(page).getByText("WDJB-MJHT")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy code and open GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect.poll(() => opened(l)).toContain("https://github.com/login/device");
    await expect(card(page).getByText("You're signed in to GitHub as @ada (Ada) on this computer.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused();
    await press(page, "Enter");

    await heading(page, "Your name on commits");
    await expect(card(page).getByText("This is what Git already uses on this computer.")).toBeVisible();
    await press(page, "Enter");

    await heading(page, "Your workspace");
    await tabTo(page, page.getByRole("radio", { name: "Create my workspace" }), true);
    await press(page, "ArrowRight");
    await expect(page.getByRole("combobox", { name: "Search your repositories" })).toBeFocused();
    await expect(card(page).getByText("3 repositories")).toBeVisible();
    await page.keyboard.type("notes");
    await expect(page.getByRole("option", { name: /ada\/notes Focus Notes workspace/ })).toBeVisible();
    await press(page, "Enter");

    await heading(page, "Make it yours");
    await press(page, "Enter");
    await heading(page, "Ready");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    expect(readFileSync(join(w.dirs.docs, "private", "notes", "secret.md"), "utf8")).toContain("Only mine.");
    expect(w.git(join(w.dirs.docs, "private"), "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(w.fakes.argv()).toContain('["gh","auth","setup-git","--hostname","github.com"]');
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-06: a pasted token, then a folder already on this computer, opened as the workspace", async () => {
  test.setTimeout(120_000);
  const w = await world({});
  const { notes } = existingInstance(w);
  const clone = join(w.root, "my clone");
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, clone);
  w.git(w.fakes.home, "config", "--global", "user.name", "Ada");
  w.git(w.fakes.home, "config", "--global", "user.email", "ada@example.com");
  const l = await start(w);
  const { page } = l;
  try {
    await l.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, clone);
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(card(page).getByText(/Git has no sign-in tool for GitHub here/)).toBeVisible();
    await tabTo(page, page.getByRole("button", { name: "Use a token instead" }));
    await press(page, "Enter");
    await tabTo(page, page.getByRole("button", { name: "Create a token on GitHub" }), true);
    await press(page, "Enter");
    await expect.poll(async () => (await opened(l)).join()).toContain("https://github.com/settings/personal-access-tokens/new?name=Focus+Notes");
    await tabTo(page, page.getByLabel("Token"));
    await page.keyboard.type("not a token");
    await press(page, "Enter");
    await expect(card(page).getByText("That doesn't look like a GitHub token. Paste the whole token.")).toBeVisible();
    await page.keyboard.type(w.gh.token);
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
    // FRE-03: Git's helper has it now, for the terminal too; the app kept no copy.
    expect(JSON.parse(w.fakes.stored())["github.com"].password).toBe(w.gh.token);
    await press(page, "Enter");
    await heading(page, "Your name on commits");
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Your workspace");
    await tabTo(page, page.getByRole("radio", { name: "Create my workspace" }), true);
    await press(page, "ArrowRight");
    // The search field takes focus in Open from GitHub; back to the choice, and on to Open a folder.
    await tabTo(page, page.getByRole("radio", { name: "Open from GitHub" }), true);
    await press(page, "ArrowRight");
    await expect(page.getByRole("button", { name: "Choose a folder…" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Make it yours");
    await press(page, "Enter");
    await press(page, "Enter");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible({ timeout: 15_000 });
    expect(readFileSync(join(w.dirs.userData, "workspace.json"), "utf8")).toContain("my clone");
    noTokenInArgs(w, l);
    for (const f of readdirSync(w.dirs.userData)) if (!f.endsWith(".json")) continue; else expect(readFileSync(join(w.dirs.userData, f), "utf8")).not.toContain(w.gh.token);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("FRE-02, FRE-01: declined and offline recover without restarting, and quitting mid-way resumes at the same step", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  w.fakes.outcomes(["declined"]);
  let l = await start(w);
  try {
    const { page } = l;
    await heading(page, "A quiet place to write");
    await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
    await press(page, "Enter");
    await heading(page, "Git");
    await expect(card(page).getByText(/is ready\./)).toBeVisible();
    await press(page, "Enter");
    await heading(page, "Sign in to GitHub");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    await press(page, "Enter");
    await expect(card(page).getByText("Sign-in didn't finish. Try again when you're ready.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeFocused();
    // Offline: GitHub can't be reached to check the sign-in; Retry once it's back.
    w.gh.offline = true;
    await press(page, "Enter");
    await expect(card(page).getByText("Can't reach GitHub. Check your connection or proxy settings, then retry.")).toBeVisible({ timeout: 15_000 });
    w.gh.offline = false;
    await tabTo(page, page.getByRole("button", { name: "Try again" }));
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as @ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Your name on commits");
  } finally {
    await quit(l);
  }
  // Quit mid-way: the next start resumes at the same step.
  l = await start(w);
  try {
    await heading(l.page, "Your name on commits");
    await expect(card(l.page).getByText("Step 4 of 7")).toBeVisible();
    await expect(l.page.getByRole("textbox", { name: "Email" })).toHaveValue("583231+ada@users.noreply.github.com");
    // Esc goes back.
    await expect(l.page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await press(l.page, "Escape");
    await heading(l.page, "Sign in to GitHub");
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("UI-12: once set up, the next start shows the writing canvas and the account pill, and Sign out signs Git out", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  const l = await start(w, false);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const pill = page.getByRole("button", { name: /Signed in to GitHub as @ada/ });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();
    await page.getByRole("menuitem", { name: "Sign out of GitHub" }).click();
    // It asks first (FRE-07, WP-3.6); Git's sign-in goes too by default.
    await page.getByRole("dialog", { name: "Sign out of GitHub?" }).getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Signed out of GitHub on this computer, in the app and in the terminal.")).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveCount(0);
    expect(w.fakes.stored()).toBe("{}");
    expect(existsSync(join(w.dirs.userData, "workspace.json"))).toBe(false);
    noTokenInArgs(w, l);
  } finally {
    await quit(l);
    w.server.close();
  }
});
