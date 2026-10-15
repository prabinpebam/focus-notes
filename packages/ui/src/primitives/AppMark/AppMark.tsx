import { useId } from "react";
import * as s from "./AppMark.css.ts";

export interface AppMarkProps {
  size?: keyof typeof s.size;
  /** Only where the mark stands for the app on its own. Next to the app's name it stays hidden. */
  label?: string;
}

/**
 * The app icon, the same drawing as the desktop's (apps/desktop/scripts/icon.mjs, a 256 unit
 * square): a paper tile, a soft shadow, the frosted ring and the red dot. The same in every theme,
 * like the icon on the desktop (D-126).
 */
export function AppMark({ size = "l", label }: AppMarkProps) {
  const soft = `app-mark-soft-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 256 256" className={`${s.base} ${s.size[size]}`} data-app-mark="" focusable="false" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <defs>
        <filter id={soft} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <rect className={s.tile} x="10" y="10" width="236" height="236" rx="54" strokeWidth="4" />
      <circle className={s.shadow} cx="128" cy="134" r="86" filter={`url(#${soft})`} />
      <circle className={s.ring} cx="128" cy="128" r="82" strokeWidth="4" />
      <circle className={s.dot} cx="128" cy="128" r="32" />
    </svg>
  );
}
