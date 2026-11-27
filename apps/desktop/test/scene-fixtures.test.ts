import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sharingLayout } from "../src/main/share/layout.ts";
import { PUBLISHED, SCENE_NOTES, SHARED } from "../e2e/scene-fixtures.ts";

const e2e = join(import.meta.dirname, "..", "e2e");
const webE2e = join(import.meta.dirname, "..", "..", "web", "e2e");
/** Every file that builds a Store or site screenshot fixture. */
const fixtureFiles = [
  ...readdirSync(e2e).filter((f) => /^(store|site)-catalog\.spec\.ts$|^scene-.*\.ts$/.test(f)).map((f) => join(e2e, f)),
  ...readdirSync(webE2e).filter((f) => /^website-catalog\.spec\.ts$/.test(f)).map((f) => join(webE2e, f)),
];

// Main, 27 November 19:13: no Store or site image shows a published or live globe under Private.
describe("Store and site screenshot fixtures", () => {
  it("keep every published note in a project with a public root, and the shared note private", () => {
    const layout = sharingLayout("C:/Notebook", { workspace: true, legacyPair: true, privateCheckout: true });
    expect(layout.roots.map((r) => r.id)).toEqual(["private", "public"]);
    expect(Object.keys(SCENE_NOTES.public)).toEqual([`${PUBLISHED}.md`]);
    expect(Object.keys(SCENE_NOTES.private)).toContain(`${SHARED}.md`);
    expect(Object.keys(SCENE_NOTES.private)).not.toContain(`${PUBLISHED}.md`);
  });

  it("never mark a note published in a private-only project", () => {
    expect(fixtureFiles.map((f) => f.replace(/\\/g, "/").split("/").pop())).toEqual(expect.arrayContaining(["store-catalog.spec.ts", "site-catalog.spec.ts", "scene-sharing.ts"]));
    // published.json is how a private-only project's note is published (its globe under Private); no fixture writes it.
    for (const file of fixtureFiles) expect(readFileSync(file, "utf8"), file).not.toMatch(/published\.json/);
  });

  it("check the globe in the picture itself wherever Files shows the shared project", () => {
    for (const name of ["store-catalog.spec.ts", "site-catalog.spec.ts", "scene-sharing.ts"]) {
      const text = readFileSync(join(e2e, name), "utf8");
      if (/startSharedProject\(/.test(text)) expect(text, name).toMatch(/expectNoGlobeUnderPrivate\(page\)/);
    }
  });
});
