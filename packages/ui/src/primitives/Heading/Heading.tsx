import * as s from "./Heading.css.ts";

export interface HeadingProps {
  value: string;
  /** display: the largest size, a full-window onboarding step's title (D-126); it is an h1. */
  level?: "1" | "2" | "3" | "display";
  id?: string;
}

/** Interface headings for sheets and dialogs. Note headings are block components. */
export function Heading({ value, level = "2", id }: HeadingProps) {
  const Tag = (level === "display" ? "h1" : `h${level}`) as "h1" | "h2" | "h3";
  return <Tag id={id} className={`${s.base} ${s.level[level]}`} dir="auto">{value}</Tag>;
}
