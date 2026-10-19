import { useContext } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { CompanionContext } from "../../behaviors/anchors.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import type { IconName } from "../../icon-names.ts";
import { useBusy } from "../../behaviors/busy.ts";
import * as s from "./IconButton.css.ts";

export interface IconButtonProps {
  icon: IconName;
  /** The accessible name and tooltip. Required: icons are never the only signal. */
  label: string;
  shortcut?: string;
  tone?: keyof typeof s.tone;
  toggle?: boolean;
  pressed?: boolean;
  /** A toggle that applies to only part of what it acts on: half-pressed (DD-FMT-06). */
  mixed?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** A wait it started (Waits, D-199): inert at once; after the busy delay a Spinner replaces the icon, and the label says what it's doing. */
  busy?: boolean;
  busyLabel?: string;
  /** At the edge of a panel's content (a dialog's close button): its icon lines up with the edge, and its hit area reaches into the padding. */
  bleed?: boolean;
  id?: string;
  onPress?: () => void;
}

export function IconButton({ icon, label, shortcut, tone = "default", toggle, pressed, mixed, disabled, disabledReason, busy, busyLabel, bleed, id, onPress }: IconButtonProps) {
  const className = `${s.base} ${s.tone[tone]}${bleed ? ` ${s.bleed}` : ""}`;
  const keepNoteFocus = useContext(CompanionContext);
  const { inert, name, attrs, ref } = useBusy({ busy, busyLabel, label, disabled });
  const common = { id, className, "aria-label": name, ...attrs, ref, "data-bleed": bleed ? "" : undefined, preventFocusOnPress: keepNoteFocus };
  const glyph = busy ? (
    <span className={s.busyGlyph}>
      <span className={s.busyIcon}><Icon name={icon} /></span>
      <span className={s.busySpinner}><Spinner size="s" /></span>
    </span>
  ) : <Icon name={icon} />;
  const button = toggle && mixed ? (
    <AriaButton {...common} aria-pressed="mixed" onPress={inert ? undefined : onPress}>
      {glyph}
    </AriaButton>
  ) : toggle ? (
    <ToggleButton {...common} isSelected={Boolean(pressed)} onChange={inert ? undefined : () => onPress?.()}>
      {glyph}
    </ToggleButton>
  ) : (
    <AriaButton {...common} onPress={inert ? undefined : onPress}>
      {glyph}
    </AriaButton>
  );
  return <Tooltip label={disabled && disabledReason ? disabledReason : name} {...(shortcut ? { shortcut } : {})}>{button}</Tooltip>;
}
