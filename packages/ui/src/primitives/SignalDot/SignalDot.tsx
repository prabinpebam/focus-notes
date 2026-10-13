import * as s from "./SignalDot.css.ts";

export interface SignalDotProps {
  tone?: keyof typeof s.tone;
}

/** The product's signature dot. Decorative: its parent carries the meaning in its accessible name. */
export function SignalDot({ tone = "red" }: SignalDotProps) {
  return <span className={`${s.base} ${s.tone[tone]}`} aria-hidden="true" data-tone={tone} />;
}
