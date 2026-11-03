import { Button, Label, Radio, RadioGroup, Toolbar } from "react-aria-components";
import type { Option } from "../../data.ts";
import type { IconName } from "../../icon-names.ts";
import { controlLabel } from "../control.css.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import * as s from "./SegmentedControl.css.ts";

export interface SegmentedControlProps {
  label: string;
  options: Option[];
  value?: string;
  /** vertical: one full-width row per choice, for labels that don't fit side by side (D-123). */
  orientation?: "horizontal" | "vertical";
  /** Shown and focusable, but the choice can't change: while what it chose is being sent (D-203). */
  readOnly?: boolean;
  /** A group of related actions in one track (Rotate left, Rotate right, Reset): buttons, not a choice. */
  actions?: boolean;
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
export function SegmentedControl({ label, options, value, orientation = "horizontal", readOnly, actions = false, id, onChange, onAction }: SegmentedControlProps) {
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
    <RadioGroup
      className={s.root[orientation]}
      orientation={orientation}
      value={value ?? null}
      isReadOnly={Boolean(readOnly)}
      onChange={(v) => onChange?.({ value: v })}
      {...(id ? { id } : {})}
    >
      <Label className={s.label}>{label}</Label>
      <span className={s.track[orientation]}>
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className={s.segment[orientation]}>{o.label}</Radio>
        ))}
      </span>
    </RadioGroup>
  );
}
