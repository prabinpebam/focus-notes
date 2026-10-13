import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./Icon.css.ts";

export interface IconProps {
  name: IconName;
  size?: "s" | "m" | "l";
  /** Only for an icon that carries meaning on its own. Decorative icons stay hidden. */
  label?: string;
}

export function Icon({ name, size = "m", label }: IconProps) {
  const Glyph = ICONS[name];
  return label ? (
    <Glyph className={`${s.base} ${s.size[size]}`} role="img" aria-label={label} />
  ) : (
    <Glyph className={`${s.base} ${s.size[size]}`} aria-hidden="true" />
  );
}
