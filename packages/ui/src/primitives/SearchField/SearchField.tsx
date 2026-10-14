import { useEffect, useRef } from "react";
import { Button, Input, SearchField as AriaSearchField } from "react-aria-components";
import type { KeyScope } from "../../data.ts";
import { resultItemId } from "../ResultList/ResultList.tsx";
import { Icon } from "../Icon/Icon.tsx";
import type { IconName } from "../../icon-names.ts";
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
  /** A mode shown before the text, such as Spotlight's All, Notes, or Commands. The label says it in words. */
  chip?: string;
  /** The ResultList this field drives (combobox pattern): its ID, and the active item's ID. */
  controls?: string;
  activeId?: string;
  /** The icon before the text: search by default; another for a field that isn't a search (Replace with). */
  icon?: IconName;
  /** 32 px tall in a bar of 32 px controls (the find bar); 40 px otherwise. */
  size?: keyof typeof s.size;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

/**
 * A search box (SearchField). Esc clears it when it has text; when it's empty, Esc passes on, so
 * the dialog or panel around it closes.
 */
export function SearchField({ label, value, placeholder, clearLabel, autoFocus, focusRequest, invalid, keyScope = "none", chip, controls, activeId, icon = "search", size = "l", id, onChange }: SearchFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);
  return (
    <AriaSearchField
      className={`${s.root} ${s.size[size]}`}
      data-key-scope={keyScope === "none" ? undefined : keyScope}
      isInvalid={Boolean(invalid)}
      aria-label={label}
      value={value ?? ""}
      onChange={(v) => onChange?.({ value: v })}
      {...(autoFocus ? { autoFocus } : {})}
      {...(id ? { id } : {})}
    >
      <span className={s.icon} aria-hidden="true"><Icon name={icon} /></span>
      {chip ? <span className={s.chip} aria-hidden="true">{chip}</span> : null}
      <Input
        className={s.input}
        ref={input}
        {...(placeholder ? { placeholder } : {})}
        {...(controls ? { role: "combobox", "aria-expanded": true, "aria-controls": controls, "aria-autocomplete": "list" as const, ...(activeId ? { "aria-activedescendant": resultItemId(controls, activeId) } : {}) } : {})}
      />
      {/* In a bar (the find bar), Esc clears it: no second × beside the bar's own close. */}
      {size === "l" ? <Button className={s.clear} aria-label={clearLabel}><Icon name="dismiss" /></Button> : null}
    </AriaSearchField>
  );
}
