import { createServer } from "node:http";
import { mkdirSync, existsSync, writeFileSync, readFileSync, openSync, closeSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const candidate = dirname(fileURLToPath(import.meta.url));
const worker = "__REVIEW_WORKTREE__";
const inspect = process.argv.includes("--inspect");
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^FOCUS_NOTES_E2E/i.test(key)));
if (!inspect && !process.argv.includes("--owner-shell")) {
  const command = join(candidate, "Open review build.cmd").replaceAll("'", "''");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; $shell=New-Object -ComObject Shell.Application; $shell.ShellExecute('${command}', '--owner-shell', '${candidate.replaceAll("'", "''")}', 'open', 1)`],
  { env: cleanEnv, stdio: "inherit" });
  console.log("Normal Windows Shell launch requested; wait for exposed-window verification before reporting it open.");
  process.exit(0);
}
const profile = join(candidate, inspect ? "feedback-inspection-profile" : "owner-review-profile");
const gitEnv = { ...cleanEnv, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(candidate, "local.gitconfig") };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: gitEnv, stdio: "pipe" });
const remotes = join(candidate, "local-git");
const samples = [
  { folder: "field-notes", name: "Field notes", accent: "blue", logo: "rocket", theme: "sepia" },
  { folder: "garden-notes", name: "Garden notes", accent: "green", logo: "leaf", theme: "ink" },
];
for (const sample of samples) {
  sample.workspace = join(candidate, sample.folder);
  sample.profile = sample === samples[0] ? profile : join(profile, "project-profiles", sample.folder);
  sample.note = join(sample.workspace, "notes", "welcome.md");
  mkdirSync(join(sample.workspace, "notes"), { recursive: true });
  mkdirSync(join(sample.workspace, ".focus-notes"), { recursive: true });
  if (!existsSync(sample.note)) {
    writeFileSync(sample.note, `# ${sample.name}\n\nSynthetic sample notes only.\n\nUse Open (Ctrl+Alt+O) and choose ${sample === samples[0] ? "Garden notes" : "Field notes"} to open its separate window.\n\n${Array.from({ length: 16 }, (_, i) => `## Sample ${i + 1}\n\nA sample paragraph for reviewing scrolling, panels and appearance.\n`).join("\n")}`);
    writeFileSync(join(sample.workspace, ".focus-notes", "workspace.json"), '{"formatVersion":1,"templateVersion":"0.0.0"}\n');
    git(sample.workspace, "init", "-b", "main");
    git(sample.workspace, "add", ".");
    git(sample.workspace, "-c", "user.name=Review", "-c", "user.email=review@example.invalid", "commit", "-m", "Synthetic sample notes");
  }
  const remote = join(remotes, "review-user", `${sample.folder}.git`);
  if (!existsSync(remote)) {
    mkdirSync(dirname(remote), { recursive: true });
    git(sample.workspace, "clone", "--bare", sample.workspace, remote);
  }
  mkdirSync(sample.profile, { recursive: true });
  if (!existsSync(join(sample.profile, "state.json"))) {
    writeFileSync(join(sample.profile, "state.json"), JSON.stringify({
      version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: sample.note,
      appearance: "dark", focusMode: false,
      projectSettings: { [sample.workspace]: { name: sample.name, accent: sample.accent, logo: sample.logo, watermark: "on", font: "app", theme: sample.theme } },
    }));
    writeFileSync(join(sample.profile, "project-folder.txt"), sample.workspace);
    writeFileSync(join(sample.profile, "workspace.json"), JSON.stringify({ version: 1, folder: sample.workspace, kind: "local" }));
  }
}
const repositories = samples.map(sample => ({ name: sample.folder, owner: { login: "review-user" }, private: true, default_branch: "main", permissions: { push: true } }));
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const value = req.method !== "GET" ? undefined : path === "/user/repos" ? repositories
    : path === "/user" ? { login: "review-user", id: 1, name: "Local review" }
    : repositories.find(repo => path === `/repos/review-user/${repo.name}`);
  res.writeHead(value ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value ?? { message: "Local review only. No real account is connected." }));
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const envFor = sample => ({
  ...gitEnv, FOCUS_NOTES_USER_DATA: sample.profile, FOCUS_NOTES_PROJECTS_PROFILE: profile,
  FOCUS_NOTES_DOCS: sample.workspace, FOCUS_NOTES_LOCAL_NOTES_HOME: join(candidate, "Local notes"),
  FOCUS_NOTES_GITHUB_API: origin, FOCUS_NOTES_CANDIDATE_GITHUB_API: origin,
  FOCUS_NOTES_CANDIDATE_GIT_REMOTES: remotes,
  ...(inspect ? { FOCUS_NOTES_E2E: "1", FOCUS_NOTES_E2E_VISIBLE: "0" } : {}),
});
const close = () => { server.closeAllConnections(); server.close(); };
if (inspect) {
  const require = createRequire(join(worker, "apps", "desktop", "package.json"));
  const { _electron, expect } = require("@playwright/test");
  try {
    for (const sample of samples) {
      let app, pid;
      try {
        app = await _electron.launch({ executablePath: join(candidate, "electron.exe"), args: [join(candidate, "app")], env: envFor(sample) });
        pid = await app.evaluate(() => process.pid);
        const page = await app.firstWindow();
        await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
        await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText(sample.name);
        await page.keyboard.press("Control+,");
        const settings = page.getByRole("dialog", { name: "Settings", exact: true });
        await expect(settings).toBeVisible();
        expect(await settings.evaluate(el => getComputedStyle(el).colorScheme)).toBe(sample.theme === "ink" ? "dark" : "light");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+Alt+o");
        const open = page.getByRole("dialog", { name: "Open", exact: true }).or(page.getByRole("region", { name: "Open", exact: true }));
        for (const project of samples) {
          const card = open.locator("[data-open-item=project]").filter({ hasText: project.name });
          await expect(card).toHaveAttribute("data-project-accent", project.accent);
        }
        await open.getByRole("button", { name: "Open from GitHub…", exact: true }).click();
        for (const repo of repositories) await expect(page.getByText(repo.name, { exact: true })).toBeVisible();
        const state = JSON.parse(readFileSync(join(sample.profile, "state.json"), "utf8"));
        expect(state.projectSettings[sample.workspace].logo).toBe(sample.logo);
        console.log(`Inspected ${sample.name}: actual note, Settings scheme, both Open project cards and both loopback repositories.`);
      } finally {
        try { if (app) await app.close(); }
        finally {
          if (pid) for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", join(worker, "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(pid), ...flags], { stdio: "inherit" });
        }
      }
    }
  } finally { close(); }
} else {
  const env = envFor(samples[0]);
  const log = openSync(join(candidate, "owner-review-app.log"), "a");
  const child = spawn(join(candidate, "electron.exe"), [join(candidate, "app")], { env, stdio: ["ignore", log, log] });
  closeSync(log);
  child.once("error", error => { console.error(error); close(); process.exitCode = 1; });
  child.once("exit", close);
  child.once("spawn", () => {
    const receipt = join(candidate, "owner-review-process.json");
    writeFileSync(receipt, JSON.stringify({
      pid: child.pid, launcherPid: process.pid, origin, profile, commit: basename(candidate),
      e2eVariables: Object.keys(env).filter(key => /^FOCUS_NOTES_E2E/i.test(key)),
    }));
    console.log(`Owner review started: PID ${child.pid}; verification pending; Open > Garden notes opens the second project window.`);
    const verification = spawn("pwsh", ["-NoProfile", "-File", join(candidate, "verify-owner-review.ps1"), "-Receipt", receipt], { env: cleanEnv, stdio: "inherit" });
    verification.once("error", error => console.error("Owner review is NOT verified:", error));
    verification.once("exit", code => {
      if (code !== 0) console.error("Owner review is NOT verified as exposed. Check owner-review-app.log; do not activate or relaunch it automatically.");
    });
  });
}
