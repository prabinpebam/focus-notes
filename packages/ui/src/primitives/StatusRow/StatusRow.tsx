import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import { Button } from "../Button/Button.tsx";
import * as s from "./StatusRow.css.ts";

export interface StatusRowProps {
  message: string;
  tone?: keyof typeof s.tone;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  detailsLabel?: string;
  details?: string;
  id?: string;
}

const TONE_ICON: Record<keyof typeof s.tone, IconName> = { danger: "error", warning: "warning", info: "info", success: "check" };

/** One status: an icon and one sentence on a tinted row (D-142). */
export function StatusRow({ message, tone = "danger", icon, actionLabel, onAction, detailsLabel, details, id }: StatusRowProps) {
  const Glyph = ICONS[icon ?? TONE_ICON[tone]];
  return (
    <div id={id} className={`${s.base} ${s.tone[tone]}`} data-status-row={tone}>
      <Glyph className={`${s.icon} ${s.iconTone[tone]}`} aria-hidden="true" />
      <div className={s.content}>
        <span className={s.text} dir="auto" role="status" aria-live="polite">{message}</span>
        {actionLabel || (details && detailsLabel) ? <div className={s.actions}>
          {actionLabel ? <Button label={actionLabel} size="s" variant="secondary" {...(onAction ? { onPress: onAction } : {})} /> : null}
          {details && detailsLabel ? <details className={s.details}><summary className={s.summary}>{detailsLabel}</summary><span className={s.detailsBody}>{details}</span></details> : null}
        </div> : null}
      </div>
    </div>
  );
}
