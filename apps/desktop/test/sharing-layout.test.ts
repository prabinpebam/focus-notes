import { expect, it } from "vitest";
import { sharingLayout } from "../src/main/share/layout.ts";

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
