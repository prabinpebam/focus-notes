import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Shortcut",
  tier: "primitive",
  description: "A key chord drawn as key caps in the platform's symbols, read aloud in words.",
  props: {
    keys: { kind: "list", of: "keyCaps", required: true, description: "Key caps in display order, from a view model." },
    label: { kind: "text", required: true, description: "The chord in words, for screen readers." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.shortcut.*",
  a11y: { pattern: "text; caps are hidden and the chord is read in words", name: "label" },
  fixtures: [
    { name: "macOS chord", props: { keys: { get: "vm.gallery.keysMac" }, label: { get: "vm.gallery.keysMacSpoken" } } },
    { name: "Windows chord", props: { keys: { get: "vm.gallery.keysPc" }, label: { get: "vm.gallery.keysPcSpoken" } } },
  ],
});
