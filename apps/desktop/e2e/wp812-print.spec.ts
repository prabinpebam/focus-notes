/**
 * Print (SHR-12, WP-8.12, D-230): ⋯ → Print… lays the open note out for paper and hands it to the
 * system's print dialog. Here the shell writes the job to a PDF instead (FOCUS_NOTES_E2E_PRINT_PDF),
 * so the journey reads the pages: the note's title names the job, a `<!-- pagebreak -->` starts a
 * new page, pages carry no numbers until Page numbers when printing is on (D-231), then every page
 * says where it is, and the screen is left as it was.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

async function printPages(page: Page, pdf: string): Promise<{ title: string | undefined; pages: string[] }> {
  rmSync(pdf, { force: true });
  const menu = await openMore(page);
  await menu.getByRole("menuitem", { name: /^Print…/ }).click();
  await expect.poll(() => existsSync(pdf), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => { try { return pdfText(readFileSync(pdf)).pages.length; } catch { return 0; } }).toBe(2);
  const { title, pages } = pdfText(readFileSync(pdf));
  return { title, pages: pages.map(flat) };
}

const FOLIO = /\d\s*\/\s*\d/;

test("SHR-12: Print… lays the note out on pages, breaks where the note says, and numbers pages when asked", async () => {
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

    const { title, pages: [one = "", two = ""] } = await printPages(page, pdf);

    // The screen is as it was: the print layout is gone, and the note is still open to edit.
    await expect(page.locator("[data-print-root]")).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(page.getByText("Couldn't print the note.")).toHaveCount(0);

    expect(title).toBe("Trip plan");
    expect(one).toContain("Trip plan");
    expect(one).toContain("Before the break, the first page.");
    expect(one).toContain("Book the ferry");
    expect(one).not.toContain("After the break");
    expect(two).toContain("Day two");
    expect(two).toContain("After the break, the second page.");
    // Page numbers are off until asked for (D-231).
    expect(one).not.toMatch(FOLIO);
    expect(two).not.toMatch(FOLIO);
    // Front matter and the marker itself never reach paper.
    expect(one + two).not.toMatch(/n-print|pagebreak|<!--/);

    // Turned on beside Print…, every page says where it is.
    const menu = await openMore(page);
    const numbers = menu.getByRole("menuitemcheckbox", { name: /^Page numbers when printing/ });
    await expect(numbers).toHaveAttribute("aria-checked", "false");
    await numbers.click();
    const numbered = await printPages(page, pdf);
    expect(numbered.pages[0]!.replace(/\s/g, "")).toContain("1/2");
    expect(numbered.pages[1]!.replace(/\s/g, "")).toContain("2/2");
    await expect((await openMore(page)).getByRole("menuitemcheckbox", { name: /^Page numbers when printing/ })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
  } finally {
    await quit(l);
  }
});
