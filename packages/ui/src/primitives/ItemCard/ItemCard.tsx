import { Children, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./ItemCard.css.ts";

export interface ItemCardProps {
  title: string;
  detail?: string;
  badge?: string;
  icon?: IconName;
  /** Only a data URL the shell made; anything else shows the initials. */
  avatar?: string;
  initials?: string;
  mark?: boolean;
  size?: "m" | "l";
  /** Which words are the person's data, not the interface's (D-127). */
  personal?: "none" | "title" | "all";
  label?: string;
  /** A pressable card's action is running: it stays focusable, says so, and doesn't run again. */
  busy?: boolean;
  /** A pressable card that can't run now: it stays focusable and says why in its detail (D-135). */
  disabled?: boolean;
  /** A pressable card takes focus when it appears (a first-run step's main action). */
  autoFocus?: boolean;
  id?: string;
  children?: ReactNode;
  /** With an action, the whole card is one button, named by what it shows: its title, then its detail (D-131). */
  onPress?: () => void;
}

const PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,/;

/** One thing, shown rather than described (D-126, D-127): an account, a workspace, or an option. */
export function ItemCard({ title, detail, badge, icon, avatar, initials, mark, size = "m", personal = "none", label, busy, disabled, autoFocus, id, children, onPress }: ItemCardProps) {
  const Glyph = icon ? ICONS[icon] : undefined;
  const pressable = Boolean(onPress);
  const GitHub = ICONS.github;
  const Chevron = ICONS.chevronRight;
  const visual = Glyph ? (
    <span className={`${s.tile} ${pressable && !disabled ? s.tileAction : ""}`} data-visual-anchor=""><Glyph className={s.tileIcon} aria-hidden="true" /></span>
  ) : avatar && PICTURE.test(avatar) ? (
    <img className={s.avatar} src={avatar} alt="" data-visual-anchor="" data-avatar="picture" />
  ) : initials ? (
    <span className={s.avatar} aria-hidden="true" data-visual-anchor="" data-avatar="initials">{initials}</span>
  ) : null;
  // Inside a button only phrasing content: spans, laid out the same.
  const Title = pressable ? "span" : "p";
  const Detail = pressable ? "span" : "div";
  const text = (
    <Detail className={s.text}>
      <Title className={`${s.title} ${size === "l" ? s.titleLarge : ""} ${pressable ? s.titleAction : ""}`} data-personal={personal !== "none" ? "" : undefined}>{title}</Title>
      {detail || badge || mark ? (
        <Detail className={s.detail}>
          {mark ? <GitHub className={s.mark} aria-hidden="true" /> : null}
          {detail ? <span data-personal={personal === "all" ? "" : undefined}>{detail}</span> : null}
          {badge ? <span className={s.badge}>{badge}</span> : null}
        </Detail>
      ) : null}
    </Detail>
  );
  if (pressable) {
    return (
      <AriaButton
        id={id}
        className={`${s.base} ${s.pressable} ${size === "l" ? s.large : ""}`}
        data-item-card=""
        aria-label={label}
        aria-disabled={busy || disabled ? "true" : undefined}
        aria-busy={busy ? "true" : undefined}
        data-unavailable={disabled ? "" : undefined}
        {...(autoFocus ? { autoFocus: true } : {})}
        onPress={busy || disabled ? undefined : onPress}
      >
        {visual}
        {text}
        <Chevron className={s.chevron} aria-hidden="true" />
      </AriaButton>
    );
  }
  return (
    <div id={id} className={`${s.base} ${size === "l" ? s.large : ""}`} role={label ? "group" : undefined} aria-label={label} data-item-card="">
      {visual}
      {text}
      {Children.count(children) ? <div className={s.actions}>{children}</div> : null}
    </div>
  );
}