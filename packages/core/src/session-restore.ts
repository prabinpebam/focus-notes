/**
 * What a project's entry restores (D-420, refining D-397): the opened-files tabs in their order and the
 * active note, or an empty Untitled only when there's genuinely nothing to restore.
 */
export type SessionProbe = "present" | "missing" | "error";

export type SessionPlan =
  /** Reopen these tabs, in order, with `active` open and focused; `dropped` were missing and are left out quietly. */
  | { kind: "restore"; opened: string[]; active: string; dropped: number }
  /** Nothing to restore: no saved session, or every note in it is gone (D-397's empty Untitled). */
  | { kind: "untitled"; gone: boolean; dropped: number }
  /** A note in the session couldn't be read: an error with a recovery, never a guess. */
  | { kind: "error" };

export function planSessionRestore(
  saved: { opened: readonly string[]; active?: string },
  probe: (path: string) => SessionProbe | undefined,
): SessionPlan {
  const tabs = [...new Set(saved.opened)];
  const candidates = saved.active && !tabs.includes(saved.active) ? [...tabs, saved.active] : tabs;
  if (!candidates.length) return { kind: "untitled", gone: false, dropped: 0 };
  const states = candidates.map((path) => probe(path));
  if (states.some((state) => state === "error" || state === undefined)) return { kind: "error" };
  const present = (path: string) => states[candidates.indexOf(path)] === "present";
  const opened = tabs.filter(present);
  const dropped = tabs.length - opened.length;
  if (saved.active && present(saved.active)) return { kind: "restore", opened, active: saved.active, dropped };
  if (!opened.length) return { kind: "untitled", gone: true, dropped };
  // The active note went: the tab that followed it takes its place, or the one before.
  const at = saved.active ? tabs.indexOf(saved.active) : -1;
  const after = at < 0 ? undefined : tabs.slice(at + 1).find(present);
  const before = at < 0 ? undefined : tabs.slice(0, at).reverse().find(present);
  return { kind: "restore", opened, active: after ?? before ?? opened[0]!, dropped };
}
