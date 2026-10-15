import { ICONS } from "../../icons.ts";
import * as s from "./VersionCompare.css.ts";

export interface VersionCompareProps {
  found: string;
  needed: string;
  foundLabel: string;
  neededLabel: string;
  label?: string;
  id?: string;
}

/** A version found → the version needed (D-142). */
export function VersionCompare({ found, needed, foundLabel, neededLabel, label, id }: VersionCompareProps) {
  const Arrow = ICONS.chevronRight;
  return (
    <div id={id} className={s.root} role="group" aria-label={label} data-version-compare="">
      <span className={`${s.pill} ${s.found}`}>{foundLabel} <span className={s.value} data-personal="">{found}</span></span>
      <Arrow className={s.arrow} aria-hidden="true" />
      <span className={`${s.pill} ${s.needed}`}>{neededLabel} <span className={s.value} data-personal="">{needed}</span></span>
    </div>
  );
}
