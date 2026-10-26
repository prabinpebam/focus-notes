/**
 * The Microsoft Store's screenshots (D-223, replacing D-202 (11)'s 1920 × 1080 window): the demo
 * workspace and the setup with GitHub, in a smaller window drawn at twice the scale, so the
 * listing's 2560 × 1440 images show the writing at a size people can read. Each capture is the
 * app's own window (webContents.capturePage, never the screen, D-141), lossless with its shadow's
 * alpha; tools/release/store-screenshots.py sets them on a backdrop, and lays the four `cascade-*`
 * windows (themes and fonts) over each other.
 *
 * Opt in with `FOCUS_NOTES_CAPTURE_STORE=1` (and `FOCUS_NOTES_E2E=1`); `FOCUS_NOTES_STORE_OUT` names
 * the folder. The `store` review catalogue runs it on CI, where the drawn window is resized to exactly
 * WINDOW (`gh workflow run review-captures.yml -f catalog=store`); a local run is a preview whose
 * window is WINDOW with its shadow margin inside.
 */
import { test, expect, screenAllowed, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, type Launched } from "./helpers.ts";
import { spotlight, files, reset, mod } from "./surfaces.ts";
import { card, heading, repoRoot, world, type World } from "./github-world.ts";
import { network, picture } from "./fre-fakes.ts";
import { captureWindow, exactSize, fullNote, openThemes, startDemo } from "./scene-capture.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_STORE !== "1", "Opt in with FOCUS_NOTES_CAPTURE_STORE=1");

/** The drawn window, in the app's own pixels; captured at SCALE, so 2240 × 1440 device pixels. */
const WINDOW = { width: 1120, height: 720 };
const SCALE = 2;
const ARGS = [`--force-device-scale-factor=${SCALE}`];
const OUT = process.env.FOCUS_NOTES_STORE_OUT ?? join(repoRoot, "test-results", "store-capture");
const exact = screenAllowed() ? (l: Launched) => exactSize(l, WINDOW) : undefined;
const capture = (l: Launched, name: string, opts?: { hover?: boolean }) => captureWindow(l, OUT, name, opts);

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

test("D-223: the note, Spotlight, Files and Themes", async () => {
  test.setTimeout(180_000);
  const l = await startDemo({ size: WINDOW, theme: "light", state: { appearance: "light", focusMode: false }, args: ARGS, exact });
  const { page } = l;
  await fullNote(page);
  await capture(l, "note-light");
  await spotlight(page, `${mod}+Slash`);
  await page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox").fill("gar");
  await page.waitForTimeout(600);
  await capture(l, "spotlight-light");
  await reset(page);
  await files(page);
  await capture(l, "files-light");
  await reset(page);
  await openThemes(page);
  await capture(l, "themes-light");
  await quit(l);
});

test("D-223: one note in four themes and fonts, for the cascade", async () => {
  test.setTimeout(300_000);
  for (const [i, look] of CASCADE.entries()) {
    const l = await startDemo({ size: WINDOW, theme: look.appearance, state: { ...look, focusMode: false }, args: ARGS, exact });
    await fullNote(l.page);
    await expect.poll(() => l.page.evaluate(() => document.documentElement.style.colorScheme)).toBe(look.appearance);
    await capture(l, `cascade-${i + 1}`);
    await quit(l);
  }
});

/** A new install in a fake GitHub, already signed in to Git as Ada with her picture known, at WINDOW. */
async function newInstall(w: World): Promise<Launched> {
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: "light" }));
  writeFileSync(join(w.dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: WINDOW.width, height: WINDOW.height } }));
  w.fakes.store(w.gh.token);
  writeFileSync(join(w.dirs.userData, "avatar.json"), JSON.stringify({ version: 1, id: w.gh.id, data: picture() }));
  const l = await launch(w.dirs, w.env, { firstRun: true, args: ARGS });
  // Pages a person would open in their browser are recorded instead, as in github-world's start().
  await l.app.evaluate(({ shell }) => {
    shell.openExternal = async () => {};
  });
  await exact?.(l);
  return l;
}

const button = (page: Page, name: string | RegExp) => card(page).getByRole("button", { name, exact: typeof name === "string" });
const text = (page: Page, t: string | RegExp) => card(page).getByText(t).first();
/** No focus ring in a listing's picture. */
const rest = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test("D-223: setting up with GitHub: Welcome, Connect, Create my notes, creating, and backing up", async () => {
  test.setTimeout(300_000);
  const w = await world({ gcm: true });
  const net = network(w);
  const l = await newInstall(w);
  const { page } = l;
  try {
    await heading(page, "A quiet place to write");
    await expect(button(page, "Get started")).toBeFocused();
    await rest(page);
    await capture(l, "setup-welcome");

    await button(page, "Get started").click();
    await expect(button(page, "Continue as Ada")).toBeFocused({ timeout: 20_000 });
    await rest(page);
    await capture(l, "setup-connect");

    await button(page, "Continue as Ada").click();
    const create = button(page, /^Create my notes/);
    await expect(create).toBeFocused({ timeout: 20_000 });
    await rest(page);
    await capture(l, "setup-create");

    // Held at the deploy key, so it's mid-way.
    const keys = net.hold("POST /repos/ada/notes-private/keys");
    await create.click();
    await heading(page, "Creating your notes");
    await keys.reached;
    await expect(text(page, "Letting your website read them · 4 of 9")).toBeVisible();
    await capture(l, "setup-creating");
    // Still mid-way when captured: the held request hasn't timed out into an error.
    await expect(page.locator('[data-status-row="danger"]')).toHaveCount(0);
    keys.release();
    await expect(text(page, "Backing up carries on in the background.")).toBeVisible({ timeout: 90_000 });
    await expect(text(page, /^Your site:/)).toBeVisible({ timeout: 30_000 });

    await button(page, "Continue").click();
    await heading(page, "Ready");
    await button(page, "Start writing").click();
    await expect(card(page)).toHaveCount(0);
    const note = page.getByRole("textbox", { name: "Note" });
    await expect(note).toBeFocused({ timeout: 15_000 });
    // A first note, backed up from the Backup popover; the scene is the popover once it's done.
    await page.keyboard.type("# Monday morning");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A first note, kept on this computer and backed up to my own GitHub repository.");
    const pill = page.locator("#saveState");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    const backup = page.getByRole("dialog", { name: "Backup", exact: true });
    await pill.hover();
    await backup.getByRole("button", { name: "Backup to GitHub", exact: true }).click();
    await expect(backup.getByText("No changes waiting for backup")).toBeVisible({ timeout: 60_000 });
    await expect(backup.getByText(/^Last backup:/)).toBeVisible();
    await pill.hover();
    await capture(l, "setup-backup", { hover: true });
  } finally {
    await quit(l).catch(() => {});
    w.server.close();
  }
});
