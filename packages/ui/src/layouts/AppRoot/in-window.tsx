import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UNSAFE_PortalProvider } from "react-aria";
import { popoverEdgeVar } from "./AppRoot.css.ts";

/**
 * The window as drawn (D-14): on Windows and Linux the app root is the window, inset in its shadow
 * margin. Views hosted beside the main one (Settings, the theme manager) render inside it, so their
 * scrims, sheets, and popovers are placed and clipped in the window, never in the margin (D-111).
 */
let windowElement: HTMLElement | null = null;
let windowFrame = "";
const listeners = new Set<() => void>();

/** Set by AppRoot while it draws the window; null for a native window (the viewport is the window). */
export function setWindowElement(el: HTMLElement | null, frame = ""): void {
  if (windowElement === el && windowFrame === frame) return;
  windowElement = el;
  windowFrame = frame;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Renders its children inside the drawn window, with overlays they open portaled there too. */
export function InWindow({ children }: { children?: ReactNode }) {
  const el = useSyncExternalStore(subscribe, () => windowElement, () => null);
  if (!el) return <>{children}</>;
  return createPortal(<UNSAFE_PortalProvider getContainer={() => el}>{children}</UNSAFE_PortalProvider>, el);
}

/**
 * Where React Aria keeps a popover (a menu, Snap Layouts): its edge padding, measured from the page,
 * grown by the drawn window's shadow margin, so the popover stays that far inside the window
 * itself, never in the margin (D-111). (Its `boundaryElement` would mix the window's page and
 * container coordinates.) Natively, the page is the window: React Aria's own padding.
 */
export function useWindowBoundary(): { containerPadding?: number } {
  const el = useSyncExternalStore(subscribe, () => windowElement, () => null);
  useSyncExternalStore(subscribe, () => windowFrame, () => "");
  if (!el) return {};
  const edge = parseFloat(getComputedStyle(el).getPropertyValue(popoverEdgeVar.replace(/^var\(|\)$/g, ""))) || 0;
  return { containerPadding: edge + Math.max(0, el.getBoundingClientRect().top) };
}
