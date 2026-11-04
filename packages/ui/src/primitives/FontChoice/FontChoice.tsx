import { Button } from "react-aria-components";
import type { ProjectFont } from "../ProjectMark/presets.ts";
import { CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./FontChoice.css.ts";

export interface FontChoiceProps {
  font: ProjectFont;
  /** The font's name: shown under the sample, and the button's name. */
  label: string;
  selected?: boolean;
  /** Shared by the choice group; only the selected tile shows the mark. */
  commit?: CommitState;
  onPress?: () => void;
  /** Pointing at it or focusing it previews the font (D-316). */
  onPreview?: () => void;
}

/** A writing font shown in itself, so the choice is made by eye (D-316); every cell is the same size. */
export function FontChoice({ font, label, selected = false, commit, onPress, onPreview }: FontChoiceProps) {
  return (
    <Button className={`${s.base}${selected && (!commit || commit === "rest") ? ` ${s.selected}` : ""}`} data-font-scope={font} aria-pressed={selected} aria-disabled={commit === "pending" || undefined} aria-busy={selected && commit === "pending" || undefined}
      {...(onPress ? { onPress: () => { if (commit !== "pending") onPress(); } } : {})} {...(onPreview ? { onHoverStart: () => { if (commit !== "pending") onPreview(); }, onFocus: () => { if (commit !== "pending") onPreview(); } } : {})}>
      <span className={s.sample} aria-hidden="true">Aa</span>
      <span className={s.name}>{label}</span>
      {commit && selected ? <CommitMark variant="border" state={commit} /> : null}
    </Button>
  );
}
