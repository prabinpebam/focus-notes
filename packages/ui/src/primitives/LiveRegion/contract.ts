import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "LiveRegion",
  tier: "primitive",
  description: "A polite screen-reader announcement with nothing on screen.",
  props: {
    message: { kind: "text", required: true },
    announceKey: { kind: "number", min: 0, description: "Changes when the same words should be announced again." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.liveRegion.*",
  a11y: { pattern: "status (live region)" },
  fixtures: [{ name: "message", props: { message: { get: "vm.gallery.query" } } }],
});
