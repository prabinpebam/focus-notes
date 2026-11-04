import { Button } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import type { ProjectFont, ProjectTheme } from "../ProjectMark/presets.ts";
import { controlLabel } from "../control.css.ts";
import { CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import { useBusy } from "../../behaviors/busy.ts";
import * as s from "./PickerButton.css.ts";

export interface PickerButtonProps {
  /** What it sets: its accessible name, with the value. */
  label: string;
  /** The current value, shown. */
  value: string;
  font?: ProjectFont | "app";
  theme?: ProjectTheme | "app";
  /** Off for an option inside the popover (a choice, not a trigger). */
  chevron?: boolean;
  /** The chosen option in the popover: a full ring. */
  selected?: boolean;
  commit?: CommitState;
  onPress?: () => void;
  /** tile: a fixed-size tile with its label on top and the value drawn (Settings → Project's Font and Theme). */
  variant?: "compact" | "fontTile" | "themeTile";
  /** Pointing at it or focusing it previews the value (D-316). */
  onPreview?: () => void;
}

/** A setting's current value, compact; its choices open in a popover (D-316). */
export function PickerButton({ label, value, font = "app", theme = "app", chevron = true, selected = false, commit, variant = "compact", onPress, onPreview }: PickerButtonProps) {
  const { inert, attrs, ref } = useBusy({ busy: commit === "pending", label });
  const interaction = {
    ...attrs, ref, isPending: commit === "pending", "data-commit": commit,
    ...(onPress && !inert ? { onPress } : {}),
    ...(onPreview && !inert ? { onHoverStart: onPreview, onFocus: onPreview } : {}),
  };
  if (variant !== "compact") {
    const fontScope = font === "app" ? undefined : font;
    return (
      <Button className={s.tile} aria-label={`${label}: ${value}`} {...interaction}>
        <span className={s.tileTop}><span className={controlLabel}>{label}</span><Icon name="chevronDown" size="s" /></span>
        <span className={s.tileVisual} aria-hidden="true">
          {variant === "fontTile"
            ? <span className={s.sample} data-font-scope={fontScope}>Aa</span>
            : <span className={s.preview} data-theme-scope={theme === "app" ? undefined : theme}><span className={s.line} /><span className={`${s.line} ${s.lineShort}`} /><span className={s.accentDot} /></span>}
        </span>
        <span className={`${controlLabel} ${s.tileValue}`}>{value}</span>
        {commit ? <CommitMark variant="border" state={commit} /> : null}
      </Button>
    );
  }
  return (
    <Button className={`${s.base}${chevron ? "" : ` ${s.option}`}${selected && (!commit || commit === "rest") ? ` ${s.selected}` : ""}`} aria-label={chevron ? `${label}: ${value}` : value} {...(chevron ? {} : { "aria-pressed": selected })} {...interaction}>
      {theme !== "app" ? <span className={s.swatch} data-theme-scope={theme} aria-hidden="true"><span className={s.dot} /></span> : null}
      <span className={`${controlLabel} ${s.value}${font !== "app" ? ` ${s.inFont}` : ""}`} data-font-scope={font === "app" ? undefined : font}>{value}</span>
      {chevron ? <Icon name="chevronDown" size="s" /> : null}
      {commit ? <CommitMark variant="border" state={commit} /> : null}
    </Button>
  );
}
