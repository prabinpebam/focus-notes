/**
 * The slash menu's surface side (EDT-06, IA-CMP-SLASH): reports the `/query` and the blocks valid
 * there, and publishes where the `/` is so the menu (a view node in a Positioner) sits under it.
 */
import type { Editor } from "@tiptap/react";
import { closeSlashMenu, slashEntries, slashInfo, validSlashEntries } from "@focus-notes/editor";
import { anchors, inCompanion } from "../../behaviors/anchors.ts";

export interface SlashPayload {
  open: boolean;
  query: string;
  /** The IDs of the entries valid where the `/` is, separated by spaces. */
  valid: string;
}

export function trackSlash(editor: Editor, scroller: HTMLElement, emit: (p: SlashPayload) => void): () => void {
  let last = { open: false, from: -1, query: "" };
  let valid = "";
  let frame = 0;

  const anchor = (from: number) => {
    const c = editor.view.coordsAtPos(from);
    anchors.set("caret", { top: c.top, bottom: c.bottom, left: c.left, right: c.left });
  };
  const publish = () => {
    if (editor.isDestroyed) return;
    const info = slashInfo(editor.state);
    if (!info.open) {
      if (!last.open) return;
      last = { open: false, from: -1, query: "" };
      anchors.set("caret", null);
      emit({ open: false, query: "", valid: "" });
      return;
    }
    // Which blocks fit depends on where the `/` is, not on the query.
    const moved = !last.open || info.from !== last.from;
    if (moved) valid = validSlashEntries(editor, slashEntries()).map((e) => e.id).join(" ");
    anchor(info.from);
    if (moved || info.query !== last.query) emit({ open: true, query: info.query, valid });
    last = info;
  };
  const follow = () => {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!editor.isDestroyed && last.open) anchor(last.from);
    });
  };
  // Leaving the note closes it; choosing a row never moves focus, so that isn't leaving.
  const onBlur = ({ event }: { event: FocusEvent }) => {
    if (!inCompanion(event.relatedTarget)) closeSlashMenu(editor);
  };

  editor.on("transaction", publish);
  editor.on("blur", onBlur);
  scroller.addEventListener("scroll", follow, { passive: true });
  window.addEventListener("resize", follow);
  return () => {
    cancelAnimationFrame(frame);
    editor.off("transaction", publish);
    editor.off("blur", onBlur);
    scroller.removeEventListener("scroll", follow);
    window.removeEventListener("resize", follow);
    anchors.set("caret", null);
  };
}
