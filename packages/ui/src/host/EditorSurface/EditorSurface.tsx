import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { coreExtensions, MarkdownSession, type PMNode } from "@focus-notes/editor";
import * as s from "./EditorSurface.css.ts";

export interface EditorSurfaceProps {
  /** Changes when a different note is loaded. The editor resets only then. */
  documentKey: string;
  initialValue: string;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  id?: string;
  onChange?: (payload: { value: string }) => void;
  onReady?: () => void;
}

/** Serializing is kept off the typing path: it runs after a short pause (PRF-01). */
const SERIALIZE_DELAY_MS = 150;
/** Dispatched on window by the runtime before a flush; surfaces hand over pending text synchronously. */
export const FLUSH_EVENT = "focus-notes:flush";

/** The writing surface: Tiptap on ProseMirror, owning the note's DOM (Views as data → Rendering). */
export function EditorSurface({ documentKey, initialValue, label, placeholder, readOnly, id, onChange, onReady }: EditorSurfaceProps) {
  const session = useMemo(() => new MarkdownSession(initialValue), [documentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef(initialValue);

  const editor = useEditor(
    {
      extensions: [...coreExtensions(), Placeholder.configure({ placeholder: placeholder ?? "" })],
      content: session.doc as object,
      editable: !readOnly,
      autofocus: "end",
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: s.prose, role: "textbox", "aria-multiline": "true", "aria-label": label, spellcheck: "true", "data-editor": "", ...(id ? { id } : {}) },
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
    return () => window.removeEventListener(FLUSH_EVENT, flush);
  }, [editor, session]);

  return (
    <main className={s.scroller} data-editor-scroller="" aria-label={label}>
      <div className={s.column}>
        <EditorContent editor={editor} />
      </div>
    </main>
  );
}
