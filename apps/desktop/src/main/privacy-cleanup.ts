import { readFile, readdir, realpath, rm, rmdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DATA_FILES, DATA_FOLDERS, filesRemovedBy, withoutRecent } from "@focus-notes/core/inventory";
import type { MetadataTicket, projectMetadataStore } from "./project-metadata.ts";
import { MetadataNotificationError } from "./project-metadata.ts";
import type { CleanupIssue, CleanupReason } from "@focus-notes/core";

type Metadata = ReturnType<typeof projectMetadataStore>;
type FilterProtected = (profile: string, scope: string, folders: readonly string[]) => Promise<void>;
const missing = (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
const same = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
async function removeEmptyRecovery(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true }).catch(error => missing(error) ? [] : Promise.reject(error));
  for (const entry of entries) if (entry.isDirectory()) await removeEmptyRecovery(join(path, entry.name));
  try { await rmdir(path); }
  catch (error) {
    if (!missing(error) && !(error && typeof error === "object" && "code" in error && error.code === "ENOTEMPTY")) throw error;
  }
}

export class PrivacyCleanupError extends Error {
  readonly pending: readonly string[];
  readonly issues: readonly CleanupIssue[];
  constructor(pending: readonly string[], issues: readonly CleanupIssue[] = []) {
    super(`Local cleanup pending: ${pending.join(", ")}. Retry cleanup.`);
    this.name = "PrivacyCleanupError";
    this.pending = pending;
    this.issues = issues;
  }
}
const failureReason = (error: unknown): CleanupReason => error && typeof error === "object" && "code" in error && error.code === "EBUSY" ? "file-lock" : "unknown";
async function cleanupError(metadata: Metadata) {
  const issues = await metadata.cleanupIssues();
  return new PrivacyCleanupError(issues.map(issue => issue.scope), issues);
}

export function withoutPrivacyTraces<T extends object>(state: T): T {
  const out = withoutRecent(state);
  Reflect.deleteProperty(out, "filesPins");
  Reflect.deleteProperty(out, "filesRecent");
  Reflect.deleteProperty(out, "filesOpened");
  return out;
}
export function withoutRemovedReferences<T extends object>(state: T, folders: readonly string[]): T {
  const references = (value: unknown) => typeof value === "string" && folders.some(folder => {
    const within = relative(folder, resolve(value));
    return !isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`);
  });
  const out = { ...state } as Record<string, unknown>;
  if (references(out.lastNotePath)) delete out.lastNotePath;
  for (const field of ["filesPins", "filesRecent", "filesOpened"]) {
    if (Array.isArray(out[field])) out[field] = out[field].filter(value => !references(value));
  }
  return out as T;
}
async function folderAliases(profile: string, folder: string): Promise<string[]> {
  const canonical = await realpath(folder).catch(error => missing(error) ? resolve(folder) : Promise.reject(error));
  const aliases = new Set([resolve(folder), canonical]);
  // Windows launches may use an 8.3 parent spelling while the stored project pointer is canonical.
  // Reconstruct that spelling from the first real common ancestor, without changing source bytes.
  for (let ancestor = resolve(profile);;) {
    const actual = await realpath(ancestor);
    const within = relative(actual, canonical);
    if (!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`)) {
      aliases.add(resolve(ancestor, within));
      break;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return [...aliases];
}
export async function removedProjectFolders(root: string, metadata: Metadata): Promise<string[]> {
  const folders: string[] = [];
  for (const profile of await cleanupProfiles(root)) {
    if (!(await metadata.isRemoved(profile))) continue;
    const path = await readFile(join(profile, DATA_FILES.projectFolder), "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
    if (path) folders.push(...await folderAliases(profile, path.trim()));
  }
  return folders;
}

/** Enumerate only real app-owned profiles, never follow a profile symlink into notes. */
export async function cleanupProfiles(root: string, folder?: string): Promise<string[]> {
  const canonicalRoot = await realpath(root);
  const profiles = [resolve(root)];
  const parent = join(canonicalRoot, DATA_FOLDERS.projectProfiles);
  for (const entry of await readdir(parent, { withFileTypes: true }).catch(error => missing(error) ? [] : Promise.reject(error))) {
    if (!entry.isDirectory()) continue;
    const profile = await realpath(join(parent, entry.name));
    const within = relative(parent, profile);
    if (isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`)) throw new Error("Invalid project profile.");
    // Keep the caller's profile spelling: lifecycle tickets are keyed by the launch profile.
    profiles.push(join(resolve(root), DATA_FOLDERS.projectProfiles, entry.name));
  }
  if (!folder) return profiles;
  const target = await realpath(folder);
  const selected: string[] = [];
  for (const profile of profiles) {
    const saved = await readFile(join(profile, DATA_FILES.projectFolder), "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
    const workspace = saved ? undefined : await readFile(join(profile, DATA_FILES.workspace), "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
    const path: unknown = saved?.trim() ?? (workspace ? JSON.parse(workspace).folder : undefined);
    if (typeof path === "string" && same(await realpath(path), target)) selected.push(profile);
  }
  return selected;
}

export async function purgeProfileTraces(root: string, profiles: readonly string[], event: "signOut" | "removeWorkspace" | "deleteProject", metadata: Metadata, atomicWrite: (path: string, content: string) => Promise<void>, filterProtected?: FilterProtected, invalidated?: (tickets: ReadonlyMap<string, MetadataTicket>) => void): Promise<void> {
  const owned = new Set((await cleanupProfiles(root)).map(profile => resolve(profile)));
  if (profiles.some(profile => !owned.has(resolve(profile)))) throw new Error("Cleanup requires an app-owned profile.");
  const scopes = filesRemovedBy(event).filter(file => file !== DATA_FILES.lastProject);
  const removedFolders: string[] = [];
  if (event !== "signOut") {
    for (const profile of profiles) {
      let folder = await readFile(join(profile, DATA_FILES.projectFolder), "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
      if (!folder) {
        const bytes = await readFile(join(profile, DATA_FILES.workspace), "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
        const record: unknown = bytes === undefined ? undefined : JSON.parse(bytes);
        if (record && typeof record === "object" && "folder" in record && typeof record.folder === "string") {
          folder = record.folder;
          await metadata.transaction(async () => {
            metadata.pending(profile, DATA_FILES.projectFolder, true);
            metadata.job(profile, event, true);
          });
          try {
            await atomicWrite(join(profile, DATA_FILES.projectFolder), folder);
            await metadata.transaction(async () => metadata.pending(profile, DATA_FILES.projectFolder, false));
          } catch (error) {
            await metadata.transaction(async () => metadata.pending(profile, DATA_FILES.projectFolder, true, failureReason(error)), false);
            throw await cleanupError(metadata);
          }
        }
      }
      if (folder) removedFolders.push(...await folderAliases(profile, folder.trim()));
    }
  }
  if (event === "signOut") scopes.push(DATA_FILES.account);
  // Invalidate first, durably. Other processes' admitted writes must finish before this lock.
  try { await metadata.invalidate(profiles, tickets => {
    for (const profile of profiles) {
      for (const scope of [...scopes, DATA_FILES.state]) metadata.pending(profile, scope, true);
      metadata.pending(profile, "open-windows", true);
      metadata.job(profile, event, true);
      if (event !== "signOut") metadata.markRemoved(profile);
    }
    metadata.pending(root, DATA_FILES.lastProject, true);
    if (event !== "signOut") for (const profile of owned) metadata.pending(profile, "open-windows", true);
    invalidated?.(tickets);
  }); } catch (error) {
    if (!(error instanceof MetadataNotificationError)) throw error;
    throw await cleanupError(metadata);
  }
  try {
    await metadata.waitForLive(profiles, event !== "signOut");
    await metadata.transaction(async () => {
      for (const profile of event === "signOut" ? profiles : owned) metadata.pending(profile, "open-windows", false);
    });
  } catch {
    throw await cleanupError(metadata);
  }
  const otherProfiles = event === "signOut" ? [] : [...owned].filter(profile => !profiles.some(selected => same(resolve(selected), profile)));
  for (const profile of otherProfiles) {
    for (const scope of [DATA_FILES.state, ...(filterProtected ? [DATA_FILES.projectRecent, DATA_FILES.projectLastNote] : [])]) {
    try {
      await metadata.transaction(async () => {
        metadata.pending(profile, scope, true);
        if (scope !== DATA_FILES.state) {
          await filterProtected?.(profile, scope, removedFolders);
          metadata.pending(profile, scope, false);
          return;
        }
        const path = join(profile, scope);
        const bytes = await readFile(path, "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
        if (bytes !== undefined) {
          const state: Record<string, unknown> = JSON.parse(bytes);
          if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid profile state.");
          const next = withoutRemovedReferences(state, removedFolders);
          if (JSON.stringify(next) !== JSON.stringify(state)) {
            metadata.pending(profile, DATA_FILES.state, true);
            await atomicWrite(path, JSON.stringify(next, null, 2));
          }
        }
        metadata.pending(profile, scope, false);
      });
    } catch (error) {
      await metadata.transaction(async () => metadata.pending(profile, scope, true, failureReason(error)), false);
    }
    }
  }
  for (const profile of profiles) {
    for (const scope of [...scopes, DATA_FILES.state]) {
      try {
        await metadata.transaction(async () => {
          if (scope === DATA_FILES.state) {
            const path = join(profile, scope);
            const bytes = await readFile(path, "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
            if (bytes !== undefined) {
              const state: unknown = JSON.parse(bytes);
              if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid profile state.");
              // The caller's state writers use this same lock, so there is no read/write race.
              await atomicWrite(path, JSON.stringify(withoutPrivacyTraces(state), null, 2));
            }
          } else if (scope === DATA_FOLDERS.drafts) await removeEmptyRecovery(join(profile, scope));
          else if (scope === DATA_FILES.account) await atomicWrite(join(profile, scope), '{"version":1,"signedOut":true}\n');
          else await rm(join(profile, scope), { force: true });
          metadata.pending(profile, scope, false);
        });
      } catch (error) {
        await metadata.transaction(async () => metadata.pending(profile, scope, true, failureReason(error)), false);
      }
    }
  }
  try {
    await metadata.transaction(async () => {
      const pointer = join(root, DATA_FILES.lastProject);
      const bytes = await readFile(pointer, "utf8").catch(error => missing(error) ? undefined : Promise.reject(error));
      if (bytes !== undefined) {
        const record: unknown = JSON.parse(bytes);
        if (!record || typeof record !== "object" || !("profile" in record) || typeof record.profile !== "string") throw new Error("Invalid launch pointer.");
        const savedProfile = record.profile;
        if (profiles.some(profile => same(resolve(savedProfile), resolve(profile)))) await rm(pointer, { force: true });
      }
      metadata.pending(root, DATA_FILES.lastProject, false);
    });
  } catch (error) {
    await metadata.transaction(async () => metadata.pending(root, DATA_FILES.lastProject, true, failureReason(error)), false);
  }
  const pending = await metadata.pendingScopes();
  if (pending.length) throw await cleanupError(metadata);
  try { await metadata.transaction(async () => {
    for (const profile of profiles) metadata.job(profile, event, false);
  }); } catch (error) {
    if (!(error instanceof MetadataNotificationError)) throw error;
    throw await cleanupError(metadata);
  }
}

export async function retryProfileCleanup(root: string, metadata: Metadata, atomicWrite: (path: string, content: string) => Promise<void>, filterProtected?: FilterProtected): Promise<void> {
  const jobs = await metadata.jobs();
  const profiles = await cleanupProfiles(root);
  try { await metadata.repairNotifications(profiles); }
  catch (error) {
    const pending = await metadata.pendingScopes();
    if (!pending.length) throw error;
    throw await cleanupError(metadata);
  }
  for (const event of ["signOut", "removeWorkspace", "deleteProject"] as const) {
    const selected = profiles.filter(profile => jobs.some(job => job.event === event && job.profile === metadata.profileId(profile)));
    if (selected.length) {
      try { await purgeProfileTraces(root, selected, event, metadata, atomicWrite, filterProtected); }
      catch (error) { if (!(error instanceof PrivacyCleanupError)) throw error; }
    }
  }
  const pending = await metadata.pendingScopes();
  if (pending.length) throw await cleanupError(metadata);
  try { await metadata.transaction(async () => {
    for (const profile of profiles) {
      const pendingJob = jobs.find(job => job.profile === metadata.profileId(profile));
      if (pendingJob) metadata.job(profile, pendingJob.event, false);
    }
  }); } catch (error) {
    if (!(error instanceof MetadataNotificationError)) throw error;
    throw await cleanupError(metadata);
  }
}
