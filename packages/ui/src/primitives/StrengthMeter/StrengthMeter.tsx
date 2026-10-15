import * as s from "./StrengthMeter.css.ts";

export interface StrengthMeterProps {
  value?: number;
  label: string;
  valueText?: string;
  id?: string;
}

/** A passphrase's strength under its field (D-142). */
export function StrengthMeter({ value = 0, label, valueText, id }: StrengthMeterProps) {
  const v = Math.max(0, Math.min(4, Math.round(value)));
  const tone = v >= 4 ? "strong" : v === 3 ? "fair" : "weak";
  return (
    <div id={id} className={s.root} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={4} aria-valuenow={v} aria-valuetext={valueText} data-strength={v}>
      <span className={s.track} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={`${s.segment} ${i <= v ? s.fill[tone] : ""}`} />)}
      </span>
      {valueText ? <span className={`${s.text} ${s.ink[tone]}`} aria-hidden="true">{valueText}</span> : null}
    </div>
  );
}
