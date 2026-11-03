import type { ProjectFont } from "../ProjectMark/presets.ts";
import * as s from "./FontChoice.css.ts";

export interface FontChoiceProps {
  font: ProjectFont;
  /** The font's name: shown under the sample, and the button's name. */
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

/** A writing font shown in itself, so the choice is made by eye (D-316). */
export function FontChoice({ font, label, selected = false, onPress }: FontChoiceProps) {
  return (
    <button type="button" className={`${s.base}${selected ? ` ${s.selected}` : ""}`} data-font-scope={font} aria-pressed={selected} onClick={onPress}>
      <span className={s.sample} aria-hidden="true">Aa</span>
      <span className={s.name}>{label}</span>
    </button>
  );
}
