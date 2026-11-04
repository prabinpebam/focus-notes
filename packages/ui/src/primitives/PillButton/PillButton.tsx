import { Button } from "react-aria-components";
import { useContext } from "react";
import { FloatingContext } from "../../layouts/Layer/floating.ts";
import { controlLabel } from "../control.css.ts";
import { BorderProgress } from "../CommitMark/BorderProgress.tsx";
import type { CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./PillButton.css.ts";

export interface PillButtonProps {
  label: string;
  /** Compact feedback belongs on the pill's own border, with recovery outside it. */
  commit?: CommitState;
  id?: string;
  onPress?: () => void;
}

/** A small, quiet text button in a pill, for out-of-the-way actions like Sign in (UI-12). */
export function PillButton({ label, commit, id, onPress }: PillButtonProps) {
  const floating = useContext(FloatingContext);
  return <Button className={`${s.pill} ${floating ? s.floating : ""}`} data-floating-control={floating ? "" : undefined} aria-busy={commit === "pending" || undefined} aria-disabled={commit === "pending" || undefined} {...(id ? { id } : {})} {...(onPress ? { onPress: () => { if (commit !== "pending") onPress(); } } : {})}><span className={controlLabel}>{label}</span>{commit ? <BorderProgress state={commit} /> : null}</Button>;
}
