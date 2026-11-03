import { app, dialog, safeStorage } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AppStateFile, ProjectEntry } from "@focus-notes/core";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "@focus-notes/core";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";
import { parseRecord } from "./workspace/record.ts";

function missing(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

export function resumeProjectProfile(root: string): { profile: string; folder: string; localNotes: boolean } | undefined {
  try {
    const record = JSON.parse(readFileSync(join(root, DATA_FILES.lastProject), "utf8")) as { profile?: unknown };
    if (typeof record.profile !== "string") throw new Error("Invalid saved project.");
    const profile = resolve(record.profile);
    if (profile === resolve(root)) return;
    if (dirname(profile) !== resolve(root, DATA_FOLDERS.projectProfiles)) throw new Error("Invalid saved project profile.");
    const folder = readFileSync(join(profile, DATA_FILES.projectFolder), "utf8").trim();
    if (!isAbsolute(folder) || !existsSync(folder)) throw new Error("Saved project folder is unavailable.");
    const saved = JSON.parse(readFileSync(join(profile, DATA_FILES.state), "utf8")) as AppStateFile;
    return { profile, folder, localNotes: saved.localNotes === true };
  } catch (error) {
    if (!missing(error)) console.error("Could not restore the last project.");
    return;
  }
}

export function projectWindows(home: () => string, atomicWrite: (path: string, content: string) => Promise<void>) {
  const rootProfile = resolve(process.env.FOCUS_NOTES_PROJECTS_PROFILE ?? app.getPath("userData"));
  const profiles = join(rootProfile, DATA_FOLDERS.projectProfiles);
  const known = new Map<string, string>();
  const key = (folder: string) => createHash("sha256").update(process.platform === "win32" ? folder.toLowerCase() : folder).digest("hex").slice(0, 24);
  const lastNoteFile = join(app.getPath("userData"), DATA_FILES.projectLastNote);
  type Recent = { rank: number; pinned: boolean; notes: { path: string; rank: number; pinned: boolean }[] };
  const halfLife = 14 * 24 * 60 * 60 * 1000;
  const addScore = (rank: number, points: number) => {
    const now = Date.now();
    return now + halfLife * Math.log2((rank ? Math.pow(2, (rank - now) / halfLife) : 0) + points);
  };
  async function recent(profile: string): Promise<Recent> {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected recent storage is unavailable.");
      return JSON.parse(safeStorage.decryptString(Buffer.from(await readFile(join(profile, DATA_FILES.projectRecent), "utf8"), "base64")));
    } catch (error) {
      if (missing(error)) return { rank: 0, pinned: false, notes: [] };
      throw error;
    }
  }
  async function saveRecent(profile: string, record: Recent) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected recent storage is unavailable.");
    await atomicWrite(join(profile, DATA_FILES.projectRecent), safeStorage.encryptString(JSON.stringify(record)).toString("base64"));
  }
  let recentWrites = Promise.resolve();
  function score(path: string, points: number) {
    const write = recentWrites.then(async () => {
      const profile = app.getPath("userData");
      const record = await recent(profile);
      const note = record.notes.find((n) => n.path === path) ?? { path, rank: 0, pinned: false };
      note.rank = addScore(note.rank, points);
      record.rank = addScore(record.rank, points);
      record.notes = [...record.notes.filter((n) => n.path !== path), note].sort((a, b) => b.rank - a.rank).filter((n, i) => n.pinned || i < 50);
      await saveRecent(profile, record);
    });
    recentWrites = write.catch(error => { console.error("Could not persist project ranking:", error instanceof Error ? error.name : "Error"); });
    return write;
  }
  async function lastRecord(): Promise<{ path: string; position?: { from: number; to: number; scroll: number } } | undefined> {
    let encrypted: string;
    try { encrypted = await readFile(lastNoteFile, "utf8"); }
    catch (error) { if (missing(error)) return; throw error; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected launch storage is unavailable.");
    const value = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    return value.startsWith("{") ? JSON.parse(value) : { path: value };
  }
  async function lastNote() { return (await lastRecord())?.path; }
  async function position(path: string) {
    const record = await lastRecord();
    return record?.path === path ? record.position : undefined;
  }
  async function remember(path: string, snapshot?: { from: number; to: number; scroll: number }) {
    if (!isAbsolute(path) || ![".md", ".markdown"].includes(extname(path).toLowerCase())) throw new Error("Choose a Markdown note.");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected launch storage is unavailable.");
    const savedPosition = snapshot ?? await position(path);
    await atomicWrite(lastNoteFile, safeStorage.encryptString(JSON.stringify({ path, position: savedPosition })).toString("base64"));
    if (!snapshot) await score(path, 1);
  }
  async function closed() {
    await atomicWrite(join(rootProfile, DATA_FILES.lastProject), `${JSON.stringify({ profile: app.getPath("userData") })}\n`);
  }
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
      const history = await recent(profile);
      const lastPath = profile === app.getPath("userData") ? await lastNote() : undefined;
      return { folder, name: identity?.name ?? basename(folder), accent: saved.localNotes ? "app" : identity?.accent ?? "teal", logo: saved.localNotes ? "none" : identity?.logo ?? "book", logoSrc: identity?.logoSrc, lastNote: lastPath ?? saved.lastNotePath, rank: history.rank, pinned: history.pinned, recent: history.notes, localNotes: saved.localNotes };
    }));
  }
  async function pin(folder: string, path?: string) {
    await list();
    const profile = known.get(await realpath(folder));
    if (!profile) throw new Error("Unknown project");
    await recentWrites;
    const record = await recent(profile);
    if (path) {
      const note = record.notes.find(n => n.path === path);
      if (!note) throw new Error("Unknown recent note");
      note.pinned = !note.pinned;
    } else record.pinned = !record.pinned;
    await saveRecent(profile, record);
  }
  async function open(folder: string, note?: string): Promise<void> {
    await list();
    const canonical = await realpath(folder);
    const profile = known.get(canonical);
    if (!profile) throw new Error("Choose a project folder first");
    const localNotes = (await state(profile)).localNotes === true;
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
      env: { ...process.env, FOCUS_NOTES_USER_DATA: profile, FOCUS_NOTES_DOCS: canonical, FOCUS_NOTES_PROJECTS_PROFILE: rootProfile, FOCUS_NOTES_LOCAL_NOTES: localNotes ? "1" : "", ...(note ? { FOCUS_NOTES_PROJECT_NOTE: note } : { FOCUS_NOTES_PROJECT_NOTE: "" }) },
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
  async function upload(): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "SVG", extensions: ["svg"] }] });
    const file = result.filePaths[0];
    if (result.canceled || !file) return;
    if (extname(file).toLowerCase() !== ".svg" || (await stat(file)).size > 262144) throw new Error("Choose an SVG logo smaller than 256 KB.");
    return readFile(file, "utf8");
  }
  const localHome = () => resolve(process.env.FOCUS_NOTES_LOCAL_NOTES_HOME ?? join(app.getPath("documents"), "Focus Notes", "Local notes"));
  async function localNote() {
    const folder = localHome();
    await mkdir(folder, { recursive: true });
    const profile = join(profiles, key(folder));
    await mkdir(profile, { recursive: true });
    if (!existsSync(join(profile, DATA_FILES.workspace))) {
      await writeFile(join(profile, DATA_FILES.projectFolder), folder, { flag: "wx" });
      await writeFile(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }), { flag: "wx" });
      await writeFile(join(profile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true, filesPinned: true }), { flag: "wx" });
    }
    let note: string;
    for (let i = 1; ; i++) {
      note = join(folder, i === 1 ? "Untitled.md" : `Untitled ${i}.md`);
      try { await writeFile(note, "", { flag: "wx" }); break; }
      catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
      }
    }
    await open(folder, note);
  }
  async function importLocal(path: string, project: string) {
    const source = await realpath(path);
    const local = await realpath(localHome());
    const rel = relative(local, source);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Choose a Local note.");
    await list();
    const folder = await realpath(project);
    const profile = known.get(folder);
    if (!profile || (await state(profile)).localNotes) throw new Error("Choose a project.");
    const destination = existsSync(join(folder, "private", "notes")) ? join(folder, "private", "notes")
      : existsSync(join(folder, "notes")) ? join(folder, "notes") : folder;
    const text = await readFile(source, "utf8");
    const name = basename(source, extname(source));
    for (let i = 1; ; i++) {
      const target = join(destination, `${name}${i === 1 ? "" : ` ${i}`}.md`);
      try { await writeFile(target, text, { flag: "wx" }); return target; }
      catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
      }
    }
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
  return { list, open, choose, upload, pin, localNote, importLocal, edited: (path: string) => score(path, 2), parent: async () => dirname(home()), chooseParent, check, create, lastNote, position, remember, closed };
}
