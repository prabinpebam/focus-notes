import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CHROMIUM_FOLDERS, DATA_FILES, DATA_FOLDERS, LOCK_FILES } from "@focus-notes/core/inventory";

export type AppChannel = "stable" | "preview" | "development";

export function appIdentity(options: {
  store: boolean;
  packaged: boolean;
  executable: string;
  defaultUserData: string;
  userData?: string;
  channel?: string;
}) {
  let channel: AppChannel = "stable";
  if (!options.store) {
    if (options.channel !== undefined) {
      if (options.channel !== "stable" && options.channel !== "preview" && options.channel !== "development") throw new Error("Invalid Focus Notes channel.");
      channel = options.channel;
    } else if (/[/\\]focus-notes-work[/\\]preview[/\\](?:builds[/\\][^/\\]+|candidates[/\\][^/\\]+|app)(?:[/\\]win-unpacked)?[/\\]focus-notes(?:-e2e)?\.exe$/i.test(options.executable)) {
      // The scheduled Preview builder makes an ordinary unpacked release; its launcher sets no flags.
      channel = "preview";
    } else if (!options.packaged) channel = "development";
  }
  const suffix = channel === "preview" ? " Preview" : channel === "development" ? " Development" : "";
  return {
    channel,
    name: `Focus Notes${suffix}`,
    appId: `io.github.prabinpebam.focusnotes${channel === "stable" ? "" : `.${channel}`}`,
    userData: options.userData ? resolve(options.userData) : `${options.defaultUserData}${suffix}`,
    legacyUserData: channel === "preview" && !options.userData ? options.defaultUserData : undefined,
  };
}

const excluded = new Set<string>([
  ...Object.values(CHROMIUM_FOLDERS), ...LOCK_FILES,
  DATA_FILES.projectMetadata, DATA_FILES.projectMetadataWal, DATA_FILES.projectMetadataShm, DATA_FILES.agentLimitsLock,
  DATA_FILES.previewCarryOver,
]);

async function copyMissing(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(destination, entry.name);
    if (entry.isDirectory()) await copyMissing(from, to);
    else if (entry.isFile()) {
      try { await copyFile(from, to, constants.COPYFILE_EXCL); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      }
    } else throw new Error("Preview profile contains an unsupported file type.");
  }
}

/** Snapshot only durable app data; never move notes, copy live SQLite locks, or overwrite a profile. */
export async function carryPreviewProfile(source: string, destination: string): Promise<void> {
  const completed = join(destination, DATA_FILES.previewCarryOver);
  if (existsSync(completed) || !existsSync(source)) return;
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(`${destination}.carry-`);
  try {
    for (const name of [...Object.values(DATA_FILES), ...Object.values(DATA_FOLDERS)]) {
      if (excluded.has(name) || !existsSync(join(source, name))) continue;
      await cp(join(source, name), join(staging, name), {
        recursive: true, errorOnExist: true, force: false,
        filter: (path) => !excluded.has(basename(path)),
      });
    }
    const pointer = join(staging, DATA_FILES.lastProject);
    if (existsSync(pointer)) {
      const record: { profile?: unknown } = JSON.parse(await readFile(pointer, "utf8"));
      if (typeof record.profile !== "string") throw new Error("Invalid legacy Preview project pointer.");
      const child = relative(resolve(source, DATA_FOLDERS.projectProfiles), resolve(record.profile));
      if (resolve(record.profile) === resolve(source)) {
        await writeFile(pointer, `${JSON.stringify({ profile: destination })}\n`);
      } else if (child && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child) && dirname(child) === ".") {
        await writeFile(pointer, `${JSON.stringify({ profile: join(destination, DATA_FOLDERS.projectProfiles, child) })}\n`);
      }
    }
    await copyMissing(staging, destination);
    await writeFile(completed, '{"version":1}\n');
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function preparePreviewProfile(
  identity: ReturnType<typeof appIdentity>,
  report: (error: unknown) => void,
  carry: typeof carryPreviewProfile = carryPreviewProfile,
): Promise<boolean> {
  if (!identity.legacyUserData) return false;
  try {
    await carry(identity.legacyUserData, identity.userData);
    return false;
  } catch (error) {
    report(error);
    await mkdir(identity.userData, { recursive: true });
    return true;
  }
}
