import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "Dialog",
  tier: "compound",
  description: "A titled modal dialog with a close button, optional fixed controls and footer actions, and a scrolling body.",
  props: {
    title: { kind: "message", required: true },
    closeLabel: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
    contentInset: { kind: "boolean", default: true, description: "Inset the body's content, not its scroll wrapper. False allows full-bleed children with their own immediate inset layouts." },
    height: { kind: "enum", values: ["stable", "content", "navigation", "adaptive"], default: "stable", description: "stable: at least 400 px without shrinking; content: top-anchored confirmation; adaptive: content-sized and always centred as async lists change; navigation: clamped 600 px with independently scrolling tab content." },
    size: { kind: "enum", values: ["s", "m", "l", "xl"], default: "l", description: "m is a form that fits its content (Send feedback, D-203), 640 px like Spotlight; xl is the conflict resolver's: most of the window, up to layout.dialogXL." },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { toolbar: { accepts: "any" }, default: { accepts: "any" }, footer: { accepts: "any", max: 1 } },
  states: ["open", "entering", "exiting"],
  tokens: "none (composes DialogPanel, Heading, IconButton, Inline)",
  a11y: { pattern: "modal dialog", name: "title" },
  uncovered: { entering: GAP.motion, exiting: GAP.motion },
  fixtures: [
    { name: "height adaptive", covers: ["open"], props: { title: { t: "gallery.sample" }, closeLabel: { t: "dialog.close" }, open: true, height: "adaptive" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "full bleed content", covers: ["open"], props: { title: { t: "gallery.sample" }, closeLabel: { t: "dialog.close" }, open: true, contentInset: false }, children: [{ type: "Stack", props: { padding: "insetLg" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] }, { type: "Divider" }] },
    { name: "height navigation", covers: ["open"], props: { title: { t: "settings.title" }, closeLabel: { t: "dialog.close" }, open: true, height: "navigation" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "size s", covers: ["open"], props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "s" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "height content", covers: ["open"], props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "s", height: "content" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    {
      name: "size l with toolbar",
      covers: ["open"],
      props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "l" },
      slots: { toolbar: [{ type: "SearchField", props: { label: { t: "shortcuts.search" }, clearLabel: { t: "field.clear" } } }] },
      children: [{ type: "Text", props: { value: { t: "gallery.long" } } }],
    },
    { name: "size m", covers: ["open"], props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "m", height: "content" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "size xl", covers: ["open"], props: { title: { t: "shortcuts.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "xl" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "fixed footer", covers: ["open"], props: { title: { t: "gallery.sample" }, closeLabel: { t: "dialog.close" }, open: true }, slots: { footer: [{ type: "Inline", props: { justify: "end", gap: "inlineItem" }, children: [{ type: "Button", props: { label: { t: "gallery.action" }, variant: "primary" } }] }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});
