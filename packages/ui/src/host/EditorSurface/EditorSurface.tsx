import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import {
  applyLink, captureFindScope, clearFindScope, closeSlashMenu, coreExtensions, EDITOR_ACTIONS, EDITOR_OPTIONS, MarkdownSession, findFromCaret, findStatus, formatState, insertSlashEntry,
  acceptRewrite, focusAtEnd, ghostRange, replaceDocument, type RewriteCapture, selectFindTarget, setFind, setSelectionGhost, slashEntries, slashInfo, syncSelection, type PMNode,
} from "@focus-notes/editor";
import type { KeyBinding } from "../../data.ts";
import { trackFocusBand } from "./focus-band.ts";
import { keepInReadingZone } from "./reading-zone.ts";
import { keepClearOfPinned } from "./pinned-column.ts";
import { trackViewportPointer } from "./viewport-pointer.ts";
import { DocMinimap, type DocMinimapHandle } from "./DocMinimap.tsx";
import { trackFormatting, type FormatPayload, type FormatTracker } from "./formatting.ts";
import { trackSlash, type SlashPayload } from "./slash-menu.ts";
import { measureColumns, tableView } from "./table-view.ts";
import { trackTables, type TablePayload, type TableTracker } from "./table-tracker.ts";
import { trackBlocks, type BlockPayload, type BlockTracker } from "./block-tracker.ts";
import { resultItemId } from "../../primitives/ResultList/ResultList.tsx";
import { inCompanion } from "../../behaviors/anchors.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import { useFadingEdges } from "../../behaviors/fading-edges.ts";
import * as s from "./EditorSurface.css.ts";

export interface EditorSurfaceProps {
  /** Changes when a different note is loaded. The editor resets only then. */
  documentKey: string;
  initialValue: string;
  label: string;
  placeholder?: string;
  /** What an empty table header cell shows and is called, with "{index}" for its column's number. */
  emptyHeader?: string;
  readOnly?: boolean;
  /** Focus mode: the caret's whole paragraph at full strength (FOC-01). */
  focusMode?: boolean;
  /** Editor key bindings from the command registry (KEY-02). Read when a note opens. */
  keymap?: KeyBinding[];
  /** Find in the note (FND-01, FND-02): the editor highlights and steps through matches. */
  findOpen?: boolean;
  findQuery?: string;
  findReplace?: string;
  findCase?: boolean;
  findWord?: boolean;
  findRegex?: boolean;
  /** Find in selection (FND-03): only the scope taken as the bar opened, tinted while on. */
  findInSelection?: boolean;
  /** The link editor is open: the selection stays highlighted and anchored while its field has focus. */
  linkEditing?: boolean;
  /** The slash menu shows (EDT-06): arrows, Enter, and Tab drive it while focus stays in the note. */
  slashOpen?: boolean;
  /** Its active row, which Enter inserts. */
  slashActive?: string;
  /** The ID of its list, for aria-controls and aria-activedescendant. */
  slashList?: string;
  /** The document minimap's name, "Contents" (UI-13, D-185). Without it there's no minimap. */
  outlineLabel?: string;
  /** What an empty heading reads as in the minimap's card. */
  outlineUntitled?: string;
  /** The minimap's card kept open beside the text, where it fits (D-186). */
  outlinePinned?: boolean;
  outlinePinLabel?: string;
  outlineUnpinLabel?: string;
  onOutlinePin?: () => void;
  /** Docking (D-187): the docked contents' width and its handle's name; docked Files and its width, arbitrated here. */
  outlineWidth?: number;
  outlineResizeLabel?: string;
  filesDock?: boolean;
  filesWidth?: number;
  onOutlineResize?: (payload: { width: number }) => void;
  onFilesFit?: (payload: { fits: boolean }) => void;
  id?: string;
  onChange?: (payload: { value: string }) => void;
  onFindResult?: (payload: { count: number; current: number; invalid: boolean; wrapped: boolean; replaced: number }) => void;
  onFindPrefill?: (payload: { value: string }) => void;
  /** Rewrite's capture: the selected text (empty when nothing is selected or the note is read-only). */
  onRewriteCapture?: (payload: { text: string }) => void;
  /** Rewrite's Accept: whether the captured selection was replaced (false when the note changed since). */
  onRewriteApplied?: (payload: { ok: boolean }) => void;
  /** Whether text was selected as the find bar opened: find in selection's scope (FND-03). */
  onFindScope?: (payload: { scoped: boolean }) => void;
  onReady?: () => void;
  /** What the formatting toolbar and link hover card show, whenever it changes (EDT-12, EDT-13). */
  onFormat?: (payload: FormatPayload) => void;
  /** Answers the link editor's open request with the link and whether text was selected. */
  onLinkEdit?: (payload: { href: string; selected: boolean }) => void;
  /** A press in the note while the link editor is open: put it away (EDT-13). */
  onLinkDismiss?: () => void;
  /** Mod+click on a link (or a plain click in a read-only note). */
  onOpenLink?: (payload: { href: string }) => void;
  /** The `/query` the slash menu filters by, and the blocks valid there (EDT-06). */
  onSlash?: (payload: SlashPayload) => void;
  /** Up or Down while the slash menu shows. */
  onSlashMove?: (payload: { delta: number }) => void;
  /** What a paste did that's worth saying (EDT-09, TBL-10): images left out, a range pasted into a table. */
  onPasteNotice?: (payload: { kind: string; rows: number; cols: number; addedRows: number; addedCols: number }) => void;
  /** The table, row, and column the table controls are for, whenever that changes (IA-CMP-TABLE). */
  onTable?: (payload: TablePayload) => void;
  /** A table's structure changed, to announce (Tables → Accessibility). */
  onTableChange?: (payload: { kind: string; index: number; align: string }) => void;
  /** A whole table was copied as Markdown or tab-separated text, for the clipboard. */
  onTableCopy?: (payload: { text: string; format: string }) => void;
  /** The context menu of the selected cells was asked for (right-click, Shift+F10, the Menu key). */
  onTableMenu?: () => void;
  /** The block the block handle is for, whenever that changes (IA-CMP-HANDLE, EDT-07). */
  onBlock?: (payload: BlockPayload) => void;
  /** The block menu was asked for from the keyboard (Shift+F10 or the Menu key outside a table). */
  onBlockMenu?: () => void;
  /** Block selection mode selected this many blocks (0: it ended), to announce (KEY-04). */
  onBlockSelect?: (payload: { count: number }) => void;
}

/** Find waits this long after the last keystroke in its field before searching (FND-01). */
const FIND_DEBOUNCE_MS = 60;
/** Serializing is kept off the typing path: it runs after a short pause (PRF-01). */
const SERIALIZE_DELAY_MS = 150;
/**
 * While typing goes on, text is still handed over at most this long after it first changed, so the
 * recovery journal keeps up (QLT-03): the app keeps each handover within JOURNAL_INTERVAL_MS (core),
 * so a key typed is kept within 0.4 s, leaving most of the second a crash may lose to a busy
 * computer (DEF-14). A keystroke that finds the handover overdue (a busy computer runs keys before
 * timers) hands over itself, so typing that never pauses can't hold the text back.
 */
const SERIALIZE_MAX_WAIT_MS = 250;
/** Dispatched on window by the runtime before a flush; surfaces hand over pending text synchronously. */
export const FLUSH_EVENT = "focus-notes:flush";

/**
 * Focuses the note now, keeping its selection. Tiptap's focus command waits a frame, and its focus
 * then writes the selection it had over one the person made in between (a click and drag, keys), so
 * a deferred caller reads the selection first and focuses directly.
 */
/** An empty table header's column name: real, muted text the note doesn't hold (see the editor's TableHooks). */
function emptyHeaderElement(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = s.emptyHeader;
  span.contentEditable = "false";
  span.textContent = text;
  return span;
}

function focusNote(editor: Editor): void {
  if (editor.isDestroyed) return;
  syncSelection(editor);
  editor.view.focus();
}
/**
 * Dispatched when a panel closes: the caret goes back exactly where it was (Main UI → Dismiss).
 * `detail.wanted`, if given, is asked again when the note would take focus, a frame later.
 */
export const REFOCUS_EVENT = "focus-notes:refocus";
/** Dispatched on window with `detail.id` to run an editor command from a menu or Spotlight. */
export const EDITOR_ACTION_EVENT = "focus-notes:editor-action";

/** The writing surface: Tiptap on ProseMirror, owning the note's DOM (Views as data → Rendering). */
export function EditorSurface({
  documentKey, initialValue, label, placeholder, emptyHeader, readOnly, focusMode, keymap,
  findOpen, findQuery = "", findReplace = "", findCase = false, findWord = false, findRegex = false, findInSelection = false, linkEditing,
  slashOpen, slashActive = "", slashList, outlineLabel, outlineUntitled, outlinePinned = false, outlinePinLabel = "", outlineUnpinLabel = "", onOutlinePin,
  outlineWidth = 0, outlineResizeLabel, filesDock = false, filesWidth = 0, onOutlineResize, onFilesFit,
  id, onChange, onReady, onFindResult, onFindPrefill, onFindScope, onRewriteCapture, onRewriteApplied, onFormat, onLinkEdit, onLinkDismiss, onOpenLink, onSlash, onSlashMove, onPasteNotice,
  onTable, onTableChange, onTableCopy, onTableMenu, onBlock, onBlockMenu, onBlockSelect,
}: EditorSurfaceProps) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const minimapRef = useRef<DocMinimapHandle | null>(null);
  useAutoHideScrollbar(scrollerRef);
  useFadingEdges(scrollerRef);
  const session = useMemo(() => new MarkdownSession(initialValue), [documentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const findRef = useRef({ onFindResult, onFindPrefill, onFindScope, findOpen });
  findRef.current = { onFindResult, onFindPrefill, onFindScope, findOpen };
  const rewriteRef = useRef({ onRewriteCapture, onRewriteApplied });
  rewriteRef.current = { onRewriteCapture, onRewriteApplied };
  const rewriteTarget = useRef<RewriteCapture | undefined>(undefined);
  const formatRef = useRef({ onFormat, onLinkEdit, onOpenLink, onPasteNotice });
  formatRef.current = { onFormat, onLinkEdit, onOpenLink, onPasteNotice };
  const tableRef = useRef({ onTable, onTableChange, onTableCopy, onTableMenu });
  tableRef.current = { onTable, onTableChange, onTableCopy, onTableMenu };
  const tables = useRef<TableTracker | null>(null);
  const blockRef = useRef({ onBlock, onBlockMenu, onBlockSelect });
  blockRef.current = { onBlock, onBlockMenu, onBlockSelect };
  const blocks = useRef<BlockTracker | null>(null);
  const slashRef = useRef({ open: Boolean(slashOpen), active: slashActive, onSlash, onSlashMove });
  slashRef.current = { open: Boolean(slashOpen), active: slashActive, onSlash, onSlashMove };
  const tracker = useRef<FormatTracker | null>(null);
  const replaceRef = useRef(findReplace);
  replaceRef.current = findReplace;
  const findOptions = () => ({ query: findOpen ? findQuery : "", replace: replaceRef.current, caseSensitive: findCase, wholeWord: findWord, regex: findRegex, inSelection: findInSelection });
  const findOptionsRef = useRef(findOptions);
  findOptionsRef.current = findOptions;
  const lastFind = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** When the text not yet handed over first changed. */
  const pendingSince = useRef<number | undefined>(undefined);
  const last = useRef(initialValue);
  const editorRef = useRef<Editor | null>(null);
  const emptyHeaderRef = useRef(emptyHeader);
  emptyHeaderRef.current = emptyHeader;

  /** Arrows, Enter, Tab, and Esc while the slash menu is open (Text formatting → Slash menu → Keyboard). */
  const slashKey = (event: KeyboardEvent): boolean => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || !slashInfo(ed.state).open) return false;
    // Esc closes it and keeps what was typed, even when no row matched.
    if (event.key === "Escape") return closeSlashMenu(ed);
    const menu = slashRef.current;
    if (!menu.open || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      menu.onSlashMove?.({ delta: event.key === "ArrowDown" ? 1 : -1 });
      return true;
    }
    if (event.key !== "Enter" && event.key !== "Tab") return false;
    const entry = slashEntries().find((e) => e.id === menu.active);
    if (entry) {
      insertSlashEntry(ed, entry);
      return true;
    }
    // Nothing matched: the key does what it always does.
    closeSlashMenu(ed);
    return false;
  };

  const editor = useEditor(
    {
      ...EDITOR_OPTIONS,
      extensions: [
        ...coreExtensions(keymap ?? [], {
          openLink: (href) => formatRef.current.onOpenLink?.({ href }),
          ghostClass: s.ghost,
          findScopeClass: s.findScope,
          blockSelectedClass: s.blockSelected,
          emptyHeader: (index) => emptyHeaderElement((emptyHeaderRef.current ?? "").replace("{index}", String(index))),
          // Tables drawn with their layout and set column widths, and measured for the width commands (D-182).
          tableView,
          tableColumns: measureColumns,
          onPasteNotice: (kind, args = {}) => formatRef.current.onPasteNotice?.({ kind, rows: args.rows ?? 0, cols: args.cols ?? 0, addedRows: args.addedRows ?? 0, addedCols: args.addedCols ?? 0 }),
          onTableChange: (c) => tableRef.current.onTableChange?.({ kind: c.kind, index: c.index ?? 0, align: c.align ?? "" }),
          onTableCopy: (text, format) => tableRef.current.onTableCopy?.({ text, format }),
          onTableMenu: () => {
            // The caret's cell is brought into view first (at once, never animated: a key, not a caret
            // move), so the menu opens beside it rather than against the window's edge (D-111).
            const ed = editorRef.current;
            if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.scrollIntoView());
            // The controls follow the caret's cell while the menu is open, wherever the pointer is.
            tables.current?.menu();
            tableRef.current.onTableMenu?.();
          },
          onBlockMenu: () => {
            // The grip goes to the caret's block, and its menu opens there.
            blocks.current?.menu();
            blockRef.current.onBlockMenu?.();
          },
          onBlockSelect: (count) => blockRef.current.onBlockSelect?.({ count }),
        }),
        Placeholder.configure({ placeholder: placeholder ?? "" }),
      ],
      content: session.doc as object,
      editable: !readOnly,
      // Focused at the end once mounted (below), at once rather than a frame later.
      autofocus: false,
      immediatelyRender: true,
      // The design system styles the editor; Tiptap's own <style> tag would be blocked by the CSP anyway.
      injectCSS: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        handleKeyDown: (view, event) => {
          if (event.isComposing) return false;
          if (slashKey(event)) return true;
          // Esc hides the formatting toolbar or hover card and keeps the selection (Text formatting).
          return event.key === "Escape" && Boolean(tracker.current?.dismiss());
        },
        attributes: { class: s.prose, role: "textbox", "aria-multiline": "true", "aria-label": label, ...(readOnly ? { "aria-readonly": "true" } : {}), spellcheck: "true", "data-editor": "", ...(id ? { id } : {}) },
      },
      onTransaction: ({ editor: ed }) => {
        // While the find bar is open, the count follows every change and selection move.
        if (!findRef.current.findOpen) return;
        const st = findStatus(ed.state);
        const key = `${st.count}:${st.current}:${st.invalid}`;
        if (key === lastFind.current) return;
        lastFind.current = key;
        findRef.current.onFindResult?.({ ...st, wrapped: false, replaced: 0 });
      },
      onUpdate: ({ editor: ed }) => {
        clearTimeout(timer.current);
        timer.current = undefined;
        const handOver = () => {
          timer.current = undefined;
          pendingSince.current = undefined;
          const value = session.serialize(ed.getJSON() as PMNode);
          if (value !== last.current) {
            last.current = value;
            onChangeRef.current?.({ value });
          }
        };
        const now = Date.now();
        pendingSince.current ??= now;
        const due = pendingSince.current + SERIALIZE_MAX_WAIT_MS - now;
        if (due <= 0) handOver();
        else timer.current = setTimeout(handOver, Math.min(SERIALIZE_DELAY_MS, due));
      },
      onBlur: ({ editor: ed }) => {
        clearTimeout(timer.current);
        pendingSince.current = undefined;
        const value = session.serialize(ed.getJSON() as PMNode);
        if (value !== last.current) {
          last.current = value;
          onChangeRef.current?.({ value });
        }
      },
    },
    [documentKey],
  );

  editorRef.current = editor;

  useEffect(() => {
    last.current = initialValue;
  }, [documentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ProseMirror puts its own selection back 20 ms after the note gains focus unless it has read a
  // newer one by then. A click in the note right after focus came back (from a menu, on a busy
  // machine) is read as soon as the browser has placed it, before that.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onDown = () => setTimeout(() => { if (!editor.isDestroyed) syncSelection(editor); }, 0);
    dom.addEventListener("mousedown", onDown, true);
    return () => dom.removeEventListener("mousedown", onDown, true);
  }, [editor]);

  useEffect(() => {
    if (!editor || !scrollerRef.current) return;
    return trackViewportPointer(editor, scrollerRef.current);
  }, [editor]);

  // The slash menu (EDT-06): the editor reports the query; the menu is a view node under the `/`.
  useEffect(() => {
    if (!editor || !scrollerRef.current) return;
    return trackSlash(editor, scrollerRef.current, (p) => slashRef.current.onSlash?.(p));
  }, [editor]);
  // Focus stays in the note, which points at the menu's active row (aria-activedescendant).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const open = Boolean(slashOpen && slashList);
    if (open) {
      dom.setAttribute("aria-controls", slashList!);
      dom.setAttribute("aria-autocomplete", "list");
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-autocomplete");
    }
    if (open && slashActive) dom.setAttribute("aria-activedescendant", resultItemId(slashList!, slashActive));
    else dom.removeAttribute("aria-activedescendant");
  }, [editor, slashOpen, slashActive, slashList]);

  useEffect(() => {
    if (editor) onReady?.();
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // The find query lives in the app; the editor highlights it and jumps to the first match at the caret.
  // Searching waits for a short pause in typing (FND-01: 60 ms), so long notes stay responsive.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const apply = () => {
      if (editor.isDestroyed) return;
      setFind(editor, findOptionsRef.current());
      if (findOpen && findQuery) findFromCaret(editor);
      const st = findStatus(editor.state);
      lastFind.current = `${st.count}:${st.current}:${st.invalid}`;
      if (findOpen) findRef.current.onFindResult?.({ ...st, wrapped: false, replaced: 0 });
    };
    if (!findOpen || !findQuery) return apply();
    const h = setTimeout(apply, FIND_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [editor, findOpen, findQuery, findCase, findWord, findRegex, findInSelection]);

  // The reading zone (UI-11): the edited line stays between 25% and 65% of the window, and with
  // find open, never under the bar.
  useEffect(() => {
    if (!editor || !scrollerRef.current || !columnRef.current) return;
    return keepInReadingZone(editor, scrollerRef.current, columnRef.current, Boolean(findOpen));
  }, [editor, findOpen]);

  // Beside a pinned Files sheet, the text moves clear of it, the caret's line staying put (D-161).
  useEffect(() => {
    if (!editor || !scrollerRef.current || !columnRef.current) return;
    return keepClearOfPinned(scrollerRef.current, columnRef.current, editor);
  }, [editor]);

  // Closing the find bar puts the caret back in the note, on the current match (VS Code behavior).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !findOpen && editor && !editor.isDestroyed) {
      // Closing forgets find in selection's scope (FND-03); the next opening takes the selection then.
      clearFindScope(editor);
      requestAnimationFrame(() => focusNote(editor));
    }
    wasOpen.current = Boolean(findOpen);
  }, [findOpen, editor]);

  // The formatting toolbar and link hover card follow the selection (EDT-12, EDT-13, UI-06).
  const findOpenRef = useRef(findOpen);
  findOpenRef.current = findOpen;
  useEffect(() => {
    if (!editor || !scrollerRef.current) return;
    const t = trackFormatting(editor, scrollerRef.current, (p) => formatRef.current.onFormat?.(p), () => Boolean(findOpenRef.current));
    tracker.current = t;
    return () => {
      t.dispose();
      tracker.current = null;
    };
  }, [editor]);
  useEffect(() => tracker.current?.refresh(), [findOpen]);

  // The table controls (IA-CMP-TABLE): handles, insertion points, and edge bars follow the pointer.
  useEffect(() => {
    if (!editor || !scrollerRef.current) return;
    const t = trackTables(editor, scrollerRef.current, { gutter: s.tableGutterVar, boundary: s.tableBoundaryVar, reach: s.tableReachVar }, (p) => tableRef.current.onTable?.(p));
    tables.current = t;
    return () => {
      t.dispose();
      tables.current = null;
    };
  }, [editor]);
  // The block handle (IA-CMP-HANDLE): the grip follows the pointer down the note.
  useEffect(() => {
    if (!editor || !scrollerRef.current || !columnRef.current) return;
    const t = trackBlocks(editor, scrollerRef.current, columnRef.current, (p) => blockRef.current.onBlock?.(p));
    blocks.current = t;
    return () => {
      t.dispose();
      blocks.current = null;
    };
  }, [editor]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setSelectionGhost(editor, Boolean(linkEditing));
    tracker.current?.holdSelection(Boolean(linkEditing));
  }, [editor, linkEditing]);
  // A press anywhere in the note while the link editor is open puts it away (EDT-13): the press then
  // places the caret or starts a selection as it would anyway.
  const linkDismissRef = useRef(onLinkDismiss);
  linkDismissRef.current = onLinkDismiss;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || !linkEditing) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element | null)?.closest?.("[data-key-scope=linkEditor]")) return;
      linkDismissRef.current?.();
    };
    sc.addEventListener("pointerdown", down, true);
    return () => sc.removeEventListener("pointerdown", down, true);
  }, [linkEditing]);

  useEffect(() => {
    if (!focusMode || !editor || !columnRef.current) return;
    return trackFocusBand(editor, columnRef.current, { top: s.bandTop, bottom: s.bandBottom });
  }, [focusMode, editor]);

  // Flush a pending change when the surface goes away (switching notes, closing).
  useEffect(() => () => {
    if (timer.current && editor && !editor.isDestroyed) {
      clearTimeout(timer.current);
      const value = session.serialize(editor.getJSON() as PMNode);
      if (value !== last.current) onChangeRef.current?.({ value });
    }
  }, [editor, session]);

  // The runtime asks every surface to hand over pending text before the app writes (QLT-03).
  useEffect(() => {
    const flush = () => {
      if (!editor || editor.isDestroyed) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      pendingSince.current = undefined;
      const value = session.serialize(editor.getJSON() as PMNode);
      if (value !== last.current) {
        last.current = value;
        onChangeRef.current?.({ value });
      }
    };
    window.addEventListener(FLUSH_EVENT, flush);
    // After a panel's own focus restoration, put the caret back in the note: unless the one who
    // asked no longer wants it by then, because a panel has opened and taken focus (DEF-4) or
    // something else took focus on purpose, like the find bar for a match opened from Find in all
    // notes (FND-04).
    const refocus = (e: Event) => {
      const wanted = (e as CustomEvent<{ wanted?: () => boolean } | null>).detail?.wanted;
      requestAnimationFrame(() => {
        if (editor && (!wanted || wanted())) focusNote(editor);
      });
    };
    window.addEventListener(REFOCUS_EVENT, refocus);
    const runAction = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; args?: Record<string, unknown> }>).detail;
      const id = String(detail?.id);
      const args = detail?.args ?? {};
      if (!editor || editor.isDestroyed) return;
      if (id === "outline.show") {
        minimapRef.current?.openFromKeyboard();
        return;
      }
      // Recovered text for this note (QLT-06): it replaces the text as one undo step back to the disk's.
      if (id === "note.recover") {
        if (args.key === documentKey && typeof args.markdown === "string") {
          last.current = args.markdown;
          replaceDocument(editor, session, args.markdown);
        }
        return;
      }
      // Rewrite: the selection is captured as the dialog opens, and Accept replaces exactly it.
      if (id === "rewrite.capture") {
        const { from, to, empty } = editor.state.selection;
        const text = empty || !editor.isEditable ? "" : editor.state.doc.textBetween(from, to, "\n\n");
        rewriteTarget.current = text.trim() ? { doc: editor.state.doc, from, to } : undefined;
        rewriteRef.current.onRewriteCapture?.({ text: rewriteTarget.current ? text : "" });
        return;
      }
      if (id === "rewrite.apply") {
        const target = rewriteTarget.current;
        const ok = Boolean(target && typeof args.text === "string" && acceptRewrite(editor, target, args.text));
        if (ok) rewriteTarget.current = undefined;
        rewriteRef.current.onRewriteApplied?.({ ok });
        if (ok) editor.view.focus();
        return;
      }
      syncSelection(editor);
      if (id === "find.prefill") {
        // The selection is find in selection's scope (FND-03), whatever its size.
        findRef.current.onFindScope?.({ scoped: captureFindScope(editor) });
        // Opened to find in the selection: the field isn't filled from it.
        if (args.scopeOnly) return;
        // A selection within one block fills the find field.
        const { from, to, empty } = editor.state.selection;
        const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
        if (text && !text.includes("\n") && text.length <= 200) findRef.current.onFindPrefill?.({ value: text });
        return;
      }
      if (id === "find.select") {
        // A match opened from Find in all notes (FND-04): search for it as the find bar will, and
        // select exactly that match. Focus goes to the find bar, so Enter steps on from there.
        const o = { query: String(args.query ?? ""), replace: replaceRef.current, caseSensitive: Boolean(args.caseSensitive), wholeWord: Boolean(args.wholeWord), regex: Boolean(args.regex) };
        const line = typeof args.lineKey === "number" ? { lineKey: args.lineKey, lineNth: Number(args.lineNth) || 0, occurrence: Number(args.occurrence) || 0 } : {};
        selectFindTarget(editor, o, { index: Number(args.index) || 0, ...line });
        const st = findStatus(editor.state);
        lastFind.current = `${st.count}:${st.current}:${st.invalid}`;
        findRef.current.onFindResult?.({ ...st, wrapped: false, replaced: 0 });
        return;
      }
      if (id === "slash.insert") {
        // A row clicked in the slash menu; focus never left the note.
        const entry = slashEntries().find((e) => e.id === args.id);
        if (entry && editor.isEditable) insertSlashEntry(editor, entry);
        editor.view.focus();
        return;
      }
      if (id === "editor.goToHeading") {
        // Spotlight's heading results: the note's nth heading as the index counts them (top-level
        // blocks), or the first with that text if the note has changed since it was indexed.
        const heads: { pos: number; text: string }[] = [];
        editor.state.doc.forEach((node, offset) => { if (node.type.name === "heading") heads.push({ pos: offset, text: node.textContent }); });
        const text = String(args.text ?? "");
        const nth = heads[Number(args.index)];
        const head = nth && (!text || nth.text === text) ? nth : (heads.find((h) => h.text === text) ?? nth);
        if (!head) return;
        editor.commands.setTextSelection(head.pos + 1);
        editor.view.focus();
        editor.commands.scrollIntoView();
        return;
      }
      if (runLinkAction(id, args)) return;
      const action = EDITOR_ACTIONS[id];
      // From the table controls: they hand focus back to the note themselves once their menu closes.
      // And from the block handle, which names its block (EDT-07).
      if ((id.startsWith("table.") || (id.startsWith("block.") && typeof args.block === "number")) && action) {
        if (editor.isEditable) action(editor, args);
        return;
      }
      if (!action || (!editor.isEditable && id !== "find.next" && id !== "find.prev")) return;
      if (id.startsWith("find.")) {
        // Apply the latest query and replacement first: Enter right after typing must not use a
        // stale search, and the replacement is read only here, so typing it never re-searches.
        setFind(editor, findOptionsRef.current());
        // Focus stays in the find bar; the editor moves its selection to the match.
        const before = editor.state.selection.from;
        const count = findStatus(editor.state).count;
        action(editor);
        const after = editor.state.selection.from;
        const wrapped = (id === "find.next" && after < before) || (id === "find.prev" && after > before);
        const st = findStatus(editor.state);
        lastFind.current = `${st.count}:${st.current}:${st.invalid}`;
        findRef.current.onFindResult?.({ ...st, wrapped, replaced: id === "find.replaceAll" ? count : 0 });
        editor.commands.scrollIntoView();
        return;
      }
      // Back to the text from the toolbar or link editor: at once, with the selection as it was.
      if (id === "edit.focus") {
        editor.view.focus();
        return;
      }
      // Run from the formatting toolbar by keyboard, focus stays in the toolbar; Esc goes back to the text.
      const active = document.activeElement;
      if (inCompanion(active) && active?.matches("[data-focus-visible]")) {
        action(editor);
        return;
      }
      editor.view.focus();
      action(editor);
      // A menu that ran it (Turn into) hands focus back to its button as it closes, a render or more
      // later; the caret belongs in the note. Whenever that happens (within a second), focus comes back.
      if (active?.closest("[data-floating-child]")) {
        const back = () => {
          if (!editor.isDestroyed && (inCompanion(document.activeElement) || document.activeElement === document.body)) focusNote(editor);
        };
        const onFocusIn = (e: FocusEvent) => {
          if (inCompanion(e.target as Element | null)) back();
        };
        document.addEventListener("focusin", onFocusIn, true);
        requestAnimationFrame(back);
        setTimeout(() => document.removeEventListener("focusin", onFocusIn, true), 1000);
      }
    };
    const runLinkAction = (id: string, args: Record<string, unknown>): boolean => {
      if (!editor || editor.isDestroyed) return false;
      const select = () => {
        const r = tracker.current?.cardRange();
        if (r) editor.commands.setTextSelection(r);
      };
      switch (id) {
        case "link.edit": {
          if (!editor.isEditable) return true;
          syncSelection(editor);
          select();
          // Read the selection a drag just made, then the ghost takes it now, while the note still has
          // focus; read in the effect once the field has it, it could come back collapsed and Apply
          // inserted the address (DEF-31).
          if (formatRef.current.onLinkEdit) setSelectionGhost(editor, true);
          const info = formatState(editor.state);
          formatRef.current.onLinkEdit?.({ href: info.link?.href ?? "", selected: !editor.state.selection.empty });
          return true;
        }
        case "link.apply": {
          // On the range the link editor opened on, which the ghost showed all along (DEF-28).
          const r = ghostRange(editor.state);
          if (r) editor.commands.setTextSelection(r);
          applyLink(editor, { href: String(args.href ?? ""), text: String(args.text ?? "") });
          editor.view.focus();
          return true;
        }
        case "link.remove":
          select();
          EDITOR_ACTIONS["link.remove"]!(editor);
          editor.view.focus();
          return true;
        default:
          return false;
      }
    };
    window.addEventListener(EDITOR_ACTION_EVENT, runAction);
    return () => {
      window.removeEventListener(FLUSH_EVENT, flush);
      window.removeEventListener(REFOCUS_EVENT, refocus);
      window.removeEventListener(EDITOR_ACTION_EVENT, runAction);
    };
  }, [editor, session, documentKey]);

  // The caret starts at the note's end, once every tracker above is listening (the reading zone
  // places it). At once rather than through Tiptap's autofocus, which focuses a frame later.
  useEffect(() => {
    if (editor) focusAtEnd(editor);
  }, [editor]);

  return (
    <div className={s.frame}>
      <main className={s.scroller} data-editor-scroller="" data-find-open={findOpen ? "" : undefined} aria-label={label} ref={scrollerRef}>
        <div className={focusMode ? `${s.column} ${s.focusOn}` : s.column} ref={columnRef} data-focus-mode={focusMode ? "on" : undefined}>
          <EditorContent editor={editor} />
        </div>
      </main>
      {editor && outlineLabel ? (
        <DocMinimap
          ref={minimapRef} editor={editor} scroller={scrollerRef} label={outlineLabel} untitled={outlineUntitled ?? ""}
          pinned={outlinePinned} pinLabel={outlinePinLabel} unpinLabel={outlineUnpinLabel} onPin={onOutlinePin}
          dockWidth={outlineWidth} resizeLabel={outlineResizeLabel} onResize={(width) => onOutlineResize?.({ width })}
          filesDock={filesDock} filesWidth={filesWidth} onFilesFit={(fits) => onFilesFit?.({ fits })}
        />
      ) : null}
      {/* The scroll edges' blur and fade, over the scroller's edges where there's more to scroll to (D-111). */}
      <div className={`${s.edge} ${s.edgeSide.top}`} aria-hidden="true" data-scroll-edge="top">
        {s.blurTop.map((c, k) => <div key={k} className={c} />)}
        <div className={s.fade.top} />
      </div>
      <div className={`${s.edge} ${s.edgeSide.bottom}`} aria-hidden="true" data-scroll-edge="bottom">
        {s.blurBottom.map((c, k) => <div key={k} className={c} />)}
        <div className={s.fade.bottom} />
      </div>
    </div>
  );
}
