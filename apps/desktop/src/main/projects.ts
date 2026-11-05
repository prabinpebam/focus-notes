import { app, dialog, safeStorage } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AppStateFile, ProjectEntry, ProjectCreateProgress, ProjectCreateStep } from "@focus-notes/core";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "@focus-notes/core";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";
import { GitHubApi } from "@focus-notes/github";
import { parseRecord } from "./workspace/record.ts";
import { localImportCopies } from "./local-import.ts";
import type { GitRunner } from "./git/run.ts";

function missing(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function windowsProtectedRecent(value: string, protect: boolean): Promise<string> {
  const operation = protect ? "Protect" : "Unprotect";
  const script = `Add-Type -AssemblyName System.Security; $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $result = [Security.Cryptography.ProtectedData]::${operation}($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))`;
  return new Promise((accept, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.resume();
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 || !output.trim()) reject(new Error(`OS-protected Recent storage failed (${code}).`));
      else accept(output.trim());
    });
    child.stdin.end(value);
  });
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

/** A review build's local GitHub stand-in: loopback only, never the account vault, never a redirect out of it. */
export function candidateGitHubApi(origin: string): GitHubApi {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Review builds use a loopback GitHub endpoint only.");
  return new GitHubApi("focus-notes-local-candidate", (url, init) => {
    const source = new URL(url);
    if (source.origin !== "https://api.github.com") throw new Error("Unexpected GitHub request destination.");
    return fetch(origin + source.pathname + source.search, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) });
  });
}

export function projectWindows(home: () => string, atomicWrite: (path: string, content: string) => Promise<void>, candidateApi?: string, git?: GitRunner) {
  const rootProfile = resolve(process.env.FOCUS_NOTES_PROJECTS_PROFILE ?? app.getPath("userData"));
  const profiles = join(rootProfile, DATA_FOLDERS.projectProfiles);
  const known = new Map<string, string>();
  const key = (folder: string) => createHash("sha256").update(process.platform === "win32" ? folder.toLowerCase() : folder).digest("hex").slice(0, 24);
  const lastNoteFile = join(app.getPath("userData"), DATA_FILES.projectLastNote);
  type Recent = { rank: number; pinned: boolean; notes: { path: string; rank: number; pinned: boolean }[] };
  let ownRecent: Recent | undefined;
  const halfLife = 14 * 24 * 60 * 60 * 1000;
  const addScore = (rank: number, points: number) => {
    const now = Date.now();
    return now + halfLife * Math.log2((rank ? Math.pow(2, (rank - now) / halfLife) : 0) + points);
  };
  async function recent(profile: string): Promise<Recent> {
    // This profile has one writer. Other project processes' records are always read from disk.
    if (profile === app.getPath("userData") && ownRecent) return structuredClone(ownRecent);
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected recent storage is unavailable.");
      const encrypted = await readFile(join(profile, DATA_FILES.projectRecent), "utf8");
      const content = encrypted.startsWith("dpapi:")
        ? Buffer.from(await windowsProtectedRecent(encrypted.slice(6), false), "base64").toString("utf8")
        : safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      return JSON.parse(content);
    } catch (error) {
      if (missing(error)) return { rank: 0, pinned: false, notes: [] };
      throw error;
    }
  }
  async function saveRecent(profile: string, record: Recent) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected recent storage is unavailable.");
    const content = JSON.stringify(record);
    const encrypted = process.platform === "win32"
      ? `dpapi:${await windowsProtectedRecent(Buffer.from(content, "utf8").toString("base64"), true)}`
      : safeStorage.encryptString(content).toString("base64");
    await atomicWrite(join(profile, DATA_FILES.projectRecent), encrypted);
    if (profile === app.getPath("userData")) ownRecent = structuredClone(record);
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
  type LaunchRecord = { path: string; position?: { from: number; to: number; scroll: number } };
  let launchRecord: Promise<LaunchRecord | undefined> | undefined;
  async function readLastRecord(): Promise<LaunchRecord | undefined> {
    let encrypted: string;
    try { encrypted = await readFile(lastNoteFile, "utf8"); }
    catch (error) { if (missing(error)) return; throw error; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Protected launch storage is unavailable.");
    const value = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    return value.startsWith("{") ? JSON.parse(value) : { path: value };
  }
  function lastRecord(): Promise<LaunchRecord | undefined> {
    if (launchRecord) return launchRecord;
    const reading = readLastRecord();
    launchRecord = reading;
    // The returned read still rejects; only its cache is cleared so a Retry can read again.
    void reading.catch(() => { if (launchRecord === reading) launchRecord = undefined; });
    return reading;
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
    const record = { path, position: savedPosition };
    await atomicWrite(lastNoteFile, safeStorage.encryptString(JSON.stringify(record)).toString("base64"));
    launchRecord = Promise.resolve(record);
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
  /** A folder Open lists, canonical; anything else is refused. */
  async function knownFolder(folder: string): Promise<string> {
    await list();
    const canonical = await realpath(folder);
    if (!known.has(canonical)) throw new Error("Unknown project");
    return canonical;
  }
  async function open(folder: string, note?: string): Promise<void> {
    await list();
    const canonical = await realpath(folder);
    const profile = known.get(canonical);
    if (!profile) throw new Error("Choose a project folder first");
    const localNotes = (await state(profile)).localNotes === true;
    // Only the canonical absolute path reaches the new process: a renderer string could carry a
    // Chromium switch that realpath() still resolves to a note inside the project.
    let target: string | undefined;
    if (note) {
      if (!isAbsolute(note)) throw new Error("That note isn't in this project");
      const path = await realpath(note);
      const within = relative(canonical, path);
      if (!isAbsolute(path) || within === ".." || within.startsWith(`..${sep}`) || resolve(path) === canonical || ![".md", ".markdown"].includes(extname(path).toLowerCase())) throw new Error("That note isn't in this project");
      target = path;
    }
    if (canonical === await realpath(home()) && !target) return;
    // One process and single-instance lock per project keep all existing workspace services scoped.
    if (profile === app.getPath("userData") && canonical !== await realpath(home())) throw new Error("That project profile is already in use");
    const args = [...(app.isPackaged ? [] : [app.getAppPath()]), ...(target ? ["--project-note", target] : [])];
    const child = spawn(process.execPath, args, {
      env: { ...process.env, FOCUS_NOTES_USER_DATA: profile, FOCUS_NOTES_DOCS: canonical, FOCUS_NOTES_PROJECTS_PROFILE: rootProfile, FOCUS_NOTES_LOCAL_NOTES: localNotes ? "1" : "", FOCUS_NOTES_PROJECT_NOTE: target ?? "" },
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
  const copyLocal = localImportCopies();
  async function importLocal(path: string, project: string, request: string = randomUUID()) {
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
    return copyLocal(request, source, destination, name, text);
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
  async function create(input: { parent: string; name: string; accent: string; logo: string }, operation?: { signal: AbortSignal; progress: (progress: Omit<ProjectCreateProgress, "request">) => void }): Promise<string> {
    if (!PROJECT_ACCENTS.includes(input.accent) || !PROJECT_LOGOS.includes(input.logo)) throw new Error("Invalid project look");
    if (candidateApi && !/^http:\/\/127\.0\.0\.1:\d+$/.test(candidateApi)) throw new Error("Project creation requires a loopback GitHub endpoint.");
    const steps: ProjectCreateStep[] = ["check", "folder", ...(git ? ["history" as const] : []), ...(candidateApi ? ["repository" as const] : []), "profile"];
    const step = async <T>(id: ProjectCreateStep, work: () => Promise<T>): Promise<T> => {
      operation?.signal.throwIfAborted();
      operation?.progress({ steps, step: id, done: false });
      const result = await work();
      operation?.progress({ steps, step: id, done: true });
      return result;
    };
    const result = await step("check", async () => {
      const result = await check(input.parent, input.name);
      if (result.problem) throw new Error(`Project folder refused: ${result.problem}`);
      return result;
    });
    await step("folder", async () => {
      // Exclusive creation is intentional: never adopt or overwrite an existing folder, even an empty one.
      await mkdir(result.folder);
      await mkdir(join(result.folder, "notes"));
    });
    if (git) {
      // Every project keeps its history with Git, offline or on GitHub (project model, the owner 5 November).
      await step("history", async () => {
        for (const args of [["init", "--quiet"], ["symbolic-ref", "HEAD", "refs/heads/main"]]) {
          const r = await git({ cwd: result.folder, args });
          if (r.code !== 0) throw new Error(`Couldn't start the project's history: git ${args[0]} failed.`);
        }
        // The first commit needs the person's Git identity; without one, the history starts at their first save.
        await git({ cwd: result.folder, args: ["commit", "--allow-empty", "--quiet", "-m", "Start the project"] });
      });
    }
    if (candidateApi) {
      await step("repository", async () => {
        const api = candidateGitHubApi(candidateApi);
        const owner = (await api.user()).login;
        const name = input.name.replace(/[^A-Za-z0-9._-]/g, "-");
        await api.createRepo(name, "Private notes for Focus Notes", true, false);
        const repository = await api.repo(owner, name);
        if (!repository.private || repository.owner !== owner || repository.name !== name) throw new Error("The local GitHub endpoint did not confirm a private repository.");
      });
    }
    const folder = await realpath(result.folder);
    await step("profile", () => adopt(folder, { name: input.name, accent: input.accent, logo: input.logo }));
    return folder;
  }
  /** Makes a folder a known project with its own profile (a clone from GitHub, a new project); an already known one is left as it is. */
  async function adopt(folder: string, look?: { name: string; accent: string; logo: string }, local = false): Promise<void> {
    await list();
    if (known.has(folder)) return;
    const profile = join(profiles, key(folder));
    await mkdir(profile, { recursive: true });
    await writeFile(join(profile, DATA_FILES.projectFolder), folder, { flag: "wx" });
    await writeFile(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder, kind: "local" }), { flag: "wx" });
    await writeFile(join(profile, DATA_FILES.state), JSON.stringify(local
      ? { version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true }
      : { version: 1, firstRun: "done", ...(look ? { projectSettings: { [folder]: { ...look, watermark: "off", font: "app", theme: "app" } } } : {}) }), { flag: "wx" });
  }
  /**
   * Open file… (owner, 4 November): a Markdown file opens in its own project's window when it's inside a
   * known project; otherwise on its own, in a window over its folder kept on this computer only, like Local
   * notes (D-333): no backup, sharing or publishing.
   */
  async function openFile(): Promise<{ file: string; here: boolean } | undefined> {
    const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const file = await realpath(result.filePaths[0]);
    if (![".md", ".markdown"].includes(extname(file).toLowerCase())) throw new Error("Choose a Markdown file");
    await list();
    const owner = [...known.keys()].filter((f) => { const r = relative(f, file); return r && !r.startsWith("..") && !isAbsolute(r); }).sort((a, b) => b.length - a.length)[0];
    const folder = owner ?? dirname(file);
    // A file in this window's own project opens here (the window asks for it).
    if (owner && owner === await realpath(home())) return { file, here: true };
    if (!owner) await adopt(folder, undefined, true);
    await open(folder, file);
    return { file, here: false };
  }
  return { list, known: knownFolder, adopt, openFile, open, choose, upload, pin, localNote, importLocal, edited: (path: string) => score(path, 2), parent: async () => dirname(home()), chooseParent, check, create, lastNote, position, remember, closed };
}
