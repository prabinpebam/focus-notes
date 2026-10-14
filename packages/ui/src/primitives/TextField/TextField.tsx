import { useEffect, useRef } from "react";
import { Input, Label, Text, TextField as AriaTextField } from "react-aria-components";
import * as s from "./TextField.css.ts";

export interface TextFieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  description?: string;
  type?: "text" | "password" | "url";
  invalid?: boolean;
  /** Read by screen readers, not shown. */
  labelHidden?: boolean;
  autoFocus?: boolean;
  /** Each new value moves focus into the field. */
  focusRequest?: number;
  /** 32 px tall beside 32 px buttons in a bar (the link editor); 40 px otherwise. */
  size?: keyof typeof s.size;
  id?: string;
  onChange?: (payload: { value: string }) => void;
  /** Enter in the field, outside an IME composition. */
  onSubmit?: () => void;
}

/** A labelled single-line field. Secrets use type "password" and are never spell-checked or autofilled. */
export function TextField({ label, value, placeholder, description, type = "text", invalid, labelHidden, autoFocus, focusRequest, size = "l", id, onChange, onSubmit }: TextFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (focusRequest) input.current?.focus();
  }, [focusRequest]);
  return (
    <AriaTextField
      className={s.root}
      value={value ?? ""}
      onChange={(v) => onChange?.({ value: v })}
      type={type}
      isInvalid={Boolean(invalid)}
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <Label className={labelHidden ? s.hidden : s.label}>{label}</Label>
      <Input
        ref={input}
        className={`${s.input} ${s.size[size]}`}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={type === "password" ? "off" : "on"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        {...(placeholder ? { placeholder } : {})}
      />
      {description ? <Text slot="description" className={s.description}>{description}</Text> : null}
    </AriaTextField>
  );
}
