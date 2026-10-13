import * as s from "./Shortcut.css.ts";

export interface ShortcutProps {
  /** Key caps in display order, already in the platform's symbols: ["⇧", "⌘", "L"]. */
  keys: string[];
  /** The chord in words, for screen readers: "Shift Command L". */
  label: string;
  id?: string;
}

/** A key chord drawn as key caps (Keyboard shortcuts → cheat sheet), read aloud in words. */
export function Shortcut({ keys, label, id }: ShortcutProps) {
  return (
    <span id={id} className={s.root}>
      {keys.map((k, i) => (
        <kbd key={i} className={s.cap} aria-hidden="true">{k}</kbd>
      ))}
      <span className={s.spoken}>{label}</span>
    </span>
  );
}
