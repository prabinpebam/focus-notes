import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
]);

/** Snapshot only durable app data; never move notes, copy live SQLite locks, or overwrite a profile. */
export async function carryPreviewProfile(source: string, destination: string): Promise<void> {
  if (existsSync(destination) || !existsSync(source)) return;
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
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
