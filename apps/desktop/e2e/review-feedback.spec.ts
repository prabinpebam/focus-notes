import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { cssVarName, themeValues } from "../../../packages/tokens/dist/tokens.ts";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./fixtures.ts";
import { fileRow, launch, quit, tempDirs } from "./helpers.ts";
import { makeFakes } from "../test/fakes/fakes.ts";
import { pointerModality, scrollbarClearOfCorners, settled } from "./visual-quality.ts";
import { LONG_NOTE } from "./surfaces.ts";
import type { Locator } from "@playwright/test";
import { configure, git, instance } from "./instance.ts";

for (const appearance of ["light", "dark"]) test(`Project outline is solid and 2 px without moving the writing surface in ${appearance}`, async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), LONG_NOTE);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, appearance,
    projectSettings: { [dirs.docs]: { name: "Sample project", accent: "blue", logo: "rocket", watermark: "off", font: "app", theme: appearance === "light" ? "paper" : "ink" } },
  }));
  const l = await launch(dirs, { FOCUS_NOTES_DISABLE_GPU: "1" });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    const root = l.page.locator("[data-app-root]");
    await expect(root).toHaveAttribute("data-project-accent", "blue");
    const drawn = await root.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { outline: cs.outlineWidth, color: cs.outlineColor, style: cs.outlineStyle, border: cs.borderTopWidth, left: r.left, top: r.top };
    });
    expect(drawn).toMatchObject({ outline: "2px", style: "solid" });
    expect(drawn.color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(drawn.border).toBe("0px");
    if (process.platform !== "darwin") expect({ left: drawn.left, top: drawn.top }).toEqual({ left: 16, top: 16 });
    await l.page.waitForFunction(() => !document.querySelector("[data-editor-scroller]")!.hasAttribute("data-scrolling"));
    await l.page.screenshot({ path: `../../test-results/screens/project-outline-${appearance}.png` });
    expect(await scrollbarClearOfCorners(l.page)).toEqual([]);
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("OFB.8: the colour-border Switch defaults on, changes only the outline and survives restart", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md"), stateFile = join(dirs.userData, "state.json");
  const text = "# Kept note\n\nUnchanged while the border is off.\n";
  writeFileSync(note, text);
  let l = await launch(dirs);
  const close = async () => {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs];
  const open = async () => {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    return settings.getByRole("switch", { name: "Project colour border", exact: true });
  };
  try {
    let control = await open();
    await expect(control).toBeChecked();
    const root = l.page.locator("[data-app-root]");
    const bounds = await root.boundingBox();
    const accent = await root.getAttribute("data-project-accent");
    await expect.poll(() => root.evaluate(el => getComputedStyle(el).outlineWidth)).toBe("2px");
    await control.press("Space");
    await expect.poll(() => saved()?.border).toBe(false);
    await expect(control).not.toBeChecked();
    await expect.poll(() => root.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("none");
    expect(await root.boundingBox()).toEqual(bounds);
    expect(await root.getAttribute("data-project-accent")).toBe(accent);
    const kept = saved();
    await close();
    l = await launch(dirs);
    control = await open();
    await expect(control).not.toBeChecked();
    await expect.poll(() => l.page.locator("[data-app-root]").evaluate(el => getComputedStyle(el).outlineStyle)).toBe("none");
    await control.press("Space");
    await expect.poll(() => saved()?.border).toBe(true);
    expect(saved()).toEqual({ ...kept, border: true });
    await expect.poll(() => l.page.locator("[data-app-root]").evaluate(el => getComputedStyle(el).outlineWidth)).toBe("2px");
    expect(readFileSync(note, "utf8")).toBe(text);
  } finally { await close(); }
});

for (const appearance of ["light", "dark"]) test(`Files pin swaps in-place and persists the exact row in ${appearance}`, async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md"), other = join(dirs.docs, "Other.md"), folder = join(dirs.docs, "Ideas");
  const text = "# Kept welcome\n\nNever change these bytes.\n", targetText = "# Pin target\n\nKeep me too.\n";
  writeFileSync(note, text); writeFileSync(other, targetText); mkdirSync(folder);
  writeFileSync(join(folder, "Leaf.md"), "# Leaf\n");
  const stateFile = join(dirs.userData, "state.json"), held = `${stateFile}.held`;
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note, appearance }));
  let l = await launch(dirs);
  const close = async () => {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  };
  const pins = (): string[] => JSON.parse(readFileSync(stateFile, "utf8")).filesPins ?? [];
  const open = async () => {
    await l.page.keyboard.press("Control+o");
    const tree = l.page.getByRole("tree", { name: "Notes and folders", exact: true });
    await expect(fileRow(tree, "Kept welcome")).toBeVisible();
    return tree;
  };
  try {
    const tree = await open(), target = fileRow(tree, "Pin target"), ideas = fileRow(tree, "Ideas");
    const label = target.locator('span[dir="auto"]').first();
    await pointerModality(l.page);
    await l.page.getByRole("textbox", { name: "Note", exact: true }).focus();
    const button = target.getByRole("button", { name: "Pin Pin target", exact: true, includeHidden: true });
    await expect(button).toBeHidden();
    const rowBox = (await target.boundingBox())!, labelBox = (await label.boundingBox())!;
    await target.hover();
    await expect(button).toBeVisible();
    expect(await target.boundingBox()).toEqual(rowBox);
    expect(await label.boundingBox()).toEqual(labelBox);
    await button.hover();
    await expect(l.page.getByRole("tooltip", { name: "Pin Pin target", exact: true })).toBeVisible();
    await button.click();
    await expect.poll(pins).toEqual([other]);
    await expect(fileRow(l.page.locator("#filesShortcuts"), "Pin target")).toBeVisible();
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:files.pin").length)).toBeGreaterThan(0);
    await expect(fileRow(tree, "Kept welcome")).toHaveAttribute("aria-selected", "true");
    await expect(target).toHaveAttribute("aria-selected", "false");
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Never change these bytes.");
    await l.page.getByRole("textbox", { name: "Note", exact: true }).focus();
    await pointerModality(l.page);
    await expect(target.getByRole("button", { name: "Unpin Pin target", exact: true, includeHidden: true })).toBeHidden();
    await expect(target.locator('[data-file-icon="pin"]')).toBeVisible();
    const pinnedRowBox = (await target.boundingBox())!, pinnedLabelBox = (await label.boundingBox())!;
    expect({ ...pinnedLabelBox, x: pinnedLabelBox.x - pinnedRowBox.x, y: pinnedLabelBox.y - pinnedRowBox.y }).toEqual({
      ...labelBox, x: labelBox.x - rowBox.x, y: labelBox.y - rowBox.y,
    });
    await target.focus();
    await l.page.keyboard.press("Tab");
    await expect(target.getByRole("button", { name: "Unpin Pin target", exact: true })).toBeFocused();
    await expect(target.getByRole("button", { name: "Unpin Pin target", exact: true })).not.toHaveAttribute("data-commit", "pending");
    await l.page.keyboard.press("Space");
    await expect.poll(pins).toEqual([]);
    await ideas.hover();
    await ideas.getByRole("button", { name: "Pin Ideas", exact: true }).click();
    await expect.poll(pins).toEqual([folder]);
    await expect(target.locator("button")).not.toHaveAttribute("data-commit", "pending");
    await expect(ideas).toHaveAttribute("aria-expanded", "false");
    renameSync(stateFile, held); mkdirSync(stateFile);
    try {
      await target.hover();
      await target.getByRole("button", { name: "Pin Pin target", exact: true }).click();
      await expect(target.locator('[data-commit="failed"]')).toBeVisible();
      expect(JSON.parse(readFileSync(held, "utf8")).filesPins).toEqual([folder]);
      await fileRow(tree, "Kept welcome").click();
    } finally { rmdirSync(stateFile); renameSync(held, stateFile); }
    await l.page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(pins).toEqual([folder, other]);
    await close();
    l = await launch(dirs);
    await open();
    const shortcuts = l.page.locator("#filesShortcuts");
    await expect(fileRow(shortcuts, "Ideas")).toBeVisible();
    await expect(fileRow(shortcuts, "Pin target")).toBeVisible();
    const cdp = await l.page.context().newCDPSession(l.page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await fileRow(shortcuts, "Ideas").getByRole("button", { name: "Unpin Ideas", exact: true }).click();
    await expect.poll(pins).toEqual([other]);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    expect(readFileSync(note, "utf8")).toBe(text);
    expect(readFileSync(other, "utf8")).toBe(targetText);
  } finally { await close(); }
});

for (const appearance of ["light", "dark"]) test(`Close tooltip never changes dialog geometry in ${appearance}`, async () => {
  test.setTimeout(120_000);
  const { dirs, notesRemote } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  const text = "# Close hover\n\nKeep these exact bytes.\n";
  writeFileSync(note, text);
  mkdirSync(join(dirs.docs, "private", "notes", "Geometry"));
  writeFileSync(join(dirs.docs, "private", "notes", "Geometry", "Leaf.md"), "# Leaf\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note, appearance,
  }));
  const publicDirs = tempDirs();
  git(publicDirs.docs, "clone", "-q", notesRemote, publicDirs.docs);
  configure(publicDirs.docs);
  writeFileSync(join(publicDirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, appearance, lastNotePath: join(publicDirs.docs, "notes", "hello.md") }));
  let l = await launch(publicDirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const closeApp = async () => {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  };
  const check = async (dialog: Locator, height?: string) => {
    height ??= await dialog.locator("..").getAttribute("data-height") ?? "content";
    await expect(dialog.locator("..")).toHaveAttribute("data-height", height);
    await settled(l.page);
    const before = (await dialog.boundingBox())!;
    const paddingOf = () => dialog.evaluate(el => JSON.stringify(Array.from(el.querySelectorAll("[data-dialog-first], [data-dialog-body], [data-dialog-last]"), node => {
      const style = getComputedStyle(node);
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
    })));
    const beforePadding = await paddingOf();
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const tooltip = l.page.getByRole("tooltip", { name: "Close", exact: true });
    const measure = async (show: () => Promise<void>, hide: () => Promise<void>) => {
      const [frames] = await Promise.all([
        dialog.evaluate(async el => {
          const frames = [];
          for (let i = 0; i < 80; i++) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const r = el.getBoundingClientRect();
            const padding = JSON.stringify(Array.from(el.querySelectorAll("[data-dialog-first], [data-dialog-body], [data-dialog-last]"), node => {
              const style = getComputedStyle(node);
              return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
            }));
            frames.push({ x: r.x, y: r.y, width: r.width, height: r.height, padding });
          }
          return frames;
        }),
        (async () => {
          await show();
          await expect(tooltip).toBeVisible();
          expect(await tooltip.evaluate(el => Boolean(el.closest("[data-dialog-modal]")))).toBe(false);
          await hide();
          await expect(tooltip).toHaveCount(0);
        })(),
      ]);
      for (const frame of frames) {
        expect(frame.padding).toBe(beforePadding);
        for (const key of ["x", "y", "width", "height"] as const) expect(frame[key], `${height} ${key} changed with Close tooltip`).toBe(before[key]);
      }
      expect(await dialog.boundingBox()).toEqual(before);
      expect(await paddingOf()).toBe(beforePadding);
    };
    for (let i = 0; i < 2; i++) {
      await pointerModality(l.page);
      await measure(() => close.hover(), () => pointerModality(l.page));
    }
    await measure(async () => { await l.page.keyboard.press("Tab"); await close.focus(); }, async () => { await dialog.locator("[data-dialog-body]").focus(); });
    const padding = await dialog.evaluate(el => {
      const body = el.querySelector("[data-dialog-body]")!;
      const before = getComputedStyle(body).paddingBottom;
      const portal = document.createElement("div");
      portal.style.position = "fixed";
      portal.setAttribute("role", "tooltip");
      el.append(portal);
      try { return { before, after: getComputedStyle(body).paddingBottom }; }
      finally { portal.remove(); }
    });
    expect(padding.after).toBe(padding.before);
    await close.click();
    await expect(dialog).toHaveCount(0);
  };
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Hello");
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    await l.page.keyboard.press("Control+n");
    await expect(l.page.getByRole("button", { name: "Public · not backed up", exact: true })).toBeVisible();
    await l.page.getByRole("textbox", { name: "Note", exact: true }).focus();
    await l.page.keyboard.type("# Untitled\n\nSynthetic location choice.\n");
    for (const [width, height] of [[1132, 812], [480, 360]]) {
      await l.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size[0]!, size[1]!), [width!, height!]);
      if (width === 1132) await l.page.keyboard.press("Control+s");
      else await l.page.getByRole("button", { name: "Public · not backed up", exact: true }).click();
      const location = l.page.getByRole("dialog", { name: /^Where should / });
      await expect(location).toBeVisible();
      console.log("[Close location geometry]", appearance, width, await location.getAttribute("aria-label"));
      await check(location);
    }
    await closeApp();
    l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
    for (const [width, height] of [[1132, 812], [480, 360]]) {
      await l.app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))!.setSize(size[0]!, size[1]!);
      }, [width!, height!]);
      await l.page.keyboard.press("Control+,");
      await check(l.page.getByRole("dialog", { name: "Settings", exact: true }), "navigation");
      await l.page.keyboard.press("Control+,");
      await l.page.getByRole("dialog", { name: "Settings", exact: true }).getByRole("tab", { name: "Keyboard", exact: true }).click();
      await l.page.getByRole("button", { name: "Customize toolbar…", exact: true }).click();
      await check(l.page.getByRole("dialog", { name: "Customize toolbar", exact: true }));
      await l.page.keyboard.press("Escape");
      const toolbar = l.page.getByRole("toolbar", { name: "Toolbar", exact: true });
      if (!await toolbar.isVisible()) await l.page.keyboard.press("Control+.");
      await toolbar.getByRole("button", { name: "More", exact: true }).click();
      await l.page.getByRole("menuitem", { name: "Share…", exact: true }).click();
      const share = l.page.getByRole("dialog", { name: "Share “Close hover”", exact: true });
      await expect(share.locator("[data-shimmer]")).toHaveCount(0);
      await check(share);
      await l.page.keyboard.press("Control+o");
      const tree = l.page.getByRole("tree", { name: "Notes and folders", exact: true });
      await fileRow(tree, "Geometry").click();
      await l.page.keyboard.press("Delete");
      await check(l.page.getByRole("dialog", { name: "Delete", exact: true }));
      await l.page.keyboard.press("Escape");
      await l.page.keyboard.press("Control+Alt+o");
      const open = l.page.getByRole("dialog", { name: "Open", exact: true }).or(l.page.getByRole("region", { name: "Open", exact: true }));
      await open.getByRole("button", { name: "New project…", exact: true }).click();
      await check(l.page.getByRole("dialog", { name: "New project", exact: true }), "stable");
      await l.page.keyboard.press("Escape");
      await l.page.keyboard.press("Control+,");
      await l.page.getByRole("dialog", { name: "Settings", exact: true }).getByRole("button", { name: "Send feedback", exact: true }).click();
      const feedback = l.page.getByRole("dialog", { name: "Send feedback", exact: true });
      await feedback.getByRole("radiogroup", { name: "Kind" }).getByText("Idea", { exact: true }).click();
      await check(feedback, "content");
    }
    expect(readFileSync(note, "utf8")).toBe(text);
  } finally { await closeApp(); }
});

for (const projectTheme of ["app", "sepia"]) test(`Themes applies real tokens and survives reopening with project theme ${projectTheme}`, async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  const text = "# Theme selection\n\nKeep these exact note bytes.\n";
  writeFileSync(note, text);
  const stateFile = join(dirs.userData, "state.json");
  const otherFolder = join(dirs.docs, "Garden notes");
  const other = { name: "Garden notes", accent: "green", logo: "leaf", watermark: "off", font: "app", theme: "ink" };
  writeFileSync(stateFile, JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note, appearance: "light",
    lightTheme: "paper", darkTheme: "ink",
    projectSettings: {
      [dirs.docs]: { name: "Field notes", accent: "blue", logo: "rocket", watermark: "off", font: "app", theme: projectTheme },
      [otherFolder]: other,
    },
  }));
  let l = await launch(dirs);
  const close = async () => {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  };
  const open = async () => {
    await l.page.keyboard.press("Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    return l.page.getByRole("complementary", { name: "Theme", exact: true });
  };
  const applied = async (id: "dusk" | "harbor-light") => {
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", id);
    for (const selector of ["html", "[data-editor]", '[role="dialog"][aria-label="Settings"]']) {
      if (!await l.page.locator(selector).count()) continue;
      for (const token of ["color.canvas", "color.text"]) {
        await expect.poll(() => l.page.locator(selector).evaluate((el, variable) => getComputedStyle(el).getPropertyValue(variable).trim(), cssVarName(token))).toBe(themeValues[id]![token]);
      }
    }
    expect(await l.page.locator("html").evaluate(el => getComputedStyle(el).colorScheme)).toBe(id === "dusk" ? "dark" : "light");
  };
  const saved = (id: string) => {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(state.projectSettings[otherFolder]).toEqual(other);
    if (projectTheme === "app") expect(state[id === "dusk" ? "darkTheme" : "lightTheme"]).toBe(id);
    else {
      expect(state.projectSettings[dirs.docs].theme).toBe(id);
      expect([state.appearance, state.lightTheme, state.darkTheme]).toEqual(["light", "paper", "ink"]);
    }
  };
  try {
    let panel = await open();
    await panel.getByRole("option", { name: /^Dusk/ }).click();
    await expect(async () => saved("dusk")).toPass();
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await applied("dusk");
    panel = await open();
    await expect(panel.getByRole("option", { name: /^Dusk/ })).toHaveAttribute("aria-selected", "true");
    await panel.locator('[data-tile="harbor-light"]').click();
    await expect(async () => saved("harbor-light")).toPass();
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await applied("harbor-light");
    await close();
    l = await launch(dirs);
    await applied("harbor-light");
    panel = await open();
    await expect(panel.locator('[data-tile="harbor-light"]')).toHaveAttribute("aria-selected", "true");
    saved("harbor-light");
    expect(readFileSync(note, "utf8")).toBe(text);
  } finally { await close(); }
});

test("Settings keeps navigation fixed and scrolls only content, with a short-window fallback", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    await l.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("agents:load");
      ipcMain.handle("agents:load", () => ({
        permissions: { connect: false, readPublic: true, readPrivate: false, edit: false, createPublic: true, folders: "all" },
        changedOutside: false, snippets: [{ id: "vscode", text: Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n") }], recent: [],
        cli: { available: false, installed: false, onPath: false },
      }));
    });
    await l.page.keyboard.press("Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    for (const [width, height] of [[1400, 850], [1024, 720], [600, 480], [480, 360]]) {
      await l.app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("index.html"))!.setSize(size[0]!, size[1]!);
      }, [width!, height!]);
      const nav = settings.locator("[data-side-nav]");
      const list = settings.getByRole("tablist");
      await expect(list).toHaveAttribute("aria-orientation", height! >= 720 ? "vertical" : "horizontal");
      await list.getByRole("tab", { name: "Agents", exact: true }).click();
      const panel = settings.getByRole("tabpanel");
      await settled(l.page);
      const before = await nav.boundingBox();
      await panel.evaluate(el => { el.scrollTop = 500; });
      await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      expect(await nav.boundingBox()).toEqual(before);
      expect(await settings.locator("[data-dialog-body]").evaluate(el => ({ top: el.scrollTop, overflow: getComputedStyle(el).overflowY }))).toEqual({ top: 0, overflow: "hidden" });
      expect(await nav.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      const feedback = settings.getByRole("button", { name: /Send feedback/ });
      await expect(feedback).toBeInViewport({ ratio: 1 });
      const feedbackBox = await feedback.boundingBox();
      await list.getByRole("tab", { selected: true }).focus();
      await l.page.keyboard.press("Home");
      const visited = new Set<string>();
      for (let i = 0; i < await list.getByRole("tab").count(); i++) {
        const selected = list.getByRole("tab", { selected: true });
        await expect(selected).toBeFocused();
        await expect(selected).toBeInViewport({ ratio: 1 });
        expect(await selected.evaluate(el => {
          const box = el.getBoundingClientRect(), style = getComputedStyle(el);
          const reach = style.outlineStyle === "none" ? 0 : Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
          for (let parent = el.parentElement; parent; parent = parent.parentElement) {
            const cs = getComputedStyle(parent), r = parent.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(cs.overflowY) &&
                (box.top - reach < r.top + parent.clientTop - 0.5 || box.bottom + reach > r.top + parent.clientTop + parent.clientHeight + 0.5)) return false;
            if (/auto|scroll|hidden|clip/.test(cs.overflowX) &&
                (box.left - reach < r.left + parent.clientLeft - 0.5 || box.right + reach > r.left + parent.clientLeft + parent.clientWidth + 0.5)) return false;
          }
          return true;
        })).toBe(true);
        visited.add(await selected.innerText());
        await expect(feedback).toBeInViewport({ ratio: 1 });
        expect(await feedback.boundingBox()).toEqual(feedbackBox);
        await l.page.keyboard.press(height! >= 720 ? "ArrowDown" : "ArrowRight");
      }
      expect(visited.size).toBe(await list.getByRole("tab").count());
      if (height! < 720) {
        const scroller = settings.locator("[data-tab-list-scroller]");
        expect(await scroller.evaluate(el => {
          const cs = getComputedStyle(el);
          return [cs.paddingTop, cs.paddingBottom, cs.paddingLeft, cs.paddingRight].every(value => parseFloat(value) === 0);
        })).toBe(true);
        for (const tab of await list.getByRole("tab").all()) {
          await tab.evaluate(el => {
            const frame = el.closest("[data-tab-list-scroller]")!;
            const box = el.getBoundingClientRect(), viewport = frame.getBoundingClientRect();
            frame.scrollTop += box.top - viewport.top;
          });
          await expect(tab).toBeInViewport({ ratio: 1 });
          await expect(feedback).toBeInViewport({ ratio: 1 });
          expect(await feedback.boundingBox()).toEqual(feedbackBox);
        }
        if (height === 360) expect(await scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      }
      expect(await panel.evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(128);
    }
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("Agents code Copy is an accessible top-right icon overlay without a reserved text column", async () => {
  const dirs = tempDirs();
  const text = '{\n  "mcpServers": { "focus-notes": { "command": "focus-notes", "args": ["mcp"] } }\n}';
  const l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1" });
  try {
    await l.app.evaluate(({ ipcMain }, code) => {
      ipcMain.removeHandler("agents:load");
      ipcMain.handle("agents:load", () => ({
        permissions: { connect: false, readPublic: true, readPrivate: false, edit: false, createPublic: true, folders: "all" },
        changedOutside: false, snippets: [{ id: "vscode", text: code }], recent: [],
        cli: { available: false, installed: false, onPath: false },
      }));
    }, text);
    await l.page.keyboard.press("Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    const block = settings.locator("[data-code-block]").first();
    const copy = block.getByRole("button", { name: "Copy", exact: true });
    await expect(copy).toBeVisible();
    expect(await copy.innerText()).toBe("");
    const layout = await block.evaluate(el => {
      const code = el.querySelector("code")!;
      const box = code.parentElement!;
      const button = el.querySelector("button")!;
      const style = getComputedStyle(box);
      const b = box.getBoundingClientRect(), c = code.getBoundingClientRect(), k = button.getBoundingClientRect();
      return {
        fullWidth: Math.abs(c.width - (b.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth))) < 1,
        overlay: getComputedStyle(button.parentElement!).position,
        topRight: k.right <= b.right && k.right > b.right - 20 && k.top < b.top + 20,
      };
    });
    expect(layout).toEqual({ fullWidth: true, overlay: "absolute", topRight: true });
    await copy.focus();
    await expect(l.page.getByRole("tooltip", { name: "Copy", exact: true })).toBeVisible();
    await copy.click();
    await expect.poll(() => l.app.evaluate(() => Reflect.get(globalThis, "memoryClipboard")?.text)).toBe(text);
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

/**
 * The tooltip as a person sees it: fully faded in, and the topmost thing painted at its centre and
 * at each corner, so nothing (its own menu) covers it. Hit-tested with its pointer-events briefly on
 * and, as the open menu makes everything outside it inert (React Aria), its inertness briefly off.
 */
async function paintedOnTop(tooltip: Locator): Promise<{ opacity: string; covered: string[] }> {
  return tooltip.evaluate(async (el: HTMLElement) => {
    await new Promise((r) => setTimeout(r, 250));
    const r = el.getBoundingClientRect();
    const prior = { pointer: el.style.pointerEvents, inert: el.inert };
    el.style.pointerEvents = "auto";
    el.inert = false;
    const inset = 3;
    const points: [number, number][] = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset]];
    const covered = points.flatMap(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === el || el.contains(hit)) ? [] : [`${Math.round(x)},${Math.round(y)}: ${hit?.getAttribute("role") ?? hit?.tagName}`];
    });
    el.style.pointerEvents = prior.pointer;
    el.inert = prior.inert;
    return { opacity: getComputedStyle(el).opacity, covered };
  });
}

test("menu explanations are accessible descriptions and hover or focus tooltips painted above their menu", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Menu descriptions\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(dirs.docs, "Welcome.md") }));
  const l = await launch(dirs);
  try {
    await l.page.keyboard.press("Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    const menu = l.page.getByRole("menu", { name: "More", exact: true });
    // The menu sits on its layer token, not React Aria's inline 100000 (which hid every item's tooltip).
    expect(await menu.evaluate((m) => {
      const popover = m.closest<HTMLElement>('[data-surface="popover"]')!;
      return { inline: popover.style.zIndex, computed: getComputedStyle(popover).zIndex, token: getComputedStyle(document.documentElement).getPropertyValue("--fn-layer-popover").trim() };
    })).toEqual({ inline: "", computed: "8", token: "8" });
    const item = l.page.getByRole("menuitem", { name: "Publish…", exact: true });
    const reason = "Publishing is local only in this preview.";
    const tip = l.page.getByRole("tooltip", { name: reason, exact: true });
    await expect(item).toHaveAccessibleDescription(reason);
    await expect(item).toHaveAttribute("aria-disabled", "true");
    const description = item.getByText(reason, { exact: true });
    expect(await description.evaluate(el => {
      const wrapper = el.closest<HTMLElement>('[style*="clip"]');
      return Boolean(wrapper && wrapper.offsetWidth <= 1 && wrapper.offsetHeight <= 1);
    })).toBe(true);

    // Keyboard focus shows it at once, painted over the menu, and moving on hides it.
    await item.focus();
    await expect(tip).toBeVisible();
    expect(await paintedOnTop(tip)).toEqual({ opacity: "1", covered: [] });
    await l.page.keyboard.press("ArrowDown");
    await expect(tip).toHaveCount(0);

    // A real pointer resting on a disabled item shows it too; it stays disabled for activation.
    const rest = async (target: Locator) => {
      await target.scrollIntoViewIfNeeded();
      const b = (await target.boundingBox())!;
      await l.page.mouse.move(b.x + 12, b.y + b.height / 2, { steps: 4 });
    };
    await rest(item);
    await expect(tip).toBeVisible();
    expect(await paintedOnTop(tip)).toEqual({ opacity: "1", covered: [] });
    await l.page.mouse.down();
    await l.page.mouse.up();
    await expect(menu).toBeVisible();

    // The menu's last disabled item, where the tooltip has the least room, and an enabled item with no reason.
    const help = l.page.getByRole("menuitem", { name: "Help and docs", exact: true });
    const helpTip = l.page.getByRole("tooltip", { name: "Help and docs arrive in a later preview", exact: true });
    await rest(help);
    await expect(helpTip).toBeVisible();
    expect(await paintedOnTop(helpTip)).toEqual({ opacity: "1", covered: [] });
    await expect(tip).toHaveCount(0);
    await rest(l.page.getByRole("menuitem", { name: /^Settings…/ }));
    await l.page.waitForTimeout(700);
    await expect(l.page.getByRole("tooltip")).toHaveCount(0);
    await l.page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("full-app Connect and modal portals cannot be painted over by docked Files", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Overlay safety\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note, filesPinned: true,
  }));
  const l = await launch(dirs, makeFakes({ token: "ghp_unused", gcm: true }).env);
  try {
    const files = l.page.locator('[data-surface="sheet"][data-docked]');
    await expect(files).toBeVisible();
    await l.page.keyboard.press("Control+,");
    const modal = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.locator("xpath=ancestor::*[@data-full-app-overlays]")).toHaveCount(1);
    await modal.getByRole("tab", { name: "Account", exact: true }).click();
    await modal.getByRole("button", { name: /^Sign in/ }).click();
    const connect = l.page.getByRole("main", { name: "Set up Focus Notes" });
    await expect(connect.getByRole("heading", { name: "Connect your GitHub account" })).toBeVisible();
    await expect(connect.locator("xpath=ancestor::*[@data-full-app-overlays]")).toHaveCount(1);
    const host = l.page.locator("[data-full-app-overlays]");
    await expect(host).toHaveCount(1);
    expect(await host.evaluate(el => el.parentElement?.hasAttribute("data-app-root"))).toBe(true);
    expect(await connect.evaluate(el => el.closest('[data-surface="sheet"]'))).toBeNull();
    const visibleOverHeader = await files.evaluate(el => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 60);
      return Boolean(hit?.closest("[data-full-app-overlays]"));
    });
    expect(visibleOverHeader).toBe(true);
    await l.page.keyboard.press("Escape");
    expect(readFileSync(note, "utf8")).toBe("# Overlay safety\n");
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("review feedback: project scheme reaches Settings and edge blur excludes both docked panels", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, Array.from({ length: 30 }, (_, i) => `## Section ${i}\n\nSample paragraph ${i} has enough words to fill the writing area and keep both scroll edges active.\n`).join("\n"));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note,
    appearance: "dark", focusMode: false, outlinePinned: true, filesPinned: true,
    projectSettings: { [dirs.docs]: { name: "Sample project", accent: "blue", logo: "rocket", watermark: "off", font: "app", theme: "sepia" } },
  }));
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: 1400, height: 850 } }));
  const baseline = process.env.FOCUS_NOTES_REVIEW_BASELINE;
  const l = await launch(dirs, {}, baseline ? { entrypoint: join(baseline, "app", "out", "main", "main.mjs") } : {});
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Sample paragraph");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    await expect(files).toHaveAttribute("data-docked", "");
    await expect(l.page.locator("[data-doc-minimap-card]")).toHaveAttribute("data-docked", "");
    await expect.poll(() => l.page.locator("[data-editor-scroller]").evaluate(el => {
      el.scrollTop = 500;
      return el.hasAttribute("data-fade-top");
    })).toBe(true);
    await expect(l.page.locator('[data-scroll-edge="top"]')).toBeVisible();
    await expect(l.page.locator('[data-scroll-edge="bottom"]')).toBeVisible();
    const shots = process.env.FOCUS_NOTES_REVIEW_OUT ?? test.info().outputPath("ui-states-owner-feedback");
    mkdirSync(shots, { recursive: true });
    await l.page.screenshot({ path: join(shots, baseline ? "before.png" : "after.png") });
    if (!baseline) {
      for (const edge of await l.page.locator("[data-scroll-edge]").all()) {
        const bounds = await edge.boundingBox();
        const area = await l.page.locator("[data-editor-scroller]").boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(area!.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(area!.x + area!.width);
      }
    }
    await l.page.keyboard.press("Control+,");
    await expect(l.page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    const scheme = await l.page.getByRole("dialog", { name: "Settings", exact: true }).evaluate(el => getComputedStyle(el).colorScheme);
    if (!baseline) {
      expect(scheme).toBe("light");
      await expect(l.page.locator("html")).toHaveAttribute("data-theme", "sepia");
    }
    console.log(JSON.stringify({ baseline: Boolean(baseline), settingsScheme: scheme }));
  } finally {
    try { await quit(l); }
    finally {
      for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url)), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});
