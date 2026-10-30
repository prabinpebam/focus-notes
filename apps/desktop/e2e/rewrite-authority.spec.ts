import { test, expect } from "./fixtures.ts";
import { launch, tempDirs } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

test("ordinary launch stays gated across explicit note and window switches", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const a = join(dirs.docs, "public", "a.md"), b = join(dirs.docs, "public", "b.md");
  writeFileSync(a, "First ordinary note."); writeFileSync(b, "Second ordinary note.");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: a }));
  const { app, page } = await launch(dirs);
  try {
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("First ordinary");
    await expect(editor).not.toHaveAttribute("data-rewrite-enabled", "true");
    const revision = await page.evaluate(async (path) => (window as any).focusNotes.rewriteAuthority("activate", { path }), a);
    await page.evaluate(async (path) => (window as any).focusNotes.windows.open(path), b);
    await expect.poll(() => app.windows().length).toBe(2);
    const second = app.windows()[1]!;
    await expect(second.getByRole("textbox", { name: "Note", exact: true })).toContainText("Second ordinary");
    for (const p of [page, second]) {
      expect(await p.evaluate(async (revision) => {
        try { await (window as any).focusNotes.rewriteAuthority("prepare", { revision, source: "First ordinary note.", target: {} }); return "unsafe"; }
        catch { return "refused"; }
      }, revision)).toBe("refused");
    }
    await page.evaluate(async (path) => (window as any).focusNotes.rewriteAuthority("activate", { path }), b);
    await editor.press("Control+Shift+r");
    await expect(page.getByRole("complementary", { name: "Rewrite with AI", exact: true })).toHaveCount(0);
    expect(readFileSync(a, "utf8")).toBe("First ordinary note.");
    expect(readFileSync(b, "utf8")).toBe("Second ordinary note.");
  } finally { await app.close(); }
});

test("candidate durable operation refuses other window, navigation and failed original checkpoint", async () => {
  const dirs = tempDirs();
  const a = join(dirs.docs, "a.md"), b = join(dirs.docs, "b.md");
  writeFileSync(a, "Original."); writeFileSync(b, "Other.");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: a }));
  const { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
  try {
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Original.");
    const token = await page.evaluate(async (path) => {
      const authority = (window as any).focusNotes.rewriteAuthority;
      const revision = await authority("activate", { path });
      return authority("prepare", { revision, source: "Dirty.", target: { from: 0, to: 6, original: "Dirty.", startByte: 0, endByte: 6, expanded: false } });
    }, a);
    await page.evaluate(async (path) => (window as any).focusNotes.windows.open(path), b);
    await expect.poll(() => app.windows().length).toBe(2);
    const second = app.windows()[1]!;
    await expect(second.getByRole("textbox", { name: "Note", exact: true })).toContainText("Other.");
    expect(await second.evaluate(async (token) => {
      try { await (window as any).focusNotes.rewriteAuthority("accept", { token }); return "unsafe"; } catch { return "refused"; }
    }, token)).toBe("refused");
    await page.evaluate(async (path) => (window as any).focusNotes.rewriteAuthority("activate", { path }), b);
    expect(await page.evaluate(async (token) => {
      try { await (window as any).focusNotes.rewriteAuthority("accept", { token }); return "unsafe"; } catch { return "refused"; }
    }, token)).toBe("refused");
    // A real storage-lock failure is a checkpoint refusal, never permission to generate.
    const history = join(dirs.userData, "rewrite-history");
    writeFileSync(join(history, readdirSync(history)[0]!, "private.lock"), "fixture");
    const failed = await page.evaluate(async (path) => {
      const authority = (window as any).focusNotes.rewriteAuthority;
      const revision = await authority("activate", { path });
      try { await authority("prepare", { revision, source: "Other.", target: { from: 0, to: 6, original: "Other.", startByte: 0, endByte: 6, expanded: false } }); return "unsafe"; }
      catch { return "refused"; }
    }, b);
    expect(failed).toBe("refused");
    expect(readFileSync(a, "utf8")).toBe("Original.");
    expect(readFileSync(b, "utf8")).toBe("Other.");
  } finally { await app.close(); }
});
