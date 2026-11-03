import { Button } from "react-aria-components";
import type { ProjectFont } from "../ProjectMark/presets.ts";
import * as s from "./FontChoice.css.ts";

export interface FontChoiceProps {
  font: ProjectFont;
  /** The font's name: shown under the sample, and the button's name. */
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Pointing at it or focusing it previews the font (D-316). */
  onPreview?: () => void;
}

/** A writing font shown in itself, so the choice is made by eye (D-316); every cell is the same size. */
export function FontChoice({ font, label, selected = false, onPress, onPreview }: FontChoiceProps) {
  return (
    <Button className={`${s.base}${selected ? ` ${s.selected}` : ""}`} data-font-scope={font} aria-pressed={selected}
      {...(onPress ? { onPress } : {})} {...(onPreview ? { onHoverStart: onPreview, onFocus: onPreview } : {})}>
      <span className={s.sample} aria-hidden="true">Aa</span>
      <span className={s.name}>{label}</span>
    </Button>
  );
}
