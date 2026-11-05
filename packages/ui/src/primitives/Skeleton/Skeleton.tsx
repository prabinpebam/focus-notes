import * as s from "./Skeleton.css.ts";

export interface SkeletonProps {
  /** What's coming: a line of words (text matches the surrounding line box), a picture, or a photo. */
  shape?: "line" | "text" | "tile" | "avatar" | "row" | "card";
  /** A line's length. */
  width?: keyof typeof s.width;
}

/**
 * A placeholder shaped like content on its way (PRF-13, D-208): a light passes across it a few
 * times, then it stands still; with reduced motion it never moves, and in forced colours it's a
 * plain GrayText shape. Always hidden from assistive technology: the region it sits in carries
 * the one status that says what's loading.
 */
export function Skeleton({ shape = "line", width = "full" }: SkeletonProps) {
  if (shape === "row" || shape === "card") return <span className={`${s.content} ${shape === "card" ? s.card : ""}`} aria-hidden="true">
    <span className={`${s.base} ${shape === "card" ? s.tile : s.avatar}`} data-shimmer="" />
    <span className={s.words}><span className={`${s.base} ${s.line} ${s.width.long}`} data-shimmer="" /><span className={`${s.base} ${s.line} ${s.width.medium}`} data-shimmer="" /></span>
  </span>;
  return <span className={`${s.base} ${shape === "line" || shape === "text" ? `${s[shape]} ${s.width[width]}` : s[shape]}`} aria-hidden="true" data-shimmer="" />;
}