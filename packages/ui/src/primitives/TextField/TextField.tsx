import { useEffect, useRef } from "react";
import { FieldError, Input, Label, Text, TextArea, TextField as AriaTextField } from "react-aria-components";
import * as s from "./TextField.css.ts";

export interface TextFieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  description?: string;
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
  /** Several lines (the invite message, D-143): Enter starts a new line, and it grows from about six lines. */
  multiline?: boolean;
  /** Shown and focusable, but not editable: while what it holds is being sent (D-203). */
  readOnly?: boolean;
  id?: string;
  onChange?: (payload: { value: string }) => void;
  /** Enter in the field, outside an IME composition. */
  onSubmit?: () => void;
}

/** A labelled single-line field. Secrets use type "password" and are never spell-checked or autofilled. */
export function TextField({ label, value, placeholder, description, type = "text", invalid, error, labelHidden, autoFocus, focusRequest, size = "l", multiline, readOnly, id, onChange, onSubmit }: TextFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (focusRequest) (input.current ?? area.current)?.focus();
  }, [focusRequest]);
  return (
    <AriaTextField
      className={s.root}
      value={value ?? ""}
      onChange={(v) => onChange?.({ value: v })}
      type={type}
      isInvalid={Boolean(invalid)}
      isReadOnly={Boolean(readOnly)}
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <Label className={labelHidden ? s.hidden : s.label}>{label}</Label>
      {multiline ? (
        <TextArea ref={area} className={`${s.input} ${s.area}`} spellCheck autoCorrect="off" {...(placeholder ? { placeholder } : {})} />
      ) : <Input
        ref={input}
        className={`${s.input} ${s.size[size]}`}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={type === "password" ? "off" : "on"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && onSubmit && !readOnly) {
            e.preventDefault();
            onSubmit();
          }
        }}
        {...(placeholder ? { placeholder } : {})}
      />}
      {description ? <Text slot="description" className={s.description}>{description}</Text> : null}
      {invalid && error ? <FieldError className={s.error}>{error}</FieldError> : null}
    </AriaTextField>
  );
}
