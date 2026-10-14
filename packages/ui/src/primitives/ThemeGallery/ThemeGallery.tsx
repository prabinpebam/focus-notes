import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ThemeTile } from "../../data.ts";
import * as s from "./ThemeGallery.css.ts";

export interface ThemeGalleryProps {
  label: string;
  items: ThemeTile[];
  /** The theme showing on the note. */
  value?: string;
  /** The theme showing is a keyboard preview: Esc goes back to the chosen one. */
  previewing?: boolean;
  /** Each new value moves focus to the selected tile. */
  focusRequest?: number;
  id?: string;
  onPreview?: (payload: { id: string }) => void;
  onChoose?: (payload: { id: string }) => void;
  onRevert?: () => void;
}

/**
 * The theme gallery (IA-VIEW-THEME): a single-select list box whose selection follows keyboard
 * focus, so arrowing through the tiles previews each theme on the note (DD-THEME-06; a pointer
 * passing over them doesn't). The arrow keys move in two dimensions, Home and End go to the ends,
 * Enter or a click chooses, and Esc, while previewing, goes back without closing the sheet. Each
 * tile's sample is drawn in its own theme's colors (`data-theme-sample`, from the token build).
 */
export function ThemeGallery({ label, items, value, previewing, focusRequest, id, onPreview, onChoose, onRevert }: ThemeGalleryProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const [active, setActive] = useState(value ?? items[0]?.id ?? "");
  const tile = (tid: string) => ref.current?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(tid)}"]`) ?? null;
  /** After Esc, focus goes back to the chosen theme's tile once it's showing again. */
  const reverting = useRef(false);
  // The tab stop follows the theme showing while focus is elsewhere.
  useEffect(() => {
    if (!value) return;
    if (reverting.current) {
      reverting.current = false;
      setActive(value);
      tile(value)?.focus();
    } else if (!ref.current?.contains(document.activeElement)) setActive(value);
  }, [value]);
  const showing = useRef(value);
  showing.current = value;
  useEffect(() => {
    const v = showing.current;
    if (!focusRequest || !v) return;
    setActive(v);
    tile(v)?.focus();
  }, [focusRequest]);

  const move = (to: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, to))];
    if (!next) return;
    setActive(next.id);
    tile(next.id)?.focus();
    if (next.id !== value) onPreview?.({ id: next.id });
  };
  /** Tiles per row, as laid out: the ones on the first tile's row. */
  const columns = () => {
    const els = [...(ref.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
    const top = els[0]?.offsetTop;
    return Math.max(1, els.filter((e) => e.offsetTop === top).length);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const at = Math.max(0, items.findIndex((i) => i.id === active));
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(at + (document.dir === "rtl" ? -1 : 1)),
      ArrowLeft: () => move(at + (document.dir === "rtl" ? 1 : -1)),
      ArrowDown: () => move(at + columns()),
      ArrowUp: () => move(at - columns()),
      Home: () => move(0),
      End: () => move(items.length - 1),
      Enter: () => onChoose?.({ id: active }),
      " ": () => onChoose?.({ id: active }),
    };
    if (e.key === "Escape") {
      if (!previewing) return;
      e.preventDefault();
      e.stopPropagation();
      reverting.current = true;
      onRevert?.();
      return;
    }
    const k = keys[e.key];
    if (!k || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    k();
  };

  return (
    <div ref={ref} role="listbox" aria-label={label} className={s.grid} onKeyDown={onKeyDown} {...(id ? { id } : {})}>
      {items.map((t) => (
        <div
          key={t.id}
          role="option"
          data-tile={t.id}
          data-theme-sample={t.id}
          aria-selected={t.id === value}
          {...(t.description ? { "aria-describedby": `${baseId}-${t.id}` } : {})}
          tabIndex={t.id === active ? 0 : -1}
          className={s.tile}
          onFocus={() => setActive(t.id)}
          onClick={() => onChoose?.({ id: t.id })}
        >
          <span className={s.swatch} aria-hidden="true">
            <span className={s.glyph} />
            <span className={s.marks}>
              <span className={s.accent} />
              <span className={s.dot} />
            </span>
          </span>
          {/* The name is what the tile shows ("Paper Light ✓"); its kind and badge are its description. */}
          <span className={s.name}>
            <span className={s.label}>{t.label}</span>
            {t.slot ? <span className={s.slot}>{` ${t.slot}`}</span> : null}
            <span className={s.badge} aria-hidden="true">{t.badge}</span>
          </span>
          {t.description ? <span id={`${baseId}-${t.id}`} hidden>{t.description}</span> : null}
        </div>
      ))}
    </div>
  );
}
