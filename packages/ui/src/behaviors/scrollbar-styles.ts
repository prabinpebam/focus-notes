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
  // In Windows contrast themes the thumb never hides, so it's always findable (Foundations → Scrollbars).
  globalStyle(`${scroller}::-webkit-scrollbar-thumb`, { "@media": { "(forced-colors: active)": { backgroundColor: t.scrollbarThumb } } });
}

/**
 * Fading scroll edges (D-111): the content fades out over `scrollFade` at an edge with more to
 * scroll to, as `useFadingEdges` marks it, so text never ends at a hard cut under a header or a
 * footer. None in forced colors, where the system's colors draw every edge plainly.
 */
export function fadingEdges(scroller: string, t: { scrollFade: string }): void {
  const top = `linear-gradient(transparent 0, black ${t.scrollFade})`;
  const bottom = `linear-gradient(black calc(100% - ${t.scrollFade}), transparent 100%)`;
  const both = `linear-gradient(transparent 0, black ${t.scrollFade}, black calc(100% - ${t.scrollFade}), transparent 100%)`;
  globalStyle(`${scroller}[data-fade-top]`, { maskImage: top, WebkitMaskImage: top });
  globalStyle(`${scroller}[data-fade-bottom]`, { maskImage: bottom, WebkitMaskImage: bottom });
  globalStyle(`${scroller}[data-fade-top][data-fade-bottom]`, { maskImage: both, WebkitMaskImage: both });
  globalStyle(`${scroller}[data-fade-top], ${scroller}[data-fade-bottom]`, { "@media": { "(forced-colors: active)": { maskImage: "none", WebkitMaskImage: "none" } } });
}

/**
 * Fading scroll edges over an opaque background (the note, D-111): two sticky gradients in the
 * background's color at the top and bottom of the scroller, shown as `useFadingEdges` marks them.
 * The same look as `fadingEdges`, without masking the scroller: a mask over a long note makes every
 * keystroke repaint all of it (PRF-01). None in forced colors.
 */
export function fadingOverlay(scroller: string, t: { scrollFade: string; background: string; fadeDuration: string }): void {
  const edge = { content: '""', display: "block", position: "sticky", zIndex: 1, height: t.scrollFade, pointerEvents: "none", opacity: 0, transitionProperty: "opacity", transitionDuration: t.fadeDuration } as const;
  globalStyle(`${scroller}::before`, { ...edge, top: 0, marginBlockEnd: `calc(-1 * ${t.scrollFade})`, backgroundImage: `linear-gradient(${t.background}, transparent)` });
  globalStyle(`${scroller}::after`, { ...edge, bottom: 0, marginBlockStart: `calc(-1 * ${t.scrollFade})`, backgroundImage: `linear-gradient(transparent, ${t.background})` });
  globalStyle(`${scroller}[data-fade-top]::before, ${scroller}[data-fade-bottom]::after`, { opacity: 1 });
  globalStyle(`${scroller}::before, ${scroller}::after`, { "@media": { "(forced-colors: active)": { display: "none" } } });
}
