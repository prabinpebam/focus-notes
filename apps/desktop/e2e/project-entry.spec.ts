import { test, expect, type Locator } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { emulateFocus, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { attachProject, closeProject, projectEntryApp } from "./project-process.ts";
import { WINDOW_METRICS } from "../../../packages/core/src/window-geometry.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

const expectedOpacity = journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1;
const sizes = [
  { width: WINDOW_METRICS.minWidth, height: WINDOW_METRICS.minHeight },
  { width: 640, height: 480 }, { width: 900, height: 640 },
  { width: 1024, height: 720 }, { width: 1100, height: 780 }, { width: 1440, height: 900 },
];

async function assertOpenBounds(open: Locator, context: object): Promise<void> {
  const measure = () => open.evaluate(element => {
    const box = element.getBoundingClientRect();
    const root = document.querySelector("[data-app-root]")!.getBoundingClientRect();
    return {
      top: box.top, bottom: box.bottom, left: box.left, right: box.right,
      clientTop: root.top, clientBottom: root.bottom, clientLeft: root.left, clientRight: root.right,
      centreError: Math.abs((box.top + box.bottom - root.top - root.bottom) / 2),
      horizontalOverflow: Math.max(...[element, ...element.querySelectorAll("[data-dialog-body]")].map(node => node.scrollWidth - node.clientWidth)),
      clippedControls: [...element.querySelectorAll("button,input,[role=combobox]")].filter(node => {
        const control = node.getBoundingClientRect();
        return control.width > 0 && (control.left < box.left || control.right > box.right);
      }).map(node => node.getAttribute("aria-label") ?? node.textContent),
    };
  });
  await expect.poll(async () => (await measure()).centreError).toBeLessThanOrEqual(2);
  const measured = await measure();
  console.log("project-open-geometry", { ...context, ...measured });
  expect(measured.top).toBeGreaterThanOrEqual(measured.clientTop);
  expect(measured.bottom).toBeLessThanOrEqual(measured.clientBottom);
  expect(measured.left).toBeGreaterThanOrEqual(measured.clientLeft);
  expect(measured.right).toBeLessThanOrEqual(measured.clientRight);
  expect(measured.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(measured.clippedControls).toEqual([]);
  await expect(open.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await open.getByRole("button", { name: "Open project…", exact: true }).scrollIntoViewIfNeeded();
  await expect(open.getByRole("button", { name: "Open project…", exact: true })).toBeInViewport();
}

function linkFixture(folder: string, scratch: string): void {
  const remote = join(scratch, "remote.git").replace(/\\/g, "/");
  execFileSync("git", ["init", "--quiet", folder]);
  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  execFileSync("git", ["-C", folder, "remote", "add", "origin", "https://github.com/local/testing-delete.git"]);
  execFileSync("git", ["-C", folder, "config", `url.${remote}.insteadOf`, "https://github.com/local/testing-delete.git"]);
}

for (const route of ["Projects card", "Open project…", "Recent"] as const) {
  test(`${route} admits a real cold linked project window with its caret and preserves existing files (D-397)`, async () => {
    const dirs = tempDirs();
    const target = tempDirs();
    const folder = realpathSync.native(target.docs);
    const profile = join(dirs.userData, "project-profiles", "testing-delete");
    mkdirSync(profile, { recursive: true });
    mkdirSync(join(folder, ".focus-notes"));
    mkdirSync(join(folder, "notes"));
    writeFileSync(join(folder, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
    const root = join(folder, "notes");
    writeFileSync(join(root, ".gitkeep"), "preserve fixture metadata\n");
    const last = route === "Recent" ? join(root, "Untitled.md") : "";
    if (last) writeFileSync(last, "");
    writeFileSync(join(profile, "project-folder.txt"), folder);
    writeFileSync(join(profile, "workspace.json"), JSON.stringify({ version: 1, folder, kind: "local" }));
    writeFileSync(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: last, projectIntroSeen: true }));
    linkFixture(folder, target.userData);
    let origin: Launched | undefined;
    let child: Awaited<ReturnType<typeof attachProject>> | undefined;
    try {
      origin = await launch(dirs, {}, { entrypoint: projectEntryApp(dirs.userData) });
      await origin.page.keyboard.press("Control+Alt+O");
      const open = origin.page.getByRole("dialog", { name: "Open", exact: true });
      if (route === "Open project…") {
        await origin.app.evaluate(({ dialog }, folder) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
        }, folder);
        await open.getByRole("button", { name: "Open project…", exact: true }).click();
      } else {
        await open.getByRole("button", { name: route === "Recent" ? "Open Untitled" : `Open ${basename(folder)}`, exact: true }).click();
      }
      await expect(open).toBeHidden();
      child = await attachProject(profile);
      const note = child.page.getByRole("textbox", { name: "Note", exact: true });
      await expect(note).toBeVisible();
      await expect(note).toBeFocused();
      await expect(note).toHaveText("");
      await expect(child.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
      expect(await note.evaluate(element => {
        const selection = getSelection();
        return Boolean(selection?.isCollapsed && selection.rangeCount && element.contains(selection.anchorNode));
      })).toBe(true);
      expect(readdirSync(root).sort()).toEqual([".gitkeep", "Untitled.md"]);
      expect(readFileSync(join(root, ".gitkeep"), "utf8")).toBe("preserve fixture metadata\n");
      await child.page.keyboard.type("Entry route keeps this thought.");
      await expect.poll(() => readdirSync(root).filter(name => /\.md$/i.test(name)).map(name => readFileSync(join(root, name), "utf8")).join("")).toContain("Entry route keeps this thought.");
      expect(readdirSync(root).filter(name => /\.md$/i.test(name))).toHaveLength(1);
    } finally {
      if (child) await closeProject(child);
      if (origin) {
        try { await quit(origin); }
        finally {
          const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
          for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(origin.pid), ...flags], { stdio: "inherit" });
        }
      }
      for (const path of [dirs.userData, dirs.docs, target.userData, target.docs]) rmSync(path, { recursive: true, force: true });
    }
  });
}

test("Open Projects card opens an already-running linked empty project without another chooser (D-397)", async () => {
  test.setTimeout(60_000);
  const originDirs = tempDirs();
  const targetDirs = tempDirs();
  writeFileSync(join(originDirs.userData, "project-folder.txt"), originDirs.docs);
  writeFileSync(join(originDirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: originDirs.docs, kind: "local" }));
  const profile = join(originDirs.userData, "project-profiles", "testing-delete");
  mkdirSync(profile, { recursive: true });
  mkdirSync(join(targetDirs.docs, ".focus-notes"));
  mkdirSync(join(targetDirs.docs, "notes"));
  writeFileSync(join(targetDirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  writeFileSync(join(profile, "project-folder.txt"), targetDirs.docs);
  writeFileSync(join(profile, "workspace.json"), JSON.stringify({ version: 1, folder: targetDirs.docs, kind: "local" }));
  writeFileSync(join(profile, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", lastNotePath: "", projectIntroSeen: true,
  }));
  linkFixture(targetDirs.docs, targetDirs.userData);
  const owned: Launched[] = [];
  try {
    const target = await launch({ userData: profile, docs: targetDirs.docs }, { FOCUS_NOTES_PROJECTS_PROFILE: originDirs.userData });
    owned.push(target);
    const origin = await launch(originDirs);
    owned.push(origin);
    await origin.page.keyboard.press("Control+Alt+O");
    const open = origin.page.getByRole("dialog", { name: "Open", exact: true });
    const cardName = `Open ${basename(targetDirs.docs)}`;
    await expect(open.getByRole("button", { name: cardName, exact: true })).toBeVisible();
    await open.getByRole("button", { name: cardName, exact: true }).click();
    await expect(open).toBeHidden();
    expect(target.app.windows()).toHaveLength(1);
    const note = target.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    await expect(note).toHaveText("");
    await expect(target.page.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(await note.evaluate(element => {
      const selection = getSelection();
      return Boolean(selection?.isCollapsed && selection.rangeCount && element.contains(selection.anchorNode));
    })).toBe(true);
  } finally {
    for (const instance of owned.reverse()) {
      try { await quit(instance); }
      finally {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
      }
    }
    for (const path of [originDirs.userData, originDirs.docs, targetDirs.userData, targetDirs.docs]) rmSync(path, { recursive: true, force: true });
  }
});

for (const content of ["", "# Restored note\n\nKeep this exact content.\n"]) {
test(`A linked project reopens its ${content ? "valid" : "empty"} last Untitled and opens a real new window without replacement (D-397)`, async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  mkdirSync(join(dirs.docs, "notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  const notePath = join(dirs.docs, "notes", "Untitled.md");
  writeFileSync(notePath, content);
  linkFixture(dirs.docs, dirs.userData);
  writeFileSync(join(dirs.userData, "project-folder.txt"), dirs.docs);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: notePath }));
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs);
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    const open = instance.page.getByRole("dialog", { name: "Open", exact: true });
    await expect.poll(() => note.isVisible().then(visible => visible || open.isVisible())).toBe(true);
    if (await open.isVisible()) {
      console.log("base-linked-empty-landing", await open.evaluate(element => {
        const box = element.getBoundingClientRect();
        const root = document.querySelector("[data-app-root]")!.getBoundingClientRect();
        return { dialog: { top: box.top, bottom: box.bottom, height: box.height }, client: { top: root.top, bottom: root.bottom, height: root.height } };
      }));
      await instance.page.screenshot({ path: join(dirs.userData, "base-linked-empty.png") });
    }
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    if (content) await expect(note).toContainText("Keep this exact content.");
    else await expect(note).toHaveText("");
    await expect(open).toBeHidden();
    expect(readFileSync(notePath, "utf8")).toBe(content);
    await instance.page.keyboard.press("Control+/");
    const actions = instance.page.getByRole("dialog", { name: "Actions", exact: true });
    const title = content ? "Restored note" : "Untitled";
    await actions.getByRole("combobox").fill(title);
    await expect(actions.getByRole("option").first()).toContainText(title);
    const nextWindow = instance.app.waitForEvent("window");
    await instance.page.keyboard.press("Control+Enter");
    const secondary = await nextWindow;
    await emulateFocus(secondary);
    const secondNote = secondary.getByRole("textbox", { name: "Note", exact: true });
    await expect(secondNote).toBeVisible();
    await expect(secondNote).toBeFocused();
    if (content) await expect(secondNote).toContainText("Keep this exact content.");
    else await expect(secondNote).toHaveText("");
    await expect(secondary.getByRole("dialog", { name: "Open", exact: true })).toBeHidden();
    expect(await secondNote.evaluate(element => {
      const selection = getSelection();
      return Boolean(selection?.isCollapsed && selection.rangeCount && element.contains(selection.anchorNode));
    })).toBe(true);
    expect(readdirSync(join(dirs.docs, "notes"))).toEqual(["Untitled.md"]);
    expect(readFileSync(notePath, "utf8")).toBe(content);
    for (const scheme of ["light", "dark"]) {
      const expectedTheme = scheme === "light" ? "paper" : "ink";
      if (await secondary.locator("html").getAttribute("data-theme") !== expectedTheme) await secondary.keyboard.press("Control+Shift+L");
      await expect(secondary.locator("html")).toHaveAttribute("data-theme", expectedTheme);
      await secondary.keyboard.press("Control+Alt+O");
      const secondOpen = secondary.getByRole("dialog", { name: "Open", exact: true });
      await expect(secondOpen).toBeVisible();
      for (const size of sizes) {
        await instance.app.evaluate(({ BrowserWindow }, { size, url, opacity }) => {
          const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === url)!;
          if (window.getOpacity() !== opacity || (!process.env.CI && opacity !== 0)) throw new Error("Geometry journeys require the expected CI or invisible local window");
          window.setContentSize(size.width, size.height);
        }, { size, url: secondary.url(), opacity: expectedOpacity });
        await assertOpenBounds(secondOpen, { secondary: true, populated: Boolean(content), scheme, size });
      }
      await secondOpen.getByRole("button", { name: "Close", exact: true }).click();
      await expect(secondOpen).toBeHidden();
    }
  } finally {
    if (instance) {
      try { await quit(instance); }
      finally {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
      }
    }
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});
}

for (const populated of [false, true]) for (const scheme of ["light", "dark"] as const) {
test(`Open stays centred and unclipped after project cards load: ${populated ? "populated" : "empty"} linked project, ${scheme}, all supported sizes (D-375)`, async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  mkdirSync(join(dirs.docs, "notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1}\n');
  const path = join(dirs.docs, "notes", "Untitled.md");
  writeFileSync(path, "");
  if (populated) writeFileSync(join(dirs.docs, "notes", "Existing.md"), "# Existing\n\nPreserve this note.\n");
  linkFixture(dirs.docs, dirs.userData);
  writeFileSync(join(dirs.userData, "project-folder.txt"), dirs.docs);
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind: "local" }));
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: path }));
  writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, width: 900, height: 640 } }));
  for (let i = 0; i < 1; i++) {
    const profile = join(dirs.userData, "project-profiles", `other-${i}`);
    const folder = join(dirs.userData, `other-notes-${i}`);
    mkdirSync(profile, { recursive: true });
    mkdirSync(folder);
    writeFileSync(join(profile, "project-folder.txt"), folder);
    writeFileSync(join(profile, "state.json"), '{"version":1}');
  }
  let instance: Launched | undefined;
  try {
    instance = await launch(dirs);
    await expect(instance.page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    const expectedTheme = scheme === "light" ? "paper" : "ink";
    if (await instance.page.locator("html").getAttribute("data-theme") !== expectedTheme) await instance.page.keyboard.press("Control+Shift+L");
    await expect(instance.page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
    await instance.page.keyboard.press("Control+Alt+O");
    const open = instance.page.getByRole("dialog", { name: "Open", exact: true });
    await expect(open).toBeVisible();
    await expect(open.getByRole("button", { name: "Open other-notes-0", exact: true })).toBeVisible();
    await open.getByRole("button", { name: "Close", exact: true }).click();
    await expect(open).toBeHidden();
    for (let i = 1; i < 6; i++) {
      const profile = join(dirs.userData, "project-profiles", `other-${i}`);
      const folder = join(dirs.userData, `other-notes-${i}`);
      mkdirSync(profile, { recursive: true });
      mkdirSync(folder);
      writeFileSync(join(profile, "project-folder.txt"), folder);
      writeFileSync(join(profile, "state.json"), '{"version":1}');
    }
    await instance.page.keyboard.press("Control+Alt+O");
    await expect(open.getByRole("button", { name: "Open other-notes-5", exact: true })).toBeVisible();
    for (const size of sizes) {
      await instance.app.evaluate(({ BrowserWindow }, { size, opacity }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        if (window.getOpacity() !== opacity || (!process.env.CI && opacity !== 0)) throw new Error("Geometry journeys require the expected CI or invisible local window");
        window.setContentSize(size.width, size.height);
      }, { size, opacity: expectedOpacity });
      await assertOpenBounds(open, { secondary: false, populated, scheme, size });
    }
    if (populated) expect(readFileSync(join(dirs.docs, "notes", "Existing.md"), "utf8")).toBe("# Existing\n\nPreserve this note.\n");
  } finally {
    if (instance) {
      try { await quit(instance); }
      finally {
        const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(instance.pid), ...flags], { stdio: "inherit" });
      }
    }
    rmSync(dirs.userData, { recursive: true, force: true });
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});
}
