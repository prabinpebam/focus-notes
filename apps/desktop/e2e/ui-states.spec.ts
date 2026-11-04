import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { DATA_FILES, DATA_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";

async function closeTestApp(l: Launched) {
  try {
    await quit(l);
  } finally {
    if (process.platform === "win32") {
      const cleanup = fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url));
      for (const flags of [["-WhatIf"], []]) {
        execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
    }
  }
}

test("New project and Local import recover without repeating completed creation or copying a partial note", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "local-draft.md");
  writeFileSync(note, "# Local draft\n\nKeep these exact bytes.\n");
  const before = readFileSync(note);
  const destination = join(dirs.userData, "Imported");
  const notes = join(destination, "notes"), held = `${notes}.held`;
  mkdirSync(notes, { recursive: true });
  const targetProfile = join(dirs.userData, DATA_FOLDERS.projectProfiles, "synthetic-import");
  mkdirSync(targetProfile, { recursive: true });
  writeFileSync(join(targetProfile, DATA_FILES.projectFolder), destination);
  writeFileSync(join(targetProfile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done" }));
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_LOCAL_NOTES_HOME: dirs.docs });
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Import into project…", exact: true }).click();
    const sheet = l.page.getByRole("dialog", { name: "Import into project", exact: true });
    renameSync(notes, held); writeFileSync(notes, "blocked directory");
    await sheet.getByRole("option", { name: /Imported/ }).click();
    const failure = sheet.locator("[data-status-row=danger]");
    await expect(failure).toContainText("Your Local note is unchanged.");
    expect(readFileSync(note)).toEqual(before);
    rmSync(notes); renameSync(held, notes);
    await failure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(sheet).not.toBeVisible();
    expect(readdirSync(notes)).toEqual(["local-draft.md"]);
    expect(readFileSync(join(notes, "local-draft.md"))).toEqual(before);
    expect(readFileSync(note)).toEqual(before);

    await l.app.evaluate(({ ipcMain }, folder) => {
      let creates = 0, opens = 0;
      ipcMain.removeHandler("projects:check");
      ipcMain.handle("projects:check", (_event, _parent, name) => ({ folder: `${folder}\\${name}`, problem: "" }));
      ipcMain.removeHandler("projects:create");
      ipcMain.handle("projects:create", () => { Reflect.set(globalThis, "fnUiStatesCreates", ++creates); return folder; });
      ipcMain.removeHandler("projects:open");
      ipcMain.handle("projects:open", async () => {
        if (++opens === 1) throw new Error("sensitive diagnostic notFound");
        await new Promise(resolve => setTimeout(resolve, 600));
      });
    }, destination);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    await l.page.getByRole("dialog", { name: "Open", exact: true }).getByRole("button", { name: "New project…", exact: true }).click();
    const project = l.page.getByRole("dialog", { name: "New project", exact: true });
    await project.getByRole("textbox", { name: "Project name", exact: true }).fill("Kept project choices");
    for (let i = 0; i < 3; i++) await project.getByRole("button", { name: "Next", exact: true }).click();
    await project.getByRole("button", { name: "Create project", exact: true }).click();
    const projectFailure = project.locator("[data-status-row=danger]");
    await expect(projectFailure).toContainText("The project was created but couldn’t open.");
    expect(await project.innerText()).not.toContain("sensitive diagnostic");
    await projectFailure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(projectFailure.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(project.getByRole("heading", { name: "Kept project choices", exact: true })).toBeVisible();
    await expect(project).not.toBeVisible();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "fnUiStatesCreates"))).toBe(1);
    expect(readFileSync(note)).toEqual(before);
    expect(readdirSync(notes)).toEqual(["local-draft.md"]);
  } finally {
    if (existsSync(held)) { if (existsSync(notes)) rmSync(notes); renameSync(held, notes); }
    await closeTestApp(l);
  }
});

test("AI details commit independently and key Save checks before persistence, retaining failures and secrets locally", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  const file = join(dirs.userData, DATA_FILES.ai), backup = `${file}.before-failure`;
  const note = join(dirs.docs, "ai-commits.md");
  writeFileSync(note, "# AI commits\n\nThese note words must never enter a key check.\n");
  const noteBytes = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const requests: string[] = [];
  let hold = true, status = 200, respond: (() => void) | undefined;
  const release = () => { const finish = respond; respond = undefined; finish?.(); };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += String(chunk); });
    req.on("end", () => {
      requests.push(body);
      const finish = () => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
      };
      if (hold) respond = finish; else finish();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Synthetic provider did not bind");
  writeFileSync(file, JSON.stringify({
    version: 2, writer: "synthetic",
    connections: [{ id: "synthetic", provider: "compatible", name: "AI writing", endpoint: `http://127.0.0.1:${address.port}/v1`, model: "model-a", deployment: "", apiVersion: "", account: "" }],
  }));
  const saved = () => JSON.parse(readFileSync(file, "utf8")).connections[0] as { name: string; model: string; key?: string };
  const restore = () => {
    if (existsSync(file) && statSync(file).isDirectory()) rmSync(file, { recursive: true });
    if (existsSync(backup)) renameSync(backup, file);
  };
  let l: Launched | undefined;
  try {
    l = await launch(dirs);
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    await settings.getByRole("button", { name: "Change", exact: true }).click();
    await expect(settings.getByText("Connection details", { exact: true })).toBeVisible();
    await expect(settings.getByText("Access key", { exact: true })).toBeVisible();
    const name = settings.getByRole("textbox", { name: "Name", exact: true });
    const model = settings.getByRole("textbox", { name: "Model", exact: true });
    await name.fill("Kept writing connection");
    renameSync(file, backup); mkdirSync(file);
    await name.press("Tab");
    await expect(settings.getByText("Couldn't save this change. What you typed is still here.", { exact: true })).toBeVisible();
    await expect(name).toHaveValue("Kept writing connection");
    restore();
    await model.fill("model-b"); await model.press("Tab");
    await expect.poll(() => saved().model).toBe("model-b");
    expect(saved().name).toBe("AI writing");
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().name).toBe("Kept writing connection");
    expect(requests).toHaveLength(0);

    const key = settings.getByLabel("API key (optional)", { exact: true });
    await key.fill("synthetic-key-one");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    const checking = settings.getByRole("button", { name: "Checking key…", exact: true });
    await expect(checking).toHaveAttribute("aria-busy", "true");
    await expect(key).toHaveAttribute("readonly", "");
    expect(saved().key).toBeUndefined();
    await expect(key).toHaveValue("synthetic-key-one");
    await name.fill("Independent during key check"); await name.press("Tab");
    await expect.poll(() => saved().name).toBe("Independent during key check");
    expect(saved().key).toBeUndefined();
    release();
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toBeVisible();
    await expect(key).toHaveValue("");
    const sealed = saved().key;
    expect(sealed).toBeTruthy();
    expect(readFileSync(file, "utf8")).not.toContain("synthetic-key-one");
    await expect(settings.getByRole("button", { name: "Save key", exact: true })).toBeVisible();

    hold = false; status = 401;
    await key.fill("synthetic-key-two");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    const kept = settings.getByText(/Your entry is kept here\. The saved key is unchanged/);
    await expect(kept).toBeVisible();
    await expect(key).toHaveValue("synthetic-key-two");
    expect(saved().key).toBe(sealed);
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toHaveCount(0);

    status = 200; hold = true;
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => requests.length).toBe(3);
    renameSync(file, backup); mkdirSync(file);
    release();
    await expect(settings.getByRole("button", { name: "Save key", exact: true }).locator("[data-border-progress]")).toHaveAttribute("data-border-progress", "failed");
    await expect(key).toHaveValue("synthetic-key-two");
    restore();
    expect(saved().key).toBe(sealed);
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(key).toHaveValue("");
    expect(requests).toHaveLength(3);
    expect(saved().key).toBe(sealed);

    hold = false;
    await key.fill("synthetic-key-two");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toBeVisible();
    await expect(key).toHaveValue("");
    expect(saved().key).not.toBe(sealed);
    for (const body of requests) {
      expect(JSON.parse(body)).toMatchObject({ messages: [{ role: "system", content: "Reply with the single word OK." }, { role: "user", content: "Connection test." }] });
      expect(body).not.toContain("These note words");
    }
    expect(await settings.innerText()).not.toContain("synthetic-key");
    expect(readFileSync(note)).toEqual(noteBytes);
    await key.fill("do-not-carry-to-another-destination");
    const endpoint = settings.getByRole("textbox", { name: "Address", exact: true });
    await endpoint.fill(`http://127.0.0.1:${address.port}/v2`); await endpoint.press("Tab");
    await expect(key).toHaveValue("");
    await expect.poll(() => saved().key).toBeUndefined();
    expect(requests).toHaveLength(4);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  } finally {
    release(); restore();
    if (l) await closeTestApp(l);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("known-empty wrappers keep their first actions local and filtered Open can clear its search", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).toBeVisible();
    await expect(settings.getByText("Connect an app or API you already use.", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Add connection", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).not.toBeVisible();
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Add connection", exact: true }).click();
    await settings.getByRole("button", { name: "Service", exact: true }).click();
    await l.page.getByRole("menuitemcheckbox", { name: "GitHub Copilot (on this computer)", exact: true }).click();
    await expect(settings.getByRole("textbox", { name: "Model", exact: true })).toHaveValue("auto");
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Change", exact: true })).toBeVisible();
    await expect(settings.getByText("No AI connections", { exact: true })).toHaveCount(0);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.ai), "utf8")).connections).toHaveLength(1);
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true }).or(l.page.getByRole("region", { name: "Open", exact: true }));
    await expect(open).toBeVisible();
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("No matching projects");
    await expect(open.getByText("No matches", { exact: true }).first()).toBeVisible();
    await open.getByRole("button", { name: "Clear search", exact: true }).first().click();
    await expect(search).toHaveValue("");
    await expect(open.getByText("No matches", { exact: true })).toHaveCount(0);
    await expect(open).toBeVisible();
  } finally { await closeTestApp(l); }
});

test("same-project Open retains the current note after a rejected read and closes only after accepted Retry", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "current.md"), target = join(dirs.docs, "target.md");
  writeFileSync(note, "# Current\n\nKept while opening.\n");
  writeFileSync(target, "# Target\n\nAccepted only after Retry.\n");
  const before = readFileSync(note), targetBefore = readFileSync(target);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.app.evaluate(({ ipcMain }, input) => {
      let reads = 0;
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", () => [{ folder: input.folder, name: "Current project", accent: "teal", logo: "book", lastNote: input.target }]);
      ipcMain.removeHandler("note:read");
      ipcMain.handle("note:read", async (_event, path) => {
        if (path !== input.target) return "# Current\n\nKept while opening.\n";
        if (++reads === 1) throw new Error("readOnly");
        await new Promise(resolve => setTimeout(resolve, 600));
        return "# Target\n\nAccepted only after Retry.\n";
      });
    }, { folder: dirs.docs, target });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("target");
    await open.getByRole("button", { name: "Open target", exact: true }).click();
    const row = open.locator("[data-status-row=danger]");
    await expect(row).toContainText("The project couldn’t be opened.");
    await expect(search).toHaveValue("target");
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Kept while opening.");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(editor).toContainText("Kept while opening.");
    await expect(open).not.toBeVisible();
    await expect(editor).toContainText("Accepted only after Retry.");
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:project.open").length)).toBe(2);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBeGreaterThan(0);
    expect(readFileSync(note)).toEqual(before);
    expect(readFileSync(target)).toEqual(targetBefore);
  } finally { await closeTestApp(l); }
});

test("Open retries the failed action in place, keeps input and never repeats a completed pin", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "open-recovery.md");
  writeFileSync(note, "# Open recovery\n\nThese exact note bytes stay here.\n");
  const before = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.app.evaluate(({ ipcMain }, folder) => {
      let reads = 0, pins = 0, opens = 0, failRefresh = false;
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", async () => {
        const request = ++reads;
        if (request === 2 || failRefresh) { failRefresh = false; throw new Error("sensitive diagnostic must stay hidden readOnly"); }
        if (request === 3) await new Promise(resolve => setTimeout(resolve, 600));
        return [{ folder, name: "Book", accent: "teal", logo: "book", pinned: pins > 0 }];
      });
      ipcMain.removeHandler("projects:pin");
      ipcMain.handle("projects:pin", () => { pins++; failRefresh = true; Reflect.set(globalThis, "fnUiStatesPinCount", pins); });
      ipcMain.removeHandler("projects:open");
      ipcMain.handle("projects:open", () => { if (++opens === 1) throw new Error("notFound"); });
    }, join(dirs.docs, "Synthetic Book"));
    const shortcut = process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o";
    await l.page.keyboard.press(shortcut);
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    const book = open.getByRole("button", { name: "Open Book", exact: true });
    await expect(book).toBeVisible();
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("Book");
    await l.page.keyboard.press(shortcut);
    const row = open.locator("[data-status-row=danger]");
    await expect(row).toContainText("Your projects couldn’t be listed. Your notes weren’t changed. Try again.");
    await row.getByText("Details", { exact: true }).click();
    await expect(row).toContainText("The system refused access to this location.");
    expect(await open.innerText()).not.toContain("sensitive diagnostic");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(book).toBeVisible();
    await expect(search).toHaveValue("Book");
    await expect(row.locator("details")).toHaveAttribute("open", "");
    await expect(row).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("Book");

    await open.getByRole("button", { name: "Pin Book", exact: true }).click();
    await expect(row).toContainText("The pin was changed, but the list couldn’t be refreshed.");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(open.getByRole("button", { name: "Unpin Book", exact: true })).toBeVisible();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "fnUiStatesPinCount"))).toBe(1);

    await book.click();
    await expect(row).toContainText("The project couldn’t be opened. Your notes weren’t changed.");
    await expect(open).toBeVisible();
    expect(readFileSync(note)).toEqual(before);
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(open).not.toBeVisible();
    expect(readFileSync(note)).toEqual(before);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("These exact note bytes stay here.");
  } finally { await closeTestApp(l); }
});

test("section loading uses the approved row shapes and keeps old content through a failed refresh and Retry", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    await l.app.evaluate(({ ipcMain }) => {
      let reads = 0;
      ipcMain.removeHandler("agents:load");
      ipcMain.handle("agents:load", async () => {
        const request = ++reads;
        await new Promise(resolve => setTimeout(resolve, 350));
        if (request === 2) throw new Error("section read refused");
        return {
          permissions: { connect: false, readPublic: true, readPrivate: false, edit: false, createPublic: true, folders: "all" },
          changedOutside: false, snippets: [], recent: [], cli: { available: false, installed: false, onPath: false },
        };
      });
    });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    const shapes = settings.locator("[data-shimmer]");
    await expect(shapes).toHaveCount(6);
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationIterationCount)).toBe("3");
    await l.page.emulateMedia({ reducedMotion: "reduce" });
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
    await expect(shapes).toHaveCount(0);
    const retained = settings.getByText("Agents can use all folders.", { exact: true });
    await expect(retained).toBeVisible();
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    await expect(retained).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect(settings.getByText("Couldn't read agent settings. Try again.", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(retained).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect(settings.getByText("Couldn't read agent settings. Try again.", { exact: true })).toHaveCount(0);
  } finally { await closeTestApp(l); }
});

test("a rejected settings write is reported and Retry persists the requested value", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    const scale = settings.getByRole("radiogroup", { name: "Interface size", exact: true });
    const larger = scale.getByRole("radio", { name: "110%", exact: true });
    await expect(larger).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await scale.getByText("110%", { exact: true }).click();
    await expect(settings.getByText("Couldn't save this choice. Try again or revert.", { exact: true })).toBeVisible();
    await expect(larger).toBeChecked();
    const retry = settings.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).uiScale).toBe(1.1);
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(settings).not.toBeVisible();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await expect(larger).toBeChecked();
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await closeTestApp(l);
  }
});

test("theme-manager appearance and paragraph choices retain failures and retry without blocking the other group", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", appearance: "light" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const mode = theme.getByRole("radiogroup", { name: "Appearance", exact: true });
    block();
    await mode.getByText("Dark", { exact: true }).click();
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mode.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    restore();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    const spacing = theme.getByRole("radiogroup", { name: "Paragraph spacing", exact: true });
    await spacing.getByText("Airy", { exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).paragraphSpacing).toBe("airy");
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).appearance).toBe("dark");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "ink");
    await expect(spacing.locator("..")).not.toHaveAttribute("data-commit", "pending");
    block();
    await spacing.getByText("Compact", { exact: true }).click();
    await expect(spacing.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
    const retries = theme.getByRole("button", { name: "Retry", exact: true });
    await expect(retries).toHaveCount(1);
    await expect(retries).toBeVisible();
    restore();
    await retries.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).paragraphSpacing).toBe("compact");
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(mode.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await expect(spacing.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("compact focus and docking controls retain stored values on failure and recover without changing the note", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  const text = "# A note\n\nKept text.\n\n## Another heading\n\nMore kept text.\n";
  writeFileSync(note, text);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, focusMode: false }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const retry = l.page.getByRole("region", { name: "Notifications", exact: true }).getByRole("button", { name: "Retry", exact: true });
  try {
    await l.page.getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    const toolbar = l.page.getByRole("toolbar", { name: "Toolbar", exact: true });
    const focus = toolbar.getByRole("button", { name: "Focus mode", exact: true });
    block();
    await focus.click();
    await expect(focus).toHaveAttribute("data-commit", "failed");
    await expect(focus).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar).toBeVisible();
    restore();
    await retry.click();
    await expect.poll(() => saved().focusMode).toBe(true);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await expect(focus).toHaveAttribute("aria-pressed", "true");
    await l.page.keyboard.press("Escape");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+o" : "Control+o");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const pin = files.getByRole("button", { name: "Dock Files", exact: true });
    block();
    await pin.click();
    await expect(pin).toHaveAttribute("data-commit", "failed");
    await expect(pin).toHaveAttribute("aria-pressed", "false");
    restore();
    await retry.click();
    await expect.poll(() => saved().filesPinned).toBe(true);
    await expect(files.getByRole("button", { name: "Undock Files", exact: true })).toHaveAttribute("aria-pressed", "true");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await toolbar.getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitemcheckbox", { name: "Dock contents", exact: true }).click();
    await expect.poll(() => saved().outlinePinned).toBe(true);
    const outline = l.page.getByRole("button", { name: "Undock contents", exact: true });
    await expect(outline).toBeVisible();
    await expect(outline).not.toHaveAttribute("data-commit", "pending");
    block();
    await outline.click();
    await expect(outline).toHaveAttribute("data-commit", "failed");
    await expect(outline).toHaveAttribute("aria-pressed", "true");
    restore();
    await retry.click();
    await expect.poll(() => saved().outlinePinned).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe(text);
  } finally { restore(); await closeTestApp(l); }
});

test("Reading size retains a failed value, retries exactly that value and leaves other reading choices alone", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Reading size\n\nKept text.\n");
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, fontSize: 16, paragraphSpacing: "airy" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const actualSize = () => l.page.locator("[data-editor]").evaluate((element) => getComputedStyle(element).fontSize);
  try {
    await l.page.getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    };
    await open();
    const manager = l.page.getByRole("complementary", { name: "Theme", exact: true });
    await manager.getByRole("tab", { name: "Reading", exact: true }).click();
    const reading = manager.getByRole("tabpanel", { name: "Reading", exact: true });
    block();
    await reading.getByRole("button", { name: "Larger text", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
    await expect(reading.locator("[data-commit=failed]")).toHaveCount(1);
    await expect(reading.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    expect(await actualSize()).toBe("16px");
    restore();
    await reading.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().fontSize).toBe(17);
    await expect.poll(actualSize).toBe("17px");
    await expect(reading.getByRole("button", { name: "Smaller text", exact: true })).not.toHaveAttribute("aria-disabled", "true");
    block();
    await reading.getByRole("button", { name: "Smaller text", exact: true }).click();
    await expect(reading.getByText("16 px", { exact: true })).toBeVisible();
    await expect(reading.locator("[data-commit=failed]")).toHaveCount(1);
    restore();
    await reading.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
    expect(saved()).toMatchObject({ fontSize: 17, paragraphSpacing: "airy" });
    expect(await actualSize()).toBe("17px");
    await manager.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await manager.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
  } finally { restore(); await closeTestApp(l); }
});

test("theme and font choices keep failed drafts, retry their own choice and reopen stored settings", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", appearance: "light" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  try {
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    };
    await open();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const gallery = theme.getByRole("listbox", { name: "Themes", exact: true });
    const paper = gallery.getByRole("option", { name: /^Paper/ });
    await paper.focus();
    await paper.press("ArrowRight");
    await expect.poll(() => saved().lightTheme).toBeUndefined();
    await expect.poll(() => saved().darkTheme).toBeUndefined();
    await l.page.keyboard.press("Escape");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    block();
    const dusk = gallery.getByRole("option", { name: /^Dusk/ });
    await dusk.click();
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(dusk).toHaveAttribute("aria-selected", "true");
    await expect(dusk.locator("[data-border-progress=failed]")).toHaveCount(1);
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    await dusk.press("Home");
    await expect(gallery.getByRole("option", { name: /^Paper/ })).toHaveAttribute("aria-selected", "true");
    restore();
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().darkTheme).toBe("dusk");
    await expect.poll(() => saved().appearance).toBe("dark");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "dusk");
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    const font = theme.getByRole("button", { name: /^Font:/ });
    await font.click();
    block();
    await l.page.getByRole("menuitemcheckbox", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(font).toHaveAttribute("data-commit", "failed");
    await expect(font).toContainText("Serif (Fraunces and Newsreader)");
    await expect(l.page.locator("html")).not.toHaveAttribute("data-content-font");
    restore();
    await theme.getByRole("tabpanel", { name: "Reading", exact: true }).getByRole("button", { name: "Revert", exact: true }).click();
    await expect(font).toContainText("Mono");
    await expect.poll(() => saved().contentFont).toBeUndefined();
    await font.click();
    block();
    await l.page.getByRole("menuitemcheckbox", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(font).toHaveAttribute("data-commit", "failed");
    restore();
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().contentFont).toBe("serif");
    await expect(l.page.locator("html")).toHaveAttribute("data-content-font", "serif");
    await expect(font).not.toHaveAttribute("data-commit", "pending");
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(font).toContainText("Serif (Fraunces and Newsreader)");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "dusk");
  } finally { restore(); await closeTestApp(l); }
});

test("reading sliders preview keyboard changes, retain failed values, retry and reopen stored settings", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", appearance: "light", measure: 70 }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
      await l.page.getByRole("tab", { name: "Reading", exact: true }).click();
    };
    await open();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const width = theme.getByRole("slider", { name: "Reading width", exact: true });
    await width.focus();
    await width.press("ArrowRight");
    await width.press("ArrowRight");
    expect(JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(70);
    await expect(theme.getByText("80 characters", { exact: true })).toBeVisible();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(80);
    await expect(width).toBeFocused();
    await expect(width.locator("xpath=ancestor::*[@data-commit][1]")).not.toHaveAttribute("data-commit", "pending");
    renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await width.press("ArrowRight");
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(width).toHaveValue("85");
    await expect(theme.getByText("85 characters", { exact: true })).toBeVisible();
    restore();
    const line = theme.getByRole("slider", { name: "Line spacing", exact: true });
    await line.focus();
    await line.press("End");
    await line.press("Tab");
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).lineHeight).toBe(2);
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(85);
    const dim = theme.getByRole("slider", { name: "Focus dim", exact: true });
    await dim.focus();
    await dim.press("End");
    await dim.press("Tab");
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).focusDim).toBe(0.6);
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await expect(width).toHaveValue("85");
    await expect(line).toHaveValue("2");
    await expect(dim).toHaveValue("0.6");
  } finally { restore(); await closeTestApp(l); }
});

test("SVG logo upload keeps its source on failure, retries without a picker and preserves the saved mark on Revert", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const logoFile = join(dirs.docs, "review-logo.svg");
  writeFileSync(logoFile, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>');
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, logoFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const upload = settings.getByRole("button", { name: "Upload SVG…", exact: true });
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await upload.click();
    await expect(settings.getByText("Couldn't save this logo. Your choice is kept here; the saved logo is unchanged. Try again or revert.", { exact: true })).toBeVisible();
    await expect(settings.locator('img[src^="data:image/svg+xml"]')).toBeVisible();
    restore();
    await l.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => { throw new Error("Retry must not reopen the picker"); };
    });
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    const saved = () => Object.values(JSON.parse(readFileSync(stateFile, "utf8")).projectSettings ?? {})[0] as { logo: string; logoSrc: string } | undefined;
    await expect.poll(() => saved()?.logo).toBe("upload");
    expect(saved()?.logoSrc).toMatch(/^data:image\/svg\+xml/);
    await settings.getByRole("button", { name: "Rocket", exact: true }).click();
    await expect.poll(() => saved()?.logo).toBe("rocket");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await l.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, logoFile);
    renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await upload.click();
    await expect(settings.getByRole("button", { name: "Revert", exact: true })).toBeVisible();
    restore();
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Rocket", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(saved()?.logo).toBe("rocket");
  } finally { restore(); await closeTestApp(l); }
});

test("four writing outcomes queue, reveal the next pill and retain a failed Retry without losing editor focus", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Notifications\n\nalpha alpha beta\n");
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, fontSize: 16 }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
    const region = l.page.getByRole("region", { name: "Notifications", exact: true });
    while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) {
      await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    }
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await editor.click();
    renameSync(stateFile, backup); mkdirSync(stateFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+=" : "Control+=");
    const retry = region.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(editor).toBeFocused();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
    const replaceAll = async (find: string, replace: string, count: number) => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+f" : "Control+h");
      const bar = l.page.getByRole("region", { name: "Find in note", exact: true });
      await bar.getByRole("searchbox", { name: "Find", exact: true }).fill(find);
      await expect(bar.getByRole("status").first()).toHaveText(new RegExp(`of ${count}$`));
      await bar.getByRole("searchbox", { name: "Replace with", exact: true }).fill(replace);
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Alt+Enter");
      await expect(editor).toContainText(replace);
      await l.page.keyboard.press("Escape");
      await expect(editor).toBeFocused();
    };
    await replaceAll("alpha", "gamma", 2);
    await replaceAll("beta", "delta", 1);
    await expect(region.locator("[data-surface=toast]")).toHaveCount(3);
    await expect(region).toContainText("1 more waiting");
    await expect(region.locator("[data-surface=toast]").first()).toHaveAttribute("data-tone", "error");
    await expect(region.locator("[data-surface=toast][data-tone=success]")).toHaveCount(1);
    await region.locator("[data-surface=toast][data-tone=warning]").getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(region.locator("[data-surface=toast][data-tone=success]")).toHaveCount(2);
    await expect(region).not.toContainText("1 more waiting");
    await expect(editor).toBeFocused();
    await l.page.keyboard.press("F6");
    await expect(retry).toBeFocused();
    await retry.click();
    await expect(retry).not.toHaveAttribute("aria-disabled", "true");
    await expect(region.locator("[data-surface=toast][data-tone=error]")).toHaveCount(1);
    await expect(retry).toBeVisible();
    restore();
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).fontSize).toBe(17);
    await expect(region.locator("[data-surface=toast][data-tone=error]")).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect(editor).toContainText("gamma gamma delta");
  } finally { restore(); await closeTestApp(l); }
});

test("an actually wrapped writing notice stays for eight visible seconds", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Wrapped notice\n\nKept text.\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await l.page.getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
    const region = l.page.getByRole("region", { name: "Notifications", exact: true });
    while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await l.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(360, 640);
      window.setContentSize(360, 640);
    });
    const time = new Date("2026-11-04T00:00:00Z");
    await l.page.clock.install({ time });
    await l.page.clock.pauseAt(new Date(time.getTime() + 1000));
    await l.page.getByRole("textbox", { name: "Note", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
    const notice = region.locator("[data-surface=toast][data-tone=warning]");
    await expect(notice).toBeVisible();
    const lines = await notice.locator("span[dir=auto]").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => rect.top)).size;
    });
    expect(lines).toBeGreaterThan(1);
    await l.page.clock.runFor(5999);
    await expect(notice).toBeVisible();
    await l.page.clock.runFor(2000);
    await expect(notice).toBeVisible();
    await l.page.clock.runFor(1);
    await expect(notice).toHaveCount(0);
  } finally { await closeTestApp(l); }
});

for (const endsFirst of ["hover", "focus"] as const) {
  test(`notification lifetime stays paused when ${endsFirst} ends while the other cause remains`, async () => {
    const dirs = tempDirs();
    const note = join(dirs.docs, "Welcome.md");
    const original = "# Pause causes\n\nKept text.\n";
    writeFileSync(note, original);
    writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
    const l = await launch(dirs);
    try {
      await l.page.getByRole("button", { name: "Dismiss", exact: true }).filter({ hasText: "Dismiss" }).click();
      const region = l.page.getByRole("region", { name: "Notifications", exact: true });
      while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
      const time = new Date("2026-11-04T00:00:00Z");
      await l.page.clock.install({ time });
      await l.page.clock.pauseAt(new Date(time.getTime() + 1000));
      const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
      await editor.click();
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
      const notice = region.locator("[data-surface=toast][data-tone=warning]");
      await expect(notice).toBeVisible();
      await l.page.clock.runFor(1000);
      await notice.hover();
      await l.page.keyboard.press("F6");
      await expect(notice.getByRole("button", { name: "Dismiss", exact: true })).toBeFocused();
      if (endsFirst === "hover") await editor.hover();
      else await editor.focus();
      await l.page.clock.runFor(8000);
      await expect(notice).toBeVisible();
      if (endsFirst === "hover") await editor.focus();
      else await editor.hover();
      await l.page.clock.runFor(4999);
      await expect(notice).toBeVisible();
      await l.page.clock.runFor(1);
      await expect(notice).toHaveCount(0);
      expect(readFileSync(note, "utf8")).toBe(original);
    } finally { await closeTestApp(l); }
  });
}

test("notification Retry stays above Settings and reachable with F6 while the modal stays open", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+=" : "Control+=");
    const retry = l.page.getByRole("region", { name: "Notifications", exact: true }).getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await l.page.keyboard.press("F6");
    await expect(retry).toBeFocused();
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).fontSize).toBeGreaterThan(16);
    await expect(settings).toBeVisible();
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await closeTestApp(l);
  }
});

test("project name saves on blur, keeps a rejected draft and retries without losing focus or input", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const name = settings.getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await name.fill("Kept project draft");
    await expect(name).toBeEditable();
    await name.press("Tab");
    await expect(settings.getByText("Couldn't save this change. What you typed is still here.", { exact: true })).toBeVisible();
    await expect(name).toHaveValue("Kept project draft");
    const savedNotice = l.page.getByRole("status").filter({ hasText: "Name saved." });
    await expect(savedNotice).toHaveCount(0);
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.name).toBe("Kept project draft");
    await expect(savedNotice).toHaveText("Name saved.");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await expect(name).toHaveValue("Kept project draft");
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await closeTestApp(l);
  }
});

test("project colour and logo keep failed choices, retry the latest value and revert without writing", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const blue = settings.getByRole("button", { name: "Blue", exact: true });
    const red = settings.getByRole("button", { name: "Red", exact: true });
    block();
    await blue.click();
    await expect(blue).toHaveAttribute("data-commit", "failed");
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    await red.click();
    await expect(red).toHaveAttribute("data-commit", "failed");
    await expect(blue).toHaveAttribute("aria-pressed", "false");
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(red).toHaveAttribute("data-commit", "failed");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.accent).toBe("red");
    const rocket = settings.getByRole("button", { name: "Rocket", exact: true });
    await rocket.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.logo).toBe("rocket");
    block();
    const star = settings.getByRole("button", { name: "Star", exact: true });
    await star.click();
    await expect(star).toHaveAttribute("data-commit", "failed");
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(rocket).toHaveAttribute("aria-pressed", "true");
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    expect(statSync(stateFile).isDirectory()).toBe(true);
    restore();
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("project font and theme retain failed choices on their triggers and keep keyboard preview separate from saving", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs];
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const font = settings.getByRole("button", { name: /^Font:/ });
    await font.click();
    const fonts = l.page.getByRole("dialog", { name: "Font", exact: true });
    block();
    await fonts.getByRole("button", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(fonts).not.toBeVisible();
    await expect(font).toHaveAttribute("data-commit", "failed");
    await expect(font).toHaveAccessibleName("Font: Serif (Fraunces and Newsreader)");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved()?.font).toBe("serif");
    const theme = settings.getByRole("button", { name: /^Theme:/ });
    await theme.click();
    const themes = l.page.getByRole("dialog", { name: "Colour theme", exact: true });
    const sepia = themes.getByRole("option", { name: /^Sepia/ });
    await sepia.focus();
    await sepia.press("ArrowRight");
    expect(saved()?.theme).toBe("app");
    block();
    await sepia.click();
    await expect(themes).not.toBeVisible();
    await expect(theme).toHaveAttribute("data-commit", "failed");
    await expect(theme).toHaveAccessibleName("Theme: Sepia");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved()?.theme).toBe("sepia");
    await expect(theme).not.toHaveAttribute("data-commit", "pending");
    await theme.click();
    await themes.getByRole("button", { name: "Use app default", exact: true }).click();
    await expect.poll(() => saved()?.theme).toBe("app");
    expect(saved()?.font).toBe("serif");
    await expect(theme).toHaveAccessibleName("Theme: App default");
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("a refused watermark change keeps the writing surface unchanged and Retry/Revert preserve its last saved value", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const watermark = settings.getByRole("radiogroup", { name: "Watermark", exact: true });
    const mark = l.page.locator('[data-project-mark="watermark"]');
    await expect(mark).toHaveCount(0);
    block();
    await watermark.getByText("On", { exact: true }).click();
    await expect(watermark.getByRole("radio", { name: "On", exact: true })).toBeChecked();
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(0);
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.watermark).toBe("on");
    await expect(mark).toHaveCount(1);
    await expect(watermark.locator("..")).not.toHaveAttribute("data-commit", "pending");
    block();
    await watermark.getByText("Off", { exact: true }).click();
    await expect(settings.getByRole("button", { name: "Revert", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(1);
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(watermark.getByRole("radio", { name: "On", exact: true })).toBeChecked();
    await expect(mark).toHaveCount(1);
    expect(statSync(stateFile).isDirectory()).toBe(true);
    restore();
  } finally {
    restore();
    await closeTestApp(l);
  }
});
