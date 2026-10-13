import { useContext, type ReactNode } from "react";
import { FloatingContext } from "../Layer/floating.ts";
import type { Space } from "../Stack/Stack.tsx";
import type { KeyScope } from "../../data.ts";
import * as s from "./Surface.css.ts";

export interface SurfaceProps {
  variant?: keyof typeof s.variant;
  shape?: keyof typeof s.shape;
  elevation?: keyof typeof s.elevation;
  padding?: Space;
  /** Keys registered for this scope work while focus is inside. */
  keyScope?: KeyScope;
  id?: string;
  children?: ReactNode;
}

/** The only way to get a background, border, radius, or shadow (DD-CMP-02). */
export function Surface({ variant = "raised", shape = "none", elevation = "0", padding = "none", keyScope = "none", id, children }: SurfaceProps) {
  const floating = useContext(FloatingContext);
  // Frost is only for things that float over text (Foundations → Surfaces); elsewhere it is solid.
  const v = variant === "frost" && !floating ? "raised" : variant;
  return (
    <div id={id} className={[s.base, s.variant[v], s.shape[shape], s.elevation[elevation], s.padding[padding]].join(" ")} data-variant={v} data-key-scope={keyScope === "none" ? undefined : keyScope}>
      {children}
    </div>
  );
}
