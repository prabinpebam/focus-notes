import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import { coreExtensions, MarkdownSession, blocks } from "../src/index.ts";

const schema = getSchema(coreExtensions());
const corpusDir = join(import.meta.dirname, "..", "..", "markdown", "test", "corpus");

describe("the editor schema keeps the round trip (EDT-10)", () => {
  for (const file of readdirSync(corpusDir)) {
    it(`${file} survives loading into ProseMirror and saving`, () => {
      const src = readFileSync(join(corpusDir, file), "utf8");
      const session = new MarkdownSession(src);
      const pmDoc = schema.nodeFromJSON(session.doc);
      pmDoc.check();
      expect(session.serialize(pmDoc.toJSON())).toBe(src);
    });
  }
});

describe("the block registry (EXT-01)", () => {
  it("registers every node in the schema that holds blocks", () => {
    const names = blocks().map((b) => b.name);
    for (const n of ["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule", "rawMarkdown"]) {
      expect(names).toContain(n);
      expect(schema.nodes[n]).toBeDefined();
    }
  });
});
