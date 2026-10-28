/**
 * Print (SHR-12, WP-8.12, D-230): ⋯ → Print… lays the open note out for paper and hands it to the
 * system's print dialog. Here the shell writes the job to a PDF instead (FOCUS_NOTES_E2E_PRINT_PDF),
 * so the journey reads the pages: the note's title names the job, a `<!-- pagebreak -->` starts a
 * new page, page numbers show from page 2, and the screen is left as it was.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { pdfText } from "./pdf-text.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const flat = (s: string) => s.replace(/\s+/g, " ");

async function openMore(page: Page) {
  const more = page.getByRole("button", { name: "More" });
  if (!(await more.isVisible())) await page.keyboard.press(`${mod}+.`);
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  return menu;
}

test("SHR-12: Print… lays the note out on pages, breaks where the note says and numbers pages from 2", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), [
    "---", "id: n-print", "---",
    "# Trip plan", "",
    "Before the break, the first page.", "",
    "- Pack the tent", "- Book the ferry", "",
    "<!-- pagebreak -->", "",
    "## Day two", "",
    "After the break, the second page.", "",
  ].join("\n"));
  const pdf = join(mkdtempSync(join(tmpdir(), "fn-print-")), "job.pdf");
  const l = await launch(dirs, { FOCUS_NOTES_E2E_PRINT_PDF: pdf });
  const { page } = l;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("After the break");
    // On screen the page break is the note's own text, shown as written.
    await expect(editor).toContainText("<!-- pagebreak -->");

    const menu = await openMore(page);
    await menu.getByRole("menuitem", { name: /^Print…/ }).click();
    await expect.poll(() => existsSync(pdf), { timeout: 20_000 }).toBe(true);

    // The screen is as it was: the print layout is gone, and the note is still open to edit.
    await expect(page.locator("[data-print-root]")).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(page.getByText("Couldn't print the note.")).toHaveCount(0);

    await expect.poll(() => { try { return pdfText(readFileSync(pdf)).pages.length; } catch { return 0; } }).toBe(2);
    const { title, pages } = pdfText(readFileSync(pdf));
    expect(title).toBe("Trip plan");
    const [one = "", two = ""] = pages.map(flat);
    expect(one).toContain("Trip plan");
    expect(one).toContain("Before the break, the first page.");
    expect(one).toContain("Book the ferry");
    expect(one).not.toContain("After the break");
    // Page 1 carries no number; page 2 says where it is.
    expect(one).not.toMatch(/\d\s*\/\s*\d/);
    expect(two).toContain("Day two");
    expect(two).toContain("After the break, the second page.");
    expect(two.replace(/\s/g, "")).toContain("2/2");
    // Front matter and the marker itself never reach paper.
    expect(one + two).not.toMatch(/n-print|pagebreak|<!--/);
  } finally {
    await quit(l);
  }
});
