import { Children, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./ItemCard.css.ts";
import { useBusy } from "../../behaviors/busy.ts";
import { Skeleton } from "../Skeleton/Skeleton.tsx";

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
  /** Article text follows the scoped reading font and size, not interface typography. */
  reading?: boolean;
  /** A trailing navigation cue; published article entries deliberately omit it. */
  chevron?: boolean;
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
  /** Native radio identity; cards with the same group form one mutually exclusive list. */
  choiceGroup?: string;
  choiceValue?: string;
  selected?: boolean;
  onChoose?: (payload: { value: string }) => void;
  children?: ReactNode;
  /** With an action, the whole card is one button, named by what it shows: its title, then its detail (D-131). */
  onPress?: () => void;
}

const PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,/;

/** One thing, shown rather than described (D-126, D-127): an account, a workspace, or an option.
 * @a11y A choice uses native grouped radios; its slot actions are outside the choice label.
 * @key Arrow keys choose within the native radio group; Space chooses the focused radio.
 */
export function ItemCard({ title, detail, badge, icon, avatar, initials, mark, size = "m", personal = "none", reading = false, chevron = true, label, busy, disabled, autoFocus, skeleton, id, children, onPress, choiceGroup, choiceValue, selected, onChoose }: ItemCardProps) {
  // The shared busy policy (D-199): inert, aria-busy and data-busy, the same as Button's.
  const { inert, attrs: busyAttrs, ref: busyRef } = useBusy({ busy, label: label ?? "", disabled });
  if (skeleton) {
    return (
      <div id={id} className={`${s.base} ${size === "l" ? s.large : ""}`} role="status" aria-busy="true" aria-label={label ?? title} data-item-card="" data-skeleton="">
        <Skeleton shape={size === "l" ? "avatar" : "tile"} />
        <span className={s.text} aria-hidden="true">
          <Skeleton width="long" />
          <Skeleton width="medium" />
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
  const Title = pressable || choiceGroup ? "span" : "p";
  const Detail = pressable || choiceGroup ? "span" : "div";
  const text = (
    <Detail className={s.text}>
      <Title className={`${s.title} ${size === "l" ? s.titleLarge : ""} ${pressable ? s.titleAction : ""} ${reading ? s.readingTitle : ""}`} data-personal={personal !== "none" ? "" : undefined}>{title}</Title>
      {detail || badge || mark ? (
        <Detail className={`${s.detail} ${reading ? s.readingDetail : ""}`}>
          {mark ? <GitHub className={s.mark} aria-hidden="true" /> : null}
          {detail ? <span data-personal={personal === "all" ? "" : undefined}>{detail}</span> : null}
          {badge ? <span className={`${s.badge} ${selected ? s.selectedBadge : ""}`}>{badge}</span> : null}
        </Detail>
      ) : null}
    </Detail>
  );
  if (choiceGroup) {
    return (
      <div id={id} className={`${s.base} ${s.choiceCard} ${reading ? s.reading : ""}`} data-item-card="" data-reading={reading ? "" : undefined} data-selected={selected ? "" : undefined} aria-busy={busy || undefined}>
        <label className={s.choice}>
          <input className={s.radio} type="radio" name={choiceGroup} value={choiceValue} checked={Boolean(selected)} aria-disabled={busy || disabled || undefined} aria-label={label ?? title}
            onClick={(e) => { if (inert) e.preventDefault(); }}
            onKeyDown={(e) => { if (inert && [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault(); }}
            onChange={() => { if (!inert && choiceValue) onChoose?.({ value: choiceValue }); }} />
          {visual}
          {text}
        </label>
        {Children.count(children) ? <div className={s.actions}>{children}</div> : null}
      </div>
    );
  }
  if (pressable) {
    return (
      <AriaButton
        id={id}
        className={`${s.base} ${s.pressable} ${size === "l" ? s.large : ""} ${reading ? s.reading : ""}`}
        data-item-card=""
        data-reading={reading ? "" : undefined}
        aria-label={label}
        {...busyAttrs}
        ref={busyRef}
        data-unavailable={disabled ? "" : undefined}
        {...(autoFocus ? { autoFocus: true } : {})}
        onPress={inert ? undefined : onPress}
      >
        {visual}
        {text}
        {chevron ? <Chevron className={s.chevron} aria-hidden="true" /> : null}
      </AriaButton>
    );
  }
  return (
    <div id={id} className={`${s.base} ${size === "l" ? s.large : ""} ${reading ? s.reading : ""}`} role={label ? "group" : undefined} aria-label={label} data-item-card="" data-reading={reading ? "" : undefined}>
      {visual}
      {text}
      {Children.count(children) ? <div className={s.actions}>{children}</div> : null}
    </div>
  );
}