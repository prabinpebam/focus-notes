import { defineContract } from "../../contract.ts";

const action = { type: "Button", props: { label: { t: "gallery.action" } } };
const pair = { type: "Stack", props: { gap: "stackPair", align: "start" }, children: [action, { type: "Text", props: { value: { t: "gallery.long" }, role: "secondary", tone: "muted" } }] };

export const contract = defineContract({
  type: "Section",
  tier: "layout",
  description:
    "One section of a view: an optional heading and section-wide context over its items, grouped by space alone (spacing SP-12). Heading and context sit stackPair apart, the header stackItem above its items, and the items stackGroup apart; a control and its own description are one item, a stackPair Stack. Sections stack stackSection apart. So pair < heading < item < section, and a heading belongs to what follows.",
  props: {},
  events: {},
  slots: { heading: { accepts: "any", max: 2 }, default: { accepts: "any" } },
  states: ["rest"],
  tokens: "space.stackPair, space.stackItem, space.stackGroup",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "with heading", slots: { heading: [{ type: "Heading", props: { value: { t: "gallery.sample" }, level: "3" } }] }, children: [pair, pair, action] },
    { name: "with section context", slots: { heading: [{ type: "Heading", props: { value: { t: "gallery.sample" }, level: "3" } }, { type: "Text", props: { value: { t: "gallery.long" }, tone: "muted" } }] }, children: [pair, pair] },
    { name: "without heading", children: [pair, action] },
  ],
});
