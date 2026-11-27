import { describe, expect, it } from "vitest";
import { middleTruncate, readableLink } from "../src/readable-link.ts";
import { siteMarksOf } from "../src/share-details.ts";
import { publicNoteUrl } from "../src/public-page.ts";
import { copyPublicLink, publicLinkOf } from "../src/public-link-app.ts";
import { MessageCatalog } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const catalog = new MessageCatalog("en", en);

// Main, 27 November: the published badge's tooltip shows a readable link on one line; copy and open keep the real URL.
describe("a published note's link, as a person reads it", () => {
  it("is decoded for display only, without https://", () => {
    expect(readableLink("https://maya-chen.github.io/notebook/n/On%20writing%20slowly/")).toBe("maya-chen.github.io/notebook/n/On writing slowly/");
    expect(readableLink(publicNoteUrl("https://ada.github.io/book/", "Café crème/Noël.md"))).toBe("ada.github.io/book/n/Café crème/Noël/");
    // A malformed escape stays as it is.
    expect(readableLink("https://ada.github.io/n/100%25%/")).toBe("ada.github.io/n/100%25%/");
  });

  it("keeps a short link whole and cuts a long one in the middle, never inside a letter", () => {
    expect(middleTruncate("ada.github.io/book/n/hello/")).toBe("ada.github.io/book/n/hello/");
    const long = `maya-chen.github.io/notebook/n/${"What a calm writing app owes the person who opens it every morning"}/`;
    const cut = middleTruncate(long);
    expect(Array.from(cut)).toHaveLength(60);
    expect(cut.startsWith("maya-chen.github.io/")).toBe(true);
    expect(cut.endsWith("opens it every morning/")).toBe(true);
    expect(cut).toContain("…");
    const emoji = middleTruncate("🌿".repeat(80), 10);
    expect(Array.from(emoji)).toEqual([..."🌿".repeat(4), "…", ..."🌿".repeat(5)]);
  });

  it("shows the readable link in the tooltip on one line and the whole readable link to screen readers; the URL stays encoded", async () => {
    const note = (name: string) => ({ kind: "note" as const, name, published: false });
    const longName = "What a calm writing app owes the person who opens it every morning.md";
    const tree = { roots: [
      { id: "private" as const, path: "/w/private/notes", readOnly: false, children: [] },
      { id: "public" as const, path: "/w/notes", readOnly: false, children: [note("On writing slowly.md"), note(longName), note("hello.md")] },
    ] };
    const state = { workspace: { tree, site: "https://maya-chen.github.io/notebook/" },
      ui: { share: { listing: { available: true, vault: false, grants: [] }, publication: { published: [], publishing: [] }, live: [] } } } as never;

    const spaced = siteMarksOf(state, "/w/notes/On writing slowly.md", catalog);
    expect(spaced.siteDescription).toBe("Published · live at maya-chen.github.io/notebook/n/On writing slowly/");
    expect(spaced.siteTooltip).toBe("Published · live at maya-chen.github.io/notebook/n/On writing slowly/");
    // Copy link and open use the real address.
    expect(publicLinkOf(tree, "https://maya-chen.github.io/notebook/", "/w/notes/On writing slowly.md")).toBe("https://maya-chen.github.io/notebook/n/On%20writing%20slowly/");
    const copied: string[] = [];
    await copyPublicLink({ store: { state } as never, commands: undefined as never, catalog, bridge: { copyText: async (text: string) => { copied.push(text); } } as never, toast: () => 0 }, "/w/notes/On writing slowly.md");
    expect(copied).toEqual(["https://maya-chen.github.io/notebook/n/On%20writing%20slowly/"]);

    const long = siteMarksOf(state, `/w/notes/${longName}`, catalog);
    expect(long.siteDescription).toBe(`Published · live at maya-chen.github.io/notebook/n/${longName.replace(/\.md$/, "")}/`);
    expect(long.siteTooltip).toBe(`Published · live at ${middleTruncate(`maya-chen.github.io/notebook/n/${longName.replace(/\.md$/, "")}/`)}`);
    expect(long.siteTooltip).toContain("…");

    expect(siteMarksOf(state, "/w/notes/hello.md", catalog).siteTooltip).toBe("Published · live at maya-chen.github.io/notebook/n/hello/");
  });
});
