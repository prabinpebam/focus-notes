/** A last project whose folder is missing resumes into recovery, never the root project, and never a removed one (FRE-11, G5.2). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";
import { resumeProjectProfile } from "../src/main/projects.ts";
import { projectMetadataStore } from "../src/main/project-metadata.ts";

vi.mock("electron", () => ({ app: { getPath: () => "", isPackaged: true, getAppPath: () => "" }, safeStorage: {}, dialog: {} }));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(opts: { record?: "same" | "other" | "none" | "corrupt" | "unreadable"; removed?: boolean; store?: boolean | "unreadable" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fn-resume-"));
  roots.push(root);
  const profile = join(root, DATA_FOLDERS.projectProfiles, "p1");
  mkdirSync(profile, { recursive: true });
  const folder = join(root, "gone", "Notes");
  writeFileSync(join(root, DATA_FILES.lastProject), JSON.stringify({ profile }));
  writeFileSync(join(profile, DATA_FILES.projectFolder), folder);
  writeFileSync(join(profile, DATA_FILES.state), JSON.stringify({ version: 1 }));
  const record = opts.record ?? "same";
  if (record === "corrupt") writeFileSync(join(profile, DATA_FILES.workspace), "{ not json");
  // A directory in the file's place reads as EISDIR: a genuine read failure, never absence.
  else if (record === "unreadable") mkdirSync(join(profile, DATA_FILES.workspace));
  else if (record !== "none") writeFileSync(join(profile, DATA_FILES.workspace), JSON.stringify({ version: 1, folder: record === "same" ? folder : join(root, "elsewhere"), kind: "local" }));
  if (opts.store === "unreadable") mkdirSync(join(root, DATA_FILES.projectMetadata));
  else if (opts.store !== false) {
    const store = projectMetadataStore(root);
    await store.initialize(profile);
    if (opts.removed) await store.transaction(async () => store.markRemoved(profile));
    await store.dispose();
  }
  return { root, profile, folder };
}

describe("resuming a last project whose folder is missing", () => {
  it("resumes its own profile, so its window shows recovery instead of the root project", async () => {
    const { root, profile, folder } = await fixture();
    expect(resumeProjectProfile(root)).toEqual({ profile, folder, localNotes: false });
  });
  it("never resumes a removed project", async () => {
    const { root } = await fixture({ removed: true });
    expect(resumeProjectProfile(root)).toBeUndefined();
  });
  it("keeps the earlier fallback without a matching record or a metadata store", async () => {
    expect(resumeProjectProfile((await fixture({ record: "none" })).root)).toBeUndefined();
    expect(resumeProjectProfile((await fixture({ record: "other" })).root)).toBeUndefined();
    expect(resumeProjectProfile((await fixture({ store: false })).root)).toBeUndefined();
  });
  it("never falls back to the root project when the record or the metadata store can't be read", async () => {
    for (const opts of [{ record: "corrupt" as const }, { record: "unreadable" as const }, { store: "unreadable" as const }]) {
      const { root, profile, folder } = await fixture(opts);
      expect(resumeProjectProfile(root), JSON.stringify(opts)).toEqual({ profile, folder, localNotes: false });
    }
  });
});