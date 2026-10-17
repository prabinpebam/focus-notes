import { Button } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import type { IconName } from "../../icon-names.ts";
import type { SAVE_STATES } from "./contract.ts";
import * as s from "./SaveState.css.ts";

export type SaveStateKind = (typeof SAVE_STATES)[number];

const ICON: Record<SaveStateKind, IconName> = {
  savedLocal: "check", pending: "cloud", syncing: "cloudUp", synced: "cloudCheck", offline: "cloudOff", error: "warning",
};

export interface SaveStateProps {
  state: SaveStateKind;
  /** The state in words: the accessible name. */
  label: string;
  /** Shown beside the icon for a moment after the person asked. */
  text?: string;
  id?: string;
  /** A pressable trigger for details, or a plain status image when off. */
  interactive?: boolean;
  onPress?: () => void;
}

/**
 * The circular save indicator (UI-12, D-132). Views may use it as the backup-details trigger.
 */
export function SaveState({ state, label, text, id, interactive = true, onPress }: SaveStateProps) {
  const glyph = (
    <span className={s.glyph}>
      <Icon name={ICON[state]} size="s" />
      {state === "pending" ? <span className={s.dot} aria-hidden="true" /> : null}
    </span>
  );
  if (!interactive) {
    return (
      <span className={`${s.pill} ${s.tone[state]}`} {...(id ? { id } : {})} role="img" aria-label={text || label} title={label} data-state={state}>
        {glyph}
        {text ? <span className={s.text}>{text}</span> : null}
      </span>
    );
  }
  return (
      <Button
        className={`${s.pill} ${s.tone[state]}`}
        {...(id ? { id } : {})}
        aria-label={text || label}
        data-state={state}
        {...(onPress ? { onPress } : {})}
      >
        {state === "syncing" ? <span className={s.moving} aria-hidden="true" data-backup-ring="" /> : null}
        {glyph}
        {text ? <span className={s.text}>{text}</span> : null}
      </Button>
  );
}