import { ProjectMark } from "../ProjectMark/ProjectMark.tsx";
import type { ProjectAccent, ProjectLogo } from "../ProjectMark/presets.ts";
import { Icon } from "../Icon/Icon.tsx";
import type { IconName } from "../../icon-names.ts";
import { controlLabel } from "../control.css.ts";
import * as s from "./ProjectPill.css.ts";

export interface ProjectPillProps {
  /** The project's name, or (with `path`) a folder's location. */
  name: string;
  logo?: ProjectLogo | "upload" | "none";
  src?: string;
  accent?: ProjectAccent | "app";
  /** Outside any project: an icon instead of a logo, on a neutral fill (Local notes' drive). */
  icon?: IconName;
  /** The name is a folder path: ellipsized in the middle, keeping its start and the containing folder. */
  path?: boolean;
  /** Its accessible name when it can be pressed. */
  label?: string;
  onPress?: () => void;
}

const SEP = /[\\/](?=[^\\/]+[\\/]?$)/;

/** A window's project, named and badged at the end of its status row (D-317); outside a project, where its file lives (D-333). */
export function ProjectPill({ name, logo = "none", src, accent = "app", icon, path = false, label, onPress }: ProjectPillProps) {
  const cut = path ? name.search(SEP) : -1;
  const text = cut > 0
    ? <span className={`${s.name} ${s.pathWrap}`}><span className={`${controlLabel} ${s.pathHead}`}>{name.slice(0, cut)}</span><span className={`${controlLabel} ${s.pathTail}`}>{name.slice(cut)}</span></span>
    : <span className={`${controlLabel} ${s.name}`}>{name}</span>;
  const inner = (
    <>
      {icon ? <span className={s.icon}><Icon name={icon} size="s" /></span>
        : logo !== "none" ? <ProjectMark logo={logo} {...(src ? { src } : {})} accent={accent} plate="bare" size="inline" /> : null}
      {text}
    </>
  );
  const accentAttr = icon || accent === "app" ? undefined : accent;
  const cls = `${s.base}${icon ? ` ${s.neutral}` : ""}${!icon && logo === "none" ? ` ${s.textOnly}` : ""}`;
  const title = path ? name : (label ?? name);
  return onPress
    ? <button type="button" className={`${cls} ${s.pressable}`} data-project-pill="" data-project-accent={accentAttr} aria-label={label ?? name} title={title} onClick={onPress}>{inner}</button>
    : <span className={cls} data-project-pill="" data-project-accent={accentAttr} title={title}>{inner}</span>;
}
