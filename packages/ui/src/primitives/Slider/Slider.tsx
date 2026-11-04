import { useEffect, useRef, useState } from "react";
import { waits } from "@focus-notes/tokens";
import { Label, Slider as AriaSlider, SliderOutput, SliderThumb, SliderTrack } from "react-aria-components";
import { CommitMark, CommitFailure, type CommitState } from "../CommitMark/CommitMark.tsx";
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
  commit?: CommitState;
  error?: string;
  retryLabel?: string;
  revertLabel?: string;
  onRetry?: () => void;
  onRevert?: () => void;
  /** Transient preview only; persistence waits for release, blur or a keyboard pause. */
  onPreview?: (payload: { value: number }) => void;
  onChange?: (payload: { value: number }) => void;
}

const fillVar = s.fillWidth.replace(/^var\((.*)\)$/, "$1");

/** A slider (ARIA slider pattern): arrow keys step, Page Up and Down take bigger steps, Home and End go to the ends. Changes apply as it moves. */
export function Slider({ label, value, min, max, step, valueText, format = "number", id, commit, error, retryLabel, revertLabel, onRetry, onRevert, onPreview, onChange }: SliderProps) {
  const [draft, setDraft] = useState(value ?? min);
  const keyboard = useRef(false);
  const queued = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setDraft(value ?? min), [value, min]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flush = () => {
    clearTimeout(timer.current);
    const next = queued.current;
    queued.current = undefined;
    if (next !== undefined && commit !== "pending" && next !== value) onChange?.({ value: next });
  };
  const change = (v: number | number[]) => {
    if (commit === "pending") return;
    const next = Array.isArray(v) ? v[0]! : v;
    if (!commit) return onChange?.({ value: next });
    setDraft(next);
    queued.current = next;
    onPreview?.({ value: next });
    clearTimeout(timer.current);
    if (keyboard.current) timer.current = setTimeout(flush, waits.commitPause);
  };
  return (
    <div className={s.root} data-commit={commit} aria-busy={commit === "pending" || undefined}
      aria-disabled={commit === "pending" || undefined}
      onKeyDownCapture={(e) => {
        if (commit === "pending" && e.key !== "Tab") { e.preventDefault(); e.stopPropagation(); return; }
        keyboard.current = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key);
      }}
      onPointerDownCapture={(e) => {
        if (commit === "pending") { e.preventDefault(); e.stopPropagation(); return; }
        keyboard.current = false;
      }}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) flush(); }}
    >
    <AriaSlider
      className={s.root}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={format === "percent" ? { style: "percent" } : { maximumFractionDigits: 2 }}
      value={commit ? draft : value ?? min}
      onChange={change}
      onChangeEnd={() => { if (commit && !keyboard.current) flush(); }}
      {...(id ? { id } : {})}
    >
      <span className={s.row}>
        <Label className={s.label}>{label}</Label>
        <span className={s.result}><SliderOutput className={s.output}>{({ state }) => valueText ?? state.getThumbValueLabel(0)}</SliderOutput>{commit ? <CommitMark state={commit} /> : null}</span>
      </span>
      <SliderTrack className={s.track}>
        {({ state }) => (
          <>
            <span className={s.rail} data-slider-rail="" />
            <span className={s.fill} data-slider-fill="" ref={(el) => el?.style.setProperty(fillVar, `${state.getThumbPercent(0) * 100}%`)} />
            <SliderThumb className={s.thumb} data-slider-thumb="" />
          </>
        )}
      </SliderTrack>
    </AriaSlider>
    {commit === "failed" && error ? <CommitFailure message={error} retryLabel={retryLabel} revertLabel={revertLabel} onRetry={onRetry} onRevert={onRevert} /> : null}
    </div>
  );
}
