/**
 * The Microsoft Store's screenshots (D-223, replacing D-202 (11)'s 1920 × 1080 window): the demo
 * project, Projects, Find in all notes, pictures, sharing and publishing, in a smaller window drawn at
 * twice the scale, so the listing's 2560 × 1440 images show the writing at a size people can read.
 * Each capture is the app's own window (webContents.capturePage, never the screen, D-141), lossless
 * with its shadow's alpha; tools/release/store-screenshots.py sets them on a backdrop, and lays the
 * four `cascade-*` windows (themes and fonts) over each other. Fakes only: no real GitHub.
 *
 * Opt in with `FOCUS_NOTES_CAPTURE_STORE=1` (and `FOCUS_NOTES_E2E=1`); `FOCUS_NOTES_STORE_OUT` names
 * the folder. The `store` review catalogue runs it on CI, where the drawn window is resized to exactly
 * WINDOW (`gh workflow run review-captures.yml -f catalog=store`); a local run is a preview whose
 * window is WINDOW with its shadow margin inside.
 */
import { test, expect, screenAllowed } from "./fixtures.ts";
import { copyFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { files, reset, mod } from "./surfaces.ts";
import { configure, configureSharing, git, instance, write } from "./instance.ts";
import { repoRoot } from "./github-world.ts";
import { captureWindow, exactSize, fullNote, openNote, startDemo } from "./scene-capture.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_STORE !== "1", "Opt in with FOCUS_NOTES_CAPTURE_STORE=1");

/** The drawn window, in the app's own pixels; captured at SCALE, so 2240 × 1440 device pixels. */
const WINDOW = { width: 1120, height: 720 };
const SCALE = 2;
const ARGS = [`--force-device-scale-factor=${SCALE}`];
const OUT = process.env.FOCUS_NOTES_STORE_OUT ?? join(repoRoot, "test-results", "store-capture");
const exact = screenAllowed() ? (l: Launched) => exactSize(l, WINDOW) : undefined;
const capture = (l: Launched, name: string, opts?: { hover?: boolean }) => captureWindow(l, OUT, name, opts);
/** A calm illustration (generated, nobody's photo) for the pictures and publishing scenes. */
const HILLS = join(import.meta.dirname, "store-hills.jpg");
const ACCOUNT = { login: "maya-chen", id: 4207, name: "Maya Chen" };

/**
 * The cascade, back to front: one note in four themes and fonts (D-223). The front one is light,
 * so the composition sits on the light backdrop.
 */
const CASCADE = [
  { appearance: "dark", darkTheme: "dusk", contentFont: "mono" },
  { appearance: "light", lightTheme: "sepia", contentFont: "hyperlegible" },
  { appearance: "dark", darkTheme: "harbor-dark", contentFont: "sans" },
  { appearance: "light", lightTheme: "paper", contentFont: "serif" },
] as const;

const FIRST_LIGHT = [
  "# First light",
  "",
  "Up before the house woke, and out along the ridge path on a clear morning, while the valley was still blue.",
  "",
  "![Rolling hills under a pale morning sun](first-light.jpg \"The ridge path, a few minutes after sunrise.\")",
  "",
  "The pines on the far slope caught the light first. By the time I turned back, the mist had lifted off the lower fields.",
  "",
].join("\n");

/** Other projects on this computer, one of them backed up to GitHub, for the Open dialog's Projects. */
const PROJECTS = [
  { name: "Essays", notes: { "On beginnings.md": "# On beginnings\n\nEvery essay starts as a question.\n" } },
  { name: "Book draft", notes: { "Chapter one.md": "# Chapter one\n\nThe harbour was quiet that winter.\n" }, github: "book-draft" },
];

/**
 * Where the demo projects live: a plain public folder on CI, so no runner's user name or temporary
 * folder shows in a path; a temporary folder elsewhere (a local run is a preview, never published).
 */
const ROOT = process.env.GITHUB_ACTIONS === "true" ? "C:\\Users\\Public\\Documents" : undefined;

/** The demo folder with its own history, as a project kept on this computer. */
function history(dirs: { docs: string }) {
  git(dirs.docs, "init", "-q", "-b", "main");
  configure(dirs.docs);
  git(dirs.docs, "add", "-A");
  git(dirs.docs, "commit", "-qm", "Start");
}

function demoExtras(dirs: { docs: string; userData: string }) {
  write(join(dirs.docs, "Walks", "First light.md"), FIRST_LIGHT);
  copyFileSync(HILLS, join(dirs.docs, "Walks", "first-light.jpg"));
  history(dirs);
  const root = join(dirs.docs, "..");
  for (const p of PROJECTS) rmSync(join(root, p.name), { recursive: true, force: true });
  for (const p of PROJECTS) {
    const folder = join(root, p.name);
    write(join(folder, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
    for (const [file, text] of Object.entries(p.notes)) write(join(folder, "notes", file), text);
    if (p.github) {
      git(folder, "init", "-q", "-b", "main");
      git(folder, "remote", "add", "origin", `https://github.com/${ACCOUNT.login}/${p.github}.git`);
    }
    const profile = join(dirs.userData, "project-profiles", p.name.toLowerCase().replace(/\s+/g, "-"));
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "project-folder.txt"), folder);
    writeFileSync(join(profile, "workspace.json"), JSON.stringify({ version: 1, folder, kind: "local" }));
    writeFileSync(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: "", projectIntroSeen: true }));
  }
}

/** No focus ring in a listing's picture. */
const rest = (l: Launched) => l.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

function closeApp(l: Launched | undefined) {
  if (l && process.platform === "win32") execFileSync("pwsh", ["-NoProfile", "-File", join(repoRoot, "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
}

test("D-223: the note, Projects, a new project, Find in all notes, a picture, and Files", async () => {
  test.setTimeout(240_000);
  const l = await startDemo({ size: WINDOW, theme: "light", state: { appearance: "light", focusMode: false }, args: ARGS, exact, setup: demoExtras, root: ROOT });
  const { page } = l;
  try {
    await fullNote(page);
    await capture(l, "note-light");

    await page.keyboard.press("Control+Alt+O");
    const open = page.getByRole("dialog", { name: "Open", exact: true });
    await expect(open).toBeVisible();
    for (const p of PROJECTS) await expect(open.getByText(p.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await rest(l);
    await capture(l, "open-projects-light");

    await l.app.evaluate(({ ipcMain }, account) => {
      ipcMain.removeHandler("firstRun:account");
      ipcMain.handle("firstRun:account", () => ({ account, gcm: false, gh: false }));
    }, ACCOUNT);
    await open.getByRole("button", { name: "New project…", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "New project", exact: true });
    await wizard.getByRole("textbox", { name: "Project name", exact: true }).fill("Field notes");
    await wizard.getByRole("button", { name: "Next", exact: true }).click();
    await expect(wizard).toContainText("Where to keep it");
    await wizard.getByRole("radio", { name: "On GitHub", exact: true }).click();
    await expect(wizard.getByRole("textbox", { name: "Repository name", exact: true })).toHaveValue("field-notes");
    await rest(l);
    await capture(l, "new-project-light");
    await reset(page);
    await expect(wizard).toBeHidden();

    await page.keyboard.press(`${mod}+Shift+F`);
    const panel = page.getByRole("complementary", { name: "Find in all notes" });
    await panel.getByRole("combobox", { name: "Search all notes" }).fill("morning");
    await expect(panel.getByRole("status").first()).toHaveText(/matches in 3 notes/);
    await rest(l);
    await capture(l, "find-all-light");
    await panel.getByRole("button", { name: "Close find in all notes", exact: true }).click();
    await expect(panel).toBeHidden();
    await page.getByRole("textbox", { name: "Note" }).focus();

    await openNote(page, "First light");
    await expect(page.locator("img[alt='Rolling hills under a pale morning sun']")).toBeVisible();
    await expect.poll(() => page.locator("img[alt='Rolling hills under a pale morning sun']").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const caption = page.getByText("The ridge path, a few minutes after sunrise.", { exact: true });
    await expect(caption).toBeVisible();
    await caption.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(400);
    await capture(l, "images-light");

    await files(page);
    await rest(l);
    await capture(l, "files-light");
  } finally {
    try { await quit(l); } finally { closeApp(l); }
  }
});

test("D-223: writing in focus mode, dark", async () => {
  test.setTimeout(120_000);
  const l = await startDemo({ size: WINDOW, theme: "dark", state: { appearance: "dark", focusMode: false }, args: ARGS, exact, setup: history, root: ROOT });
  try {
    await fullNote(l.page);
    await l.page.getByText("So I keep the screen quiet").click();
    await l.page.keyboard.press("End");
    await l.page.keyboard.press("F8");
    await expect.poll(() => l.page.evaluate(() => document.documentElement.dataset.focus !== undefined)).toBe(true);
    await capture(l, "focus-dark");
  } finally {
    try { await quit(l); } finally { closeApp(l); }
  }
});

test("D-223: one note in four themes and fonts, for the cascade", async () => {
  test.setTimeout(300_000);
  for (const [i, look] of CASCADE.entries()) {
    const l = await startDemo({ size: WINDOW, theme: look.appearance, state: { ...look, focusMode: false }, args: ARGS, exact, setup: history, root: ROOT });
    try {
      await fullNote(l.page);
      await expect.poll(() => l.page.evaluate(() => document.documentElement.style.colorScheme)).toBe(look.appearance);
      await capture(l, `cascade-${i + 1}`);
    } finally {
      try { await quit(l); } finally { closeApp(l); }
    }
  }
});

const windowAt = (userData: string) => writeFileSync(join(userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: WINDOW.width, height: WINDOW.height } }));

test("D-223: sharing a folder with a link and passcode, dark", async () => {
  test.setTimeout(180_000);
  const made = instance();
  // The project's name shows in its pill: a person's name for it, not the fixture's.
  const docs = join(made.dirs.docs, "..", "Notebook");
  renameSync(made.dirs.docs, docs);
  const dirs = { ...made.dirs, docs };
  const priv = join(dirs.docs, "private");
  write(join(priv, "notes", "Travel", "Lisbon.md"), "# Lisbon\n\nThree days in October. Tram 28 early, before the crowds; the miradouros at dusk.\n");
  write(join(priv, "notes", "Travel", "Packing list.md"), "# Packing list\n\n- Walking shoes\n- Light rain jacket\n- Notebook\n");
  write(join(priv, "notes", "Garden plan.md"), "# Garden plan\n\nPeas along the north fence, tomatoes in the sunny bed.\n");
  git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add notes");
  write(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", appearance: "dark", focusMode: false, lastNotePath: join(priv, "notes", "Travel", "Lisbon.md") }));
  windowAt(dirs.userData);
  await configureSharing(dirs);
  let l: Launched | undefined;
  try {
    l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_CANDIDATE_SITE: "" }, { args: ARGS });
    await exact?.(l);
    const { page } = l;
    await l.app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Tram 28");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
    await page.keyboard.press("Control+Shift+E");
    await page.getByRole("treeitem", { name: "Travel", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “Travel”", exact: true });
    await expect(share).toBeVisible();
    await expect(share.getByRole("button", { name: "Copy share information", exact: true })).toBeVisible();
    await rest(l);
    await capture(l, "share-dark");
  } finally {
    try { if (l) await quit(l); } finally { closeApp(l); }
  }
});

test("D-223: publishing a note with its picture to a public site", async () => {
  test.setTimeout(180_000);
  const dirs = tempDirs();
  const root = join(dirs.docs, "Journal");
  const note = join(root, "notes", "walks", "first-light.md");
  write(join(root, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  write(note, FIRST_LIGHT.replace("](first-light.jpg", "](../../assets/images/first-light.jpg"));
  write(join(root, "notes", "Reading list.md"), "# Reading list\n\n- Bird by Bird\n- Draft No. 4\n");
  mkdirSync(join(root, "assets", "images"), { recursive: true });
  copyFileSync(HILLS, join(root, "assets", "images", "first-light.jpg"));
  write(join(root, "access.json"), `${JSON.stringify({ version: 1, grants: [] }, null, 2)}\n`);
  write(join(root, ".focus-notes", "site-pairing.json"), JSON.stringify({ version: 1, project: `${ACCOUNT.login}/journal`, owner: ACCOUNT.login, name: "journal-site",
    intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: `https://${ACCOUNT.login}.github.io/journal-site/` }));
  const bare = join(dirs.userData, "journal.git").replace(/\\/g, "/");
  git(root, "init", "-q", "-b", "main");
  configure(root);
  git(dirs.userData, "init", "-q", "--bare", "-b", "main", bare);
  git(root, "remote", "add", "origin", `https://github.com/${ACCOUNT.login}/journal.git`);
  git(root, "config", `url.${bare}.insteadOf`, `https://github.com/${ACCOUNT.login}/journal.git`);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Start");
  git(root, "push", "-q", "-u", "origin", "main");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", focusMode: false, projectIntroSeen: true, lastNotePath: note }));
  windowAt(dirs.userData);
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: ACCOUNT.login, name: "journal-site", files: [".github/workflows/pages.yml"] });
  const fake = await serveFakeGitHub(github);
  let l: Launched | undefined;
  try {
    l = await launch({ userData: dirs.userData, docs: root }, { FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "" }, { args: ARGS });
    await exact?.(l);
    const { page } = l;
    await l.app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("ridge path");
    await expect.poll(() => page.locator("img[alt='Rolling hills under a pale morning sun']").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press(`${mod}+Home`);
    await page.keyboard.press(`${mod}+.`);
    await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Publish/ });
    await expect(dialog).toContainText("Publish “First light” on your public site?");
    await rest(l);
    await capture(l, "publish-light");
  } finally {
    try { if (l) await quit(l); } finally { closeApp(l); await fake.close(); }
  }
});
