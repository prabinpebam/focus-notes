import { Button } from "react-aria-components";
import * as s from "./PillButton.css.ts";

export interface PillButtonProps {
  label: string;
  id?: string;
  onPress?: () => void;
}

/** A small, quiet text button in a pill, for out-of-the-way actions like Sign in (UI-12). */
export function PillButton({ label, id, onPress }: PillButtonProps) {
  return <Button className={s.pill} {...(id ? { id } : {})} {...(onPress ? { onPress } : {})}>{label}</Button>;
}
