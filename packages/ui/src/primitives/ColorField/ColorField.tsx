import { useEffect, useId, useState } from "react";
import * as s from "./ColorField.css.ts";

export interface ColorFieldProps {
  label: string;
  value?: string;
  /** The color the swatch shows; only #rgb or #rrggbb is ever painted. */
  swatch?: string;
  description?: string;
  invalid?: boolean;
  error?: string;
  id?: string;
  onCommit?: (payload: { value: string }) => void;
}

const swatchVar = s.swatchColor.replace(/^var\((.*)\)$/, "$1");
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A hex color field with a swatch (Theme manager → Edit colors). Every color can be typed, so a
 * pointer-only picker is never needed. What's typed is committed on Enter or on leaving the field;
 * Esc puts back the value. The description (the contrast it's checked against) is said with it.
 */
export function ColorField({ label, value = "", swatch, description, invalid, error, id, onCommit }: ColorFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const base = useId();
  const descId = `${base}-d`;
  const commit = () => {
    if (text !== value) onCommit?.({ value: text });
  };
  const said = invalid && error ? error : description;
  return (
    <div className={s.root} {...(id ? { id } : {})}>
      <label className={s.label} htmlFor={`${base}-i`}>{label}</label>
      <div className={`${s.control} ${invalid ? s.invalid : ""}`}>
        <span
          className={s.swatch}
          aria-hidden="true"
          ref={(el) => {
            if (!el) return;
            if (swatch && HEX.test(swatch)) el.style.setProperty(swatchVar, swatch);
            else el.style.removeProperty(swatchVar);
          }}
        />
        <input
          id={`${base}-i`}
          className={s.input}
          value={text}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          {...(said ? { "aria-describedby": descId } : {})}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && text !== value) {
              e.preventDefault();
              e.stopPropagation();
              setText(value);
            }
          }}
        />
      </div>
      {said ? <span id={descId} className={invalid && error ? s.error : s.description}>{said}</span> : null}
    </div>
  );
}
