import { Children, type ReactNode } from "react";
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
  id?: string;
  children?: ReactNode;
}

const PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,/;

/** One thing, shown rather than described (D-126, D-127): an account, a workspace, or an option. */
export function ItemCard({ title, detail, badge, icon, avatar, initials, mark, size = "m", personal = "none", label, id, children }: ItemCardProps) {
  const Glyph = icon ? ICONS[icon] : undefined;
  const GitHub = ICONS.github;
  const visual = Glyph ? (
    <span className={s.tile} data-visual-anchor=""><Glyph className={s.tileIcon} aria-hidden="true" /></span>
  ) : avatar && PICTURE.test(avatar) ? (
    <img className={s.avatar} src={avatar} alt="" data-visual-anchor="" data-avatar="picture" />
  ) : initials ? (
    <span className={s.avatar} aria-hidden="true" data-visual-anchor="" data-avatar="initials">{initials}</span>
  ) : null;
  return (
    <div id={id} className={`${s.base} ${size === "l" ? s.large : ""}`} role={label ? "group" : undefined} aria-label={label} data-item-card="">
      {visual}
      <div className={s.text}>
        <p className={`${s.title} ${size === "l" ? s.titleLarge : ""}`} data-personal={personal !== "none" ? "" : undefined}>{title}</p>
        {detail || badge || mark ? (
          <div className={s.detail}>
            {mark ? <GitHub className={s.mark} aria-hidden="true" /> : null}
            {detail ? <span data-personal={personal === "all" ? "" : undefined}>{detail}</span> : null}
            {badge ? <span className={s.badge}>{badge}</span> : null}
          </div>
        ) : null}
      </div>
      {Children.count(children) ? <div className={s.actions}>{children}</div> : null}
    </div>
  );
}
