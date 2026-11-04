import { useEffect, useId, useRef, useState } from "react";
import { CommitFailure, CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./ColorField.css.ts";

export interface ColorFieldProps {
  label: string;
  value?: string;
  /** The color the swatch shows; only #rgb or #rrggbb is ever painted. */
  swatch?: string;
  description?: string;
  invalid?: boolean;
  error?: string;
  /** Each new value moves focus into the field. */
  focusRequest?: number;
  /** The commit track (F2), as on TextField: the commit border and spinner, the tick, or the failure line with Retry and Revert. */
  commit?: CommitState;
  retryLabel?: string;
  revertLabel?: string;
  id?: string;
  onRetry?: () => void;
  onRevert?: () => void;
  onCommit?: (payload: { value: string }) => void;
}

const swatchVar = s.swatchColor.replace(/^var\((.*)\)$/, "$1");
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A hex color field with a swatch (Theme manager → Edit colors). Every color can be typed, so a
 * pointer-only picker is never needed. What's typed is committed on Enter or on leaving the field;
 * Esc puts back the value. The description (the contrast it's checked against) is said with it.
 */
export function ColorField({ label, value = "", swatch, description, invalid, error, focusRequest, commit, retryLabel, revertLabel, id, onRetry, onRevert, onCommit }: ColorFieldProps) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (focusRequest) input.current?.focus();
  }, [focusRequest]);
  const base = useId();
  const descId = `${base}-d`;
  const save = () => {
    if (text !== value) onCommit?.({ value: text });
  };
  const failed = commit === "failed" && Boolean(error);
  const said = failed ? undefined : invalid && error ? error : description;
  return (
    <div className={s.root} {...(id ? { id } : {})} {...(commit ? { "data-commit": commit } : {})}>
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
          ref={input}
          id={`${base}-i`}
          className={s.input}
          value={text}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-invalid={invalid || failed || undefined}
          readOnly={commit === "pending"}
          {...(commit === "pending" ? { "aria-disabled": true, "aria-busy": true } : {})}
          {...(said ? { "aria-describedby": descId } : {})}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape" && text !== value) {
              e.preventDefault();
              e.stopPropagation();
              setText(value);
            }
          }}
        />
        {commit ? <CommitMark state={commit} /> : null}
      </div>
      {failed && error ? <CommitFailure message={error} retryLabel={retryLabel} revertLabel={revertLabel} onRetry={onRetry} onRevert={onRevert} /> : null}
      {said ? <span id={descId} className={invalid && error ? s.error : s.description}>{said}</span> : null}
    </div>
  );
}
