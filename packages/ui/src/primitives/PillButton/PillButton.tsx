import { Button } from "react-aria-components";
import { useContext } from "react";
import { FloatingContext } from "../../layouts/Layer/floating.ts";
import { controlLabel } from "../control.css.ts";
import * as s from "./PillButton.css.ts";

export interface PillButtonProps {
  label: string;
  id?: string;
  onPress?: () => void;
}

/** A small, quiet text button in a pill, for out-of-the-way actions like Sign in (UI-12). */
export function PillButton({ label, id, onPress }: PillButtonProps) {
  const floating = useContext(FloatingContext);
  return <Button className={`${s.pill} ${floating ? s.floating : ""}`} data-floating-control={floating ? "" : undefined} {...(id ? { id } : {})} {...(onPress ? { onPress } : {})}><span className={controlLabel}>{label}</span></Button>;
}
