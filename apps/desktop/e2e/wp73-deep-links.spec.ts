/**
 * WP-7.3 journey (AGT-06, D-165): read-only deep links. The app opened with
 * `focus-notes://open?path=…&heading=…` opens that note at that heading; with `focus-notes://search`
 * it opens Spotlight with the query; and a hostile link (outside the notes, a write action) is
 * ignored: the usual note opens and nothing is written. Local files only.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { instance } from "./instance.ts";

const LONG = `# Field guide\n\n${Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1} about the garden.`).join("\n\n")}\n\n## Far heading\n\nThe part the link points at.\n`;

test("AGT-06: a deep link opens its note at its heading; a search link opens Spotlight; a hostile link is ignored", async () => {
  const { dirs } = instance();
  writeFileSync(join(dirs.docs, "notes", "guide.md"), LONG);

  let l = await launch(dirs, {}, { args: ["focus-notes://open?path=notes%2Fguide.md&heading=far-heading"] });
  const editor = l.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Field guide");
  const far = editor.getByRole("heading", { name: "Far heading" });
  await expect(far).toBeInViewport({ timeout: 10_000 });
  await quit(l);

  l = await launch(dirs, {}, { args: ["focus-notes://search?q=garden"] });
  const field = l.page.getByRole("combobox").or(l.page.getByRole("searchbox")).first();
  await expect(field).toHaveValue("garden", { timeout: 10_000 });
  await quit(l);

  const before = readdirSync(join(dirs.docs, "notes")).sort();
  for (const hostile of ["focus-notes://open?path=private%2Faccess.json", "focus-notes://open?path=..%2F..%2Fescape.md", "focus-notes://new?folder=notes&title=Injected"]) {
    l = await launch(dirs, {}, { args: [hostile] });
    await expect(l.page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await expect(l.page.getByRole("dialog")).toHaveCount(0);
    await quit(l);
  }
  expect(readdirSync(join(dirs.docs, "notes")).sort()).toEqual(before);
  expect(existsSync(join(dirs.docs, "notes", "Injected.md"))).toBe(false);
});
