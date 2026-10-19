/**
 * M5 journey for local diagnostics (WP-5.7: QLT-04, D-55, D-140): Settings → About shows what the
 * diagnostic report includes, one card per part; Copy diagnostic report puts it on the clipboard
 * (in memory here); Save diagnostic report… from Spotlight writes it where the person chooses. The
 * report has the versions, Git, the workspace's two repositories, the recovery journal, compositing,
 * and recent problems, and never a note's text or name, the workspace's folder, a remote's address,
 * or the identity's email. Local bare remotes only: nothing touches the network.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, mkdtempSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { git, instance, write } from "./instance.ts";
import { BUDGETS, anchorScore, economyScore } from "./visual-score.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const clipboard = (l: { app: import("@playwright/test").ElectronApplication }) => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
const SECRET_LINE = "The surprise party for Grace is on Friday";
const TYPED = "Unsaved words about the garden gate";
/** The private repository's name and the identity: never in a report (D-140). */
const PRIVATE_REPO = "ada-secret-journal";
const IDENTITY = "Ada Lovelace";

/** What a report must never hold: note text and names, the folders, the remotes, the identity. */
function expectPrivate(report: string, dirs: { docs: string; userData: string }, remotes: string[]) {
  for (const bad of [SECRET_LINE, "surprise", TYPED, "garden", "party.md", "hello.md", "welcome.md", dirs.docs, dirs.userData, ...remotes, "test@example.com", "access.json", PRIVATE_REPO, IDENTITY, "Lovelace"]) {
    expect(report, bad).not.toContain(bad);
  }
}

test("QLT-04: Settings → About previews the diagnostic report; Copy and Save (from Spotlight) give it with no note text, names, paths, or addresses", async () => {
  test.setTimeout(120_000);
  const { dirs, notesRemote, privateRemote: oldPrivate } = instance();
  const priv = join(dirs.docs, "private");
  // The private repository has a name of the person's own, and so does the identity.
  const privateRemote = join(dirname(oldPrivate), `${PRIVATE_REPO}.git`);
  renameSync(oldPrivate, privateRemote);
  git(priv, "remote", "set-url", "origin", privateRemote);
  git(priv, "config", "user.name", IDENTITY);
  write(join(priv, "notes", "party.md"), `# Party\n\n${SECRET_LINE}\n`);
  git(priv, "add", "-A");
  git(priv, "commit", "-q", "-m", "Add a note");
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  const { page } = l;
  const settings = page.getByRole("dialog", { name: "Settings" });
  try {
    const note = page.getByRole("textbox", { name: "Note" });
    await expect(note).toBeVisible();
    await note.click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type(` ${TYPED}`);

    await page.keyboard.press(`${mod}+,`);
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "About" }).click();
    await expect(settings.getByRole("heading", { name: "Diagnostic report" })).toBeVisible();
    for (const part of ["Recovery journal", "Compositing", "Recent problems", "2 repositories", "Git Credential Manager|Another credential helper, or none"]) {
      await expect(settings.getByText(new RegExp(`^(${part})$`))).toBeVisible();
    }
    await expect(settings.getByText(/^Focus Notes \d/)).toBeVisible();
    await expect(settings.getByText("Never included: note text, names, paths, emails, passwords, keys, or tokens.")).toBeVisible();
    expect(await settled(page).then(() => axeViolations(page))).toEqual([]);

    // Copy: the report, on the clipboard.
    await settings.getByRole("button", { name: "Copy diagnostic report" }).click();
    // The report is built afresh, Git probes included: 1 to 2 s, past 5 s on a busy machine.
    await expect(page.getByText("Diagnostic report copied")).toBeVisible({ timeout: 15_000 });
    const copied = await clipboard(l);
    expect(copied).toContain("## Focus Notes diagnostic report");
    expect(copied).toContain(`- Focus Notes ${(JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as { version: string }).version}`);
    expect(copied).toMatch(/- Git \d+\.\d+/);
    expect(copied).toContain("- notes repository: remote other");
    expect(copied).toContain("- private repository: remote other");
    expect(copied).toMatch(/- Compositing: (GPU|software)/);
    expect(copied).toContain("### Recovery journal");
    expect(copied).toContain("### Recent problems");
    expectPrivate(copied, dirs, [notesRemote, privateRemote]);

    // Report a problem: the report on the clipboard, and the issue form opened at a fixed address without it.
    await l.app.evaluate(({ shell }) => {
      (globalThis as { opened?: string[] }).opened = [];
      shell.openExternal = (async (u: string) => void (globalThis as { opened?: string[] }).opened!.push(u)) as typeof shell.openExternal;
      (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard!.text = "";
    });
    // D-203: it opens Send feedback on Problem with the report attached; signed out, it continues on GitHub.
    await settings.getByRole("button", { name: "Report a problem…" }).click();
    const feedback = page.getByRole("dialog", { name: "Send feedback" });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByRole("radio", { name: "Problem" })).toBeChecked();
    await expect(feedback.getByRole("button", { name: "Attach diagnostic report" })).toHaveAttribute("aria-pressed", "true");
    await expect(feedback.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("The app closed");
    await feedback.getByRole("button", { name: "Continue on GitHub" }).click();
    // Built afresh again, as Copy is.
    await expect(page.getByText("Report copied. Paste it into the issue.")).toBeVisible({ timeout: 15_000 });
    await expect(feedback).toHaveCount(0);
    const opened = await l.app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/github\.com\/prabinpebam\/focus-notes\/issues\/new\?/);
    expect(new URL(opened[0]!).searchParams.get("title")).toBe("The app closed");
    expect(decodeURIComponent(opened[0]!)).not.toContain("Focus Notes diagnostic report");
    expect(await clipboard(l)).toContain("## Focus Notes diagnostic report");

    // Save, from Spotlight: the system's dialog is answered with a file in a temporary folder.
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    // The first answer is inside the workspace: refused, and the dialog asks again.
    const file = join(mkdtempSync(join(tmpdir(), "fn-diag-")), "report.md");
    const inside = join(dirs.docs, "notes", "report.md");
    await l.app.evaluate(({ dialog }, [first, second]) => {
      const answers = [first, second];
      (globalThis as { saveAsked?: unknown[] }).saveAsked = [];
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        (globalThis as { saveAsked?: unknown[] }).saveAsked!.push(args.at(-1));
        return { canceled: false, filePath: answers.shift() };
      }) as typeof dialog.showSaveDialog;
    }, [inside, file] as const);
    await page.keyboard.press(`${mod}+/`);
    const spotlight = page.getByRole("dialog", { name: "Spotlight" });
    await spotlight.getByRole("combobox").fill("Save diagnostic report");
    await expect(spotlight.locator("[role=option][aria-selected=true]")).toContainText("Save diagnostic report");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Diagnostic report saved")).toBeVisible();
    expect(existsSync(inside)).toBe(false);
    const asked = await l.app.evaluate(() => (globalThis as { saveAsked?: { properties?: string[] }[] }).saveAsked ?? []);
    expect(asked).toHaveLength(2);
    expect(asked[0]!.properties).toContain("showOverwriteConfirmation");
    const saved = readFileSync(file, "utf8");
    expect(saved).toContain("## Focus Notes diagnostic report");
    expectPrivate(saved, dirs, [notesRemote, privateRemote]);
  } finally {
    await quit(l);
  }
});

test("D-127: Settings → About scores VVS ≥ 70 on the measured criteria, light and dark", async () => {
  test.setTimeout(90_000);
  const { dirs } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("tab", { name: "About" }).click();
    await expect(settings.getByText("Recovery journal")).toBeVisible();
    const scores: string[] = [];
    for (const mode of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      // The app follows the system's scheme through the shell, not the page's media query.
      await l.app.evaluate(({ nativeTheme }, m) => { nativeTheme.themeSource = m; }, mode);
      await settled(page);
      // The tab panel is the region measured: the section, without the category list.
      const m = await settings.getByRole("tabpanel").evaluate((region: HTMLElement) => {
        const count = (t: string) => (t.match(/\S+/g) ?? []).length;
        const personal = [...region.querySelectorAll("[data-personal]")].reduce((n, el) => n + count((el as HTMLElement).innerText), 0);
        let anchor = 0;
        for (const el of region.querySelectorAll("[data-app-mark], [data-visual-anchor]")) {
          const r = el.getBoundingClientRect();
          anchor = Math.max(anchor, Math.min(r.width, r.height));
        }
        return { words: count(region.innerText) - personal, anchor: Math.round(anchor) };
      });
      const a = anchorScore(m.anchor), e = economyScore(m.words, 0, BUDGETS.settings);
      if (process.env.FOCUS_NOTES_DIAG_SHOTS) await page.screenshot({ path: join(process.env.FOCUS_NOTES_DIAG_SHOTS, `about-${mode}.png`) });
      scores.push(`${mode}: anchor ${a}/20 (${m.anchor}px), economy ${e}/20 (${m.words} words)`);
      expect(a, scores.join("; ")).toBeGreaterThanOrEqual(10);
      expect(e, scores.join("; ")).toBeGreaterThanOrEqual(10);
    }
    console.log(`VVS about: ${scores.join("; ")}`);
  } finally {
    await quit(l);
  }
});
