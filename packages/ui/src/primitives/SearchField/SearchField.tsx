import { useEffect, useRef } from "react";
import { Button, Input, SearchField as AriaSearchField } from "react-aria-components";
import type { KeyScope } from "../../data.ts";
import { Icon } from "../Icon/Icon.tsx";
import * as s from "./SearchField.css.ts";

export interface SearchFieldProps {
  /** The accessible name. */
  label: string;
  value?: string;
  placeholder?: string;
  clearLabel: string;
  autoFocus?: boolean;
  /** Each new value moves focus into the field and selects its text. */
  focusRequest?: number;
  /** Shows the field as in error, for example a regular expression that doesn't compile. */
  invalid?: boolean;
  keyScope?: KeyScope;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/**
 * A search box (SearchField). Esc clears it when it has text; when it's empty, Esc passes on, so
 * the dialog or panel around it closes.
 */
export function SearchField({ label, value, placeholder, clearLabel, autoFocus, focusRequest, invalid, keyScope = "none", id, onChange }: SearchFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);
  return (
    <AriaSearchField
      className={s.root}
      data-key-scope={keyScope === "none" ? undefined : keyScope}
      isInvalid={Boolean(invalid)}
      aria-label={label}
      value={value ?? ""}
      onChange={(v) => onChange?.({ value: v })}
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <span className={s.icon} aria-hidden="true"><Icon name="search" /></span>
      <Input className={s.input} ref={input} {...(placeholder ? { placeholder } : {})} />
      <Button className={s.clear} aria-label={clearLabel}><Icon name="dismiss" /></Button>
    </AriaSearchField>
  );
}
