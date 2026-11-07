import { join } from "node:path";

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
