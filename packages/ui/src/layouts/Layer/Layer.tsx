import type { ReactNode } from "react";
import { FloatingContext, LayerContext } from "./floating.ts";
import * as s from "./Layer.css.ts";

export interface LayerProps {
  layer?: keyof typeof s.layer;
  position?: keyof typeof s.position;
  /** Puts the window's title bar band (the desktop's drag region, DSK-02) under the layer's content. */
  dragBand?: boolean;
  /** The landmark this layer forms for assistive technology. */
  landmark?: "none" | "banner" | "main" | "complementary" | "region";
  /** Accessible name, needed for the region landmark. */
  label?: string;
  id?: string;
  children?: ReactNode;
}

const ROLE = { none: undefined, banner: "banner", main: "main", complementary: "complementary", region: "region" } as const;

/** Puts content on a layer with the right order. Content in a layer may use frost. */
export function Layer({ layer = "panel", position = "center", dragBand, landmark = "none", label, id, children }: LayerProps) {
  return (
    <FloatingContext.Provider value={true}>
      <LayerContext.Provider value={layer}>
      <div id={id} className={`${s.base} ${s.layer[layer]} ${s.position[position]}`} role={ROLE[landmark]} aria-label={label}>
        {/* The band is the window's top 44 px, whatever the layer's height; the content above it is never dragged. */}
        {dragBand ? <div className={s.band} data-drag-band="" /> : null}
        <div className={s.content} data-no-drag="">{children}</div>
      </div>
      </LayerContext.Provider>
    </FloatingContext.Provider>
  );
}
