/**
 * PKG-13, D-228: the Microsoft Store package's own Git. With FOCUS_NOTES_E2E_EXE set to an unpacked
 * Store build (`win-unpacked\focus-notes.exe` with `resources\git`), and no other Git on PATH, the
 * app finds the Git it carries, and the first run offers nothing to install: no install button,
 * command or link, and the shell refuses the pages that would. A damaged bundle says to repair the
 * app. Skipped on any other build, so the suite runs as usual.
 *
 * Never a real account: as in every journey, Git's global settings are a throwaway file and its
 * system settings are off (helpers.ts), so no sign-in helper is set and Git Credential Manager never
 * runs; its store is pointed at a temporary folder and it may never ask, in case anything did.
 */
import { test, expect } from "./fixtures.ts";
import { cpSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import { launch, quit, tempDirs } from "./helpers.ts";

const exe = process.env.FOCUS_NOTES_E2E_EXE ?? "";
const bundled = (file: string) => existsSync(join(dirname(file), "resources", "git", "cmd", "git.exe"));
test.skip(process.platform !== "win32" || !exe || !bundled(exe), "runs on an unpacked Store build that carries Git (FOCUS_NOTES_E2E_EXE)");
test.describe.configure({ mode: "serial" });

const windows = process.env.SystemRoot ?? "C:\\Windows";
/** No Git, no GitHub CLI and no sign-in helper anywhere on PATH: only Windows itself. */
const noOtherGit = (): Record<string, string> => ({
  PATH: [join(windows, "System32"), windows, join(windows, "System32", "WindowsPowerShell", "v1.0")].join(";"),
  GCM_CREDENTIAL_STORE: "plaintext",
  GCM_PLAINTEXT_STORE_PATH: mkdtempSync(join(tmpdir(), "fn-gcm-")),
  GCM_INTERACTIVE: "never",
  GIT_TERMINAL_PROMPT: "0",
});

const setup = (page: Page) => page.getByRole("main", { name: "Set up Focus Notes" });
const INSTALL_ROUTES = /^(Install( Git| the sign-in helper)?|Update Git|Get the GitHub CLI|Copy( command)?)$/;

/** What the shell opened in the browser, from here on (the pages a person is sent to). */
async function watchOpened(app: Awaited<ReturnType<typeof launch>>["app"]): Promise<() => Promise<string[]>> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    shell.openExternal = (async (url: string) => void g.__opened.push(url)) as typeof shell.openExternal;
  });
  return () => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);
}

test("PKG-13: the Store package finds its own Git with no other Git on the computer, and its first run offers nothing to install", async () => {
  test.setTimeout(90_000);
  const l = await launch(tempDirs(), noOtherGit(), { firstRun: true });
  const { page, app } = l;
  try {
    const check = await page.evaluate(() => window.focusNotes.firstRun!.git());
    expect(check).toMatchObject({ installed: true, ok: true, bundled: true, gh: false });
    expect(check.version).toMatch(/^2\.56\.0/);
    const opened = await watchOpened(app);

    await expect(page.getByRole("button", { name: "Get started", exact: true })).toBeFocused({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    // Git's system settings are off here, so no sign-in helper is set: the person is told to turn it
    // back on, with only Check again, never an install.
    await expect(setup(page).getByRole("heading")).toHaveText("Turn on the sign-in helper", { timeout: 20_000 });
    await expect(setup(page).getByText("Git's sign-in helper is turned off in your Git settings. Turn it back on, then check again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
    for (const name of await setup(page).getByRole("button").allInnerTexts()) expect(name.trim()).not.toMatch(INSTALL_ROUTES);
    await expect(setup(page).getByText(/winget/)).toHaveCount(0);

    // Whatever asks, the shell opens none of the pages that offer other software.
    for (const p of ["git", "gcm", "gh"] as const) await page.evaluate((x) => window.focusNotes.firstRun!.openPage(x), p);
    await page.evaluate(() => window.focusNotes.firstRun!.openPage("token"));
    await expect.poll(opened).toEqual([expect.stringMatching(/^https:\/\/github\.com\//)]);
  } finally {
    await quit(l);
  }
});

test("PKG-13: a Store package whose Git won't start says to repair Focus Notes, never to install Git", async () => {
  test.setTimeout(120_000);
  const original = exe;
  const folder = mkdtempSync(join(tmpdir(), "fn-store-broken-"));
  cpSync(dirname(original), folder, { recursive: true });
  // Not a program any more: Windows refuses to start it (EFTYPE), as a damaged install would.
  writeFileSync(join(folder, "resources", "git", "cmd", "git.exe"), "not a program");
  process.env.FOCUS_NOTES_E2E_EXE = join(folder, "focus-notes.exe");
  let l: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    l = await launch(tempDirs(), noOtherGit(), { firstRun: true });
    const { page } = l;
    expect(await page.evaluate(() => window.focusNotes.firstRun!.git())).toMatchObject({ installed: false, ok: false, bundled: true });
    await expect(page.getByRole("button", { name: "Get started", exact: true })).toBeFocused({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    await expect(setup(page).getByRole("heading")).toHaveText("Focus Notes can't start Git", { timeout: 20_000 });
    await expect(setup(page).getByText("Repair Focus Notes in Windows Settings → Apps → Installed apps, then check again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeFocused();
    for (const name of await setup(page).getByRole("button").allInnerTexts()) expect(name.trim()).not.toMatch(INSTALL_ROUTES);
    await expect(setup(page).getByText(/winget/)).toHaveCount(0);
  } finally {
    process.env.FOCUS_NOTES_E2E_EXE = original;
    if (l) await quit(l);
  }
});
