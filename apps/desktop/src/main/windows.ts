/**
 * Several windows, one note each (DSK-06, D-179). The state file (state.json) is one for every
 * window; each window saves the whole of it. A window opened for a note never changes which note the
 * app reopens at launch: what it saves keeps the file's own `lastNotePath`.
 */
export function stateFromWindow(incoming: Record<string, unknown>, onDisk: Record<string, unknown> | undefined, secondary: boolean): Record<string, unknown> {
  if (!secondary) return incoming;
  const { lastNotePath: _, ...rest } = incoming;
  return typeof onDisk?.lastNotePath === "string" ? { ...rest, lastNotePath: onDisk.lastNotePath } : rest;
}
