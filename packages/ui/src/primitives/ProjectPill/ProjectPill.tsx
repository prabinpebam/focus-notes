import { ProjectMark } from "../ProjectMark/ProjectMark.tsx";
import type { ProjectAccent, ProjectLogo } from "../ProjectMark/presets.ts";
import * as s from "./ProjectPill.css.ts";

export interface ProjectPillProps {
  /** The project's name. */
  name: string;
  logo?: ProjectLogo | "upload" | "none";
  src?: string;
  accent?: ProjectAccent | "app";
  /** Its accessible name when it can be pressed. */
  label?: string;
  onPress?: () => void;
}

/** A window's project, named and badged at the end of its status row (D-317). */
export function ProjectPill({ name, logo = "none", src, accent = "app", label, onPress }: ProjectPillProps) {
  const inner = (
    <>
      {logo !== "none" ? <ProjectMark logo={logo} {...(src ? { src } : {})} accent={accent} plate="bare" size="s" /> : null}
      <span className={s.name}>{name}</span>
    </>
  );
  const accentAttr = accent === "app" ? undefined : accent;
  return onPress
    ? <button type="button" className={`${s.base} ${s.pressable}`} data-project-accent={accentAttr} aria-label={label ?? name} title={label ?? name} onClick={onPress}>{inner}</button>
    : <span className={s.base} data-project-accent={accentAttr} title={name}>{inner}</span>;
}
