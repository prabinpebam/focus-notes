/**
 * MW journeys (PKG-05, PKG-07, PKG-08, DST-02, FRE-09): the app on its own, local first in
 * IndexedDB, then connected to a notes repository through GitHub's API (faked here).
 */
import { test, expect, type Page } from "@playwright/test";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const TOKEN = "github_pat_" + "A".repeat(40);

async function fakeGitHub(page: Page) {
  const gh = new FakeGitHub();
  gh.token = TOKEN;
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  // GitHub's own pages (opened in new tabs) are stubbed, so they don't redirect to a sign-in page.
  await page.context().route("https://github.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>GitHub</title>" }));
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    const headers = await req.allHeaders();
    const res = await gh.fetch(req.url(), { method: req.method(), headers: { Authorization: headers["authorization"] ?? "" }, body: req.postData() ?? undefined } as RequestInit);
    await route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: await res.text() });
  });
  return { gh, hosts };
}
const mod = "Control";
/** Dialogs fade in; accessibility checks run on the settled page, not mid-fade. */
const settledAxe = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return axeViolations(page);
};
const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });

test("the app runs on its own: welcome, local notes that survive a reload, and Open", async ({ page }) => {
  await fakeGitHub(page);
  await page.goto("./");
  const welcome = page.getByRole("dialog", { name: "Welcome to Focus Notes" });
  await expect(welcome).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-welcome.png" });
  await welcome.getByRole("button", { name: "Start writing" }).click();
  await expect(welcome).toBeHidden();
  await expect(editor(page)).toContainText("Welcome to Focus Notes");

  // Write, reload: it's still there, and the welcome doesn't come back.
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Written in the browser.");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(editor(page)).toContainText("Written in the browser.");
  await expect(page.getByRole("dialog", { name: "Welcome to Focus Notes" })).toBeHidden();

  // A second note, then Open… lists both and opens the first again.
  await page.keyboard.press(`${mod}+Alt+n`);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("# Second note");
  await page.waitForTimeout(800);
  await page.keyboard.press(`${mod}+o`);
  const open = page.getByRole("dialog", { name: "Open a note" });
  await expect(open).toBeVisible();
  await expect(open.getByRole("option")).toHaveCount(2);
  await open.getByRole("combobox", { name: "Find a note" }).fill("welc");
  await expect(open.getByRole("option")).toHaveCount(1);
  expect(await settledAxe(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(open).toBeHidden();
  await expect(editor(page)).toContainText("Written in the browser.");
});

test("connect GitHub from pre-filled pages, then sync both ways and keep both versions on a conflict", async ({ page, context }) => {
  const { gh, hosts } = await fakeGitHub(page);
  gh.commitFiles({ "From GitHub.md": "# From GitHub\n\nAlready in the repository.\n" });
  await page.goto("./");
  const dialog = page.getByRole("dialog", { name: "Welcome to Focus Notes" });
  await dialog.getByRole("button", { name: "Connect GitHub…" }).click();
  const connect = page.getByRole("dialog", { name: "Connect GitHub" });

  // Step 1: the notes repository, from GitHub's own pre-filled page.
  const [repoPage] = await Promise.all([context.waitForEvent("page"), connect.getByRole("button", { name: "Create the repository on GitHub" }).click()]);
  const repoUrl = new URL(repoPage.url());
  expect(repoUrl.origin + repoUrl.pathname).toBe("https://github.com/new");
  expect(repoUrl.searchParams.get("visibility")).toBe("private");
  await repoPage.close();
  await expect(connect.getByRole("textbox", { name: "Notes repository" })).toHaveValue("notes");
  await connect.getByRole("button", { name: "Next" }).click();

  // Step 2: the token, from the pre-filled fine-grained token page.
  const [tokenPage] = await Promise.all([context.waitForEvent("page"), connect.getByRole("button", { name: "Create a token on GitHub" }).click()]);
  const tokenUrl = new URL(tokenPage.url());
  expect(tokenUrl.pathname).toBe("/settings/personal-access-tokens/new");
  expect(tokenUrl.searchParams.get("contents")).toBe("write");
  expect(tokenUrl.searchParams.get("name")).toBe("Focus Notes");
  await tokenPage.close();
  const token = connect.getByLabel("Token");
  await token.fill("not a token");
  await connect.getByRole("button", { name: "Connect" }).click();
  await expect(connect.getByText("doesn't look like a GitHub token")).toBeVisible();
  await token.fill("github_pat_" + "B".repeat(40));
  await connect.getByRole("button", { name: "Connect" }).click();
  await expect(connect.getByText("didn't accept that token")).toBeVisible();
  await token.fill(TOKEN);
  expect(await settledAxe(page)).toEqual([]);
  await connect.getByRole("button", { name: "Connect" }).click();
  await expect(connect.getByText("Connected as me to me/notes.")).toBeVisible();
  await page.screenshot({ path: "../../test-results/screens/web-connected.png" });

  // The token is stored encrypted, never as text.
  const stored = await page.evaluate(() => new Promise<string>((resolve) => {
    const r = indexedDB.open("focus-notes");
    r.onsuccess = () => {
      const g = r.result.transaction("meta").objectStore("meta").get("token");
      g.onsuccess = () => resolve(JSON.stringify(g.result, (_k, v) => (v instanceof ArrayBuffer ? `bytes:${v.byteLength}` : v)));
    };
  }));
  expect(stored).not.toContain("github_pat_");
  expect(stored).toContain("bytes:");

  await connect.getByRole("button", { name: "Start writing" }).click();
  // The repository's notes arrived; the local welcome note wasn't pushed.
  await page.keyboard.press(`${mod}+o`);
  const open = page.getByRole("dialog", { name: "Open a note" });
  await expect(open.getByRole("option", { name: /From GitHub/ })).toBeVisible();
  await open.getByRole("option", { name: /From GitHub/ }).click();
  await expect(editor(page)).toContainText("Already in the repository.");
  expect(Object.keys(gh.files())).toEqual(["From GitHub.md"]);

  // Typing here becomes a commit there.
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Typed in the browser.");
  await expect.poll(() => gh.files()["From GitHub.md"] ?? "", { timeout: 15_000 }).toContain("Typed in the browser.");

  // A change made elsewhere arrives when the page asks again (focus, timer, or Sync now).
  gh.commitFiles({ "From GitHub.md": gh.files()["From GitHub.md"]!.replace("Already", "Edited elsewhere, already") });
  await page.keyboard.press(`${mod}+.`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Sync now" }).click();
  await expect(editor(page)).toContainText("Edited elsewhere, already in the repository.");

  // Both sides change: both versions are kept, and a toast says so.
  gh.commitFiles({ "From GitHub.md": "# From GitHub\n\nRemote rewrite.\n" });
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Local addition.");
  await expect(page.getByRole("status").filter({ hasText: "Both are kept" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => Object.keys(gh.files()).sort(), { timeout: 15_000 }).toEqual(["From GitHub (conflict " + new Date().toISOString().slice(0, 10) + ").md", "From GitHub.md"]);
  expect(gh.files()["From GitHub.md"]).toContain("Local addition.");

  // Nothing went anywhere but this site and GitHub's API.
  expect([...hosts].filter((h) => h !== "127.0.0.1:4317" && h !== "api.github.com")).toEqual([]);
});

test("offline: writing goes on, and the change syncs when the connection returns", async ({ page, context }) => {
  const { gh } = await fakeGitHub(page);
  gh.commitFiles({ "Offline.md": "start\n" });
  await page.goto("./");
  await page.getByRole("dialog", { name: "Welcome to Focus Notes" }).getByRole("button", { name: "Connect GitHub…" }).click();
  const connect = page.getByRole("dialog", { name: "Connect GitHub" });
  await connect.getByRole("button", { name: "Next" }).click();
  await connect.getByLabel("Token").fill(TOKEN);
  await connect.getByRole("button", { name: "Connect" }).click();
  await connect.getByRole("button", { name: "Start writing" }).click();
  await page.keyboard.press(`${mod}+o`);
  await page.getByRole("dialog", { name: "Open a note" }).getByRole("option", { name: /Offline/ }).click();

  await context.setOffline(true);
  await editor(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("written offline");
  await page.waitForTimeout(4000);
  expect(gh.files()["Offline.md"]).toBe("start\n");
  await page.reload().catch(() => {});
  await context.setOffline(false);
  await page.reload();
  await expect(editor(page)).toContainText("written offline");
  await expect.poll(() => gh.files()["Offline.md"] ?? "", { timeout: 15_000 }).toContain("written offline");
});


test("the account pill: a quiet Sign in at the bottom left, then the name with sync and sign out (UI-12)", async ({ page }) => {
  await fakeGitHub(page);
  await page.goto("./");
  await page.getByRole("dialog", { name: "Welcome to Focus Notes" }).getByRole("button", { name: "Start writing" }).click();
  const account = page.getByRole("region", { name: "Account" });
  const signIn = account.getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeVisible();

  // Bottom left, small, and faint at rest.
  const box = (await signIn.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeLessThan(40);
  expect(view.height - (box.y + box.height)).toBeLessThan(40);
  expect(box.height).toBeLessThanOrEqual(32);
  // Muted words with no fill, but still readable (AA contrast, checked by axe below).
  const style = await signIn.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, text: getComputedStyle(document.querySelector(".ProseMirror")!).color }));
  expect(style.bg).toBe("rgba(0, 0, 0, 0)");
  expect(style.color).not.toBe(style.text);
  expect(await settledAxe(page)).toEqual([]);

  await signIn.click();
  const connect = page.getByRole("dialog", { name: "Connect GitHub" });
  await expect(connect).toBeVisible();
  await connect.getByRole("button", { name: "Next" }).click();
  await connect.getByLabel("Token").fill(TOKEN);
  await connect.getByRole("button", { name: "Connect" }).click();
  await connect.getByRole("button", { name: "Start writing" }).click();

  const pill = account.getByRole("button", { name: "Signed in to GitHub as me" });
  await expect(pill).toHaveText("me");
  expect(await settledAxe(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/web-account-pill.png" });
  await pill.click();
  const menu = page.getByRole("menu", { name: "Signed in to GitHub as me" });
  await expect(menu.getByText(/Synced with me\/notes|Syncing with me\/notes/)).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sync now" })).toBeVisible();
  expect(await settledAxe(page)).toEqual([]);
  await menu.getByRole("menuitem", { name: "Sign out of GitHub" }).click();
  await expect(account.getByRole("button", { name: "Sign in" })).toBeVisible();
});
