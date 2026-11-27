import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { serveFakeGitHub } from "../test/fake-pages.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { configure, git, write } from "./instance.ts";

/**
 * D-436 (owner, 27 November 10:35): right after Publish a published file's globe waits in amber, with the commit
 * mark's own-border arc, until its page answers on GitHub Pages with the new build; then a green outline, then the
 * accent. A page that never goes live turns the globe to danger with the reason in its tooltip, one auto-dismiss
 * notification, and Retry publish and View on GitHub in the file's menu. GitHub and Pages are loopback fakes.
 */
const TRIP = "# Trip to the coast\n\nWe walked along the harbour wall until the light went.\n";
const ROME = "# Rome\n\nThe fountains at dusk.\n";

async function pairedProject() {
  const dirs = tempDirs();
  const root = dirs.docs, bare = join(dirs.userData, "book.git").replace(/\\/g, "/");
  write(join(root, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  write(join(root, "notes", "trip.md"), TRIP);
  write(join(root, "notes", "rome.md"), ROME);
  write(join(root, "notes", "long.md"), `# ${"A walk along the harbour wall until the light went ".repeat(4).trim()}\n\nLong.\n`);
  write(join(root, "access.json"), `${JSON.stringify({ version: 1, grants: [] }, null, 2)}\n`);
  write(join(root, ".focus-notes", "site-pairing.json"), JSON.stringify({ version: 1, project: "ada/book", owner: "ada", name: "quiet-site",
    intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/quiet-site/" }));
  git(root, "init", "-q", "-b", "main");
  configure(root);
  git(dirs.userData, "init", "-q", "--bare", "-b", "main", bare);
  git(root, "remote", "add", "origin", "https://github.com/ada/book.git");
  git(root, "config", `url.${bare}.insteadOf`, "https://github.com/ada/book.git");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "Start");
  git(root, "push", "-q", "-u", "origin", "main");
  mkdirSync(dirs.userData, { recursive: true });
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(root, "notes", "trip.md") }));
  const github = new FakeGitHub("focus-notes-local-candidate");
  github.add({ owner: "ada", name: "quiet-site", files: [".github/workflows/pages.yml"] });
  const fake = await serveFakeGitHub(github);
  return { dirs, root, fake, env: {
    FOCUS_NOTES_CANDIDATE_GITHUB_API: fake.origin, FOCUS_NOTES_CANDIDATE_SITE: "",
    // A short Publish wait (O4), quick live checks, and a short timeout, so every state shows in seconds.
    FOCUS_NOTES_PAGES_WAIT_MS: "1500", FOCUS_NOTES_LIVE_CHECK_MS: "300", FOCUS_NOTES_LIVE_TIMEOUT_MS: "6000",
  } };
}

test("D-436: a published file's globe is amber until its page is live on Pages, then green, then the accent; never live is danger with Retry", async () => {
  test.setTimeout(180_000);
  const { dirs, root, fake, env } = await pairedProject();
  let l: Launched | undefined;
  try {
    // Pages hasn't served anything new yet.
    fake.git.setStale(true);
    l = await launch(dirs, env);
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("harbour wall");
    const color = (token: string) => page.locator("[data-app-root]").first().evaluate((root, name) => {
      const s = document.createElement("span");
      s.style.color = `var(${name})`;
      (root.querySelector("[role=tree]") ?? root).append(s);
      const c = getComputedStyle(s).color;
      s.remove();
      return c;
    }, token);
    const publish = async (name: string) => {
      const row = page.getByRole("tree", { name: "Notes and folders", exact: true }).getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });
      await row.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: /Publish/ });
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await expect.poll(() => fake.git.pushes.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
    };
    const files = () => page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    await files();
    const tree = page.getByRole("tree", { name: "Notes and folders", exact: true });
    const trip = tree.getByRole("treeitem", { name: /^Trip to the coast\b/ });
    await expect(trip).toBeVisible();
    const [warning, success, danger, accent] = await Promise.all(["--fn-color-warning", "--fn-color-success", "--fn-color-danger", "--fn-color-accent"].map(color));
    await publish("Trip to the coast");
    await files();
    await expect(trip).toBeVisible();
    const globe = trip.locator('[data-badge="published"]');
    const paint = () => globe.evaluate((el) => getComputedStyle(el).color);
    // Waiting for Pages: amber, inside the pending arc, and said in words.
    await expect(globe).toHaveAttribute("data-live", "pending", { timeout: 30_000 });
    expect(await paint()).toBe(warning);
    await expect(globe.locator('[data-border-progress="pending"][data-tone="warning"]')).toHaveCount(1);
    await expect(trip).toHaveAccessibleDescription("Publishing · waiting for GitHub Pages to go live");
    // Pages serves the new build: green with its outline, held, then the accent globe with its address.
    fake.git.setStale(false);
    await expect(globe).toHaveAttribute("data-live", "confirmed", { timeout: 30_000 });
    expect(await paint()).toBe(success);
    await expect(globe.locator('[data-border-progress="confirmed"]')).toHaveCount(1);
    await expect(trip).toHaveAccessibleDescription("Published · live at ada.github.io/quiet-site/n/trip/");
    await expect(globe).not.toHaveAttribute("data-live", /./, { timeout: 10_000 });
    expect(await paint()).toBe(accent);
    await expect(trip).toHaveAccessibleDescription("Published · live at ada.github.io/quiet-site/n/trip/");
    expect(await page.evaluate(() => performance.getEntriesByName("fn:sharing.liveStatus").length)).toBeGreaterThan(0);
    // The pin has its own place at the row's end (main, 13:27, 13:58): hidden at rest, shown on hover without moving the
    // title (its slot is reserved), never under the badges, and always before the row's ⋯.
    // At rest: no hover, and focus outside the row.
    await page.mouse.move(1, 1);
    await page.getByRole("searchbox").first().focus().catch(() => page.locator("body").focus());
    await expect(trip).not.toBeFocused();
    const pinButton = trip.getByRole("button", { name: "Pin Trip to the coast", exact: true });
    const geometry = () => trip.evaluate((row) => {
      const box = (el: Element | null) => { const r = el!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const pin = row.querySelector("button[aria-label^='Pin'], button[aria-label^='Unpin']");
      return { title: box(row.querySelector("[dir=auto]")), pin: box(pin), more: box(row.querySelector("[data-row-more]")), badge: box(row.querySelector("[data-badge]")),
        pinVisible: getComputedStyle(pin!).visibility === "visible" };
    });
    const rest = await geometry();
    expect(rest.pinVisible).toBe(false);
    await trip.hover();
    const hovered = await geometry();
    expect(hovered.pinVisible).toBe(true);
    expect(hovered.title).toEqual(rest.title);
    expect(hovered.pin.right).toBeLessThanOrEqual(hovered.more.left);
    expect(hovered.pin.left >= hovered.badge.right || hovered.pin.right <= hovered.badge.left).toBe(true);
    // A long title truncates before the pin and ⋯.
    const long = tree.getByRole("treeitem", { name: /^A walk along the harbour wall/ });
    await long.hover();
    const cut = await long.evaluate((row) => { const t = row.querySelector("[dir=auto]") as HTMLElement, p = row.querySelector("button[aria-label^='Pin']")!.getBoundingClientRect(); return { truncated: t.scrollWidth > t.clientWidth, titleRight: t.getBoundingClientRect().right, pinLeft: p.left }; });
    expect(cut.truncated).toBe(true);
    expect(cut.titleRight).toBeLessThanOrEqual(cut.pinLeft);
    await trip.hover();
    await pinButton.click();
    await expect(trip.getByRole("button", { name: "Unpin Trip to the coast", exact: true })).toHaveCount(1, { timeout: 10_000 });
    // Keyboard focus on the row shows the badges' tooltip at once, the row's description word for word.
    await page.mouse.move(1, 1);
    await trip.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await expect(trip).toBeFocused();
    await expect(page.getByRole("tooltip").filter({ hasText: "Published · live at ada.github.io/quiet-site/n/trip/" })).toBeVisible();

    // A page that never goes live: danger, the reason in words, one notification, and the recovery in its menu.
    fake.git.setStale(true);
    const rome = tree.getByRole("treeitem", { name: /^Rome\b/ });
    await publish("Rome");
    await files();
    const romeGlobe = rome.locator('[data-badge="published"]');
    await expect(romeGlobe).toHaveAttribute("data-live", "pending", { timeout: 30_000 });
    await expect(romeGlobe).toHaveAttribute("data-live", "failed", { timeout: 30_000 });
    expect(await romeGlobe.evaluate((el) => getComputedStyle(el).color)).toBe(danger);
    await expect(rome).toHaveAccessibleDescription("Not live yet · GitHub Pages didn't show the change within 10 minutes");
    await expect(page.getByText(/“Rome” isn't live yet/)).toHaveCount(1);
    await rome.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Retry publish", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "View on GitHub", exact: true })).toBeVisible();
    // Retry once Pages serves again: amber, then live.
    fake.git.setStale(false);
    await page.getByRole("menuitem", { name: "Retry publish", exact: true }).click();
    await expect(romeGlobe).not.toHaveAttribute("data-live", "failed", { timeout: 30_000 });
    await expect(romeGlobe).not.toHaveAttribute("data-live", /./, { timeout: 30_000 });
    expect(JSON.parse(readFileSync(join(root, ".focus-notes", "published.json"), "utf8"))).toEqual({ version: 1, notes: ["rome.md", "trip.md"] });
  } finally {
    if (l) {
      try { await quit(l); } finally {
        if (process.platform === "win32") execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
      }
    }
    await fake.close();
  }
});
