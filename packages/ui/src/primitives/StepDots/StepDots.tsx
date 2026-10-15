import * as s from "./StepDots.css.ts";

export interface StepDotsProps {
  current?: number;
  total?: number;
  /** Step 2 of 4. */
  label: string;
}

/** Where the setup is (D-142): a compact stepper, named as a whole. */
export function StepDots({ current = 1, total = 4, label }: StepDotsProps) {
  const n = Math.max(2, Math.min(8, Math.round(total)));
  const at = Math.max(1, Math.min(n, Math.round(current)));
  return (
    <span className={s.base} role="img" aria-label={label} data-step-dots={`${at}/${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`${s.dot} ${i + 1 < at ? s.done : i + 1 === at ? s.on : s.todo}`} />
      ))}
    </span>
  );
}
