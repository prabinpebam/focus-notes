interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a side sheet floats (Foundations → Visual quality, D-111): `base` from the window's top,
 * side, and bottom, so it's vertically centered, never covering the trigger or the window's own
 * controls (`bands`). A band it can end before, staying at least `minWidth` wide (the trigger, in a
 * narrow window), makes it narrower; one it can't (the window's controls in its corner) makes the
 * inset as much bigger as clears it, still the same on all three sides. All in viewport pixels.
 */
export function placeSheet(win: Box, bands: Box[], side: "start" | "end", m: { base: number; clearance: number; width: number; minWidth: number }): { inset: number; width: number } {
  const room = (inset: number) => Math.max(0, win.right - win.left - 2 * inset);
  let inset = m.base;
  let width = Math.min(m.width, room(inset));
  for (let pass = 0; pass < 8; pass++) {
    const left = side === "start" ? win.left + inset : win.right - inset - width;
    const right = left + width;
    const hit = bands.find((b) => b.right > left && b.left < right && b.bottom > win.top + inset && b.top < win.bottom - inset);
    if (!hit) break;
    const narrowed = side === "start" ? hit.left - m.clearance - left : right - (hit.right + m.clearance);
    if (narrowed >= m.minWidth) width = Math.floor(narrowed);
    else {
      inset = Math.ceil(hit.bottom - win.top + m.clearance);
      width = Math.min(m.width, room(inset));
    }
  }
  return { inset, width };
}
