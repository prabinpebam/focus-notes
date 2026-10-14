import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ResultList",
  tier: "primitive",
  description: "A list box of results whose owner keeps focus and moves the active item (aria-activedescendant). Header items head labeled groups; highlights mark where the query matched; a row can show its state.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "resultItems", required: true },
    activeId: { kind: "text" },
    width: { kind: "enum", values: ["fill", "menu"], default: "fill", description: "Fills its container, or the slash menu's fixed width." },
    height: { kind: "enum", values: ["content", "fill"], default: "content", description: "As tall as its items up to a popover's height, or as tall as all of them in a side sheet, whose body scrolls it." },
  },
  events: { action: { payload: { id: "text" } }, activeChange: { payload: { id: "text" } } },
  slots: {},
  states: ["rest", "active", "disabled"],
  tokens: "cmp.resultList.*",
  a11y: { pattern: "listbox with aria-activedescendant", name: "label" },
  fixtures: [
    { name: "with active item", props: { label: { t: "find.label" }, items: { get: "vm.gallery.results" }, activeId: { get: "vm.gallery.optionFirst" } } },
    { name: "width fill", props: { label: { t: "find.label" }, items: { get: "vm.gallery.results" }, width: "fill" } },
    { name: "width menu", props: { label: { t: "slash.label" }, items: { get: "vm.gallery.results" }, activeId: { get: "vm.gallery.optionFirst" }, width: "menu" } },
    { name: "groups, matches, and states", props: { label: { t: "spotlight.list" }, items: { get: "vm.gallery.spotlight" }, activeId: { get: "vm.gallery.spotlightFirst" } } },
    { name: "groups with descriptions and matches, height fill", props: { label: { t: "findAll.results" }, items: { get: "vm.gallery.matches" }, activeId: { get: "vm.gallery.matchFirst" }, height: "fill" } },
    { name: "height content", props: { label: { t: "find.label" }, items: { get: "vm.gallery.results" }, height: "content" } },
  ],
});
