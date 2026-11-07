import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export interface SharingLayout {
  legacy: boolean;
  privateDir?: string;
  privateNotes?: string;
  publicDir?: string;
  roots: { id: "local" | "private" | "public"; path: string; readOnly: boolean }[];
}
/** The project repository is private; only a legacy pair has public source at its root. */
export function sharingLayout(root: string, facts: { workspace: boolean; legacyPair: boolean; privateCheckout: boolean }): SharingLayout {
  if (!facts.workspace) return { legacy: false, roots: [{ id: "local", path: root, readOnly: false }] };
  if (facts.legacyPair) return {
    legacy: true,
    ...(facts.privateCheckout ? { privateDir: join(root, "private"), privateNotes: join(root, "private", "notes") } : {}),
    publicDir: root,
    roots: [
      ...(facts.privateCheckout ? [{ id: "private" as const, path: join(root, "private", "notes"), readOnly: false }] : []),
      { id: "public", path: join(root, "notes"), readOnly: false },
    ],
  };
  return {
    legacy: false, privateDir: root, privateNotes: join(root, "notes"),
    roots: [{ id: "private", path: join(root, "notes"), readOnly: false }],
  };
}

export function projectSharingLayout(root: string, workspace: boolean): SharingLayout {
  const privateCheckout = existsSync(join(root, "private", "notes")) || existsSync(join(root, "private", ".git"));
  let legacyPair = privateCheckout;
  if (workspace && !legacyPair) {
    let modules: string;
    try { modules = readFileSync(join(root, ".gitmodules"), "utf8"); }
    catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
      modules = "";
    }
    legacyPair = /^\s*path\s*=\s*"?private"?\s*$/m.test(modules);
  }
  return sharingLayout(root, { workspace, legacyPair, privateCheckout });
}
