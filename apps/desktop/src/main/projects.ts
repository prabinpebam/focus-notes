import { app, dialog } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AppStateFile, ProjectEntry } from "@focus-notes/core";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "@focus-notes/core";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";
import { parseRecord } from "./workspace/record.ts";

export function projectWindows(home: () => string) {
  const rootProfile = resolve(process.env.FOCUS_NOTES_PROJECTS_PROFILE ?? app.getPath("userData"));
  const profiles = join(rootProfile, DATA_FOLDERS.projectProfiles);
  const known = new Map<string, string>();
  const key = (folder: string) => createHash("sha256").update(process.platform === "win32" ? folder.toLowerCase() : folder).digest("hex").slice(0, 24);
  async function state(profile: string): Promise<AppStateFile> {
    try {
      return JSON.parse(await readFile(join(profile, DATA_FILES.state), "utf8"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { version: 1 };
      throw error;
    }
  }
  async function list(): Promise<ProjectEntry[]> {
    known.clear();
    known.set(await realpath(home()), app.getPath("userData"));
    await mkdir(profiles, { recursive: true });
    if (app.getPath("userData") === rootProfile && !existsSync(join(rootProfile, DATA_FILES.projectFolder))) await writeFile(join(rootProfile, DATA_FILES.projectFolder), await realpath(home()), { flag: "wx" });
    const rootRecord = parseRecord(await readFile(join(rootProfile, DATA_FILES.workspace), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    }));
    if (rootRecord && existsSync(rootRecord.folder)) known.set(await realpath(rootRecord.folder), rootProfile);
    else if (existsSync(join(rootProfile, DATA_FILES.projectFolder))) {
      const folder = await readFile(join(rootProfile, DATA_FILES.projectFolder), "utf8");
      if (existsSync(folder)) known.set(await realpath(folder), rootProfile);
    }
    for (const name of await readdir(profiles)) {
      const profile = join(profiles, name);
      if (!(await stat(profile)).isDirectory()) continue;
      const folder = await readFile(join(profile, DATA_FILES.projectFolder), "utf8");
      if (existsSync(folder)) known.set(await realpath(folder), profile);
    }
    return Promise.all([...known].map(async ([folder, profile]) => {
      const saved = await state(profile);
      const identity = saved.projectSettings?.[folder];
      return { folder, name: identity?.name ?? basename(folder), accent: identity?.accent ?? "teal", logo: identity?.logo ?? "book", lastNote: saved.lastNotePath };
    }));
  }
  async function open(folder: string, note?: string): Promise<void> {
    await list();
    const canonical = await realpath(folder);
    const profile = known.get(canonical);
    if (!profile) throw new Error("Choose a project folder first");
    if (note) {
      const path = await realpath(note);
      const within = relative(canonical, path);
      if (within === ".." || within.startsWith(`..${sep}`) || resolve(path) === canonical || ![".md", ".markdown"].includes(extname(path).toLowerCase())) throw new Error("That note isn't in this project");
    }
    if (canonical === await realpath(home()) && !note) return;
    // One process and single-instance lock per project keep all existing workspace services scoped.
    if (profile === app.getPath("userData") && canonical !== await realpath(home())) throw new Error("That project profile is already in use");
    const args = [...(app.isPackaged ? [] : [app.getAppPath()]), ...(note ? ["--project-note", note] : [])];
    const child = spawn(process.execPath, args, {
      env: { ...process.env, FOCUS_NOTES_USER_DATA: profile, FOCUS_NOTES_DOCS: canonical, FOCUS_NOTES_PROJECTS_PROFILE: rootProfile, ...(note ? { FOCUS_NOTES_PROJECT_NOTE: note } : { FOCUS_NOTES_PROJECT_NOTE: "" }) },
      stdio: "ignore",
    });
    await new Promise<void>((accept, reject) => { child.once("spawn", accept); child.once("error", reject); });
  }
  async function choose(): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], defaultPath: dirname(home()) });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const folder = await realpath(result.filePaths[0]);
    await list();
    if (!known.has(folder)) {
      const profile = join(profiles, key(folder));
      await mkdir(profile, { recursive: true });
      await writeFile(join(profile, DATA_FILES.projectFolder), folder, { encoding: "utf8", flag: "wx" });
      await writeFile(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done" }), { encoding: "utf8", flag: "wx" });
      await writeFile(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }), { encoding: "utf8", flag: "wx" });
    }
    return folder;
  }
  async function chooseParent(parent: string): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], defaultPath: parent });
    return result.canceled || !result.filePaths[0] ? undefined : realpath(result.filePaths[0]);
  }
  async function check(parent: string, name: string): Promise<{ folder: string; problem: string }> {
    const folder = join(parent, name);
    if (!name.trim() || name !== name.trim() || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || name.length > 100 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) return { folder, problem: "name" };
    const canonical = await realpath(parent);
    for (let ancestor = canonical; ; ancestor = dirname(ancestor)) {
      if (existsSync(join(ancestor, ".focus-notes", "workspace.json"))) return { folder, problem: "nested" };
      if (ancestor === dirname(ancestor)) break;
    }
    await list();
    for (const project of known.keys()) {
      const rel = relative(project, canonical);
      if (!rel || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return { folder, problem: "nested" };
    }
    if (existsSync(folder)) return { folder, problem: "exists" };
    try { await access(canonical, constants.W_OK); }
    catch { return { folder, problem: "access" }; }
    return { folder: join(canonical, name), problem: "" };
  }
  async function create(input: { parent: string; name: string; accent: string; logo: string }): Promise<string> {
    if (!PROJECT_ACCENTS.includes(input.accent) || !PROJECT_LOGOS.includes(input.logo)) throw new Error("Invalid project look");
    const result = await check(input.parent, input.name);
    if (result.problem) throw new Error(`Project folder refused: ${result.problem}`);
    // Exclusive creation is intentional: never adopt or overwrite an existing folder, even an empty one.
    await mkdir(result.folder);
    await mkdir(join(result.folder, "notes"));
    const folder = await realpath(result.folder);
    const profile = join(profiles, key(folder));
    await mkdir(profile);
    await writeFile(join(profile, DATA_FILES.projectFolder), folder, { flag: "wx" });
    await writeFile(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }), { flag: "wx" });
    await writeFile(join(profile, DATA_FILES.state), JSON.stringify({
      version: 1, firstRun: "done", projectSettings: { [folder]: { name: input.name, accent: input.accent, logo: input.logo, watermark: "off", font: "app", theme: "app" } },
    }), { flag: "wx" });
    return folder;
  }
  return { list, open, choose, parent: async () => dirname(home()), chooseParent, check, create };
}
