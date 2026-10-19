/**
 * The one busy policy every control with a `busy` prop shares (Waits, PRF-08, D-199).
 *
 * The task tracker owns the timing; a control keeps no timer and no state of its own:
 * - `busy` turns true when the press is acknowledged (`ack`). Activation is suppressed at once, so a
 *   repeated press does nothing, and the control says `aria-busy`. Nothing new is drawn yet: the
 *   control's busy sign (a Spinner in place of its icon) is revealed by its style after its
 *   `cmp.*.busy.signDelay` token (`wait.signDelay`), so work that ends sooner shows nothing (`on`).
 * - Its words are `busyLabel` when the tracker gives them ("Publishing…", then "Publishing… 4 s").
 * - `done`: `busy` is false but words remain ("Published", for `wait.doneDuration`): no sign, not inert.
 * - A failure ends the task at once: `busy` false, no words, the control is back at rest.
 * Under reduced motion the timing is the same and the Spinner stands still (motion.spin).
 */
export type BusyPhase = "on" | "done";

export interface BusyInput {
  busy?: boolean | undefined;
  busyLabel?: string | undefined;
  /** The control's own name. */
  label: string;
  disabled?: boolean | undefined;
}

export interface Busy {
  /** `on` while busy (the sign shows after the delay), `done` while the tracker's done words show. */
  phase: BusyPhase | undefined;
  /** Activation is suppressed: busy or disabled. */
  inert: boolean;
  /** The accessible name and visible words. */
  name: string;
  attrs: { "aria-disabled"?: "true"; "data-busy"?: BusyPhase };
  /**
   * Sets `aria-busy` while busy. React Aria's buttons pass only global and data attributes through,
   * so an `aria-busy` prop never reached the DOM; the control hands this ref to its button instead.
   */
  ref: (el: Element | null) => void;
}

export function useBusy({ busy, busyLabel, label, disabled }: BusyInput): Busy {
  const phase: BusyPhase | undefined = busy ? "on" : busyLabel ? "done" : undefined;
  const inert = Boolean(busy || disabled);
  return {
    phase,
    inert,
    name: busyLabel || label,
    attrs: {
      ...(inert ? { "aria-disabled": "true" as const } : {}),
      ...(phase ? { "data-busy": phase } : {}),
    },
    ref: (el) => {
      if (busy) el?.setAttribute("aria-busy", "true");
      else el?.removeAttribute("aria-busy");
    },
  };
}
