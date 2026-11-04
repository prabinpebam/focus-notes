import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "ColorField",
  tier: "primitive",
  description: "A labelled hex color field with a swatch (Theme manager → Edit colors). The value is committed on Enter or on leaving the field, so typing never applies half a color.",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "text", description: "The color, or what was typed if it isn't one." },
    swatch: { kind: "text", description: "The color the swatch shows: #rgb or #rrggbb, anything else shows none." },
    description: { kind: "text", description: "Said with the field: the contrast it's checked against." },
    invalid: { kind: "boolean", default: false },
    error: { kind: "text", description: "Why the value isn't a color, shown instead of the description." },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus into the field (after Fix, whose button goes away)." },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"], description: "The commit track (F2), as on TextField: pending (commit border, locked, spinner), confirmed (tick), failed (error icon, `error` below with Retry and Revert, the value kept)." },
    retryLabel: { kind: "message", description: "Failed: saves the same colour again." },
    revertLabel: { kind: "message", description: "Failed: puts back the last colour that was kept." },
  },
  events: { commit: { payload: { value: "text" } }, retry: {}, revert: {} },
  slots: {},
  states: ["rest", "focused", "invalid", "pending", "confirmed", "failed"],
  tokens: "cmp.colorField.*",
  a11y: { pattern: "text box", name: "label" },
  uncovered: { focused: GAP.focused },
  fixtures: [
    { name: "with a swatch", props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, description: { get: "vm.gallery.query" } } },
    { name: "commit rest", props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, commit: "rest" } },
    { name: "commit pending", covers: ["pending"], props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, commit: "pending" } },
    { name: "commit confirmed", covers: ["confirmed"], props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, commit: "confirmed" } },
    { name: "commit failed", covers: ["failed"], props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, commit: "failed", error: { get: "vm.gallery.query" }, retryLabel: { t: "commit.retry" }, revertLabel: { t: "commit.revert" } } },
    { name: "invalid", covers: ["invalid"], props: { label: { t: "colors.key.accent" }, value: { get: "vm.gallery.query" }, invalid: true, error: { get: "vm.gallery.query" } } },
  ],
});
