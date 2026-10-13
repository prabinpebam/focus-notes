import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "EditorSurface",
  tier: "host",
  description: "The writing surface (Tiptap and ProseMirror). It owns the note's DOM; views place it once.",
  props: {
    documentKey: { kind: "text", required: true },
    initialValue: { kind: "text", required: true },
    label: { kind: "message", required: true },
    placeholder: { kind: "message" },
    readOnly: { kind: "boolean", default: false },
    focusMode: { kind: "boolean", default: false },
    keymap: { kind: "list", of: "keyBindings", description: "Editor key bindings from the command registry." },
  },
  events: { change: { payload: { value: "text" } }, ready: {} },
  slots: {},
  states: ["empty", "editing", "readOnly"],
  tokens: "cmp.editorSurface.*",
  a11y: { pattern: "textbox (multi-line)", name: "label" },
  fixtures: [],
});
