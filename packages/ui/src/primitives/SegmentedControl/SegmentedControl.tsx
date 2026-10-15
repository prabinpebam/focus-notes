import { Label, Radio, RadioGroup } from "react-aria-components";
import type { Option } from "../../data.ts";
import * as s from "./SegmentedControl.css.ts";

export interface SegmentedControlProps {
  label: string;
  options: Option[];
  value?: string;
  /** vertical: one full-width row per choice, for labels that don't fit side by side (D-123). */
  orientation?: "horizontal" | "vertical";
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/** Two to five mutually exclusive choices drawn as segments, side by side or one row each: a radio group (arrow keys move and select). */
export function SegmentedControl({ label, options, value, orientation = "horizontal", id, onChange }: SegmentedControlProps) {
  return (
    <RadioGroup
      className={s.root[orientation]}
      orientation={orientation}
      value={value ?? null}
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
