import { Button } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import type { IconName } from "../../icon-names.ts";
import type { SAVE_STATES } from "./contract.ts";
import * as s from "./SaveState.css.ts";

export type SaveStateKind = (typeof SAVE_STATES)[number];

const ICON: Record<SaveStateKind, IconName> = {
  savedLocal: "check", pending: "cloud", syncing: "cloudUp", synced: "cloudCheck", offline: "cloudOff", error: "warning",
};

export interface SaveStateProps {
  state: SaveStateKind;
  /** The state in words: the tooltip and the accessible name. */
  label: string;
  /** Shown beside the icon for a moment after the person asked. */
  text?: string;
  id?: string;
  /** Pressing backs up now; off when there's nowhere to back up to (no Git), so it's only a status. */
  interactive?: boolean;
  onPress?: () => void;
}

/**
 * The save state at the leading edge of the bottom-left pill (UI-12, D-132): one calm icon that never
 * pops up and never takes focus from the note when pressed. Pressing it backs up now.
 */
export function SaveState({ state, label, text, id, interactive = true, onPress }: SaveStateProps) {
  const glyph = (
    <span className={`${s.glyph}${state === "syncing" ? ` ${s.moving}` : ""}`}>
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
    <Tooltip label={label} placement="top">
      <Button
        className={`${s.pill} ${s.tone[state]}`}
        {...(id ? { id } : {})}
        aria-label={text || label}
        data-state={state}
        preventFocusOnPress
        {...(onPress ? { onPress } : {})}
      >
        {glyph}
        {text ? <span className={s.text}>{text}</span> : null}
      </Button>
    </Tooltip>
  );
}