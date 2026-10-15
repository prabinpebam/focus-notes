import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "AppMark",
  tier: "primitive",
  description: "The Focus Notes app icon (the red dot in a frosted circle, on paper), drawn from the brand tokens (a dark tile in a dark theme, D-135): the hero of the full-window setup (D-126). Decorative unless it has a label.",
  props: {
    size: { kind: "enum", values: ["m", "l"], default: "l" },
    label: { kind: "message" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.appMark.*",
  a11y: { pattern: "img", name: "label" },
  fixtures: [
    ...["m", "l"].map((size) => ({ name: `size ${size}`, props: { size } })),
    { name: "labelled", props: { label: { t: "gallery.sample" } } },
  ],
});
