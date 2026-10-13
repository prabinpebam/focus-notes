import { Label, Radio, RadioGroup } from "react-aria-components";
import type { Option } from "../../data.ts";
import * as s from "./SegmentedControl.css.ts";

export interface SegmentedControlProps {
  label: string;
  options: Option[];
  value?: string;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/** Two to five mutually exclusive choices drawn as segments: a radio group (arrow keys move and select). */
export function SegmentedControl({ label, options, value, id, onChange }: SegmentedControlProps) {
  return (
    <RadioGroup
      className={s.root}
      orientation="horizontal"
      value={value ?? null}
      onChange={(v) => onChange?.({ value: v })}
      {...(id ? { id } : {})}
    >
      <Label className={s.label}>{label}</Label>
      <span className={s.track}>
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className={s.segment}>{o.label}</Radio>
        ))}
      </span>
    </RadioGroup>
  );
}
