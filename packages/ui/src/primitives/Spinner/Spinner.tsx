import * as s from "./Spinner.css.ts";

export interface SpinnerProps {
  /** What's being waited for. Omit when the spinner sits inside a control that already says it. */
  label?: string;
  size?: keyof typeof s.size;
  id?: string;
}

/** An indeterminate wait sign (Feedback → Waits). With reduced motion it stands still. */
export function Spinner({ label, size = "m", id }: SpinnerProps) {
  return label
    ? <span id={id} role="progressbar" aria-label={label} className={`${s.base} ${s.size[size]}`} />
    : <span id={id} aria-hidden="true" className={`${s.base} ${s.size[size]}`} />;
}
