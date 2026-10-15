/**
 * PRF-13, D-149: no step of setup waits in silence. Each wait is slowed through the journeys' slow-down
 * (`globalThis.focusNotesSlow` in the main process, read only with FOCUS_NOTES_E2E and never in a
 * packaged app), then its sign and words are checked at their place and times: nothing before
 * `wait.signDelay` (300 ms), the words after it, the elapsed time after `wait.elapsedDelay` (3 s),
 * and the title bar band still drags the window throughout. GitHub is the fake, its repositories
 * local bare remotes; nothing touches the network.
 */
import { test, expect } from "./fixtures.ts";
import type { Page } from "@playwright/test";
import { bandProblems, quit, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, press, start, world } from "./github-world.ts";

test.describe.configure({ mode: "serial" });

const slow = (l: Launched, delays: Record<string, number>) =>
  l.app.evaluate((_electron, d) => void ((globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow = d), delays);

/** The wait's words show at their place, never before the sign's delay, and the window can still be moved. */
async function named(page: Page, words: RegExp, since: number, where: string) {
  await expect(card(page).getByText(words).first()).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - since, `${where}: nothing shows before wait.signDelay`).toBeGreaterThanOrEqual(280);
  expect(await bandProblems(page, where)).toEqual([]);
}
/** Past wait.elapsedDelay the words add the seconds waited. */
const counts = (page: Page, words: string) =>
  expect(card(page).getByText(new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.* · \\d+ s$`)).first()).toBeVisible({ timeout: 6_000 });

test("PRF-13: reading the account, finding the notes, downloading and opening them each say what they wait for, with skeletons and the elapsed time", async () => {
  test.setTimeout(150_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  existingInstance(w);
  const l = await start(w);
  const { page } = l;
  try {
    await slow(l, { "firstRun:account": 4500, "firstRun:repositories": 7000, "firstRun:clone": 4500, "firstRun:openWorkspace": 1500 });
    await heading(page, "A quiet place to write");
    let t = Date.now();
    await press(page, "Enter");

    // Reading the account: the profile card's skeleton and "Connecting to your account…".
    await named(page, /^Connecting to your account…/, t, "reading the account");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(1);
    await counts(page, "Connecting to your account…");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 10_000 });
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(0);

    // Finding the notes, already asked at Connect: three skeleton rows and the words, then the seconds.
    t = Date.now();
    await press(page, "Enter");
    await named(page, /^Looking for your notes on GitHub…/, t, "finding the notes");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(3);
    await counts(page, "Looking for your notes on GitHub…");

    // Downloading: the part with its number, then the seconds; then opening them.
    await heading(page, "We found your notes");
    await expect(card(page).locator("[data-skeleton]")).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Open", exact: true })).toBeFocused();
    t = Date.now();
    await press(page, "Enter");
    await named(page, /^Downloading your notes · 1 of 3/, t, "downloading the notes");
    await counts(page, "Downloading your notes · 1 of 3");
    await expect(card(page).getByText(/^Opening your notes…/)).toBeVisible({ timeout: 10_000 });
    expect(await bandProblems(page, "opening the notes")).toEqual([]);
    await heading(page, "Ready");
  } finally {
    await quit(l);
    w.server.close();
  }
});

test("PRF-13: creating the notes always shows its parts in plain words and the one it's on, with its number and the elapsed time", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await start(w);
  const { page } = l;
  try {
    await slow(l, { "setup:instance": 4000 });
    await heading(page, "A quiet place to write");
    await press(page, "Enter");
    await expect(page.getByRole("button", { name: "Continue as Ada" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");
    await heading(page, "Create your notes");
    await expect(page.getByRole("button", { name: "Create my notes" })).toBeFocused({ timeout: 15_000 });
    await press(page, "Enter");

    // The parts, without Show details, and the one it's on in words with its number, then the seconds.
    await expect(card(page).getByText("Making your notes on GitHub · 2 of 9", { exact: true })).toBeVisible({ timeout: 15_000 });
    for (const part of ["Sign in to GitHub", "Make your notes on GitHub", "Download to this computer", "Turn on your website", "Save to GitHub"]) {
      await expect(card(page).getByText(part, { exact: true })).toBeVisible();
    }
    await expect(card(page).getByRole("button", { name: "Show details" })).toHaveCount(0);
    expect(await bandProblems(page, "creating the notes")).toEqual([]);
    await counts(page, "Making your notes on GitHub · 2 of 9");
    await expect(card(page).getByText("Backing up carries on in the background.")).toBeVisible({ timeout: 60_000 });
  } finally {
    await quit(l);
    w.server.close();
  }
});
