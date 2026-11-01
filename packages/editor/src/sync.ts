import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Input events outrank selectionchange in Chromium, so a key pressed right after moving the selection
 * (fast typists, macros, a double-click then a shortcut) can arrive before ProseMirror has read it.
 * Commands that act on the selection read it first. So does anything that dispatches a transaction
 * outside an input event (an effect, a timer): built on a selection ProseMirror hasn't read yet, it
 * would put the old selection back over the one the person just made (arrow keys right after the
 * link editor closes, on a busy machine).
 */
export function syncSelection(editor: Editor, restored = false): void {
  const observer = (editor.view as unknown as { domObserver?: { flush?: () => void; setCurSelection?: () => void } }).domObserver;
  observer?.flush?.();
  // A range restored without editor focus must replace Chromium's last observed caret too.
  // Otherwise clicking that same caret again looks unchanged to ProseMirror's observer.
  if (restored) observer?.setCurSelection?.();
}

const flush = (view: EditorView): false => {
  (view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
  return false;
};

/**
 * Clipboard events read the selection too: a paste, copy, or cut right after an arrow key acts on
 * where the caret is now, not where it was. Runs before every other handler.
 */
export const SelectionSync = Extension.create({
  name: "selectionSync",
  priority: 1000,
  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey("selectionSync"), props: { handleDOMEvents: { paste: flush, copy: flush, cut: flush } } })];
  },
});
