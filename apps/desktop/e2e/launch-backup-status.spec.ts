/**
 * D-414: nothing says "Backed up" before the app has counted what waits. A sampler that runs before
 * the page's own script records every change of the corner's save state and the Files panel's backup
 * icons from the first frame. With work not on the remote, no frame may say Backed up; a workspace
 * that is really backed up says so once it's counted, and that wait is measured (perceived-performance).
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

const SAMPLER = `(() => {
  if (!location.href.includes("index.html")) return;
  const trail = [];
  window.__statusTrail = trail;
  const ids = ["saveState", "repoBackupIcon-private", "repoBackupIcon-public"];
  const read = () => ids.map((id) => {
    const el = document.getElementById(id);
    return el ? id + "=" + el.getAttribute("data-state") + "|" + (el.getAttribute("aria-label") || "") : id + "=absent";
  }).join(" ");
  let last = "";
  const note = () => { const v = read(); if (v !== last) { last = v; trail.push({ t: performance.now(), v }); } };
  note();
  new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "aria-label"] });
  const frame = () => { note(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
})();`;

type Entry = { t: number; v: string };
// The corner speaks for the whole workspace; each Files icon for its own repository.
const says = (v: string, id: string) => new RegExp(`${id}=([^ ]*)`).exec(v)?.[1] ?? "";
const claimsBackedUp = (v: string, id: string) => /^synced\|/.test(says(v, id)) || /Backed up/.test(says(v, id));

type Setup = (ws: string, remotes: { notes: string; priv: string }) => void;
// Each case, and the Files icons of the repositories holding the work that isn't on the remote.
const holds: Record<string, string[]> = {
  "an unpushed commit": ["repoBackupIcon-public"],
  "a deleted note": ["repoBackupIcon-public"],
  "a note saved but not committed": ["repoBackupIcon-private"],
  "no remote at all": ["repoBackupIcon-private", "repoBackupIcon-public"],
  "offline, with a note saved but not committed": ["repoBackupIcon-private"],
};
const unpushedWork: Record<string, Setup> = {
  "an unpushed commit": (ws) => {
    write(join(ws, "notes", "kept.md"), "# Kept\n");
    git(ws, "add", "notes/kept.md");
    git(ws, "commit", "-q", "-m", "Not pushed yet");
  },
  "a deleted note": (ws) => {
    for (const n of ["a", "b", "c"]) write(join(ws, "notes", `${n}.md`), `# ${n}\n`);
    git(ws, "add", "notes");
    git(ws, "commit", "-q", "-m", "Three notes");
    git(ws, "push", "-q");
    rmSync(join(ws, "notes", "b.md"));
  },
  "a note saved but not committed": (ws) => {
    writeFileSync(join(ws, "private", "notes", "welcome.md"), "# Welcome\n\nSaved, never committed.\n");
  },
  "no remote at all": (ws) => {
    git(ws, "remote", "remove", "origin");
    git(join(ws, "private"), "remote", "remove", "origin");
  },
  "offline, with a note saved but not committed": (ws) => {
    git(ws, "remote", "set-url", "origin", "C:\\fn-nowhere\\notes.git");
    git(join(ws, "private"), "remote", "set-url", "origin", "C:\\fn-nowhere\\private.git");
    writeFileSync(join(ws, "private", "notes", "welcome.md"), "# Welcome\n\nOffline and waiting.\n");
  },
};
const backedUp: Record<string, Setup> = {
  "a clean, pushed workspace": () => {},
  "a line-ending-only change": (ws) => {
    const welcome = join(ws, "private", "notes", "welcome.md");
    writeFileSync(welcome, readFileSync(welcome, "utf8").replace(/\r?\n/g, "\r\n"));
  },
};

async function sample(setup: Setup) {
  const { dirs, notesRemote, privateRemote } = instance();
  setup(dirs.docs, { notes: notesRemote, priv: privateRemote });
  const l = await launch(dirs, {}, { initScript: SAMPLER });
  try {
    await expect(l.page.locator("#saveState")).toBeVisible();
    await l.page.waitForTimeout(3_000);
    // The Files panel's backup icons too.
    await l.page.keyboard.press("Control+O");
    await expect(l.page.getByRole("complementary", { name: "Files" })).toBeVisible();
    await l.page.waitForTimeout(2_000);
    return await l.page.evaluate(() => (window as unknown as { __statusTrail: Entry[] }).__statusTrail);
  } finally {
    await quit(l);
  }
}

for (const [name, setup] of Object.entries(unpushedWork)) {
  test(`D-414: ${name}: no frame from launch says Backed up`, async () => {
    const trail = await sample(setup);
    console.log(`[D-414] ${name}: ${trail.map((e) => `${Math.round(e.t)}ms ${e.v}`).join(" > ")}`);
    // The sampler ran before the corner's first paint, so every frame is in the trail.
    expect(trail[0]?.v).toContain("saveState=absent");
    for (const id of ["saveState", ...holds[name]!]) expect(trail.filter((e) => claimsBackedUp(e.v, id)).map((e) => e.v), id).toEqual([]);
    // The Files icons were seen, so they were checked.
    for (const id of holds[name]!) expect(trail.some((e) => !e.v.includes(`${id}=absent`)), id).toBe(true);
  });
}

for (const [name, setup] of Object.entries(backedUp)) {
  test(`D-414: ${name}: says Backed up once counted, never before`, async () => {
    const trail = await sample(setup);
    console.log(`[D-414] ${name}: ${trail.map((e) => `${Math.round(e.t)}ms ${e.v}`).join(" > ")}`);
    expect(trail[0]?.v).toContain("saveState=absent");
    const first = trail.find((e) => !e.v.includes("saveState=absent"))!;
    const synced = trail.find((e) => /saveState=synced\|/.test(e.v));
    expect(synced, "a backed-up workspace says so").toBeTruthy();
    expect(trail.at(-1)!.v).toMatch(/saveState=synced\|/);
    // The Files panel's backup icons agree: nothing waits (no false alarm).
    expect(trail.at(-1)!.v).not.toMatch(/repoBackupIcon-\w+=pending/);
    // The corner's wait from its first frame to Backed up (the wait inventory's row).
    console.log(`[D-414] ${name}: corner first frame ${Math.round(first.t)} ms, Backed up after ${Math.round(synced!.t - first.t)} ms`);
  });
}
