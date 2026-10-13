import { globalStyle } from "@vanilla-extract/css";

export interface ScrollbarTokens {
  scrollbarSize: string;
  scrollbarInset: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  scrollbarTrack: string;
}

/**
 * The minimal scrollbar (D-73, UI-09) for a scrolling class: no arrow buttons, hidden at rest,
 * shown while scrolling or near its edge (see useAutoHideScrollbar). Only ::-webkit-scrollbar is
 * used: setting the standard scrollbar-width or scrollbar-color makes Chromium ignore these styles.
 * Callers keep `scrollbar-gutter: stable` on the scroller so nothing moves when it appears.
 */
export function minimalScrollbar(scroller: string, t: ScrollbarTokens): void {
  globalStyle(`${scroller}::-webkit-scrollbar`, { width: t.scrollbarSize, height: t.scrollbarSize, backgroundColor: t.scrollbarTrack });
  globalStyle(`${scroller}::-webkit-scrollbar-button`, { display: "none", width: 0, height: 0 });
  globalStyle(`${scroller}::-webkit-scrollbar-track`, { backgroundColor: t.scrollbarTrack });
  globalStyle(`${scroller}::-webkit-scrollbar-corner`, { backgroundColor: t.scrollbarTrack });
  globalStyle(`${scroller}::-webkit-scrollbar-thumb`, {
    backgroundColor: t.scrollbarTrack,
    borderRadius: t.scrollbarSize,
    borderStyle: "solid",
    borderWidth: t.scrollbarInset,
    borderColor: t.scrollbarTrack,
    backgroundClip: "padding-box",
  });
  globalStyle(`${scroller}[data-scrolling]::-webkit-scrollbar-thumb, ${scroller}[data-scrollbar-hover]::-webkit-scrollbar-thumb`, { backgroundColor: t.scrollbarThumb });
  globalStyle(`${scroller}[data-scrollbar-hover]::-webkit-scrollbar-thumb:hover, ${scroller}::-webkit-scrollbar-thumb:active`, { backgroundColor: t.scrollbarThumbHover });
}
