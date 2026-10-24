/**
 * Import files (FIL-15, D-210): a folder's menu imports Markdown, text, HTML and Word files as new notes
 * in it, as one batch with Undo; HTML is read as a paste is, and nothing is replaced.
 */
import { test, expect } from "./fixtures.ts";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const ls = (dir: string) => readdirSync(dir).filter((n) => !n.startsWith(".")).sort();

test("FIL-15: Import files… brings Markdown, text, HTML and Word files into a folder as notes, with Undo", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome to Focus Notes\n\nHello.\n");
  const journal = join(dirs.docs, "journal");
  mkdirSync(journal);
  writeFileSync(join(journal, "ideas.md"), "# Ideas\n\nAlready here.\n");
  const outside = mkdtempSync(join(tmpdir(), "fn-import-"));
  const picked = [
    join(outside, "ideas.md"),
    join(outside, "todo.txt"),
    join(outside, "page.html"),
    join(outside, "plan.docx"),
  ];
  writeFileSync(picked[0]!, "---\nid: n-old\n---\r\n# Ideas\r\n\r\nFrom elsewhere.\r\n");
  writeFileSync(picked[1]!, "Buy milk\n");
  writeFileSync(picked[2]!, `<html><head><style>p{color:red}</style></head><body><h1>Web page</h1><p>Hi <script>alert(1)</script><a href="javascript:alert(1)">there</a> <img src="https://example.com/x.png"></p></body></html>`);
  copyFileSync(join(import.meta.dirname, "..", "test", "fixtures", "plan.docx"), picked[3]!);

  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toContainText("Hello.");
    await l.app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
    }, picked);
    await page.keyboard.press(`${mod}+O`);
    const tree = page.getByRole("complementary", { name: "Files" }).getByRole("tree", { name: "Notes and folders" });
    await tree.getByRole("treeitem", { name: "journal", exact: true }).click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Actions for “journal”" });
    await menu.locator('[role="menuitem"][data-key="files.import"]').click();
    await expect(menu).toBeHidden();

    const toasts = page.locator("#toasts");
    await expect(toasts.getByText("Imported 4 notes into “journal”.")).toBeVisible();
    await expect.poll(() => ls(journal)).toEqual(["ideas-2.md", "ideas.md", "quarterly-plan.md", "todo.md", "web-page.md"]);
    // Nothing is replaced; an import is a new note, so its old id is gone and its line ends are \n.
    expect(readFileSync(join(journal, "ideas.md"), "utf8")).toBe("# Ideas\n\nAlready here.\n");
    expect(readFileSync(join(journal, "ideas-2.md"), "utf8")).not.toContain("n-old");
    expect(readFileSync(join(journal, "ideas-2.md"), "utf8")).toContain("# Ideas\n\nFrom elsewhere.\n");
    // Text without a heading takes its file's name as its title.
    expect(readFileSync(join(journal, "todo.md"), "utf8")).toContain("# todo\n\nBuy milk\n");
    // HTML is read as a paste is: no script, style, unsafe link or image.
    const web = readFileSync(join(journal, "web-page.md"), "utf8");
    expect(web).toContain("# Web page");
    expect(web).toContain("Hi");
    expect(web).not.toMatch(/alert|color:red|javascript:|example\.com|<script/);
    // A Word document's headings and emphasis become Markdown.
    expect(readFileSync(join(journal, "quarterly-plan.md"), "utf8")).toContain("# Quarterly plan\n\nShip the **import** feature.\n");
    await expect(tree.getByRole("treeitem", { name: "Quarterly plan", exact: true })).toBeVisible();

    // Undo removes the whole batch and leaves what was there.
    await toasts.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => ls(journal)).toEqual(["ideas.md"]);
    expect(existsSync(join(journal, "ideas.md"))).toBe(true);
  } finally {
    await quit(l);
  }
});
