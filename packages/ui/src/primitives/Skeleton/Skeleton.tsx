import * as s from "./Skeleton.css.ts";

export interface SkeletonProps {
  /** What's coming: a line of words, a card's picture, or a person's photo. */
  shape?: "line" | "tile" | "avatar";
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
  return <span className={`${s.base} ${shape === "line" ? `${s.line} ${s.width[width]}` : s[shape]}`} aria-hidden="true" data-shimmer="" />;
}