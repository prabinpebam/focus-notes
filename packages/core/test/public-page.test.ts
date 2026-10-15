/** WP-5.1: public pages' URLs, links, front matter, and first-screen fonts (SHR-03, PRV-04, PRF-12). */
import { describe, expect, it } from "vitest";
import { publicNoteUrl, publicPage, publicPagePath, sharedListModel, sharedNoteFromHash, sharedNoteHash, sharedPage } from "../src/public-page.ts";

const PUBLIC = new Set(["ideas.md", "essays/on-focus.md", "Plans/Launch plan.md"]);
const hrefs = (md: string, path = "essays/on-focus.md") => {
  const out: (string | null)[] = [];
  const walk = (n: { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }) => {
    for (const m of n.marks ?? []) if (m.type === "link") out.push(m.attrs?.href as string | null);
    for (const c of (n.content ?? []) as typeof n[]) walk(c);
  };
  for (const b of publicPage(md, path, "2026-10-01T00:00:00Z", PUBLIC).model.body) walk(b);
  return out;
};

describe("public pages", () => {
  it("SHR-03: a public note's URL is stable and follows its path", () => {
    expect(publicPagePath("ideas.md")).toBe("n/ideas/");
    expect(publicPagePath("essays/on-focus.md")).toBe("n/essays/on-focus/");
    expect(publicPagePath("Plans/Launch plan.md")).toBe("n/Plans/Launch%20plan/");
    expect(publicNoteUrl("https://octo.github.io/notes/", "Plans/Launch plan.md")).toBe("https://octo.github.io/notes/n/Plans/Launch%20plan/");
    expect(publicNoteUrl("https://octo.github.io/notes", "ideas.md")).toBe("https://octo.github.io/notes/n/ideas/");
  });

  it("SHR-03: links to public notes go to their pages; private, missing, and unsafe ones become text", () => {
    expect(hrefs("[a](../ideas.md) [b](../Plans/Launch%20plan.md#steps) [c](#top) [d](https://example.com) [e](mailto:a@b.c)")).toEqual(["../../ideas/", "../../Plans/Launch%20plan/#steps", "#top", "https://example.com", "mailto:a@b.c"]);
    expect(hrefs("[p](../private/notes/Plan.md) [q](../../outside.md) [r](javascript:alert(1)) [s](/etc/passwd) [t](missing.md)")).toEqual([null, null, null, null, null]);
  });

  it("PRV-04: front matter noindex keeps a page out of search; the front matter itself never shows", () => {
    const off = publicPage("---\nid: x\nnoindex: true\n---\n# Hi\n", "ideas.md", "", PUBLIC);
    expect(off.noindex).toBe(true);
    expect(JSON.stringify(off.model)).not.toContain("id: x");
    expect(publicPage("---\nid: x\n---\n# Hi\n", "ideas.md", "", PUBLIC).noindex).toBe(false);
  });

  it("takes the first H1 as the title, or the file name", () => {
    const p = publicPage("# On focus\n\nAttention is a garden.\n", "essays/on-focus.md", "2026-10-01T00:00:00Z", PUBLIC);
    expect(p.title).toBe("On focus");
    expect(p.description).toBe("Attention is a garden.");
    expect(p.model.updated).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(p.model.body.some((b) => b.type === "heading")).toBe(false);
    expect(publicPage("Just text.\n", "Plans/Launch plan.md", "", PUBLIC).title).toBe("Launch plan");
  });

  it("PRF-12: preloads italic only when the first screen has italic text", () => {
    expect(publicPage("# T\n\nPlain.\n", "ideas.md", "", PUBLIC).faces.sort()).toEqual(["400-normal", "700-normal"]);
    expect(publicPage("# T\n\nSome *em* and ***both***.\n", "ideas.md", "", PUBLIC).faces.sort()).toEqual(["400-italic", "400-normal", "700-italic", "700-normal"]);
    expect(publicPage(`# T\n\n${"word ".repeat(400)}\n\nLate *italic*.\n`, "ideas.md", "", PUBLIC).faces).not.toContain("400-italic");
  });
});

describe("shared notes on the share reader (WP-5.4, SHR-10)", () => {
  const SHARED = new Set(["drafts/Plan.md", "drafts/sub/Detail.md"]);
  const links = (md: string, path = "drafts/Plan.md") => {
    const out: (string | null)[] = [];
    const walk = (n: { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }) => {
      for (const m of n.marks ?? []) if (m.type === "link") out.push(m.attrs?.href as string | null);
      for (const c of (n.content ?? []) as typeof n[]) walk(c);
    };
    for (const b of sharedPage(md, path, "2026-10-01T00:00:00Z", SHARED).model.body) walk(b);
    return out;
  };

  it("links only to notes the same share opens, on the reader's own page; anything else is plain text", () => {
    expect(links("[d](sub/Detail.md) [x](../Diary.md) [p](/etc/passwd) [w](https://example.com/) [j](javascript:alert(1)) [s](sub/Detail.md#part)")).toEqual([
      "#note=drafts%2Fsub%2FDetail.md", null, null, "https://example.com/", null, null,
    ]);
  });

  it("keeps fragment links only to notes in the share; any other fragment is plain text (review L6)", () => {
    expect(links("[a](#note=drafts%2Fsub%2FDetail.md) [b](#note=Diary.md) [c](#gshare001.secretsecret) [d](#heading) [e](#note=%zz)")).toEqual([
      "#note=drafts%2Fsub%2FDetail.md", null, null, null, null,
    ]);
    // Public pages keep their in-page anchors.
    expect(publicPage("[top](#top)", "a.md", "2026-10-01T00:00:00Z", new Set(["a.md"])).model.body[0]!.content![0]!.marks![0]!.attrs!.href).toBe("#top");
  });

  it("reads the note a fragment names, and nothing malformed", () => {
    expect(sharedNoteFromHash(sharedNoteHash("drafts/Plan (2).md"))).toBe("drafts/Plan (2).md");
    expect(sharedNoteFromHash("#gshare001.abc")).toBeUndefined();
    expect(sharedNoteFromHash("#note=%E0%A4%A")).toBeUndefined();
    expect(sharedNoteFromHash("")).toBeUndefined();
  });

  it("lists what a share opens by title, each a link on the reader's page", () => {
    const m = sharedListModel("Shared with you", [{ path: "drafts/Plan.md", title: "The plan" }, { path: "x.md", title: "" }]);
    expect(m.title).toEqual([{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Shared with you" }] }]);
    expect(JSON.stringify(m.body)).toContain('"text":"The plan","marks":[{"type":"link","attrs":{"href":"#note=drafts%2FPlan.md"}}]');
    expect(JSON.stringify(m.body)).toContain('"text":"x.md"');
  });
});
