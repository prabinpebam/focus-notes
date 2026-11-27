/**
 * Review captures for the project accent (D-435): the editor with a text selection, the Files panel
 * (selection, hover, the active opened tab) and Settings, in a project window of each colour and in a
 * window with no project (the default blue), light and dark, plus one High contrast window. The app's
 * own window only (capturePage, D-141). Opt in with FOCUS_NOTES_CAPTURE_ACCENT=1; FOCUS_NOTES_ACCENT_OUT
 * names the folder.
 */
import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileRow, launch, quit, tempDirs } from "./helpers.ts";
import { captureWindow, DEMO_NOTES } from "./scene-capture.ts";
import { mkdirSync } from "node:fs";
import { repoRoot } from "./github-world.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_ACCENT !== "1", "Opt in with FOCUS_NOTES_CAPTURE_ACCENT=1");

const OUT = process.env.FOCUS_NOTES_ACCENT_OUT ?? join(repoRoot, "test-results", "project-accent");
const CASES = [
  ...(["light", "dark"] as const).flatMap((appearance) => (["app", "green", "amber", "violet"] as const).map((accent) => ({ appearance, accent, theme: undefined as string | undefined }))),
  { appearance: "light" as const, accent: "violet" as const, theme: "contrast-light" },
];

for (const c of CASES) test(`D-435 capture: ${c.accent} ${c.theme ?? c.appearance}`, async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  for (const [path, text] of Object.entries(DEMO_NOTES)) {
    const file = join(dirs.docs, ...path.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  const first = join(dirs.docs, "On writing slowly.md");
  const themeKey = c.appearance === "light" ? "lightTheme" : "darkTheme";
  const local = c.accent === "app";
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: first, appearance: c.appearance, focusMode: false,
    ...(c.theme ? { [themeKey]: c.theme } : {}),
    ...(local ? { localNotes: true } : { projectSettings: { [dirs.docs]: { name: "Field notes", accent: c.accent, logo: "rocket", watermark: "off", font: "app", theme: "app" } } }),
  }));
  const l = await launch(dirs, local ? { FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_LOCAL_NOTES_HOME: dirs.docs } : {});
  const { page } = l;
  const name = (surface: string) => `${c.accent === "app" ? "default-blue" : c.accent}.${c.theme ?? c.appearance}.${surface}`;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("On writing slowly");
    if (!local) await expect(page.locator("[data-app-root]")).toHaveAttribute("data-project-accent", c.accent);

    // The editor with a text selection.
    await editor.getByText("A good first draft asks for one thing", { exact: false }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await captureWindow(l, OUT, name("1-editor-selection"));

    // The Files panel: an opened tab, the selected row, a hovered row.
    await page.keyboard.press("Control+O");
    const files = page.getByRole("complementary", { name: "Files" });
    const dock = page.getByRole("button", { name: "Dock Files" });
    if (await dock.isVisible().catch(() => false)) await dock.click();
    const tree = page.getByRole("tree", { name: "Notes and folders" });
    await fileRow(tree, "Reading list").dblclick();
    await expect(editor).toContainText("Reading list");
    await fileRow(tree, "Reading list").click();
    await fileRow(tree, "On writing slowly").hover();
    await page.waitForTimeout(300);
    await captureWindow(l, OUT, name("2-files"), { hover: true });
    await page.keyboard.press("Escape");

    // Settings: Switches, segmented choices, its buttons.
    await page.keyboard.press("Control+,");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await captureWindow(l, OUT, name("3-settings"));
    const appearanceTab = settings.getByRole("tab", { name: "Appearance", exact: true });
    await appearanceTab.click();
    await captureWindow(l, OUT, name("3-settings-appearance"));
    const project = settings.getByRole("tab", { name: "Project", exact: true });
    if (!local && await project.isVisible().catch(() => false)) {
      await project.click();
      await captureWindow(l, OUT, name("4-settings-project"));
    }
    await page.keyboard.press("Escape");
  } finally {
    await quit(l);
  }
});
