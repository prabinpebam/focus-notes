import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./StepMark.css.ts";

export interface StepMarkProps {
  icon: IconName;
  tone?: keyof typeof s.tone;
  /** The step is waiting: a ring turns around the tile. */
  busy?: boolean;
  /** Only where the mark carries meaning on its own. */
  label?: string;
}

/** A setup step's hero (D-135): one icon in a large round tile, the step's visual anchor (D-127). */
export function StepMark({ icon, tone = "neutral", busy, label }: StepMarkProps) {
  const Glyph = ICONS[icon];
  return (
    <span className={`${s.base} ${s.tone[tone]}`} data-visual-anchor="" data-step-mark={tone} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <Glyph className={s.icon} aria-hidden="true" />
      {busy ? <span className={s.ring} data-busy="" /> : null}
    </span>
  );
}
