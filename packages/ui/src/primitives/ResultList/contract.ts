import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ResultList",
  tier: "primitive",
  description: "A list box of results whose owner keeps focus and moves the active item (aria-activedescendant).",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "resultItems", required: true },
    activeId: { kind: "text" },
  },
  events: { action: { payload: { id: "text" } }, activeChange: { payload: { id: "text" } } },
  slots: {},
  states: ["rest", "active", "disabled"],
  tokens: "cmp.resultList.*",
  a11y: { pattern: "listbox with aria-activedescendant", name: "label" },
  fixtures: [
    { name: "with active item", props: { label: { t: "find.label" }, items: { get: "vm.gallery.results" }, activeId: { get: "vm.gallery.optionFirst" } } },
  ],
});
