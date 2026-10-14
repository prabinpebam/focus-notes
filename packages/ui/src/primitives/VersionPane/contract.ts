import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "VersionPane",
  tier: "primitive",
  description: "One version of a note in the conflict resolver: its blocks as plain text, with the blocks that differ from the other version highlighted.",
  props: {
    label: { kind: "message", required: true, description: "Which version: This computer, or the other version and when it was made." },
    blocks: { kind: "list", of: "versionBlocks", required: true },
    emptyText: { kind: "message", required: true, description: "Shown when this version has no blocks (deleted, or empty)." },
    changedLabel: { kind: "message", required: true, description: "Said before each highlighted block, so the difference isn't only a color." },
  },
  events: {},
  slots: {},
  states: ["rest", "changed", "empty"],
  tokens: "cmp.versionPane.*",
  a11y: { pattern: "region (labelled), changed blocks prefixed for screen readers", name: "label" },
  fixtures: [
    { name: "with changed blocks", props: { label: { t: "conflict.mine" }, blocks: { get: "vm.gallery.versionBlocks" }, emptyText: { t: "conflict.emptyNote" }, changedLabel: { t: "conflict.changed" } } },
    { name: "deleted version", props: { label: { t: "conflict.theirs" }, blocks: { get: "vm.gallery.versionEmpty" }, emptyText: { t: "conflict.deletedThere" }, changedLabel: { t: "conflict.changed" } } },
  ],
});
