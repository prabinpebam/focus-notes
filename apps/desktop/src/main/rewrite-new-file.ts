import { link, open, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { withoutNoteId } from "@focus-notes/core";

/** Publish a complete new inode, never rename over an existing note. A crash leaves only a hidden temp. */
export async function createRewriteFile(path: string, output: string, validate: () => Promise<void>): Promise<void> {
  const clean = withoutNoteId(output);
  const id = randomUUID();
  const text = clean.startsWith("---\n") ? clean.replace("---\n", `---\nid: ${id}\n`) : `---\nid: ${id}\n---\n${clean}`;
  const temp = join(dirname(path), `.${id}.focus-notes.tmp`);
  await validate();
  try {
    const file = await open(temp, "wx");
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    await validate();
    // link is exclusive (EEXIST on a collision), including on Windows; no partial .md is visible.
    await link(temp, path);
  } finally { await rm(temp, { force: true }); }
}
