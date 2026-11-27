import type { CommitState } from "./CommitMark.tsx";
import * as s from "./CommitMark.css.ts";

/** Decorative border feedback for a positioned, rounded control without room for an inline mark. `warning`: the arc in the warning tone (D-436). */
export function BorderProgress({ state = "rest", id, tone }: { state?: CommitState; id?: string; tone?: "warning" }) {
  return state === "rest" ? null : <span id={id} className={s.border} data-border-progress={state} data-tone={tone} aria-hidden="true" />;
}
