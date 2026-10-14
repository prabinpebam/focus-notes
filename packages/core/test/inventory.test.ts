/**
 * PRV-02: the data inventory is code, and it's the one in the docs. Every file the desktop's main
 * process keeps in the app's data folder is named in `DATA_FILES`, each is a row of the inventory
 * in Security and privacy, and the events that delete them (signing out, removing the workspace,
 * running setup again) are the ones the inventory says. The web app's storage names are the
 * inventory's too.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHROMIUM_FOLDERS, DATA_FILES, DESKTOP_DATA, LOCK_FILES, RECENT_STATE_KEYS, WEB_DATA, WEB_DATABASE, WEB_META, WEB_STORES, filesRemovedBy, withoutRecent } from "../src/inventory.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

/** The Data inventory table in Security and privacy, as rows of cells. */
function docRows(): string[][] {
  const doc = read("documentations/architecture/security-and-privacy.md");
  const section = doc.slice(doc.indexOf("## Data inventory"), doc.indexOf("## Privacy commitments"));
  return section.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Data ") && !l.startsWith("| ---")).map((l) => l.split(" | "));
}
const ticks = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

describe("PRV-02: the desktop's data folder", () => {
  it("names every file and folder the app keeps there, each with what removes it", () => {
    expect(Object.values(DATA_FILES).sort()).toEqual(["account.json", "first-run.json", "recovery-journal.jsonl", "setup.json", "state.json", "window.json", "workspace.json"]);
    const paths = DESKTOP_DATA.map((i) => i.path.split("#")[0]);
    for (const f of [...Object.values(DATA_FILES), ...Object.values(CHROMIUM_FOLDERS).map((c) => `${c}/`)]) expect(paths).toContain(f);
    for (const i of DESKTOP_DATA) expect(i.removedBy.length).toBeGreaterThan(0);
    expect(RECENT_STATE_KEYS).toEqual(["lastNotePath"]);
  });
  it("signing out and removing the workspace delete the recent items, setup progress, and the first run's choices; only removing forgets the folder", () => {
    expect(filesRemovedBy("signOut").sort()).toEqual(["first-run.json", "recovery-journal.jsonl", "setup.json"]);
    expect(filesRemovedBy("removeWorkspace").sort()).toEqual(["first-run.json", "recovery-journal.jsonl", "setup.json", "workspace.json"]);
    // QLT-03: unsaved text in the journal is the person's writing, so it goes with the workspace, and on a clean quit.
    expect(filesRemovedBy("quit")).toEqual(["recovery-journal.jsonl"]);
    expect(filesRemovedBy("runSetupAgain")).toEqual(["setup.json"]);
    expect(filesRemovedBy("signIn")).toEqual(["account.json"]);
    for (const e of ["signOut", "removeWorkspace"] as const) expect(DESKTOP_DATA.find((i) => i.id === "recentItems")!.removedBy).toContain(e);
    expect(withoutRecent({ version: 1, lastNotePath: "/n/a.md", fontSize: 18 })).toEqual({ version: 1, fontSize: 18 });
  });
  it("is the inventory in Security and privacy: every data-folder file there is in the code, and every one in the code is there", () => {
    const rows = docRows();
    const inDataFolder = rows.filter((r) => /app's data folder/.test(r[1] ?? ""));
    const documented = new Set(inDataFolder.flatMap((r) => ticks(r[1]!).filter((t) => /\.jsonl?$|\/$/.test(t) || (LOCK_FILES as readonly string[]).includes(t))));
    const code = new Set([...Object.values(DATA_FILES), ...Object.values(CHROMIUM_FOLDERS).map((c) => `${c}/`), ...LOCK_FILES]);
    expect([...documented].sort()).toEqual([...code].sort());
    // No row is listed twice.
    const names = rows.map((r) => r[0]!.replace(/^\| /, ""));
    expect(new Set(names).size).toBe(names.length);
  });
  it("is where the main process keeps its files: no other name is joined to the data folder", () => {
    const main = walk(join(root, "apps", "desktop", "src", "main")).filter((f) => f.endsWith(".ts"));
    for (const f of main) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/getPath\("userData"\),\s*["'`]/);
    }
    expect(read("apps/desktop/src/main/main.ts")).toMatch(/from "@focus-notes\/core\/inventory"/);
  });
});

describe("PRV-02: the browser's storage", () => {
  it("is one IndexedDB database with the notes and meta stores, and the meta keys the inventory lists", () => {
    expect(WEB_DATABASE).toBe("focus-notes");
    expect(Object.values(WEB_STORES).sort()).toEqual(["meta", "notes"]);
    expect(Object.values(WEB_META).sort()).toEqual(["appState", "folders", "vaultUnlockKey", "workspaceFormat"]);
    const web = read("apps/web/src/bridge.ts") + read("apps/web/src/idb.ts");
    expect(web).toMatch(/from "@focus-notes\/core\/inventory"/);
    // Every key the inventory names is in the docs' rows about the browser.
    const browserRows = docRows().filter((r) => /IndexedDB/.test(r[1] ?? "")).map((r) => r[1]!).join("\n");
    for (const k of [...Object.values(WEB_STORES), ...Object.values(WEB_META)]) expect(browserRows).toContain(`\`${k}\``);
    for (const i of WEB_DATA) expect(i.removedBy.length).toBeGreaterThan(0);
  });
});
