import { Button, Input, SearchField as AriaSearchField } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import * as s from "./SearchField.css.ts";

export interface SearchFieldProps {
  /** The accessible name. */
  label: string;
  value?: string;
  placeholder?: string;
  clearLabel: string;
  autoFocus?: boolean;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/**
 * A search box (SearchField). Esc clears it when it has text; when it's empty, Esc passes on, so
 * the dialog or panel around it closes.
 */
export function SearchField({ label, value, placeholder, clearLabel, autoFocus, id, onChange }: SearchFieldProps) {
  return (
    <AriaSearchField
      className={s.root}
      aria-label={label}
      value={value ?? ""}
      onChange={(v) => onChange?.({ value: v })}
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <span className={s.icon} aria-hidden="true"><Icon name="search" /></span>
      <Input className={s.input} {...(placeholder ? { placeholder } : {})} />
      <Button className={s.clear} aria-label={clearLabel}><Icon name="dismiss" /></Button>
    </AriaSearchField>
  );
}
