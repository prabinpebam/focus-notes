import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cornerClearance, pinnedSheet } from "../../behaviors/pinned-sheet.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import { FloatingContext, LayerContext } from "./floating.ts";
import * as s from "./Layer.css.ts";

export interface LayerProps {
  layer?: keyof typeof s.layer;
  position?: keyof typeof s.position;
  /** Puts the window's title bar band (the desktop's drag region, DSK-02) under the layer's content. */
  dragBand?: boolean;
  avoidPinned?: boolean;
  /** The landmark this layer forms for assistive technology. */
  landmark?: "none" | "banner" | "main" | "complementary" | "region";
  /** Accessible name, needed for the region landmark. */
  label?: string;
  id?: string;
  children?: ReactNode;
}

const ROLE = { none: undefined, banner: "banner", main: "main", complementary: "complementary", region: "region" } as const;

/** Puts content on a layer with the right order. Content in a layer may use frost. */
export function Layer({ layer = "panel", position = "center", dragBand, avoidPinned = false, landmark = "none", label, id, children }: LayerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !avoidPinned || position !== "bottomStart") return;
    const name = (v: string) => v.slice(4, -1);
    const measure = () => {
      const box = fixedBox(el);
      const gap = parseFloat(getComputedStyle(el).getPropertyValue(name(s.cornerGap))) || 0;
      const x = cornerClearance(pinnedSheet.get(), box.left, box.width, el.getBoundingClientRect().width, gap);
      el.style.setProperty(name(s.cornerLeft), `${x ?? gap}px`);
      if (x === undefined) el.dataset.pinnedOverflow = "";
      else delete el.dataset.pinnedOverflow;
    };
    measure();
    const off = pinnedSheet.subscribe(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { off(); ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [avoidPinned, position]);
  return (
    <FloatingContext.Provider value={true}>
      <LayerContext.Provider value={layer}>
      <div ref={ref} id={id} className={`${s.base} ${s.layer[layer]} ${s.position[position]}${avoidPinned ? ` ${s.avoidPinned}` : ""}`} role={ROLE[landmark]} aria-label={label}>
        {/* The band is the window's top 44 px, whatever the layer's height; the content above it is never dragged. */}
        {dragBand ? <div className={s.band} data-drag-band="" /> : null}
        <div className={s.content} data-no-drag="">{children}</div>
      </div>
      </LayerContext.Provider>
    </FloatingContext.Provider>
  );
}
