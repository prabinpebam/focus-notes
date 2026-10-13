import type { ReactNode } from "react";
import { FloatingContext } from "./floating.ts";
import * as s from "./Layer.css.ts";

export interface LayerProps {
  layer?: keyof typeof s.layer;
  position?: keyof typeof s.position;
  /** Marks the layer as part of the window's drag band (desktop title bar). */
  dragBand?: boolean;
  /** The landmark this layer forms for assistive technology. */
  landmark?: "none" | "banner" | "complementary" | "region";
  /** Accessible name, needed for the region landmark. */
  label?: string;
  id?: string;
  children?: ReactNode;
}

const ROLE = { none: undefined, banner: "banner", complementary: "complementary", region: "region" } as const;

/** Puts content on a layer with the right order. Content in a layer may use frost. */
export function Layer({ layer = "panel", position = "center", dragBand, landmark = "none", label, id, children }: LayerProps) {
  return (
    <FloatingContext.Provider value={true}>
      <div id={id} className={`${s.base} ${s.layer[layer]} ${s.position[position]}`} data-drag-band={dragBand ? "" : undefined} role={ROLE[landmark]} aria-label={label}>
        <div className={s.content} data-no-drag="">{children}</div>
      </div>
    </FloatingContext.Provider>
  );
}
