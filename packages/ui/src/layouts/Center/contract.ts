import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Center",
  tier: "layout",
  description: "Centers content up to a maximum width, with the page gutter.",
  props: {
    maxWidth: { kind: "enum", values: ["measure", "wideContent", "popover", "dialogS", "dialogL", "onboarding"], default: "measure" },
    block: { kind: "enum", values: ["start", "middle", "anchored"], default: "start", description: "middle: centred in the height of a scroller while there's room (the full-window setup, D-126). anchored: placed as a block of layout.onboardingBlock would be centred, so content shorter than that changes height without moving (DSK-09, D-148)." },
    gutter: { kind: "enum", values: ["none", "regular"], default: "regular" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "layout.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...["measure", "wideContent", "popover", "dialogS", "dialogL", "onboarding"].map((maxWidth) => ({ name: `max width ${maxWidth}`, props: { maxWidth }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] })),
    ...["start", "middle", "anchored"].map((block) => ({ name: `block ${block}`, props: { block }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    ...["none", "regular"].map((gutter) => ({ name: `gutter ${gutter}`, props: { gutter }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] })),
  ],
});
