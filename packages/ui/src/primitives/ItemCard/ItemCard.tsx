import { Children, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./ItemCard.css.ts";
import { useBusy } from "../../behaviors/busy.ts";

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
  /** Its content is on its way (PRF-13): the card's shape with placeholders, named by its title for screen readers. */
  skeleton?: boolean;
  id?: string;
  children?: ReactNode;
  /** With an action, the whole card is one button, named by what it shows: its title, then its detail (D-131). */
  onPress?: () => void;
}

const PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,/;

/** One thing, shown rather than described (D-126, D-127): an account, a workspace, or an option. */
export function ItemCard({ title, detail, badge, icon, avatar, initials, mark, size = "m", personal = "none", label, busy, disabled, autoFocus, skeleton, id, children, onPress }: ItemCardProps) {
  // The shared busy policy (D-199): inert, aria-busy and data-busy, the same as Button's.
  const { inert, attrs: busyAttrs, ref: busyRef } = useBusy({ busy, label: label ?? "", disabled });
  if (skeleton) {
    return (
      <div id={id} className={`${s.base} ${size === "l" ? s.large : ""}`} role="status" aria-busy="true" aria-label={label ?? title} data-item-card="" data-skeleton="">
        <span className={size === "l" ? s.skeletonAvatar : s.skeletonTile} aria-hidden="true" />
        <span className={s.text} aria-hidden="true">
          <span className={`${s.skeletonBar} ${s.skeletonTitle}`} />
          <span className={`${s.skeletonBar} ${s.skeletonDetail}`} />
        </span>
      </div>
    );
  }
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
        {...busyAttrs}
        ref={busyRef}
        data-unavailable={disabled ? "" : undefined}
        {...(autoFocus ? { autoFocus: true } : {})}
        onPress={inert ? undefined : onPress}
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