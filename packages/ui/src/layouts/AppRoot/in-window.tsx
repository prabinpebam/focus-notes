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
let overlayElement: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** Set by AppRoot while it draws the window; null for a native window (the viewport is the window). */
export function setWindowElement(el: HTMLElement | null, frame = "", overlays: HTMLElement | null = null): void {
  if (windowElement === el && windowFrame === frame && overlayElement === overlays) return;
  windowElement = el;
  windowFrame = frame;
  overlayElement = overlays;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useOverlayContainers() {
  const overlays = useSyncExternalStore(subscribe, () => overlayElement, () => null);
  const window = useSyncExternalStore(subscribe, () => windowElement, () => null);
  return { overlays, window };
}

export function FullAppOverlay({ children }: { children?: ReactNode }) {
  const { overlays } = useOverlayContainers();
  return overlays ? createPortal(children, overlays) : <>{children}</>;
}

/** Renders its children inside the drawn window, with overlays they open portaled there too. */
export function InWindow({ children }: { children?: ReactNode }) {
  const el = useSyncExternalStore(subscribe, () => windowElement, () => null);
  if (!el) return <>{children}</>;
  return createPortal(<UNSAFE_PortalProvider getContainer={() => el}>{children}</UNSAFE_PortalProvider>, el);
}

const POPOVER_LAYER = { zIndex: undefined } as const;

/**
 * Where React Aria keeps a popover (a menu, Snap Layouts): its edge padding, measured from the page,
 * grown by the drawn window's shadow margin, so the popover stays that far inside the window
 * itself, never in the margin (D-111). (Its `boundaryElement` would mix the window's page and
 * container coordinates.) Natively, the page is the window: React Aria's own padding.
 *
 * It also keeps the popover on its layer token: React Aria writes `z-index: 100000` inline on every
 * popover, which outranks the layer order (a menu would cover its own items' tooltips). Every
 * popover spreads this, so clearing it here hands the stacking back to its class's `layer` token.
 */
export function useWindowBoundary(): { containerPadding?: number; style: { zIndex: undefined } } {
  const el = useSyncExternalStore(subscribe, () => windowElement, () => null);
  useSyncExternalStore(subscribe, () => windowFrame, () => "");
  if (!el) return { style: POPOVER_LAYER };
  const edge = parseFloat(getComputedStyle(el).getPropertyValue(popoverEdgeVar.replace(/^var\(|\)$/g, ""))) || 0;
  return { containerPadding: edge + Math.max(0, el.getBoundingClientRect().top), style: POPOVER_LAYER };
}
