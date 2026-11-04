import type { CommitState } from "./CommitMark.tsx";
import * as s from "./CommitMark.css.ts";

/** Decorative border feedback for a positioned, rounded control without room for an inline mark. */
export function BorderProgress({ state = "rest", id }: { state?: CommitState; id?: string }) {
  return state === "rest" ? null : <span id={id} className={s.border} data-border-progress={state} aria-hidden="true" />;
}
