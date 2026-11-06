import { useEffect, useRef, useState } from "react";
import { FieldError, Input, Label, Text, TextArea, TextField as AriaTextField } from "react-aria-components";
import { CommitFailure, CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./TextField.css.ts";

export interface TextFieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  description?: string;
  /** A compact inline prefix (for example W or H); label remains the accessible name. */
  prefix?: string;
  /** Numeric Arrow Up/Down increment; Shift multiplies it by ten. */
  step?: number;
  type?: "text" | "password" | "url";
  invalid?: boolean;
  /** What's wrong, shown below the field while it's invalid and read with it (its description). */
  error?: string;
  /** Read by screen readers, not shown. */
  labelHidden?: boolean;
  autoFocus?: boolean;
  /** Each new value moves focus into the field. */
  focusRequest?: number;
  /** 32 px tall beside 32 px buttons in a bar (the link editor); 40 px otherwise. */
  size?: keyof typeof s.size;
  width?: keyof typeof s.width;
  /** Several lines (the invite message, D-143): Enter starts a new line, and it grows from about six lines. */
  multiline?: boolean;
  /** A two-line prompt that grows to the token maximum; only the field scrolls beyond it. */
  compactMultiline?: boolean;
  /** Shown and focusable, but not editable: while what it holds is being sent (D-203). */
  readOnly?: boolean;
  /** Several lines that scroll past a set height instead of growing: the report Send feedback posts (D-203). */
  scrolls?: boolean;
  /** Needed before its form can go: announced as required; the form says what's missing (D-203). */
  required?: boolean;
  /**
   * The commit track (F2), for a field that saves on its own: pending (the commit border, locked, a spinner
   * in the trailing slot), confirmed (the tick), failed (the error icon, the value kept, `error` below with
   * Retry and Revert). Any value reserves the trailing slot, so nothing shifts when it changes.
   */
  commit?: CommitState;
  /** Standalone persisted values save on blur or Enter; typing remains an editable local draft. */
  commitOnBlur?: boolean;
  retryLabel?: string;
  revertLabel?: string;
  id?: string;
  onRetry?: () => void;
  onRevert?: () => void;
  onChange?: (payload: { value: string }) => void;
  /** Enter in the field, outside an IME composition. */
  onSubmit?: () => void;
}

/** A labelled single-line field. Secrets use type "password" and are never spell-checked or autofilled. */
export function TextField({ label, value, placeholder, description, prefix, step, type = "text", invalid, error, labelHidden, autoFocus, focusRequest, size = "l", width = "fill", multiline, compactMultiline, readOnly, scrolls, required, commit, commitOnBlur = false, retryLabel, revertLabel, id, onRetry, onRevert, onChange, onSubmit }: TextFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value ?? "");
  const displayedValue = commitOnBlur ? draft : value ?? "";
  const change = (next: string) => commitOnBlur ? setDraft(next) : onChange?.({ value: next });
  useEffect(() => setDraft(value ?? ""), [value]);
  const save = () => {
    if (commitOnBlur && commit !== "pending" && !readOnly && draft !== (value ?? "")) onChange?.({ value: draft });
  };
  useEffect(() => {
    if (focusRequest) (input.current ?? area.current)?.focus();
  }, [focusRequest]);
  return (
    <AriaTextField
      className={`${s.root} ${s.width[width]}`}
      value={displayedValue}
      onChange={change}
      onBlur={save}
      type={type}
      isInvalid={Boolean(invalid) || commit === "failed"}
      isReadOnly={Boolean(readOnly) || commit === "pending"}
      {...(commit ? { "data-commit": commit } : {})}
      isRequired={Boolean(required)}
      validationBehavior="aria"
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <Label className={labelHidden ? s.hidden : s.label}>{label}</Label>
      {multiline ? (
        <TextArea ref={area} rows={compactMultiline ? 2 : undefined} className={`${s.input} ${s.area}${scrolls ? ` ${s.scrolls}` : ""}${compactMultiline ? ` ${s.compactArea}` : ""}`} spellCheck={!scrolls} autoCorrect="off" {...(placeholder ? { placeholder } : {})} />
      ) : <div className={`${s.box}${prefix ? ` ${s.adornedBox} ${s.size[size]}` : ""}`}
        {...(prefix ? { "data-invalid": Boolean(invalid) || commit === "failed" ? "" : undefined } : {})}
        onClick={prefix ? () => input.current?.focus() : undefined}>
        {prefix ? <span className={s.prefix} aria-hidden="true">{prefix}</span> : null}
        <Input
        ref={input}
        className={prefix ? s.adornedInput : `${s.input} ${s.size[size]}`}
        {...(step ? { inputMode: "decimal" as const, role: "spinbutton", "aria-valuenow": Number.isFinite(Number(displayedValue)) && displayedValue !== "" ? Number(displayedValue) : undefined } : {})}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={type === "password" ? "off" : "on"}
        onKeyDown={(e) => {
          if (step && !readOnly && commit !== "pending" && !e.nativeEvent.isComposing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            const current = Number(displayedValue);
            if (Number.isFinite(current)) {
              e.preventDefault();
              e.stopPropagation();
              change(String(current + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
            }
            return;
          }
          if (e.key === "Escape" && commitOnBlur && draft !== (value ?? "")) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(value ?? "");
          }
          if (e.key === "Enter" && !e.nativeEvent.isComposing && commitOnBlur) {
            e.preventDefault();
            save();
            return;
          }
          if (e.key === "Enter" && !e.nativeEvent.isComposing && onSubmit && !readOnly) {
            e.preventDefault();
            onSubmit();
          }
        }}
        {...(placeholder ? { placeholder } : {})}
        {...(commit === "pending" ? { "aria-disabled": true, "aria-busy": true } : {})}
      />{commit ? <span className={s.slot}><CommitMark state={commit} /></span> : null}</div>}
      {description ? <Text slot="description" className={s.description}>{description}</Text> : null}
      {invalid && error && commit !== "failed" ? <FieldError className={s.error}>{error}</FieldError> : null}
      {commit === "failed" && error ? <CommitFailure message={error} retryLabel={retryLabel} revertLabel={revertLabel} onRetry={onRetry} onRevert={onRevert} /> : null}
    </AriaTextField>
  );
}
