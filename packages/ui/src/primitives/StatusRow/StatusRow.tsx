import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./StatusRow.css.ts";

export interface StatusRowProps {
  message: string;
  tone?: keyof typeof s.tone;
  icon?: IconName;
  id?: string;
}

const TONE_ICON: Record<keyof typeof s.tone, IconName> = { danger: "error", warning: "warning", info: "info", success: "check" };

/** One status: an icon and one sentence on a tinted row (D-142). */
export function StatusRow({ message, tone = "danger", icon, id }: StatusRowProps) {
  const Glyph = ICONS[icon ?? TONE_ICON[tone]];
  return (
    <div id={id} className={`${s.base} ${s.tone[tone]}`} role="status" aria-live="polite" data-status-row={tone}>
      <Glyph className={`${s.icon} ${s.iconTone[tone]}`} aria-hidden="true" />
      <span className={s.text} dir="auto">{message}</span>
    </div>
  );
}
