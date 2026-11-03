import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "NoteContent",
  tier: "block",
  description: "A note's content through the block components (paragraphs, headings, lists, task lists, quotes, code, tables, rules, page breaks, inline marks, and unknown syntax), read-only: the published reader page's note (IA-VIEW-PUBLIC) and a printed note (SHR-12).",
  props: {
    blocks: { kind: "list", of: "noteBlocks", required: true, description: "The note as the Markdown bridge parses it." },
    focusMode: { kind: "boolean", default: false, description: "Keep the selected reading block clear and dim the rest. Choose a block with the pointer, or focus the document and use Up/Down." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.noteContent.*",
  a11y: { pattern: "document", name: "The page's landmarks name it; headings keep their levels." },
  fixtures: [
    { name: "paragraph focus", props: { blocks: { get: "vm.gallery.noteBlocks" }, focusMode: true } },
    { name: "every block", props: { blocks: { get: "vm.gallery.noteBlocks" } } },
  ],
});
