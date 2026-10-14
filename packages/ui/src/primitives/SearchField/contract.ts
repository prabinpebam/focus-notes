import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SearchField",
  tier: "primitive",
  description: "A search box with a clear button. Esc clears it, or passes on when it's already empty.",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "text", bindable: true },
    placeholder: { kind: "message" },
    clearLabel: { kind: "message", required: true },
    autoFocus: { kind: "boolean", default: false },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus into the field." },
    invalid: { kind: "boolean", default: false },
    keyScope: { kind: "enum", values: ["none", "findBar", "findField", "replaceField", "pickerField", "moveField", "repoField", "spotlightField", "findAllField"], default: "none" },
    chip: { kind: "message", description: "A mode shown before the text (Spotlight's All, Notes, Commands); the label says it in words." },
    controls: { kind: "ref", description: "The ResultList this field drives." },
    activeId: { kind: "text", description: "The active item in that list." },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: {},
  states: ["rest", "focused", "filled", "invalid"],
  tokens: "cmp.searchField.*",
  a11y: { pattern: "search box", name: "label" },
  fixtures: [
    { name: "empty", props: { label: { t: "shortcuts.search" }, placeholder: { t: "shortcuts.searchPlaceholder" }, clearLabel: { t: "field.clear" } } },
    { name: "filled", props: { label: { t: "shortcuts.search" }, value: { get: "vm.gallery.query" }, clearLabel: { t: "field.clear" } } },
    { name: "with a mode chip", props: { label: { t: "spotlight.field" }, chip: { t: "spotlight.mode.commands" }, value: { get: "vm.gallery.query" }, clearLabel: { t: "field.clear" }, keyScope: "spotlightField" } },
    { name: "invalid", props: { label: { t: "shortcuts.search" }, value: { get: "vm.gallery.query" }, clearLabel: { t: "field.clear" }, invalid: true } },
    ...["none", "findBar", "findField", "replaceField", "pickerField", "moveField", "repoField", "spotlightField", "findAllField"].map((keyScope) => ({ name: `keyScope ${keyScope}`, props: { label: { t: "shortcuts.search" }, clearLabel: { t: "field.clear" }, keyScope } })),
  ],
});
