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
    findOpen: { kind: "boolean", default: false },
    findQuery: { kind: "text" },
    findReplace: { kind: "text" },
    findCase: { kind: "boolean", default: false },
    findWord: { kind: "boolean", default: false },
    findRegex: { kind: "boolean", default: false },
  },
  events: {
    change: { payload: { value: "text" } },
    ready: {},
    findResult: { payload: { count: "number", current: "number", invalid: "boolean", wrapped: "boolean", replaced: "number" } },
    findPrefill: { payload: { value: "text" } },
  },
  slots: {},
  states: ["empty", "editing", "readOnly"],
  tokens: "cmp.editorSurface.*",
  a11y: { pattern: "textbox (multi-line)", name: "label" },
  fixtures: [],
});
