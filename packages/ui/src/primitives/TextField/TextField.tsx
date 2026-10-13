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
  autoFocus?: boolean;
  /** Each new value moves focus into the field. */
  focusRequest?: number;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/** A labelled single-line field. Secrets use type "password" and are never spell-checked or autofilled. */
export function TextField({ label, value, placeholder, description, type = "text", invalid, autoFocus, focusRequest, id, onChange }: TextFieldProps) {
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
      <Label className={s.label}>{label}</Label>
      <Input
        ref={input}
        className={s.input}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete={type === "password" ? "off" : "on"}
        {...(placeholder ? { placeholder } : {})}
      />
      {description ? <Text slot="description" className={s.description}>{description}</Text> : null}
    </AriaTextField>
  );
}
