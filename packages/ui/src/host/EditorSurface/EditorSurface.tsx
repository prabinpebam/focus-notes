import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { coreExtensions, EDITOR_ACTIONS, MarkdownSession, findFromCaret, findStatus, setFind, syncSelection, type PMNode } from "@focus-notes/editor";
import type { KeyBinding } from "../../data.ts";
import { trackFocusBand } from "./focus-band.ts";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import * as s from "./EditorSurface.css.ts";

export interface EditorSurfaceProps {
  /** Changes when a different note is loaded. The editor resets only then. */
  documentKey: string;
  initialValue: string;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Focus mode: only the caret's visual row at full strength (FOC-01). */
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
  id?: string;
  onChange?: (payload: { value: string }) => void;
  onFindResult?: (payload: { count: number; current: number; invalid: boolean; wrapped: boolean; replaced: number }) => void;
  onFindPrefill?: (payload: { value: string }) => void;
  onReady?: () => void;
}

/** Find waits this long after the last keystroke in its field before searching (FND-01). */
const FIND_DEBOUNCE_MS = 60;
/** Serializing is kept off the typing path: it runs after a short pause (PRF-01). */
const SERIALIZE_DELAY_MS = 150;
/** Dispatched on window by the runtime before a flush; surfaces hand over pending text synchronously. */
export const FLUSH_EVENT = "focus-notes:flush";
/** Dispatched when a panel closes: the caret goes back exactly where it was (Main UI → Dismiss). */
export const REFOCUS_EVENT = "focus-notes:refocus";
/** Dispatched on window with `detail.id` to run an editor command from a menu or Spotlight. */
export const EDITOR_ACTION_EVENT = "focus-notes:editor-action";

/** The writing surface: Tiptap on ProseMirror, owning the note's DOM (Views as data → Rendering). */
export function EditorSurface({
  documentKey, initialValue, label, placeholder, readOnly, focusMode, keymap,
  findOpen, findQuery = "", findReplace = "", findCase = false, findWord = false, findRegex = false,
  id, onChange, onReady, onFindResult, onFindPrefill,
}: EditorSurfaceProps) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  useAutoHideScrollbar(scrollerRef);
  const session = useMemo(() => new MarkdownSession(initialValue), [documentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const findRef = useRef({ onFindResult, onFindPrefill, findOpen });
  findRef.current = { onFindResult, onFindPrefill, findOpen };
  const replaceRef = useRef(findReplace);
  replaceRef.current = findReplace;
  const findOptions = () => ({ query: findOpen ? findQuery : "", replace: replaceRef.current, caseSensitive: findCase, wholeWord: findWord, regex: findRegex });
  const findOptionsRef = useRef(findOptions);
  findOptionsRef.current = findOptions;
  const lastFind = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef(initialValue);

  const editor = useEditor(
    {
      extensions: [...coreExtensions(keymap ?? []), Placeholder.configure({ placeholder: placeholder ?? "" })],
      content: session.doc as object,
      editable: !readOnly,
      autofocus: "end",
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: s.prose, role: "textbox", "aria-multiline": "true", "aria-label": label, spellcheck: "true", "data-editor": "", ...(id ? { id } : {}) },
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
        timer.current = setTimeout(() => {
          const value = session.serialize(ed.getJSON() as PMNode);
          if (value !== last.current) {
            last.current = value;
            onChangeRef.current?.({ value });
          }
        }, SERIALIZE_DELAY_MS);
      },
      onBlur: ({ editor: ed }) => {
        clearTimeout(timer.current);
        const value = session.serialize(ed.getJSON() as PMNode);
        if (value !== last.current) {
          last.current = value;
          onChangeRef.current?.({ value });
        }
      },
    },
    [documentKey],
  );

  useEffect(() => {
    last.current = initialValue;
  }, [documentKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [editor, findOpen, findQuery, findCase, findWord, findRegex]);

  // While find is open, matches scroll into view below the bar, not under it.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !columnRef.current) return;
    const top = findOpen ? parseFloat(getComputedStyle(columnRef.current).paddingTop) || 0 : 5;
    editor.view.setProps({ scrollMargin: { top, bottom: 5, left: 5, right: 5 }, scrollThreshold: { top, bottom: 0, left: 0, right: 0 } });
  }, [editor, findOpen]);

  // Closing the find bar puts the caret back in the note, on the current match (VS Code behavior).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !findOpen && editor && !editor.isDestroyed) requestAnimationFrame(() => editor.commands.focus());
    wasOpen.current = Boolean(findOpen);
  }, [findOpen, editor]);

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
      const value = session.serialize(editor.getJSON() as PMNode);
      if (value !== last.current) {
        last.current = value;
        onChangeRef.current?.({ value });
      }
    };
    window.addEventListener(FLUSH_EVENT, flush);
    // After a panel's own focus restoration, put the caret back in the note.
    const refocus = () => requestAnimationFrame(() => {
      if (editor && !editor.isDestroyed) editor.commands.focus();
    });
    window.addEventListener(REFOCUS_EVENT, refocus);
    const runAction = (e: Event) => {
      const id = String((e as CustomEvent<{ id?: string }>).detail?.id);
      if (!editor || editor.isDestroyed) return;
      syncSelection(editor);
      if (id === "find.prefill") {
        // A selection within one block fills the find field.
        const { from, to, empty } = editor.state.selection;
        const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
        if (text && !text.includes("\n") && text.length <= 200) findRef.current.onFindPrefill?.({ value: text });
        return;
      }
      const action = EDITOR_ACTIONS[id];
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
      editor.commands.focus();
      action(editor);
    };
    window.addEventListener(EDITOR_ACTION_EVENT, runAction);
    return () => {
      window.removeEventListener(FLUSH_EVENT, flush);
      window.removeEventListener(REFOCUS_EVENT, refocus);
      window.removeEventListener(EDITOR_ACTION_EVENT, runAction);
    };
  }, [editor, session]);

  return (
    <main className={s.scroller} data-editor-scroller="" data-find-open={findOpen ? "" : undefined} aria-label={label} ref={scrollerRef}>
      <div className={focusMode ? `${s.column} ${s.focusOn}` : s.column} ref={columnRef} data-focus-mode={focusMode ? "on" : undefined}>
        <EditorContent editor={editor} />
      </div>
    </main>
  );
}
