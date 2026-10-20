/**
 * D-193, D-204: on macOS a right-click in text shows the system's own menu, built from the shared
 * model: the OS spell checker's suggestions, Learn Spelling, Look Up, the edit actions (Undo and Redo
 * through the editor's history), links, Speech, and Emoji & Symbols, in macOS's words. Keys open the
 * app's own menus, and a right-click on nothing to act on shows no menu at all.
 */
import { describe, expect, it } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { describeMenu, MAC_MENU_WORDS, MAX_SUGGESTIONS, spellingMenu, type SpellingMenuParams } from "../src/main/spelling/menu.ts";

const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true };
const params = (p: Partial<SpellingMenuParams> = {}): SpellingMenuParams => ({
  isEditable: true, misspelledWord: "", dictionarySuggestions: [], selectionText: "", menuSourceType: "mouse", editFlags: flags, linkURL: "", ...p,
});
function rig() {
  const calls: string[] = [];
  return {
    calls,
    act: {
      replace: (s: string) => calls.push(`replace ${s}`), learn: (w: string) => calls.push(`learn ${w}`), lookUp: () => calls.push("lookUp"),
      run: (c: string) => calls.push(`run ${c}`), emoji: () => calls.push("emoji"), copyLink: () => calls.push("copyLink"), openLink: () => calls.push("openLink"),
    },
  };
}
const EDIT = "Undo | Redo | - | role:cut | role:copy | role:paste | role:pasteAndMatchStyle | role:delete | - | role:selectAll";
const TAIL = "Speech[role:startSpeaking, role:stopSpeaking] | - | Emoji && Symbols";
const click = (items: MenuItemConstructorOptions[], label: string) => (items.find((i) => i.label === label)!.click as () => void)();

describe("spellingMenu (macOS's native menu)", () => {
  it("puts the suggestions first, then Learn Spelling and Look Up, the edit actions, Speech, and Emoji & Symbols", () => {
    const items = spellingMenu(params({ misspelledWord: "teh", dictionarySuggestions: ["the", "tech", "ten"] }), rig().act);
    expect(describeMenu(items)).toBe(`the | tech | ten | - | Learn Spelling | - | Look Up “teh” | - | ${EDIT} | - | ${TAIL}`);
  });

  it("replaces the word, learns it, looks it up, and runs Undo and Redo through the editor's history", () => {
    const { calls, act } = rig();
    const items = spellingMenu(params({ misspelledWord: "Pebam", dictionarySuggestions: ["Pebble"] }), act);
    for (const label of ["Pebble", "Learn Spelling", "Look Up “Pebam”", "Undo", "Redo", "Emoji && Symbols"]) click(items, label);
    expect(calls).toEqual(["replace Pebble", "learn Pebam", "lookUp", "run edit.undo", "run edit.redo", "emoji"]);
    const undo = items.find((i) => i.label === "Undo")!;
    expect(undo).toMatchObject({ accelerator: "CommandOrControl+Z", registerAccelerator: false });
  });

  it("says when the OS has no suggestions, and still offers to learn the word", () => {
    const items = spellingMenu(params({ misspelledWord: "zxqv" }), rig().act);
    expect(describeMenu(items).split(" | ").slice(0, 3)).toEqual([`${MAC_MENU_WORDS.noSuggestions} (off)`, "-", "Learn Spelling"]);
  });

  it("shows at most as many suggestions as the OS menus do, with & shown as written", () => {
    const many = ["a&b", ...Array.from({ length: 10 }, (_, i) => `w${i}`)];
    const items = spellingMenu(params({ misspelledWord: "x", dictionarySuggestions: many }), rig().act);
    const suggestions = items.slice(0, items.findIndex((i) => i.type === "separator"));
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestions[0]!.label).toBe("a&&b");
  });

  it("follows the page's edit state", () => {
    const items = spellingMenu(params({ editFlags: { ...flags, canCut: false, canCopy: false, canDelete: false } }), rig().act);
    expect(items.filter((i) => i.role).map((i) => `${i.role}:${i.enabled}`)).toEqual(["cut:false", "copy:false", "paste:true", "pasteAndMatchStyle:true", "delete:false", "selectAll:true"]);
  });

  it("offers Copy Link and Open Link on a link, opening only web links", () => {
    const { calls, act } = rig();
    const items = spellingMenu(params({ linkURL: "https://example.com/" }), act);
    expect(describeMenu(items)).toBe(`${EDIT} | - | Copy Link | Open Link | - | ${TAIL}`);
    click(items, "Copy Link");
    click(items, "Open Link");
    expect(calls).toEqual(["copyLink", "openLink"]);
    expect(describeMenu(spellingMenu(params({ linkURL: "file:///etc/passwd" }), act))).toContain("Copy Link | - | Speech");
  });

  it("offers Copy, Look Up and Speech for selected text outside a field, and nothing when there's nothing to act on", () => {
    expect(describeMenu(spellingMenu(params({ isEditable: false, selectionText: "words" }), rig().act))).toBe("Look Up “words” | - | role:copy | - | Speech[role:startSpeaking, role:stopSpeaking]");
    expect(spellingMenu(params({ isEditable: false, selectionText: "  " }), rig().act)).toEqual([]);
    expect(spellingMenu(params({ isEditable: false, misspelledWord: "teh" }), rig().act)).toEqual([]);
  });

  it("leaves keys to the app's own menus", () => {
    expect(spellingMenu(params({ menuSourceType: "keyboard", misspelledWord: "teh", dictionarySuggestions: ["the"] }), rig().act)).toEqual([]);
  });
});
