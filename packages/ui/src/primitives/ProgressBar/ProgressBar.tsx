import * as s from "./ProgressBar.css.ts";

export interface ProgressBarProps {
  value?: number;
  label: string;
  id?: string;
}

/** Determinate progress for long work that reports it (PRF-13): the platform's own progress element, styled with tokens. */
export function ProgressBar({ value = 0, label, id }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return <progress id={id} className={s.root} max={100} value={v} aria-label={label} />;
}
