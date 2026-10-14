import { Label, Slider as AriaSlider, SliderOutput, SliderThumb, SliderTrack } from "react-aria-components";
import * as s from "./Slider.css.ts";

export interface SliderProps {
  label: string;
  value?: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown ("60 characters"); the number itself otherwise. */
  valueText?: string;
  /** How the value is spoken: a number, or a percentage of 1. */
  format?: "number" | "percent";
  id?: string;
  onChange?: (payload: { value: number }) => void;
}

const fillVar = s.fillWidth.replace(/^var\((.*)\)$/, "$1");

/** A slider (ARIA slider pattern): arrow keys step, Page Up and Down take bigger steps, Home and End go to the ends. Changes apply as it moves. */
export function Slider({ label, value, min, max, step, valueText, format = "number", id, onChange }: SliderProps) {
  return (
    <AriaSlider
      className={s.root}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={format === "percent" ? { style: "percent" } : { maximumFractionDigits: 2 }}
      value={value ?? min}
      onChange={(v) => onChange?.({ value: Array.isArray(v) ? v[0]! : v })}
      {...(id ? { id } : {})}
    >
      <span className={s.row}>
        <Label className={s.label}>{label}</Label>
        <SliderOutput className={s.output}>{({ state }) => valueText ?? state.getThumbValueLabel(0)}</SliderOutput>
      </span>
      <SliderTrack className={s.track}>
        {({ state }) => (
          <>
            <span className={s.rail} />
            <span className={s.fill} ref={(el) => el?.style.setProperty(fillVar, `${state.getThumbPercent(0) * 100}%`)} />
            <SliderThumb className={s.thumb} />
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  );
}
