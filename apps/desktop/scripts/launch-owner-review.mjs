// Owner review launcher: the normal app, its own profile and workspace, one ordinary note.
// No flags, sample modes or test switches: every FOCUS_NOTES_* variable is removed first, and only
// the profile and workspace folders are set, under <worktree>\scratch\owner-review\<head>\.
import { mkdir, writeFile, access } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const desktop = join(root, "apps", "desktop");
const head = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const base = join(root, "scratch", "owner-review", head);
const profile = join(base, "profile");
const workspace = join(base, "workspace");
const note = join(workspace, "Sample.md");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const key of Object.keys(env)) if (key.startsWith("FOCUS_NOTES_")) delete env[key];
env.FOCUS_NOTES_USER_DATA = profile;
env.FOCUS_NOTES_DOCS = workspace;

await mkdir(profile, { recursive: true });
await mkdir(workspace, { recursive: true });
const exists = (p) => access(p).then(() => true, () => false);
if (!(await exists(note))) {
  await writeFile(note, [
    "# A little room to think",
    "",
    "I think it is really important to make some time every day to focus on the things that matter most, without getting distracted by all the other things.",
    "",
    "A quiet morning is enough to begin. Put the phone away, open a page, and leave the rest for later.",
    "",
  ].join("\n"), "utf8");
}
// An ordinary local workspace that has finished its first run, opened on Sample.md.
if (!(await exists(join(profile, "workspace.json")))) {
  await writeFile(join(profile, "workspace.json"), `${JSON.stringify({ version: 1, folder: workspace, kind: "local" }, null, 2)}\n`, "utf8");
}
if (!(await exists(join(profile, "state.json")))) {
  await writeFile(join(profile, "state.json"), `${JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }, null, 2)}\n`, "utf8");
}

const require = createRequire(join(desktop, "package.json"));
const electron = require("electron");
const child = spawn(electron, [join(desktop, "out", "main", "main.mjs")], { cwd: desktop, env, detached: true, stdio: "ignore", windowsHide: false });
child.unref();
console.log(JSON.stringify({ head, pid: child.pid, profile, workspace, note }));
