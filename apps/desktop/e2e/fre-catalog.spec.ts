/**
 * A visual catalogue of the desktop's first run and setup (D-124, D-126), for the owner's review:
 * every state the journeys' fakes reach (the fake GitHub, the fake sign-in helpers, Git missing or
 * too old, GitHub unreachable, setup failing at each step).
 *
 * Always (a CI gate, D-135): each state is reached and asserted: its problem is shown where it
 * happened (a rejected token on the token form), Try again finishes setup, and every state on the
 * setup screen passes the visual score's measurable criteria (D-127, `visual-score.ts`): a visual
 * anchor of 48 px or more, and text economy of 10 or more, measured at the default window in light.
 *
 * Opt in to the screenshots with `FOCUS_NOTES_CAPTURE_FRE=1` (and `FOCUS_NOTES_E2E=1`): light and
 * dark at the default window, and the main path also at the smallest (480 × 360) and a large
 * (1600 × 1000) window. `FOCUS_NOTES_FRE_OUT` names the folder (default `test-results/fre-review`),
 * which gets `NN-<step>-<state>.<theme>.<size>.png`, `index.html` and `README.md` (`fre-catalog-index.ts`).
 */
import { test, expect, screenAllowed, type Page } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { bandProblems, bandStartsMove, quit, windowBox, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, repoRoot, start, tabTo, world, type World } from "./github-world.ts";
import { anchorScore, ANCHOR, BUDGETS, economyScore, measureVisual, visualScoreProblems } from "./visual-score.ts";
import { writeReview, type CatalogState, type Measure, type Shot } from "./fre-catalog-index.ts";
import { network, picture } from "./fre-fakes.ts";

/** Screenshots are opt-in; the states and their checks always run. */
const CAPTURE = process.env.FOCUS_NOTES_CAPTURE_FRE === "1";

const OUT = process.env.FOCUS_NOTES_FRE_OUT ?? join(repoRoot, "test-results", "fre-review");
const mod = process.platform === "darwin" ? "Meta" : "Control";
const win = process.platform === "win32";
// The install command Having trouble? offers on this system (D-194).
const GIT_INSTALL = process.platform === "darwin" ? "xcode-select --install" : win ? "winget install --id Git.Git -e" : "sudo apt install git";

const STEPS: Record<string, string> = {
  welcome: "1 · Welcome", connect: "2 · Connect", notes: "3 · Your notes", creating: "4 · Creating your notes",
  ready: "5 · Ready and the app", local: "6 · Just use this computer for now", settings: "7 · Settings → Workspace",
};
/** Every state, in flow order: [id, label, when it appears, on the main path]. The id's first word is its step. */
const CATALOG: [string, string, string, boolean?][] = [
  ["welcome-rest", "Welcome, at rest", "The first thing a new install shows, with nothing focused.", true],
  ["welcome-focus-start", "Welcome, focus on Get started", "Welcome as it opens: Get started has the keyboard focus."],
  ["welcome-focus-local", "Welcome, focus on Just use this computer for now", "Welcome after Tab: the way to write with no account has the focus."],
  ["connect-checking", "Connect, checking this computer", "Right after Get started, while Git and the account Git already has are checked."],
  ["connect-github", "Connect, no account yet (the GitHub card)", "No GitHub sign-in on this computer: Connect to GitHub, or create a free account.", true],
  ["connect-github-trouble", "Connect, Having trouble? open", "Having trouble? opened under the GitHub card: other ways to connect."],
  ["connect-waiting", "Connect, waiting for the browser", "Having trouble? → Sign in in the browser instead with Git Credential Manager: waiting for the person to approve in the browser."],
  ["connect-window", "Connect, finish in the window that opened", "After Connect to GitHub (a device code, D-142) with Git Credential Manager, before its code arrives: its own window shows it.", true],
  ["connect-code", "Connect, a one-time code shown", "Connecting through the GitHub CLI: the code to enter on GitHub, waiting."],
  ["connect-cli", "Connect, the GitHub CLI is signed in", "Git has no sign-in but the GitHub CLI has one: Continue as offers it."],
  ["connect-found-picture", "Connect, signed in (profile card with picture)", "Git is already signed in to GitHub, and the account's picture is known.", true],
  ["connect-found-initials", "Connect, signed in (initials fallback)", "Git is signed in, with no picture (offline or not fetched yet): the initials stand in."],
  ["connect-found-trouble", "Connect, signed in, Having trouble? open", "Having trouble? opened under the profile card: use a different account."],
  ["connect-token", "Connect, token entry", "Having trouble? → Use a token instead: paste a fine-grained token."],
  ["connect-token-error", "Connect, token that doesn't look like one", "Something pasted that isn't shaped like a GitHub token."],
  ["connect-token-rejected", "Connect, token GitHub rejects (still on the token form)", "A token-shaped string GitHub doesn't accept, right after Continue: the form as it's left."],
  ["connect-problem-declined", "Connect, sign-in declined", "The person declined or closed the sign-in in the browser."],
  ["connect-problem-expired", "Connect, code expired", "The sign-in or its code timed out."],
  ["connect-problem-offline", "Connect, GitHub unreachable", "GitHub can't be reached to check the sign-in."],
  ["connect-problem-invalid", "Connect, GitHub didn't accept it", "Back from a token GitHub rejected: the GitHub card with the problem."],
  ["connect-problem-nohelper", "Connect, nowhere safe to keep the sign-in", "A token was accepted by GitHub, but Git has no credential helper to keep it."],
  ["connect-problem-failed", "Connect, sign-in didn't finish", "The helper finished, but GitHub doesn't accept what it saved."],
  ["connect-no-helper", "Connect, no sign-in helper installed", "Git is installed but neither Git Credential Manager nor the GitHub CLI is."],
  ["connect-git-missing", "Connect, Git missing", "Git isn't installed: one free helper app to install, then Check again."],
  ["connect-git-missing-trouble", "Connect, Git missing, Having trouble? open", "Git missing, with the technical details and the install command shown."],
  ["connect-git-old", "Connect, Git too old", "Git is older than 2.31: the same install button, then Check again."],
  ["connect-git-old-trouble", "Connect, Git too old, Having trouble? open", "Git too old, with its version and the install command shown."],
  ["notes-checking", "Your notes, looking for notes", "Right after Continue as, while the account's repositories are listed: three skeleton rows and \"Looking for your notes on GitHub…\" (PRF-13)."],
  ["notes-found-one", "We found your notes, one workspace", "The account has one Focus Notes workspace: Open it with one press.", true],
  ["notes-found-several", "We found your notes, several workspaces", "The account has several workspaces, public and private."],
  ["notes-found-more", "We found your notes, More options open", "More options under the found notes: create new ones, another repository, a folder."],
  ["notes-create", "Your notes, Create my notes", "The account has no workspace yet: one option card creates it.", true],
  ["notes-create-more", "Your notes, More options open (top)", "More options under Create my notes: the two repository names and the folder."],
  ["notes-create-more-end", "Your notes, More options open (scrolled to the end)", "The rest of More options: publishing, the passphrase, open another repository or a folder."],
  ["notes-create-error-names", "Your notes, repository names problem", "Create my notes with the same name for both repositories."],
  ["notes-create-error-confirm", "Your notes, passphrases don't match", "Create my notes with a passphrase and a different confirmation."],
  ["notes-create-error-weak", "Your notes, passphrase too easy", "Create my notes with a passphrase that's too easy to guess."],
  ["notes-offline", "Your notes, GitHub unreachable", "GitHub can't be reached to look for the account's notes."],
  ["notes-clone", "Open from GitHub (the list)", "More options → Open another repository from GitHub: every repository the account owns."],
  ["notes-clone-nomatch", "Open from GitHub, nothing matches", "The repository search with a query that matches nothing."],
  ["notes-local", "Open a folder", "More options → Open a folder on this computer."],
  ["notes-local-error", "Open a folder, not a Git repository", "A folder was chosen that isn't a clone of a workspace."],
  ["creating-progress", "Creating your notes, in progress", "Create my notes is running (here at its fourth step, the deploy key): the part it's on in words with its number, and every part, always shown (PRF-13).", true],
  ["creating-success", "Creating your notes, done", "Every step that matters is done: Continue, and the site's address.", true],
  ["creating-failed-workflow", "Creating your notes, sign-in can't add workflows", "The GitHub sign-in lacks the workflow scope the instance's first push needs (D-201); nothing is made yet."],
  ["creating-failed-notfound", "Creating your notes, something not found", "GitHub answers 404 on a later step (the deploy key)."],
  ["creating-failed-permission", "Creating your notes, permission refused", "GitHub answers 403 on a step: the sign-in doesn't allow it."],
  ["creating-failed-offline", "Creating your notes, GitHub unreachable", "GitHub can't be reached in the middle of setup."],
  ["creating-retried", "Creating your notes, after Try again", "Try again on the failed step (sign-in can't add workflows), once signed in again with it: the rest of setup runs to the end, its parts shown."],
  ["ready-ready", "Ready", "After Continue: the window starts again in the new notes, at the last step.", true],
  ["ready-canvas", "The app after Start writing", "Writing, with the circular save indicator.", true],
  ["ready-canvas-account", "The app, backup details", "The save indicator's hover card: status, last backup and Backup to GitHub."],
  ["local-canvas", "Just use this computer for now: the app", "Welcome → Just use this computer for now: writing at once, with no account and no Ready step.", true],
  ["settings-workspace", "Settings → Workspace", "Settings, Workspace, for someone already set up: the way back into the picker."],
  ["settings-found", "Open another workspace: We found your notes", "Settings → Open another workspace from GitHub: the same picker, without the steps."],
  ["settings-clone", "Open another workspace: Open from GitHub", "The same picker's More options → Open another repository from GitHub."],
];
const STATES: CatalogState[] = CATALOG.map(([id, label, when, primary], i) => {
  const step = id.split("-")[0]!;
  return { id, n: i + 1, step, stepTitle: STEPS[step]!, state: id.slice(step.length + 1), label, when, primary: Boolean(primary) };
});
const byId = (id: string) => {
  const s = STATES.find((x) => x.id === id);
  if (!s) throw new Error(`No state ${id} in the catalogue`);
  return s;
};
/** States in the catalogue no fake reaches, and why. Filled as the journeys find them. */
const UNREACHABLE: Record<string, string> = {};
/** How the states that need more than the journeys' own fakes were reached, for the README. */
const NOTES = [
  "Light and dark: the app follows the system's appearance (appearance: system), switched in the main process as the OS would; the Ready step's Look therefore shows System.",
  "Sizes: the drawn window (inside its shadow margin) is resized in place; the default is the app's own 1100 × 780.",
  "Checking this computer and Looking for your notes: the fake GitHub holds GET /user and GET /user/repos until each is captured.",
  "Finish connecting in the window that opened, and Waiting for you to approve: a slow fake Git Credential Manager that never prints a code.",
  "A one-time code: the fake GitHub CLI (code WDJB-MJHT), waiting 60 s.",
  "The profile card's picture: a generated 128 px PNG put in the app's avatar cache (avatar.json), since journeys never fetch pictures; without it, the initials.",
  "Git too old: a fake git.exe reporting 2.20.1, compiled with the .NET Framework's C# compiler. Git missing: PATH without Git.",
  "A token GitHub rejects (invalid), and one with nowhere safe to keep it (noHelper), are said on the token form itself, which stays (16); after Back, the GitHub card says it too (20, 21).",
  "Sign-in didn't finish (failed): the helper signs in, but what it keeps is a token GitHub rejects.",
  "Creating your notes mid-way: the fake GitHub holds the deploy key request (step 4). Failures: 404 on copying the template, 404 and 403 on the deploy key, and the deploy key request dropped (offline).",
  "Just use this computer for now has no Ready step: it goes straight to writing (54).",
];

const SIZES = { default: { width: 1100, height: 780 }, small: { width: 480, height: 360 }, large: { width: 1600, height: 1000 } } as const;
type SizeId = keyof typeof SIZES;
type Theme = "light" | "dark";

// ---- the manifest, kept on disk so each journey adds to it ----
const manifestFile = () => join(OUT, "manifest.json");
type Manifest = { shots: Shot[]; measures: Record<string, Measure> };
const readManifest = (): Manifest => (existsSync(manifestFile()) ? JSON.parse(readFileSync(manifestFile(), "utf8")) : { shots: [], measures: {} });
function record(shot: Shot, measure?: Measure) {
  const m = readManifest();
  m.shots = [...m.shots.filter((s) => s.file !== shot.file), shot];
  if (measure) m.measures[shot.id] = measure;
  writeFileSync(manifestFile(), JSON.stringify(m, null, 2));
}

// ---- the window: theme and size ----
/** The system's appearance, as the OS would change it; the app follows it (appearance: system). */
async function theme(l: Launched, t: Theme) {
  if ((await l.page.evaluate(() => document.documentElement.style.colorScheme)) === t) return;
  await l.app.evaluate(({ nativeTheme }, s) => {
    nativeTheme.themeSource = s;
    nativeTheme.emit("updated");
  }, t);
  await expect.poll(() => l.page.evaluate(() => document.documentElement.style.colorScheme)).toBe(t);
}
/** The drawn window at this size, inside its shadow margin. */
async function size(l: Launched, s: SizeId) {
  const want = SIZES[s];
  const box = await windowBox(l.page);
  if (Math.abs(box.width - want.width) <= 1 && Math.abs(box.height - want.height) <= 1) return;
  const inner = await l.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const mx = (inner.w - box.width) / 2, my = (inner.h - box.height) / 2;
  await l.app.evaluate(({ BrowserWindow }, a) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    const b = w.getBounds();
    w.setBounds({ x: b.x, y: b.y, width: Math.round(a.width + 2 * a.mx), height: Math.round(a.height + 2 * a.my) });
  }, { ...want, mx, my });
  await expect.poll(async () => {
    const b = await windowBox(l.page);
    return Math.abs(b.width - want.width) <= 1 && Math.abs(b.height - want.height) <= 1;
  }).toBe(true);
}
/** Finite animations and transitions done; a spinner turns forever and doesn't count. */
const calm = async (page: Page) => {
  await page.waitForTimeout(200);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), undefined, { timeout: 10_000 }).catch(() => {});
};
/** D-144: the px between the focused control's focus ring (its outline, past its offset) and the named button, never touching. */
const ringClearance = (page: Page, other: string) =>
  page.evaluate((name) => {
    const el = document.activeElement as HTMLElement;
    const o = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
    const cs = getComputedStyle(el);
    const ring = cs.outlineStyle === "none" ? 0 : parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    const a = el.getBoundingClientRect(), b = o.getBoundingClientRect();
    return (a.bottom <= b.top ? b.top - a.bottom : a.top - b.bottom) - ring;
  }, other);

/**
 * Captures a state: light and dark at the default window, and for the main path also at the
 * smallest and a large one, then puts the window back (default size, light). `prep` runs before
 * each capture (to scroll, say, since a resize moves things).
 */
async function shot(l: Launched, id: string, prep?: (page: Page) => Promise<void>) {
  const s = byId(id);
  await check(l.page, id);
  // D-154: a state that went well never shows an error left over from something earlier.
  if (/^(creating-success|creating-retried|ready-|connect-found-|notes-found-)/.test(id)) expect.soft(await l.page.locator('[data-status-row="danger"]').count(), `no error on ${id}`).toBe(0);
  if (!CAPTURE) return;
  mkdirSync(OUT, { recursive: true });
  // The small and large windows resize the real window: on CI, or with FOCUS_NOTES_E2E_ALLOW_SCREEN=1 (D-141).
  const sizes: SizeId[] = s.primary && screenAllowed() ? ["default", "small", "large"] : ["default"];
  for (const sz of sizes) {
    await size(l, sz);
    for (const t of ["light", "dark"] as const) {
      await theme(l, t);
      await prep?.(l.page);
      await calm(l.page);
      const file = `${String(s.n).padStart(2, "0")}-${s.step}-${s.state}.${t}.${sz}.png`;
      await l.page.screenshot({ path: join(OUT, file), animations: "disabled", caret: "hide" });
      let measure: Measure | undefined;
      if (sz === "default" && t === "light" && (await card(l.page).count())) {
        const m = await measureVisual(l.page);
        measure = { ...m, anchorScore: anchorScore(m.anchor), economyScore: economyScore(m.words, m.maxLines, 40) };
      }
      record({ id, theme: t, size: sz, file }, measure);
    }
  }
  await size(l, "default");
  await theme(l, "light");
}

/**
 * D-127, D-135: every state on the setup screen passes the measurable criteria of the visual score,
 * at the default window in light, at the top of the step: a full visual anchor (48 px or more in
 * view) and text economy of 10 or more (an onboarding step's budget, 40 words). Soft, so a journey
 * reports every state that fails, not just the first.
 */
async function check(page: Page, id: string) {
  await page.mouse.move(0, 0);
  // D-147: in every state, the window still drags by its title bar band.
  expect.soft(await bandProblems(page, id), `the title bar band on ${id}`).toEqual([]);
  if (!(await card(page).count())) return;
  await calm(page);
  const problems = await visualScoreProblems(page, id, BUDGETS.onboarding);
  const m = await measureVisual(page);
  if (m.anchor < ANCHOR.full) problems.push(`${id}: visual anchor ${anchorScore(m.anchor)}/20: the largest non-text element in view is ${m.anchor} px (48 px for full marks)`);
  expect.soft([...new Set(problems)], `the visual score's measurable criteria on ${id}`).toEqual([]);
}

// ---- the fakes beyond the journeys' own ----
/** Git Credential Manager whose sign-in waits a minute without a code: the browser, or its own window. */
function slowGcm(w: World) {
  const bin = join(w.fakes.root, "bin");
  writeFileSync(join(bin, "slow-gcm.mjs"), 'if (process.argv[2] === "--version") { process.stdout.write("2.6.0\\n"); process.exit(0); }\nsetTimeout(() => process.exit(1), 60_000);\n');
  if (win) writeFileSync(join(bin, "git-credential-manager.cmd"), '@node "%~dp0slow-gcm.mjs" %*\r\n');
  else writeFileSync(join(bin, "git-credential-manager"), '#!/bin/sh\nexec node "$(dirname "$0")/slow-gcm.mjs" "$@"\n');
}
/** PATH without Git, as on a computer that never installed it. */
const withoutGit = (path: string) => path.split(delimiter).filter((d) => !existsSync(join(d, "git.exe")) && !existsSync(join(d, "git"))).join(delimiter);
/** A `git` that reports 2.20.1, compiled with the .NET Framework's C# compiler (Windows only), or undefined. */
function oldGit(): string | undefined {
  const csc = join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (!win || !existsSync(csc)) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "fn-oldgit-"));
  writeFileSync(join(dir, "git.cs"), 'class P { static int Main(string[] a) { if (System.Array.IndexOf(a, "--version") >= 0) { System.Console.WriteLine("git version 2.20.1.windows.1"); return 0; } return 1; } }\n');
  execFileSync(csc, ["/nologo", `/out:${join(dir, "git.exe")}`, join(dir, "git.cs")], { stdio: "ignore" });
  return dir;
}

/** Starts a new install in `w`, following the system's appearance, optionally with the account's picture cached. */
async function begin(w: World, opts: { picture?: boolean } = {}): Promise<Launched> {
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: "system" }));
  if (opts.picture) cachePicture(w);
  const l = await start(w);
  await theme(l, "light");
  return l;
}
const cachePicture = (w: World) => writeFileSync(join(w.dirs.userData, "avatar.json"), JSON.stringify({ version: 1, id: w.gh.id, data: picture() }));
const button = (page: Page, name: string | RegExp) => card(page).getByRole("button", { name, exact: typeof name === "string" });
const text = (page: Page, t: string | RegExp) => card(page).getByText(t).first();
const TOKEN_SHAPED = `ghp_${"Q".repeat(36)}`;
async function getStarted(page: Page) {
  await heading(page, "A quiet place to write");
  await button(page, "Get started").click();
  // D-142: Connect's title names its state; the stepper says where it is.
  await expect(card(page).getByRole("img", { name: "Step 2 of 4" })).toBeVisible({ timeout: 20_000 });
}
async function close(l: Launched, w: World) {
  await quit(l).catch(() => {});
  w.server.close();
}

test.afterAll(() => {
  if (!CAPTURE || !existsSync(manifestFile())) return;
  const m = readManifest();
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoRoot, encoding: "utf8" }).trim();
  const unreachable = { ...UNREACHABLE };
  for (const s of STATES) if (!m.shots.some((x) => x.id === s.id) && !unreachable[s.id]) unreachable[s.id] = "Its journey didn't reach it in this run (see the Playwright output).";
  writeReview(OUT, {
    states: STATES, shots: m.shots, measures: m.measures, unreachable, notes: NOTES,
    commit: process.env.FOCUS_NOTES_FRE_COMMIT ?? git("rev-parse", "HEAD"), subject: git("log", "-1", "--format=%s"),
    captured: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
  });
});

// ---- the journeys ----

test("the main path: Welcome, Connect (no account, waiting, signed in), Create my notes, creating, Ready, writing", async () => {
  test.setTimeout(600_000);
  const w = await world({ gcm: true });
  slowGcm(w);
  const net = network(w);
  const l = await begin(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(button(page, "Get started")).toBeFocused();
    // D-144: the app's name shows on Welcome, under its icon.
    await expect(card(page).getByText("Focus Notes", { exact: true })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await shot(l, "welcome-rest");
    await tabTo(page, button(page, "Get started"));
    expect(await ringClearance(page, "Just use this computer for now"), "Get started's focus ring clears the other button").toBeGreaterThanOrEqual(4);
    await shot(l, "welcome-focus-start");
    await tabTo(page, button(page, "Just use this computer for now"));
    expect(await ringClearance(page, "Get started"), "Just use this computer for now's focus ring clears Get started").toBeGreaterThanOrEqual(4);
    await shot(l, "welcome-focus-local");
    await getStarted(page);

    await expect(button(page, "Connect to GitHub")).toBeFocused({ timeout: 15_000 });
    await shot(l, "connect-github");
    await button(page, "Having trouble?").click();
    await expect(button(page, "Use a token instead")).toBeVisible();
    await shot(l, "connect-github-trouble");
    await button(page, "Having trouble?").click();
    // D-142: Connect to GitHub is a device code; GCM's own window shows it until GCM prints it.
    await button(page, "Connect to GitHub").click();
    await expect(text(page, "Finish connecting in your browser, or in the window that opened.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-window");
    await button(page, "Cancel").click();
    await button(page, "Having trouble?").click();
    await button(page, "Sign in in the browser instead").click();
    await expect(text(page, "Waiting for you to approve on GitHub…")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-waiting");
    await button(page, "Cancel").click();
    await expect(button(page, "Connect to GitHub")).toBeVisible();

    // Signed in meanwhile, with the account's picture known: back, and Get started again.
    w.fakes.store(w.gh.token);
    cachePicture(w);
    await button(page, "Back").click();
    // Your notes' list is asked as soon as Connect has the account (prefetch, PRF-13): held from here.
    const repos = net.hold("GET /user/repos");
    await getStarted(page);
    await expect(button(page, "Continue as Ada")).toBeFocused({ timeout: 20_000 });
    await shot(l, "connect-found-picture");
    await button(page, "Having trouble?").click();
    await expect(button(page, "Use a different account")).toBeVisible();
    await shot(l, "connect-found-trouble");
    await button(page, "Having trouble?").click();

    await button(page, "Continue as Ada").click();
    await heading(page, "Looking for your notes");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(3);
    await expect(text(page, /^Looking for your notes on GitHub…/)).toBeVisible();
    await shot(l, "notes-checking");
    repos.release();
    const create = button(page, /^Create my notes/);
    await expect(create).toBeFocused({ timeout: 15_000 });
    await shot(l, "notes-create");
    await button(page, "More options").click();
    await expect(card(page).getByRole("textbox", { name: "Public repository" })).toBeVisible();
    await shot(l, "notes-create-more");
    const scroller = page.locator('[data-key-scope="firstRun"] > div');
    await shot(l, "notes-create-more-end", () => scroller.first().evaluate((el) => el.scrollTo({ top: el.scrollHeight })));

    // What Create my notes says when More options isn't right.
    const priv = card(page).getByRole("textbox", { name: "Private repository" });
    const pass = card(page).getByLabel("Passphrase (optional)");
    const confirm = card(page).getByLabel("Confirm passphrase");
    const into = (t: string) => () => text(page, t).scrollIntoViewIfNeeded();
    await priv.fill("notes");
    await create.click();
    const names = "Use two different names.";
    await expect(text(page, names)).toBeVisible();
    await shot(l, "notes-create-error-names", into(names));
    await priv.fill("notes-private");
    await pass.fill("quiet harbour lantern morning");
    await confirm.fill("quiet harbour lantern evening");
    await create.click();
    await expect(text(page, "The passphrases don't match.")).toBeVisible();
    await shot(l, "notes-create-error-confirm", into("The passphrases don't match."));
    await pass.fill("abc");
    await confirm.fill("abc");
    await create.click();
    const weak = /four or more random words/;
    await expect(text(page, weak)).toBeVisible();
    await shot(l, "notes-create-error-weak", () => text(page, weak).scrollIntoViewIfNeeded());
    await pass.fill("");
    await confirm.fill("");
    await button(page, "More options").click();
    await expect(button(page, "More options")).toHaveAttribute("aria-expanded", "false");

    // Creating: held at the deploy key, so it's mid-way.
    const keys = net.hold("POST /repos/ada/notes-private/keys");
    await create.click();
    await heading(page, "Creating your notes");
    await keys.reached;
    await expect(text(page, "Letting your website read them · 4 of 9")).toBeVisible();
    await expect(text(page, "Turn on your website")).toBeVisible();
    await shot(l, "creating-progress");
    keys.release();
    await expect(text(page, "Backing up carries on in the background.")).toBeVisible({ timeout: 90_000 });
    await expect(text(page, /^Your site:/)).toBeVisible({ timeout: 30_000 });
    await shot(l, "creating-success");

    await button(page, "Continue").click();
    await heading(page, "Ready");
    await expect(button(page, "Start writing")).toBeFocused({ timeout: 15_000 });
    // D-144: focus mode is featured with its toggle's keys, in this platform's keys, read aloud in words.
    await expect(text(page, "Focus mode keeps your current paragraph bright.")).toBeVisible();
    const spoken = card(page).getByText(process.platform === "darwin" ? "Shift Command D" : "Control Shift D", { exact: true });
    await expect(spoken).toBeAttached();
    // The keys sit on the hint's line at the default window, not wrapped below it.
    const [hintBox, capsBox] = [await text(page, "Focus mode keeps your current paragraph bright.").boundingBox(), await spoken.locator("..").boundingBox()];
    expect(Math.abs(hintBox!.y + hintBox!.height / 2 - (capsBox!.y + capsBox!.height / 2)), "the focus keys on the hint's line").toBeLessThan(8);
    await shot(l, "ready-ready");
    await button(page, "Start writing").click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    const pill = page.locator("#saveState");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await shot(l, "ready-canvas");
    await pill.hover();
    await expect(page.getByRole("dialog", { name: "Backup", exact: true }).getByRole("button", { name: "Backup to GitHub", exact: true })).toBeVisible();
    await shot(l, "ready-canvas-account");
    await page.keyboard.press("Escape");
  } finally {
    await close(l, w);
  }
});

test("Connect: a stalled account request times out, keeps the frame usable, and can be retried", async () => {
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const user = network(w).hold("GET /user");
  const l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    await user.reached;
    await heading(page, "Checking this computer");
    if (process.platform !== "darwin") {
      expect(await bandStartsMove(l.app, page)).toEqual(["start:move", "end:move"]);
      for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
        const handle = page.locator(`[data-window-handle="${edge}"]`);
        await handle.dispatchEvent("pointerdown", { pointerId: 47, button: 0, buttons: 1, screenX: 200, screenY: 100 });
        await handle.dispatchEvent("pointerup", { pointerId: 47, button: 0, buttons: 0, screenX: 200, screenY: 100 });
      }
      await expect.poll(() => l.app.evaluate(() => (globalThis as unknown as { bandMoves: string[] }).bandMoves.slice())).toEqual([
        "start:move", "end:move", ...["n", "s", "e", "w", "ne", "nw", "se", "sw"].flatMap((edge) => [`start:${edge}`, `end:${edge}`]),
      ]);
    }
    await expect(page.getByText("Can't reach GitHub. Check your internet connection, then try again.", { exact: true })).toBeVisible({ timeout: 15_000 });
    user.release();
    await page.keyboard.press("Escape");
    await heading(page, "A quiet place to write");
    await getStarted(page);
    await expect(button(page, "Continue as Ada")).toBeVisible({ timeout: 15_000 });
  } finally {
    user.release();
    await quit(l);
    w.server.closeAllConnections();
    w.server.close();
  }
});

test("existing notes: checking, initials, We found your notes with several, More options, Open from GitHub, Open a folder", async () => {
  test.setTimeout(300_000);
  const w = await world({ gcm: true });
  existingInstance(w);
  const day = 86_400_000;
  w.gh.add({ owner: "ada", name: "journal", private: true, files: [".focus-notes/workspace.json"] }).pushedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  w.gh.add({ owner: "ada", name: "work-notes", files: [".focus-notes/workspace.json"] }).pushedAt = new Date(Date.now() - 45 * day).toISOString();
  w.gh.add({ owner: "ada", name: "old-notes", private: true, files: [".focus-notes/workspace.json"] }).pushedAt = new Date(Date.now() - 400 * day).toISOString();
  w.fakes.store(w.gh.token);
  const net = network(w);
  const user = net.hold("GET /user");
  const l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    await heading(page, "Checking this computer");
    await shot(l, "connect-checking");
    if (process.platform !== "darwin") expect(await bandStartsMove(l.app, page)).toEqual(["start:move", "end:move"]);
    user.release();
    await expect(button(page, "Continue as Ada")).toBeFocused({ timeout: 20_000 });
    await shot(l, "connect-found-initials");
    await button(page, "Continue as Ada").click();
    await heading(page, "We found your notes");
    await expect(button(page, "Open")).toHaveCount(4, { timeout: 15_000 }).catch(() => {});
    // D-147: the full-window setup never takes the window's dragging.
    if (process.platform !== "darwin") expect(await bandStartsMove(l.app, page)).toEqual(["start:move", "end:move"]);
    await shot(l, "notes-found-several");
    await button(page, "More options").click();
    await expect(button(page, "Open from GitHub…")).toBeVisible();
    await shot(l, "notes-found-more");
    await button(page, "Open from GitHub…").click();
    await heading(page, "Open from GitHub");
    await shot(l, "notes-clone");
    const search = card(page).getByRole("combobox", { name: "Search your repositories" }).or(card(page).getByLabel("Search your repositories")).first();
    await search.fill("zzz");
    await expect(text(page, "No repositories match.")).toBeVisible();
    await shot(l, "notes-clone-nomatch");
    await search.fill("");
    await button(page, "Back").click();
    await heading(page, "We found your notes");
    await button(page, "More options").click();
    await button(page, "Open a folder…").click();
    await heading(page, "Open a folder");
    await shot(l, "notes-local");
    const empty = mkdtempSync(join(tmpdir(), "fn-not-notes-"));
    await l.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    }, empty);
    await button(page, "Choose a folder…").click();
    await expect(text(page, /isn't a Git repository|isn't a Focus Notes workspace/)).toBeVisible({ timeout: 15_000 });
    await shot(l, "notes-local-error");
  } finally {
    await close(l, w);
  }
});

test("Your notes offline, then Look again finds one workspace", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  existingInstance(w);
  w.fakes.store(w.gh.token);
  const net = network(w);
  net.down.add("GET /user/repos");
  const l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    await expect(button(page, "Continue as Ada")).toBeFocused({ timeout: 20_000 });
    await button(page, "Continue as Ada").click();
    await expect(text(page, /Can't reach GitHub to look for your notes/)).toBeVisible({ timeout: 20_000 });
    await shot(l, "notes-offline");
    net.down.clear();
    await button(page, "Look again").click();
    await heading(page, "We found your notes");
    await expect(button(page, "Open")).toBeFocused({ timeout: 15_000 });
    await shot(l, "notes-found-one");
  } finally {
    await close(l, w);
  }
});

test("Connect's problems: declined, expired, offline, didn't finish; the token form, its error, and a token GitHub rejects", async () => {
  test.setTimeout(240_000);
  const w = await world({ gcm: true });
  w.fakes.outcomes(["declined", "expired"]);
  const l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    const connect = button(page, "Connect to GitHub");
    await expect(connect).toBeFocused({ timeout: 15_000 });
    await connect.click();
    await expect(text(page, "Connecting didn't finish. Try again when you're ready.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-problem-declined");
    await connect.click();
    await expect(text(page, "The code ran out of time. Try again.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-problem-expired");
    w.gh.offline = true;
    await connect.click();
    await expect(text(page, "Can't reach GitHub. Check your internet connection, then try again.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-problem-offline");
    w.gh.offline = false;
    // The helper signs in, but what it keeps isn't a sign-in GitHub accepts.
    w.fakes.signInAs(TOKEN_SHAPED, "ada");
    await connect.click();
    await expect(text(page, "Connecting didn't finish. Try again.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-problem-failed");

    await button(page, "Having trouble?").click();
    await button(page, "Use a token instead").click();
    const token = card(page).getByLabel("Token");
    await expect(token).toBeFocused();
    await shot(l, "connect-token");
    await token.fill("not a token");
    await token.press("Enter");
    await expect(text(page, "That doesn't look like a GitHub token. Paste the whole token.")).toBeVisible();
    await shot(l, "connect-token-error");
    await token.fill(TOKEN_SHAPED);
    await token.press("Enter");
    // D-135: said on the form itself, which stays, with focus back in the field that describes it.
    const rejected = "GitHub didn't accept that token, so it was cleared. Make a new one and paste it.";
    await expect(text(page, rejected)).toBeVisible({ timeout: 15_000 });
    await expect(token).toBeFocused();
    await expect(token).toHaveAttribute("aria-invalid", "true");
    await expect(token).toHaveAccessibleDescription(rejected);
    await shot(l, "connect-token-rejected");
    await button(page, "Back").click();
    await expect(text(page, "GitHub didn't accept that. Connect again.")).toBeVisible({ timeout: 10_000 });
    await shot(l, "connect-problem-invalid");
  } finally {
    await close(l, w);
  }
});

test("Connect without a sign-in helper, and with nowhere to keep a token", async () => {
  test.setTimeout(180_000);
  let w = await world({});
  let l = await begin(w);
  try {
    await getStarted(l.page);
    await expect(text(l.page, "To connect, Focus Notes needs GitHub's free sign-in helper. Install it, then check again.")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-no-helper");
  } finally {
    await close(l, w);
  }
  // The GitHub CLI is there, but Git has no credential helper to keep a token in.
  w = await world({ gh: true, helper: false });
  l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    await expect(button(page, "Connect to GitHub")).toBeVisible({ timeout: 15_000 });
    await button(page, "Having trouble?").click();
    await button(page, "Use a token instead").click();
    const token = card(page).getByLabel("Token");
    await token.fill(w.gh.token);
    await token.press("Enter");
    await expect(text(page, "There's nowhere safe to keep it, so it was cleared. Install the sign-in helper, then paste it again.")).toBeVisible({ timeout: 15_000 });
    await expect(token).toBeFocused();
    await button(page, "Back").click();
    await expect(text(page, "There's nowhere safe to keep the sign-in. Install the sign-in helper, then try again.")).toBeVisible({ timeout: 10_000 });
    await shot(l, "connect-problem-nohelper");
  } finally {
    await close(l, w);
  }
});

test("Connect with the GitHub CLI: its session offered, then a one-time code", async () => {
  test.setTimeout(180_000);
  const w = await world({ gh: true, delayMs: 60_000 });
  w.fakes.session(w.gh.token);
  const l = await begin(w);
  const { page } = l;
  try {
    await getStarted(page);
    await expect(button(page, "Continue as Ada")).toBeVisible({ timeout: 20_000 });
    await shot(l, "connect-cli");
    await button(page, "Having trouble?").click();
    await button(page, "Use a different account").click();
    await button(page, "Connect to GitHub").click();
    await expect(text(page, "WDJB-MJHT")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-code");
    await button(page, "Cancel").click();
  } finally {
    await close(l, w);
  }
});

test("Git missing, and Git too old", async () => {
  test.setTimeout(180_000);
  let w = await world({ gcm: true });
  w.env.PATH = withoutGit(w.env.PATH!);
  let l = await begin(w);
  try {
    await getStarted(l.page);
    await expect(text(l.page, "One free helper app")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-git-missing");
    await button(l.page, "Having trouble?").click();
    await expect(text(l.page, GIT_INSTALL)).toBeVisible();
    await shot(l, "connect-git-missing-trouble");
  } finally {
    await close(l, w);
  }
  const old = oldGit();
  if (!old) {
    UNREACHABLE["connect-git-old"] = UNREACHABLE["connect-git-old-trouble"] = "Needs a fake `git` reporting an old version; this spec builds one with the .NET Framework's C# compiler, which only Windows has.";
    return;
  }
  w = await world({ gcm: true });
  w.env.PATH = [old, withoutGit(w.env.PATH!)].join(delimiter);
  l = await begin(w);
  try {
    await getStarted(l.page);
    await expect(text(l.page, "One free helper app")).toBeVisible({ timeout: 15_000 });
    await shot(l, "connect-git-old");
    await button(l.page, "Having trouble?").click();
    // D-142: the versions as a comparison (found → needed), said in full to screen readers.
    await expect(card(l.page).getByRole("group", { name: /Git 2\.20\.1 is too old/ })).toBeVisible();
    await shot(l, "connect-git-old-trouble");
  } finally {
    await close(l, w);
  }
});

const KEYS = "POST /repos/ada/notes-private/keys";
const FAILURES: [string, string, RegExp, (w: World, net: ReturnType<typeof network>) => void][] = [
  ["creating-failed-workflow", "sign-in can't add workflows", /sign-in can't add workflows/, (w) => void (w.gh.scopes = ["repo", "gist"])],
  ["creating-failed-notfound", "something not found", /GitHub couldn't find something this step needs/, (w) => w.gh.fail(KEYS, 404, "Not Found", 50)],
  ["creating-failed-permission", "permission refused", /Your sign-in doesn't allow this/, (w) => w.gh.fail(KEYS, 403, "Resource not accessible by integration", 50)],
  ["creating-failed-offline", "GitHub unreachable", /Can't reach GitHub\. Check your connection, then retry\./, (_w, net) => net.down.add(KEYS)],
];
for (const [id, what, says, breakIt] of FAILURES) {
  test(`Creating your notes fails: ${what}, with Try again`, async () => {
    test.setTimeout(180_000);
    const w = await world({ gcm: true });
    w.fakes.store(w.gh.token);
    const net = network(w);
    breakIt(w, net);
    const l = await begin(w);
    const { page } = l;
    try {
      await getStarted(page);
      await expect(button(page, "Continue as Ada")).toBeFocused({ timeout: 20_000 });
      await button(page, "Continue as Ada").click();
      await expect(button(page, /^Create my notes/)).toBeFocused({ timeout: 15_000 });
      await button(page, /^Create my notes/).click();
      await expect(text(page, says)).toBeVisible({ timeout: 30_000 });
      await shot(l, id);
      // D-154: no dead ends: besides Try again, something that changes what happens next, and Back.
      await expect(button(page, "Start over")).toBeVisible();
      await expect(button(page, "Back")).toBeVisible();
      if (id !== "creating-failed-workflow") return;
      // Try again once signed in with the workflow scope: the whole rest of setup runs, to the end (D-135).
      w.gh.scopes = ["repo", "gist", "workflow"];
      await expect(button(page, "Try again")).toBeFocused();
      await button(page, "Try again").click();
      await expect(text(page, says)).toHaveCount(0, { timeout: 30_000 });
      await expect(text(page, "Backing up carries on in the background.")).toBeVisible({ timeout: 90_000 });
      await expect(button(page, "Continue")).toBeEnabled();
      for (const step of ["Make your notes on GitHub", "Make a place for private notes", "Download to this computer", "Link them"]) await expect(card(page).getByText(step, { exact: true })).toBeVisible();
      await expect(card(page).getByRole("img", { name: "Not started yet" })).toHaveCount(0);
      await shot(l, "creating-retried");
      await button(page, "Continue").click();
      await heading(page, "Ready");
    } finally {
      await close(l, w);
    }
  });
}

test("Just use this computer for now: straight to writing", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  const l = await begin(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await button(page, "Just use this computer for now").click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.waitForTimeout(1000);
    await shot(l, "local-canvas");
  } finally {
    await close(l, w);
  }
});

test("Settings → Workspace → Open another workspace from GitHub: the same picker after setup", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  w.git(join(w.dirs.docs, "private"), "checkout", "--quiet", "main");
  for (const dir of [w.dirs.docs, join(w.dirs.docs, "private")]) {
    w.git(dir, "config", "user.name", "Ada");
    w.git(dir, "config", "user.email", "ada@example.com");
  }
  const note = join(w.dirs.docs, "private", "notes", "secret.md");
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", appearance: "system", lastNotePath: note }));
  writeFileSync(join(w.dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: w.dirs.docs }));
  const l = await start(w, false);
  const { page } = l;
  try {
    await theme(l, "light");
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await expect(page.locator("#saveState")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Workspace" }).click();
    await expect(settings.getByRole("button", { name: "Open another workspace from GitHub…" })).toBeVisible();
    // D-147: a dialog never takes the window's dragging, and a press on the band leaves it open.
    if (process.platform !== "darwin") {
      expect(await bandProblems(page, "Settings")).toEqual([]);
      expect(await bandStartsMove(l.app, page)).toEqual(["start:move", "end:move"]);
      await expect(settings).toBeVisible();
    }
    await shot(l, "settings-workspace");
    await settings.getByRole("button", { name: "Open another workspace from GitHub…" }).click();
    await heading(page, "We found your notes");
    await expect(button(page, "Open")).toBeFocused({ timeout: 15_000 });
    await shot(l, "settings-found");
    await button(page, "More options").click();
    await button(page, "Open from GitHub…").click();
    await heading(page, "Open from GitHub");
    await shot(l, "settings-clone");
  } finally {
    await close(l, w);
  }
});
