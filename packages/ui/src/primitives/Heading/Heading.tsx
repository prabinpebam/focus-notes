import { Icon } from "../Icon/Icon.tsx";
import * as s from "./Heading.css.ts";

export interface HeadingProps {
  value: string;
  /** display: the largest size, a full-window onboarding step's title (D-126); it is an h1. */
  level?: "1" | "2" | "3" | "display";
  /** Pressable, it leads back (D-189): a chevron before it. */
  back?: boolean;
  /** Pressable: what pressing it does, its accessible name ("Back to Files"). */
  label?: string;
  id?: string;
  onPress?: () => void;
}

/** Interface headings for sheets and dialogs. Note headings are block components. */
export function Heading({ value, level = "2", back, label, id, onPress }: HeadingProps) {
  const Tag = (level === "display" ? "h1" : `h${level}`) as "h1" | "h2" | "h3";
  // Still a heading, its text a button (Files from Recently deleted, D-189): the outline keeps its level.
  if (onPress) {
    return (
      <Tag id={id} className={`${s.base} ${s.level[level]}`} dir="auto">
        <button type="button" className={s.press} aria-label={label || undefined} onClick={() => onPress()}>
          {back ? <Icon name="chevronLeft" size="s" /> : null}
          {value}
        </button>
      </Tag>
    );
  }
  return <Tag id={id} className={`${s.base} ${s.level[level]}`} dir="auto">{value}</Tag>;
}
