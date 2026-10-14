/**
 * Where fixed layers are placed. In the app-built window (D-14) the window is drawn inside the page,
 * inset by its shadow margin, and it's the containing block for fixed content; elsewhere it's the
 * viewport. Geometry measured in viewport coordinates (the editor's ranges) is moved into it.
 */
export interface FixedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function fixedBox(near?: Element | null): FixedBox {
  if (typeof document !== "undefined" && document.documentElement.dataset.windowFrame) {
    const root = near?.closest("[data-app-root]") ?? document.querySelector("[data-app-root]");
    if (root) {
      const r = root.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return { left: 0, top: 0, width: innerWidth, height: innerHeight };
}
