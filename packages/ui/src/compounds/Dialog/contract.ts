import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Dialog",
  tier: "compound",
  description: "A titled modal dialog with a close button, optional fixed controls, and a scrolling body.",
  props: {
    title: { kind: "message", required: true },
    closeLabel: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
    size: { kind: "enum", values: ["s", "l"], default: "l" },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { toolbar: { accepts: "any" }, default: { accepts: "any" } },
  states: ["open", "entering", "exiting"],
  tokens: "none (composes DialogPanel, Heading, IconButton, Inline)",
  a11y: { pattern: "modal dialog", name: "title" },
  fixtures: [
    { name: "size s", props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "s" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    {
      name: "size l with toolbar",
      props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "l" },
      slots: { toolbar: [{ type: "SearchField", props: { label: { t: "shortcuts.search" }, clearLabel: { t: "field.clear" } } }] },
      children: [{ type: "Text", props: { value: { t: "gallery.long" } } }],
    },
  ],
});
