import { defineContract } from "../../contract.ts";

const mark = { type: "StepMark", props: { icon: "warning", size: "compact", tone: "warning" } };
const heading = [
  { type: "Heading", props: { value: { t: "gallery.sample" }, level: "3" } },
  { type: "Text", props: { value: { t: "gallery.long" } } },
];
const facts = { type: "Stack", props: { gap: "stackPair" }, children: [1, 2].map(() => ({ type: "Text", props: { value: { t: "gallery.sample" }, role: "caption", tone: "muted" } })) };
const actions = [
  { type: "Button", props: { label: { t: "gallery.action" }, variant: "secondary" } },
  { type: "Button", props: { label: { t: "gallery.action" }, variant: "primary" } },
];

export const contract = defineContract({
  type: "IconLayout",
  tier: "layout",
  description:
    "The app-wide two-column layout for dialogs, alert cards and popover cards (D-408). The icon slot is the first column and holds only the icon or visual; everything else sits in the second column: the heading slot (title and its line, stackPair apart), then the default slot stackGroup below (body, details, progress, fields; stackItem apart), then the actions slot below with the largest gap (cmp.iconLayout.actionsGap, the gutter, never more than a card's inset), aligned to the trailing edge, secondary first and primary last (D-374). Nothing in the second column wraps under the icon. Without an icon it is one column with the same trailing actions. It paints no border, fill or inset: the enclosing Surface, PopoverPanel or Dialog owns the one inset.",
  props: {},
  events: {},
  slots: {
    icon: { accepts: "any", max: 1 },
    heading: { accepts: "any", max: 2 },
    default: { accepts: "any" },
    actions: { accepts: "any", max: 4 },
  },
  states: ["rest"],
  tokens: "space.inlineGroup, space.inlineItem, space.stackPair, space.stackItem, space.stackGroup, cmp.iconLayout.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "icon, details and actions", slots: { icon: [mark], heading, actions }, children: [facts] },
    { name: "icon with progress", slots: { icon: [{ ...mark, props: { ...mark.props, icon: "cloudUp", tone: "accent", busy: true } }], heading }, children: [{ type: "ProgressBar", props: { value: 45, label: { t: "gallery.sample" } } }, facts] },
    { name: "no icon", slots: { heading, actions }, children: [facts] },
  ],
});
