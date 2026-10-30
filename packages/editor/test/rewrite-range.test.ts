import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { Slice, Fragment } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { parseMarkdown } from "@focus-notes/markdown";
import { coreExtensions, MarkdownSession } from "../src/index.ts";
import { RewriteRange } from "../src/rewrite.ts";

const schema = getSchema(coreExtensions());
const doc = () => schema.nodeFromJSON(parseMarkdown("Before\n\nOriginal\n\nAfter").doc);
const text = (value: string) => new Slice(Fragment.from(schema.text(value)), 0, 0);

describe("RWR-24: paired canonical/projection transaction mapping", () => {
  it("captures pending ordinary edits from the Markdown session before resolving a target (EDT-15)", () => {
    const session = new MarkdownSession("Original\n\nOutside");
    const original = schema.nodeFromJSON(session.doc);
    const edited = new Transform(original).insert(1, schema.text("New ")).doc;
    const captured = session.rewriteTarget(edited.toJSON(), 1, 4);
    expect(captured.source).toBe("New Original\n\nOutside");
    expect(captured.target.original).toBe("New");
    expect(captured.target.expanded).toBe(false);
  });
  it("keeps every preview and navigation out of canonical text", () => {
    const range = new RewriteRange(doc(), 9, 17);
    range.show(text("Short"));
    expect(range.projection.textContent).toBe("BeforeShortAfter");
    expect(range.canonical.textContent).toBe("BeforeOriginalAfter");
    range.show(text("A much longer variation"));
    expect(range.canonical.eq(doc())).toBe(true);
    expect(range.discard().eq(doc())).toBe(true);
  });
  it("maps multi-step independent edits through unequal preview lengths in both directions", () => {
    const range = new RewriteRange(doc(), 9, 17);
    range.show(text("X"));
    const tr = new Transform(range.projection).insert(2, schema.text("++"));
    tr.insert(tr.doc.content.size - 1, schema.text("!"));
    range.applyOutside(tr);
    expect(range.canonical.textContent).toBe("B++eforeOriginalAfter!");
    expect(range.projection.textContent).toBe("B++eforeXAfter!");
    expect(range.from).toBe(11);
    expect(range.to).toBe(19);
    range.show(text("Longer"));
    expect(range.projection.textContent).toBe("B++eforeLongerAfter!");
    expect(range.accept().doc.textContent).toBe("B++eforeLongerAfter!");
  });
  it("rejects crossing steps atomically, retaining both prior documents", () => {
    const range = new RewriteRange(doc(), 9, 17);
    range.show(text("X"));
    const before = range.projection;
    const tr = new Transform(before).insert(2, schema.text("safe"));
    tr.delete(6, 16);
    expect(() => range.applyOutside(tr)).toThrow("protected-target");
    expect(range.projection.eq(before)).toBe(true);
    expect(range.canonical.eq(doc())).toBe(true);
  });
  it("refuses overlapping formatting, ancestor removal, and stale transactions", () => {
    const range = new RewriteRange(doc(), 9, 17);
    range.show(text("X"));
    expect(() => range.applyOutside(new Transform(range.projection).addMark(9, 10, schema.marks.bold!.create()))).toThrow("protected-target");
    expect(() => range.applyOutside(new Transform(range.projection).delete(8, 11))).toThrow("protected-target");
    expect(() => range.applyOutside(new Transform(doc()).insert(2, schema.text("x")))).toThrow("stale-target");
  });
  it("accepts only one complete replacement step, not one step per streamed token", () => {
    const range = new RewriteRange(doc(), 9, 17);
    range.show(text("N"));
    range.show(text("New"));
    range.show(text("New words"));
    const accepted = range.accept();
    expect(accepted.steps).toHaveLength(1);
    expect(accepted.doc.textContent).toBe("BeforeNew wordsAfter");
  });
});
