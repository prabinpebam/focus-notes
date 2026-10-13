import * as s from "./Heading.css.ts";

export interface HeadingProps {
  value: string;
  level?: "1" | "2" | "3";
  id?: string;
}

/** Interface headings for sheets and dialogs. Note headings are block components. */
export function Heading({ value, level = "2", id }: HeadingProps) {
  const Tag = (`h${level}` as "h1" | "h2" | "h3");
  return <Tag id={id} className={`${s.base} ${s.level[level]}`} dir="auto">{value}</Tag>;
}
