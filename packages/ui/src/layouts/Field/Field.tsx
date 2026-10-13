import { useId, type ReactNode } from "react";
import * as s from "./Field.css.ts";

export interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  id?: string;
  children?: ReactNode;
}

/** Label, control, description, and error in one consistent arrangement, named as a group. */
export function Field({ label, description, error, id, children }: FieldProps) {
  const base = useId();
  const described = [description ? `${base}-d` : "", error ? `${base}-e` : ""].filter(Boolean).join(" ");
  return (
    <div id={id} role="group" aria-labelledby={`${base}-l`} aria-describedby={described || undefined} className={s.root}>
      <span id={`${base}-l`} className={s.label} dir="auto">{label}</span>
      {children}
      {description ? <span id={`${base}-d`} className={s.description} dir="auto">{description}</span> : null}
      {error ? <span id={`${base}-e`} className={s.error} role="alert" dir="auto">{error}</span> : null}
    </div>
  );
}
