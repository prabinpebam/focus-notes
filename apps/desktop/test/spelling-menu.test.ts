/**
 * D-193: a right-click on a misspelled word shows the OS spell checker's suggestions and "Add to
 * dictionary" in the OS's menu, then the edit actions; choosing one acts on the word. Keys open the
 * app's own menus, and a right-click on nothing to act on shows no menu at all.
 */
import { describe, expect, it } from "vitest";
import { describeMenu, MAX_SUGGESTIONS, spellingMenu, type SpellingMenuParams } from "../src/main/spelling/menu.ts";

const flags = { canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true };
const params = (p: Partial<SpellingMenuParams> = {}): SpellingMenuParams => ({
  isEditable: true, misspelledWord: "", dictionarySuggestions: [], selectionText: "", menuSourceType: "mouse", editFlags: flags, ...p,
});
function rig() {
  const calls: string[] = [];
  return { calls, act: { replace: (s: string) => calls.push(`replace ${s}`), learn: (w: string) => calls.push(`learn ${w}`) } };
}

describe("spellingMenu", () => {
  it("puts the OS's suggestions first, then Add to dictionary, then the edit actions", () => {
    const { act } = rig();
    const items = spellingMenu(params({ misspelledWord: "teh", dictionarySuggestions: ["the", "tech", "ten"] }), act);
    expect(describeMenu(items)).toBe("the | tech | ten | - | Add to dictionary | - | role:cut | role:copy | role:paste | - | role:selectAll");
  });

  it("replaces the word with the chosen suggestion, and adds the word itself to the dictionary", () => {
    const { calls, act } = rig();
    const items = spellingMenu(params({ misspelledWord: "Pebam", dictionarySuggestions: ["Pebble"] }), act);
    const click = (label: string) => (items.find((i) => i.label === label)!.click as () => void)();
    click("Pebble");
    click("Add to dictionary");
    expect(calls).toEqual(["replace Pebble", "learn Pebam"]);
  });

  it("says when the OS has no suggestions, and still offers to learn the word", () => {
    const items = spellingMenu(params({ misspelledWord: "zxqv" }), rig().act);
    expect(describeMenu(items).split(" | ").slice(0, 3)).toEqual(["No suggestions (off)", "-", "Add to dictionary"]);
  });

  it("shows at most as many suggestions as the OS menus do, with & shown as written", () => {
    const many = ["a&b", ...Array.from({ length: 10 }, (_, i) => `w${i}`)];
    const items = spellingMenu(params({ misspelledWord: "x", dictionarySuggestions: many }), rig().act);
    const suggestions = items.slice(0, items.findIndex((i) => i.type === "separator"));
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestions[0]!.label).toBe("a&&b");
  });

  it("follows the page's edit state", () => {
    const items = spellingMenu(params({ editFlags: { ...flags, canCut: false, canCopy: false } }), rig().act);
    expect(items.filter((i) => i.role).map((i) => `${i.role}:${i.enabled}`)).toEqual(["cut:false", "copy:false", "paste:true", "selectAll:true"]);
  });

  it("offers Copy for selected text outside a field, and nothing when there's nothing to act on", () => {
    expect(describeMenu(spellingMenu(params({ isEditable: false, selectionText: "words" }), rig().act))).toBe("role:copy");
    expect(spellingMenu(params({ isEditable: false, selectionText: "  " }), rig().act)).toEqual([]);
    expect(spellingMenu(params({ isEditable: false, misspelledWord: "teh" }), rig().act)).toEqual([]);
  });

  it("leaves keys to the app's own menus", () => {
    expect(spellingMenu(params({ menuSourceType: "keyboard", misspelledWord: "teh", dictionarySuggestions: ["the"] }), rig().act)).toEqual([]);
  });
});
