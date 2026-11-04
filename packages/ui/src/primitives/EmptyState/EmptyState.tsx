import { Icon } from "../Icon/Icon.tsx";
import { Button } from "../Button/Button.tsx";
import type { IconName } from "../../icon-names.ts";
import * as s from "./EmptyState.css.ts";

export interface EmptyStateProps {
  title: string;
  detail?: string;
  icon?: IconName;
  size?: "component" | "section" | "view";
  tone?: "neutral" | "good";
  actionLabel?: string;
  onAction?: () => void;
}

/** A known-empty result, in the content's own wrapper; never a loading or error fallback. @tier primitive */
export function EmptyState({ title, detail, icon = "folder", size = "section", tone = "neutral", actionLabel, onAction }: EmptyStateProps) {
  return <div className={`${s.root} ${s.size[size]}`} data-tone={tone}>
    <span className={s.tile} aria-hidden="true"><Icon name={icon} size="l" /></span>
    <span className={s.title}>{title}</span>
    {detail ? <span className={s.detail}>{detail}</span> : null}
    {actionLabel ? <span className={s.action}><Button label={actionLabel} variant="primary" {...(onAction ? { onPress: onAction } : {})} /></span> : null}
  </div>;
}
