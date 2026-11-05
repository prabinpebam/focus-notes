import { useContext } from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { CompanionContext } from "../../behaviors/anchors.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import type { IconName } from "../../icon-names.ts";
import { useBusy } from "../../behaviors/busy.ts";
import { CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./IconButton.css.ts";

export interface IconButtonProps {
  icon: IconName;
  /** The accessible name and tooltip. Required: icons are never the only signal. */
  label: string;
  shortcut?: string;
  /** stretch: match the adjacent field's block size in a stretch-aligned row. */
  size?: "m" | "stretch";
  tone?: keyof typeof s.tone;
  toggle?: boolean;
  pressed?: boolean;
  /** Whether this action's disclosed region is open; not an on/off setting. */
  expanded?: boolean;
  /** A toggle that applies to only part of what it acts on: half-pressed (DD-FMT-06). */
  mixed?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** A wait it started (Waits, D-199): inert at once; after the busy delay a Spinner replaces the icon, and the label says what it's doing. */
  busy?: boolean;
  busyLabel?: string;
  /** Immediate own-border commit feedback; recovery belongs beside this compact control. */
  commit?: CommitState;
  /** @deprecated Retained for old view documents; padding and paint always stay inside the button (D-354). */
  bleed?: boolean;
  id?: string;
  onPress?: () => void;
}

export function IconButton({ icon, label, shortcut, size = "m", tone = "default", toggle, pressed, expanded, mixed, disabled, disabledReason, busy, busyLabel, commit, bleed, id, onPress }: IconButtonProps) {
  const className = `${s.base} ${s.tone[tone]}${size === "stretch" ? ` ${s.stretch}` : ""}`;
  const keepNoteFocus = useContext(CompanionContext);
  const { inert, name, attrs, ref } = useBusy({ busy: busy || commit === "pending", busyLabel, label, disabled });
  const common = { id, className, "aria-label": name, "aria-expanded": expanded, ...attrs, ref, "data-commit": commit, preventFocusOnPress: keepNoteFocus };
  const glyph = commit && commit !== "rest" ? <><Icon name={icon} /><CommitMark variant="border" state={commit} /></> : busy ? (
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
