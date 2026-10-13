/**
 * WP-1.3 journeys: the slash menu (EDT-06), paste (EDT-09), and sanitizing under Trusted Types (SEC-02).
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { axeViolations } from "./axe.ts";

const mac = process.platform === "darwin";
const mod = mac ? "Meta" : "Control";

/** Records Content Security Policy violations (Trusted Types included) and console reports of them. */
async function watchViolations(page: Page) {
  const console: string[] = [];
  page.on("console", (m) => {
    if (/trusted ?type/i.test(m.text())) console.push(m.text());
  });
  await page.evaluate(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      if (/trusted-types/.test(e.violatedDirective)) w.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  return async () => [...console, ...(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations))];
}

async function start(markdown: string): Promise<Launched & { note: string; saved: () => string; violations: () => Promise<string[]> }> {
  const dirs = tempDirs();
  // The note that opens first. Notes here start with an H1 other than their name, a name chosen by
  // hand, so the file never follows a pasted heading (FIL-07).
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, markdown);
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const violations = await watchViolations(l.page);
  return { ...l, note, saved: () => readFileSync(note, "utf8"), violations };
}

/** The on-screen box of the last `/` in the note. */
const slashBox = (page: Page) => page.evaluate(() => {
  const root = document.querySelector("[data-editor]")!;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let found: DOMRect | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.textContent!.lastIndexOf("/");
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + 1);
    found = r.getBoundingClientRect();
  }
  if (!found) throw new Error("No / in the note");
  return { left: found.left, bottom: found.bottom };
});

/**
 * Pastes as the browser does: a paste event carrying the clipboard's text and HTML, into the real
 * editor and its whole pipeline. The system clipboard isn't reachable where the journeys run, so its
 * data is handed over in the event (as in WP-1.2). Plain text holds Mod+Shift, as Mod+Shift+V does.
 */
async function paste(page: Page, data: { text?: string; html?: string }, { plain = false } = {}) {
  if (plain) {
    await page.keyboard.down(mod);
    await page.keyboard.down("Shift");
  }
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    if (d.html) dt.setData("text/html", d.html);
    if (d.text) dt.setData("text/plain", d.text);
    document.querySelector("[data-editor]")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
  if (plain) {
    await page.keyboard.up("Shift");
    await page.keyboard.up(mod);
  }
}

/** Settles the menu's entrance fade so contrast is checked on what people finally see. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

test("EDT-06: / opens the block menu under the caret; typing filters, arrows and Enter insert, Esc keeps the text, a click inserts", async () => {
  const l = await start("# Journal\n\nIntro paragraph.\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const menu = page.getByRole("listbox", { name: "Insert a block" });

  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();
  // Under the `/`, lined up with it, never covering the line.
  const slash = await slashBox(page);
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(slash.bottom);
  expect(Math.abs(box.x - slash.left)).toBeLessThan(24);
  // The registry's blocks, grouped Text, Lists, Insert, the first one active, with focus still in the note.
  await expect(menu.getByRole("option")).toHaveText([
    /^Text/, /^Heading 1/, /^Heading 2/, /^Heading 3/, /^Quote/, /^Bulleted list/, /^Numbered list/, /^To-do list/, /^Code block/, /^Divider/,
  ]);
  const first = menu.getByRole("option").first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(first).toContainText("Plain text");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("aria-controls", "slashList");
  await expect(editor).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.screenshot({ path: "../../test-results/screens/slash-menu.png" });

  // Typing filters; arrows move; Enter inserts with the caret inside.
  await page.keyboard.type("head");
  await expect(menu.getByRole("option")).toHaveText([/^Heading 1/, /^Heading 2/, /^Heading 3/]);
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { name: /Heading 2/ })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: "../../test-results/screens/slash-menu-filtered.png" });
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await page.keyboard.type("Section");
  await expect(editor.locator("h2")).toHaveText("Section");

  // Synonyms, and Tab inserts too.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/checkbox");
  await expect(menu.getByRole("option")).toHaveText([/^To-do list/]);
  await page.keyboard.press("Tab");
  await page.keyboard.type("Buy milk");
  await expect(editor.locator("ul[data-type=taskList] li p")).toHaveText("Buy milk");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // Esc closes it and keeps what was typed; it doesn't come back for the same `/`.
  await page.keyboard.type("/quo");
  await expect(menu.getByRole("option")).toHaveText([/^Quote/]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.keyboard.type("te");
  await expect(menu).toBeHidden();
  await expect(editor).toContainText("/quote");

  // No match says so; Backspace past the `/` closes it.
  await page.keyboard.type(" /xyz");
  await expect(page.getByText("No blocks match ‘xyz’. Press Esc to keep the text.")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await expect(page.getByText(/No blocks match/)).toBeHidden();
  await expect(menu).toBeHidden();
  await page.keyboard.press("Backspace");

  // A click inserts, below the line when it has text.
  await page.keyboard.type(" /");
  await menu.getByRole("option", { name: /Bulleted list/ }).click();
  await expect(menu).toBeHidden();
  await expect(editor).toBeFocused();
  await page.keyboard.type("Item");
  await expect(editor.locator("ul:not([data-type]) li")).toHaveText("Item");

  // Never inside a word or in code.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("and/or");
  await expect(menu).toBeHidden();
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a /b");
  await expect(editor.locator("pre")).toContainText("a /b");
  await expect(menu).toBeHidden();

  await expect.poll(l.saved).toBe("# Journal\n\nIntro paragraph.\n\n## Section\n\n- [ ] Buy milk\n\n/quote\n\n- Item\n\nand/or\n\n```\na /b\n```\n");
  expect(await l.violations()).toEqual([]);
  await quit(l);
});

test("EDT-09: pasting from a web page and from Word gives headings, lists, links, and marks; images are reported", async () => {
  const l = await start("# Journal\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  {
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await paste(page, {
      text: "Heading Para with bold and a link. One Two",
      html: `<meta charset="utf-8"><h2>Heading</h2><p>Para with <strong>bold</strong>, <em>italic</em>, and a <a href="https://example.com/a" onclick="alert(1)">link</a>.</p><ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul><script>alert(2)</script><img src="x" onerror="alert(3)">`,
    });
    await expect(editor.locator("h2")).toHaveText("Heading");
    await expect(editor.locator("strong")).toHaveText("bold");
    await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com/a");
    await expect(editor.locator("ul ul li")).toHaveText("Nested");
    await expect(editor.locator("img, script, [onclick], [onerror]")).toHaveCount(0);
    // The image had no alt text: it's left out, and the toast says so.
    await expect(page.getByText("Images can't be added to notes yet, so they were left out.")).toBeVisible();

    // Out of the pasted list: Enter on an empty item leaves one level at a time.
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    for (let i = 0; i < 3 && (await page.evaluate(() => Boolean((getSelection()?.anchorNode as Element | null)?.closest?.("li")))); i++) await page.keyboard.press("Enter");
    const bullet = (level: number, text: string) => `<p class=MsoListParagraphCxSpMiddle style='margin-left:.5in;text-indent:-.25in;mso-list:l0 level${level} lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>${text}<o:p></o:p></p>`;
    await paste(page, {
      text: "Report",
      html: `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body lang=EN-US><!--StartFragment--><h1>Report</h1><p class=MsoNormal><b>Key</b> point with <a href="https://example.org/">a source</a><o:p></o:p></p>${bullet(1, "First")}${bullet(2, "Inner")}${bullet(1, "Second")}<!--EndFragment--></body></html>`,
    });
    await expect(editor.locator("h1").nth(1)).toHaveText("Report");
    await expect(editor.locator("a[href='https://example.org/']")).toHaveText("a source");
    await page.screenshot({ path: "../../test-results/screens/paste-html.png" });

    await expect.poll(l.saved).toBe(
      "# Journal\n\n## Heading\n\nPara with **bold**, *italic*, and a [link](https://example.com/a).\n\n- One\n- Two\n  - Nested\n\n# Report\n\n**Key** point with [a source](https://example.org/)\n\n- First\n  - Inner\n- Second\n",
    );
    expect(await l.violations()).toEqual([]);
  }
  await quit(l);
});

test("EDT-09: Markdown text becomes blocks, and Mod+Shift+V pastes plain text as it is", async () => {
  const l = await start("# Journal\n");
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  {
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await paste(page, { text: "# Plan\n\n- [ ] draft\n- [x] outline\n\nSee [docs](https://example.com) and `code`.\n" });
    await expect(editor.locator("h1").nth(1)).toHaveText("Plan");
    await expect(editor.locator("ul[data-type=taskList] li")).toHaveCount(2);
    await expect(editor.locator("code")).toHaveText("code");

    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await paste(page, { text: "**not bold** and # not a heading", html: "<b>html that would be bold</b>" }, { plain: true });
    await expect(editor).toContainText("**not bold** and # not a heading");
    await expect(editor.locator("b, strong")).toHaveCount(0);
    await expect.poll(l.saved).toBe("# Journal\n\n# Plan\n\n- [ ] draft\n- [x] outline\n\nSee [docs](https://example.com) and `code`.\n\n\\*\\*not bold\\*\\* and # not a heading\n");
    expect(await l.violations()).toEqual([]);
  }
  await quit(l);
});

test("SEC-02: Trusted Types are required; raw HTML in a note is text; nothing in the app ever violates the policy", async () => {
  const l = await start(`# Raw HTML stays text\n\n<img src="x" onerror="document.title='pwned'">\n\nEntities decode: &copy; &amp; &lt;b&gt;\n\n[js](javascript:alert(1)) and [ok](https://example.com)\n`);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content"));
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain("trusted-types default dompurify");

  await expect(editor).toContainText(`<img src="x" onerror="document.title='pwned'">`);
  await expect(editor).toContainText("Entities decode: © & <b>");
  await expect(editor.locator("img, [onerror]")).toHaveCount(0);
  await expect(editor.getByText("js", { exact: true })).not.toHaveAttribute("href", /javascript/);
  expect(await page.title()).not.toBe("pwned");

  // Everyday use touches every library sink: toolbar, menus, live regions, the cheat sheet, find.
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" more");
  await page.keyboard.press("Shift+Home");
  await expect(page.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
  await page.keyboard.press(`${mod}+B`);
  await page.keyboard.press(`${mod}+F`);
  await page.keyboard.type("raw");
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod}+Shift+/`);
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await l.violations()).toEqual([]);

  // HTML reaching a sink is sanitized by the default policy; scripts have no policy at all.
  const result = await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = `<img src="x" onerror="alert(1)"><b>kept</b>`;
    let script = "allowed";
    try {
      document.createElement("script").text = "alert(1)";
    } catch {
      script = "refused";
    }
    return { html: div.innerHTML, script };
  });
  expect(result.html).toBe(`<img src="x"><b>kept</b>`);
  expect(result.script).toBe("refused");
  await quit(l);
});
