/**
 * M5 journey for sharing (WP-5.3: SHR-05, SHR-07, SHR-08, SHR-09, D-134): in Settings → Sharing the
 * owner shares a folder by link and a note by passcode, copies the invites, changes what one opens,
 * and withdraws the other, with the keyboard for the confirmation. `private/access.json` then holds
 * the expected grants, the commit reaches the private remote only, no secret reaches the public
 * repository, and the real publisher seals the result so SiteReader opens the link and the passcode.
 * Local bare remotes only: nothing touches the network.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { publish } from "../../../packages/seal/src/publish.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import { parseShareFragment, type AccessFile } from "../../../packages/seal/src/grants.ts";
import { launch, quit } from "./helpers.ts";
import { axeViolations } from "./axe.ts";
import { git, instance, write } from "./instance.ts";
import { BUDGETS, anchorScore, economyScore } from "./visual-score.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const SITE = "https://ada.github.io/notes/";
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
const settledAxe = async (page: Page) => (await settled(page), axeViolations(page));
const clipboard = (l: { app: import("@playwright/test").ElectronApplication }) => l.app.evaluate(({ clipboard: c }) => c.readText());
const shot = process.env.FOCUS_NOTES_SHARE_SHOTS;
async function capture(page: Page, name: string) {
  if (!shot) return;
  await settled(page);
  await page.screenshot({ path: join(shot, `${name}.png`) });
}

test("SHR-05, SHR-07, SHR-08, SHR-09: share by link and by passcode, copy the invites, change what one opens, withdraw the other; access.json is right, private, and publishes", async () => {
  test.setTimeout(180_000);
  const { dirs, notesRemote, privateRemote } = instance();
  const priv = join(dirs.docs, "private");
  write(join(priv, "notes", "trips", "rome.md"), "# Rome\n\nThe trip plan.\n");
  write(join(priv, "notes", "diary.md"), "# Diary\n\nDear diary.\n");
  git(priv, "add", "-A");
  git(priv, "commit", "-q", "-m", "Add notes");
  // Setup found the Pages site (D-124): links are made for it.
  writeFileSync(join(dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site: SITE, steps: {} }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000", FOCUS_NOTES_POINTER_GAP_MS: "0" });
  const { page } = l;
  const settings = page.getByRole("dialog", { name: "Settings" });
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(`${mod}+,`);
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Sharing" }).click();
    await expect(settings.getByRole("heading", { name: "People with access" })).toBeVisible();
    await expect(settings.getByText("Only you can read your private notes")).toBeVisible();
    await expect(settings.getByText("Changes are live after your next backup and publish.")).toBeVisible();
    expect(await settledAxe(page)).toEqual([]);
    await capture(page, "sharing-empty");

    // ---- by link: the trips folder ----
    await settings.getByRole("button", { name: "Share with someone" }).click();
    const editor = page.getByRole("dialog", { name: "Share with someone" });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("textbox", { name: "Name" })).toBeFocused();
    await page.keyboard.type("Asha");
    await editor.getByRole("button", { name: "Passcode", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Passcode", exact: true })).toHaveAttribute("aria-pressed", "false");
    // The note that's open is picked to start with (Add people: "this note (checked)").
    await expect(editor.getByRole("button", { name: "Welcome", exact: true })).toHaveAttribute("aria-pressed", "true");
    await editor.getByRole("button", { name: "Welcome", exact: true }).click();
    await editor.getByRole("button", { name: "trips", exact: true }).click();
    await expect(editor.getByText("1 picked")).toBeVisible();
    expect(await settledAxe(page)).toEqual([]);
    await capture(page, "sharing-editor");
    await editor.getByRole("button", { name: "Share", exact: true }).click();
    const invite = page.getByRole("dialog", { name: "Invite Asha" });
    await expect(invite).toBeVisible();
    await expect(invite.getByText(/^Open it here: https:\/\/ada\.github\.io\/notes\/s\/#s/)).toBeVisible();
    await invite.getByRole("button", { name: "Copy invite" }).click();
    await expect(invite.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(invite.getByText("Invite copied")).toBeVisible();
    const asha = await clipboard(l);
    expect(asha).toMatch(/^Hi Asha, I've shared "trips" with you\.\nOpen it here: https:\/\/ada\.github\.io\/notes\/s\/#s[a-z2-7]{16}\.[A-Za-z0-9_-]{43}\nIt works until /);
    expect(asha).not.toContain("passcode");
    expect(await settledAxe(page)).toEqual([]);
    await capture(page, "sharing-invite-link");
    await invite.getByRole("button", { name: "Done" }).click();
    await expect(settings).toBeVisible();
    const ashaRow = settings.getByRole("group", { name: "Access for Asha" });
    await expect(ashaRow.getByText("Expires in 30 days")).toBeVisible();
    await expect(ashaRow.getByText("trips/ · Link")).toBeVisible();

    // ---- by passcode: the diary, a duplicate name refused first ----
    await settings.getByRole("button", { name: "Share with someone" }).click();
    await page.keyboard.type("ASHA");
    await editor.getByRole("button", { name: "Link", exact: true }).click();
    await editor.getByRole("button", { name: "Welcome", exact: true }).click();
    await editor.getByRole("button", { name: "Diary", exact: true }).click();
    await editor.getByRole("button", { name: "Share", exact: true }).click();
    await expect(editor.getByText("There's already someone called ASHA with access. Use another name, or change theirs.")).toBeVisible();
    await editor.getByRole("textbox", { name: "Name" }).fill("Book club");
    await editor.getByRole("button", { name: "Share", exact: true }).click();
    const invite2 = page.getByRole("dialog", { name: "Invite Book club" });
    await expect(invite2).toBeVisible();
    await invite2.getByRole("button", { name: "Copy passcode" }).click();
    const passcode = await clipboard(l);
    expect(passcode).toMatch(/^[a-z]+(-[a-z]+){3}$/);
    await invite2.getByRole("button", { name: "Copy invite" }).click();
    expect(await clipboard(l)).toContain(`Or go to ${SITE}s/ and use your name "Book club" with the passcode ${passcode}.`);
    await capture(page, "sharing-invite-passcode");
    await invite2.getByRole("button", { name: "Done" }).click();
    await capture(page, "sharing-list");

    // ---- change what Asha opens ----
    await ashaRow.getByRole("button", { name: "More for Asha" }).click();
    await page.getByRole("menuitem", { name: "Change…" }).click();
    const change = page.getByRole("dialog", { name: "Change access for Asha" });
    await expect(change).toBeVisible();
    await change.getByRole("button", { name: "Diary", exact: true }).click();
    await change.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Invite Asha" }).getByRole("button", { name: "Done" }).click();
    await expect(ashaRow.getByText("trips/ and 1 more · Link")).toBeVisible();

    // ---- withdraw Book club, with the keyboard: Cancel has focus, Tab, Enter ----
    const club = settings.getByRole("group", { name: "Access for Book club" });
    await club.getByRole("button", { name: "More for Book club" }).click();
    await page.getByRole("menuitem", { name: "Withdraw…" }).click();
    const confirm = page.getByRole("dialog", { name: "Withdraw access for Book club?" });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    expect(await settledAxe(page)).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(confirm.getByRole("button", { name: "Withdraw" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(club.getByText("Withdrawn")).toBeVisible();
    await expect(club.getByRole("button", { name: "Invite" })).toHaveCount(0);

    // ---- access.json: the expected grants, committed to the private repository only ----
    const access = JSON.parse(readFileSync(join(priv, "access.json"), "utf8")) as AccessFile;
    const [a, b] = access.grants;
    expect(a).toMatchObject({ name: "Asha", scope: { folders: ["trips"], notes: ["diary.md"] } });
    expect(a!.link?.secret).toHaveLength(43);
    expect(a!.passcode).toBeUndefined();
    expect(b).toMatchObject({ name: "Book club", scope: { notes: ["diary.md"] }, passcode: { value: passcode, generated: true } });
    expect(b!.revokedAt).toBeTruthy();
    expect(asha).toContain(`#${a!.id}.${a!.link!.secret}`);
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${mod}+S`);
    await expect.poll(() => { try { return git(privateRemote, "show", "main:access.json"); } catch { return ""; } }, { timeout: 30_000 }).toContain(a!.link!.secret);
    const publicHistory = git(notesRemote, "log", "-p", "--all");
    for (const secret of [a!.link!.secret, passcode, a!.salt]) expect(publicHistory).not.toContain(secret);

    // ---- the real publisher seals it, and SiteReader opens the link; the withdrawn passcode opens nothing ----
    const site = mkdtempSync(join(tmpdir(), "fn-share-site-"));
    const r = await publish({ site, notes: join(dirs.docs, "notes"), private: priv, owner: "ada" });
    expect(r.shares).toBe(1);
    const reader = new SiteReader(async (p) => readFile(join(site, ...p.split("/").map(decodeURIComponent)), "utf8").catch(() => undefined));
    const frag = parseShareFragment(new URL(/https:\S+/.exec(asha)![0]).hash)!;
    const opened = await reader.openLink(frag.id, frag.secret);
    expect(opened.notes.map((n) => n.title).sort()).toEqual(["Diary", "Rome"]);
    expect(await opened.read(opened.notes.find((n) => n.title === "Rome")!.path)).toContain("The trip plan.");
    await expect(reader.openPasscode("Book club", passcode)).rejects.toThrow();
  } finally {
    await quit(l);
  }
});

test("D-127: Settings → Sharing and its dialogs score VVS ≥ 70 on the measured criteria, light and dark", async () => {
  test.setTimeout(120_000);
  const { dirs } = instance();
  writeFileSync(join(dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site: SITE, steps: {} }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("tab", { name: "Sharing" }).click();
    await expect(settings.getByText("Only you can read your private notes")).toBeVisible();
    const scores: string[] = [];
    for (const mode of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await settled(page);
      // The measure reads the setup landmark; here the dialog is the region measured.
      const m = await settings.evaluate((region: HTMLElement) => {
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
      scores.push(`${mode}: anchor ${a}/20 (${m.anchor}px), economy ${e}/20 (${m.words} words)`);
      expect(a, scores.join("; ")).toBeGreaterThanOrEqual(10);
      expect(e, scores.join("; ")).toBeGreaterThanOrEqual(10);
    }
    console.log(`VVS sharing: ${scores.join("; ")}`);
  } finally {
    await quit(l);
  }
});
