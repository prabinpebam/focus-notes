import { expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectSharingLayout, sharingLayout } from "../src/main/share/layout.ts";

it("PRJ-10: classifies a real New-project folder as Private and preserves an inaccessible legacy pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "sharing-layout-"));
  try {
    await mkdir(join(root, "notes"));
    expect(projectSharingLayout(root, true)).toEqual(sharingLayout(root, { workspace: true, legacyPair: false, privateCheckout: false }));
    await writeFile(join(root, ".gitmodules"), '[submodule "private"]\n\tpath = private\n\turl = https://github.com/example/private.git\n');
    expect(projectSharingLayout(root, true).roots.map(root => root.id)).toEqual(["public"]);
    expect(projectSharingLayout(root, true).privateDir).toBeUndefined();
    await mkdir(join(root, "private", "notes"), { recursive: true });
    expect(projectSharingLayout(root, true).roots.map(root => root.id)).toEqual(["private", "public"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("PRJ-10: New project notes are always Private, never a publishable public source", () => {
  const layout = sharingLayout("C:\\Projects\\Book", { workspace: true, legacyPair: false, privateCheckout: false });
  expect(layout.privateDir).toBe("C:\\Projects\\Book");
  expect(layout.privateNotes).toBe("C:\\Projects\\Book\\notes");
  expect(layout.publicDir).toBeUndefined();
  expect(layout.roots).toEqual([{ id: "private", path: "C:\\Projects\\Book\\notes", readOnly: false }]);
  expect(layout.roots.some(root => root.id === "public")).toBe(false);
});

it("keeps the legacy pair's private and public source separate", () => {
  const layout = sharingLayout("C:\\Projects\\Book", { workspace: true, legacyPair: true, privateCheckout: true });
  expect(layout.privateDir).toBe("C:\\Projects\\Book\\private");
  expect(layout.publicDir).toBe("C:\\Projects\\Book");
  expect(layout.roots.map(root => root.id)).toEqual(["private", "public"]);
});

it("does not invent a private checkout when a legacy clone cannot access it", () => {
  const layout = sharingLayout("C:\\Projects\\Book", { workspace: true, legacyPair: true, privateCheckout: false });
  expect(layout.privateDir).toBeUndefined();
  expect(layout.privateNotes).toBeUndefined();
  expect(layout.roots.map(root => root.id)).toEqual(["public"]);
});

it("leaves a plain local folder outside the project format unchanged", () => {
  expect(sharingLayout("C:\\Local notes", { workspace: false, legacyPair: false, privateCheckout: false }).roots)
    .toEqual([{ id: "local", path: "C:\\Local notes", readOnly: false }]);
});
