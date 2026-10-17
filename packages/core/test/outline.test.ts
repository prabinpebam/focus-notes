/** UI-13, D-185: *Show contents* is available with two or more headings, and asks the editor to open the card. */
import { describe, expect, it } from "vitest";
import { createApp, type PlatformBridge } from "../src/index.ts";
import { headingCount } from "../src/outline.ts";
import en from "../../views/messages/en.json" with { type: "json" };

describe("headingCount", () => {
  it("counts ATX and setext headings at the top level, never in code, lists or quotes", () => {
    expect(headingCount("# One\n\nText\n\n## Two\n")).toBe(2);
    expect(headingCount("Title\n=====\n\nSub\n---\n")).toBe(2);
    expect(headingCount("```\n# not\n```\n\n~~~md\n## not\n~~~\n\n# Yes\n")).toBe(1);
    expect(headingCount("- # in a list\n\n> # in a quote\n\n    # indented code\n")).toBe(0);
    // A thematic break after a blank line isn't a setext underline.
    expect(headingCount("Para\n\n---\n\n#\n")).toBe(1);
    expect(headingCount("#hashtag\n\n####### seven\n")).toBe(0);
    // Inside a list item: indented headings and setext underlines, and lazy lines, aren't top level.
    expect(headingCount("1. Step\n\n   ## Note\n\n- a\n  b\n  ---\n")).toBe(0);
    expect(headingCount("- item\nlazy line\n# After\n\n> quote\n\n## Out\n")).toBe(2);
    expect(headingCount("- item\n\nParagraph\n---\n")).toBe(1);
  });
});

function setup(markdown: string) {
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async () => markdown,
    writeNote: async () => {},
    chooseNote: async () => "/n/b.md",
    newNotePath: async () => "/n/new.md",
    defaultNotePath: async () => "/n/a.md",
    loadAppState: async () => ({ version: 1, lastNotePath: "/n/a.md", firstRun: "done" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
  };
  return createApp(bridge, en as Record<string, string>);
}

describe("Show contents", () => {
  it("is unavailable, saying why, until the note has two headings, then asks the editor to open the card", async () => {
    const app = setup("# Only one\n\nText.\n");
    await app.start();
    expect(app.commands.describe("outline.show")).toMatchObject({ enabled: false, disabledReason: "command.outline.show.reason" });
    expect(app.messages.format("command.outline.show.reason")).toBe("Add two or more headings to see the contents");
    await app.commands.run("note.setContent", { value: "# One\n\n## Two\n" });
    expect(app.commands.describe("outline.show")).toMatchObject({ enabled: true });
    expect(app.messages.format(app.commands.describe("outline.show").title)).toBe("Show contents");
    const asked: string[] = [];
    app.onEditorAction((id) => asked.push(id));
    await app.commands.run("outline.show");
    expect(asked).toEqual(["outline.show"]);
  });
});
