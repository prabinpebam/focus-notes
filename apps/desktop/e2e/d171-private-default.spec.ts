/**
 * D-171 (SHR-01): nothing is public unless the person chose it. A fresh profile on a workspace whose
 * `notes/` has an empty public note shows a private note and creates nothing in `notes/`, even when
 * the remembered note is that empty public file; Mod+N from a public note creates under Private.
 */
import { test, expect } from "./fixtures.ts";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** A workspace with both roots: `notes/` holds an empty public note (the template's) and an essay. */
function workspace() {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "notes", "exploratory-conversation.md"), "");
  writeFileSync(join(dirs.docs, "notes", "essay.md"), "# Essay\n\nPublished on purpose.\n");
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  const publicFiles = () => readdirSync(join(dirs.docs, "notes")).sort();
  const privateFiles = () => readdirSync(join(dirs.docs, "private", "notes")).sort();
  return { dirs, publicFiles, privateFiles };
}

test("D-171: a fresh profile shows a private note, never the empty public one, and creates nothing in notes/", async () => {
  const w = workspace();
  const l = await launch(w.dirs);
  const editor = l.page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("Welcome");
  expect(w.privateFiles()).toEqual(["welcome.md"]);
  expect(w.publicFiles()).toEqual(["essay.md", "exploratory-conversation.md"]);
  await quit(l);

  // Remembered as the last note, the empty public file still isn't reopened.
  const again = workspace();
  writeFileSync(join(again.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(again.dirs.docs, "notes", "exploratory-conversation.md") }));
  const l2 = await launch(again.dirs);
  await expect(l2.page.getByRole("textbox", { name: "Note" })).toContainText("Welcome");
  expect(again.privateFiles()).toEqual(["welcome.md"]);
  expect(again.publicFiles()).toEqual(["essay.md", "exploratory-conversation.md"]);
  await quit(l2);
});

test("D-171: Mod+N from a public note creates the new note under Private, at once after launch", async () => {
  const w = workspace();
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(w.dirs.docs, "notes", "essay.md") }));
  const l = await launch(w.dirs);
  const editor = l.page.getByRole("textbox", { name: "Note" });
  // The note the person last opened is reopened as it is.
  await expect(editor).toContainText("Published on purpose.");
  await expect(editor).toBeFocused();
  // Straight away, before the Files tree may have been read.
  await l.page.keyboard.press(`${mod}+N`);
  await expect(editor).toHaveText("");
  await expect.poll(() => w.privateFiles()).toEqual(["Untitled.md"]);
  await l.page.keyboard.type("Private by default.");
  await expect.poll(() => w.privateFiles().map((f) => readFileSync(join(w.dirs.docs, "private", "notes", f), "utf8")).join("")).toContain("Private by default.");
  expect(w.publicFiles()).toEqual(["essay.md", "exploratory-conversation.md"]);
  await quit(l);
});
