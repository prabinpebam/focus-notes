import { useEffect, useId, useRef, useState } from "react";
import { waits } from "@focus-notes/tokens";
import { Button, Label, Radio, RadioGroup, Toolbar } from "react-aria-components";
import type { Option } from "../../data.ts";
import type { IconName } from "../../icon-names.ts";
import { controlLabel } from "../control.css.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { CommitMark, CommitFailure, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./SegmentedControl.css.ts";

export interface SegmentedControlProps {
  label: string;
  options: Option[];
  value?: string;
  /** vertical: one full-width row per choice, for labels that don't fit side by side (D-123). */
  orientation?: "horizontal" | "vertical";
  /** Shown and focusable, but the choice can't change: while what it chose is being sent (D-203). */
  readOnly?: boolean;
  commit?: CommitState;
  error?: string;
  retryLabel?: string;
  revertLabel?: string;
  onRetry?: () => void;
  onRevert?: () => void;
  /** A group of related actions in one track (Rotate left, Rotate right, Reset): buttons, not a choice. */
  actions?: boolean;
  /** Native icon radios, named and titled without visible labels; also work on script-free pages. */
  iconsOnly?: boolean;
  id?: string;
  onChange?: (payload: { value: string }) => void;
  onAction?: (payload: { id: string }) => void;
}

/**
 * Two to five mutually exclusive choices drawn as segments, side by side or one row each: a radio group
 * (arrow keys move and select). With `actions`, the same track holds related actions instead: a toolbar
 * of buttons (arrow keys move, Enter or Space acts), an option with an icon drawn icon-only with its
 * label as accessible name and tooltip; the group's label names the toolbar and isn't shown.
 */
export function SegmentedControl({ label, options, value, orientation = "horizontal", readOnly, commit, error, retryLabel, revertLabel, onRetry, onRevert, actions = false, iconsOnly = false, id, onChange, onAction }: SegmentedControlProps) {
  const group = useId();
  const [draft, setDraft] = useState(value);
  const keyboard = useRef(false);
  const queued = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flush = () => {
    clearTimeout(timer.current);
    const next = queued.current;
    queued.current = undefined;
    if (next !== undefined && next !== value && commit !== "pending" && !readOnly) onChange?.({ value: next });
  };
  const change = (next: string) => {
    if (!commit) return onChange?.({ value: next });
    setDraft(next);
    queued.current = next;
    clearTimeout(timer.current);
    if (keyboard.current) timer.current = setTimeout(flush, waits.commitPause);
    else flush();
  };
  const chosen = commit ? draft : value;
  if (iconsOnly && !actions) {
    return (
      <div className={s.wrapper} aria-busy={commit === "pending" || undefined} data-commit={commit}
        onKeyDownCapture={(e) => { keyboard.current = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key); }}
        onPointerDownCapture={() => { keyboard.current = false; }}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) flush(); }}>
        <fieldset id={id} className={s.nativeRoot} role="radiogroup" aria-label={label}>
          <span className={s.track.horizontal}>
            {options.map((o) => (
              <label key={o.id} className={`${s.nativeSegment} ${s.iconSegment}`} title={o.label}>
                <input className={s.nativeInput} type="radio" name={group} value={o.id} checked={o.id === chosen}
                  aria-label={o.label} aria-disabled={readOnly || commit === "pending" || undefined}
                  onClick={(e) => { if (readOnly || commit === "pending") e.preventDefault(); }}
                  onKeyDown={(e) => { if ((readOnly || commit === "pending") && [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault(); }}
                  onChange={() => { if (!readOnly && commit !== "pending") change(o.id); }} />
                {o.icon ? <Icon name={o.icon as IconName} /> : <span className={controlLabel}>{o.label}</span>}
                {commit && o.id === chosen ? <CommitMark variant="border" state={commit} /> : null}
              </label>
            ))}
          </span>
        </fieldset>
        {commit === "failed" && error ? <CommitFailure message={error} {...(retryLabel ? { retryLabel } : {})} {...(revertLabel ? { revertLabel } : {})} {...(onRetry ? { onRetry } : {})} {...(onRevert ? { onRevert } : {})} /> : null}
      </div>
    );
  }
  if (actions) {
    return (
      <Toolbar aria-label={label} orientation="horizontal" className={s.track.horizontal} {...(id ? { id } : {})}>
        {options.map((o) => {
          const button = (
            <Button key={o.id} className={`${s.segment.horizontal} ${s.actionSegment}${o.icon ? ` ${s.iconSegment}` : ""}`} {...(o.icon ? { "aria-label": o.label } : {})} onPress={() => onAction?.({ id: o.id })}>
              {o.icon ? <Icon name={o.icon as IconName} /> : <span className={controlLabel}>{o.label}</span>}
            </Button>
          );
          return o.icon ? <Tooltip key={o.id} label={o.label}>{button}</Tooltip> : button;
        })}
      </Toolbar>
    );
  }
  return (
    <div className={s.wrapper} aria-busy={commit === "pending" || undefined} data-commit={commit}
      onKeyDownCapture={(e) => { keyboard.current = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key); }}
      onPointerDownCapture={() => { keyboard.current = false; }}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) flush(); }}
    ><RadioGroup
      className={s.root[orientation]}
      orientation={orientation}
      value={chosen ?? null}
      isReadOnly={Boolean(readOnly) || commit === "pending"}
      aria-disabled={commit === "pending" || undefined}
      onChange={change}
      {...(id ? { id } : {})}
    >
      <Label className={s.label}>{label}</Label>
      <span className={s.track[orientation]}>
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className={s.segment[orientation]}>{o.label}{commit && o.id === chosen ? <CommitMark variant="border" state={commit} /> : null}</Radio>
        ))}
      </span>
    </RadioGroup>{commit === "failed" && error ? <CommitFailure message={error} {...(retryLabel ? { retryLabel } : {})} {...(revertLabel ? { revertLabel } : {})} {...(onRetry ? { onRetry } : {})} {...(onRevert ? { onRevert } : {})} /> : null}</div>
  );
}
