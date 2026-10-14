/**
 * M4 journeys for the search index (WP-4.1): it builds in its own worker from the workspace on
 * disk, private notes included; it follows the app's saves and changes made outside the app; and
 * neither indexing nor searching makes a single network request (SPT-08). Spotlight's panel and its
 * budgets are WP-4.2's; the index's own budgets (SPT-07) are in the benchmark.
 */
import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { instance, write } from "./instance.ts";
import { ask, keysOf, searchWorker } from "./search.ts";

test("SPT-08: the index is built on this computer, in its own worker, and indexing and searching make no network requests", async () => {
  const { dirs } = instance();
  write(join(dirs.docs, "private", "notes", "budget.md"), "# Budget\n\n## Quarterly zanzibar review\n\nThe zanzibar numbers stay private.\n");
  write(join(dirs.docs, "notes", "essays", "on-focus.md"), "# On focus\n\n## Deep work\n\nOne line at a time, in focus.\n");
  const l = await launch(dirs);
  const { page } = l;
  // Every request the window or its workers make, other than the app's own files.
  const requests: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("file:")) requests.push(`${r.method()} ${r.url()}`); });
  await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
  const worker = await searchWorker(page);
  expect(worker.url()).toMatch(/^file:.*\/assets\/worker-[\w-]+\.js$/);

  // Full text, a private note's included, is indexed in the background.
  await expect.poll(async () => (await ask(worker, { text: "zanzibar", scope: "text" })).hits.map((h) => [h.rel, h.root]), { timeout: 20_000 }).toEqual([["budget.md", "private"]]);
  // Notes only: Spotlight (WP-4.2) has given the index its commands and settings too ("Focus mode").
  const titles = await ask(worker, { text: "focus", scope: "titles", kinds: ["note"] });
  expect(titles.hits[0]).toMatchObject({ kind: "note", label: "On focus", rel: "essays/on-focus.md", root: "public", tier: "word" });
  expect((await ask(worker, { text: "focus", scope: "titles", kinds: ["command"] })).hits.map((h) => h.key)).toContain("command:focus.toggle");
  expect((await ask(worker, { text: "deep work", scope: "titles" })).hits[0]).toMatchObject({ kind: "heading", rel: "essays/on-focus.md", heading: { level: 2, note: "On focus" } });
  expect((await ask(worker, { text: "zanzibar", scope: "titles", roots: ["public"] })).hits).toEqual([]);

  // The app's own save, and a change made outside the app, both reach the index.
  const editor = page.getByRole("textbox", { name: "Note" });
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
  await page.keyboard.type(" Quokka sightings.");
  await expect.poll(() => keysOf(worker, { text: "quokka", scope: "text" }), { timeout: 10_000 }).toHaveLength(1);
  write(join(dirs.docs, "notes", "outside.md"), "# Written elsewhere\n\nA platypus appeared.\n");
  await expect.poll(async () => (await ask(worker, { text: "platypus", scope: "text" })).hits.map((h) => h.rel), { timeout: 10_000 }).toEqual(["outside.md"]);

  // Searching, many times, makes no request at all; nor did anything before it.
  for (const text of ["z", "za", "zan", "zanz", "zanzibar", "budget", "on focus", "privat"]) {
    await ask(worker, { text, scope: "titles" });
    await ask(worker, { text, scope: "text" });
  }
  expect(requests).toEqual([]);
  expect(l.log.filter((x) => x.includes("blocked request"))).toEqual([]);
  await quit(l);
});
