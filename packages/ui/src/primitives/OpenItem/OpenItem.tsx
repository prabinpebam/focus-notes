import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import { IconButton } from "../IconButton/IconButton.tsx";
import { ProjectMark } from "../ProjectMark/ProjectMark.tsx";
import type { ProjectAccent, ProjectLogo } from "../ProjectMark/presets.ts";
import * as s from "./OpenItem.css.ts";

export interface OpenItemProps {
  kind?: "project" | "file";
  title: string;
  /** A file: where it is (its project and folder). */
  detail?: string;
  /** A project: its folder, one line, ellipsized in the middle; pressing it shows the folder (reveal). */
  path?: string;
  /** The path's action: Show in File Explorer, or Show in Finder. */
  pathLabel?: string;
  logo?: ProjectLogo | "upload" | "none";
  src?: string;
  initials?: string;
  accent?: ProjectAccent | "app";
  /** A file's type icon. */
  icon?: IconName;
  pinned?: boolean;
  pinLabel?: string;
  unpinLabel?: string;
  /** The open action's accessible name, when the title alone doesn't say it. */
  label?: string;
  id?: string;
  onPress?: () => void;
  onPin?: () => void;
  onReveal?: () => void;
}

const SEP = /[\\/](?=[^\\/]+[\\/]?$)/;

/** A project card or a recent file row in Open (owner, 4 November): the whole item opens it; pin shows top right on hover. */
export function OpenItem({ kind = "file", title, detail, path, pathLabel, logo = "none", src, initials, accent = "app", icon = "documentText", pinned = false, pinLabel, unpinLabel, label, id, onPress, onPin, onReveal }: OpenItemProps) {
  const Glyph = ICONS[icon];
  const PathIcon = ICONS.folder;
  const cut = path ? path.search(SEP) : -1;
  const visual = kind === "project"
    ? <ProjectMark logo={logo} {...(src ? { src } : {})} {...(initials ? { initials } : {})} accent={accent} plate={logo === "upload" ? "neutral" : "tint"} size="l" />
    : <span className={s.fileTile} aria-hidden="true"><Glyph className={s.fileIcon} /></span>;
  const pinText = pinned ? (unpinLabel ?? pinLabel) : pinLabel;
  return (
    <div id={id} className={`${s.base} ${s.kind[kind]}`} data-open-item={kind} data-pinned={pinned ? "" : undefined} data-project-accent={kind === "project" && accent !== "app" ? accent : undefined}>
      {visual}
      <span className={s.text}>
        <button type="button" className={s.hit} aria-label={label} onClick={onPress}>
          <span className={`${s.title} ${s.titleSize[kind]}`} data-personal="">{title}</span>
        </button>
        {path ? (
          <button type="button" className={s.path} title={path} aria-label={pathLabel ? `${pathLabel}: ${path}` : path} onClick={onReveal}>
            <PathIcon className={s.pathIcon} aria-hidden="true" />
            {cut > 0
              ? <span className={s.pathWrap} data-personal=""><span className={s.pathHead}>{path.slice(0, cut)}</span><span className={s.pathTail}>{path.slice(cut)}</span></span>
              : <span className={s.pathHead} data-personal="">{path}</span>}
          </button>
        ) : detail ? <span className={s.detail} data-personal="">{detail}</span> : null}
      </span>
      {pinText ? (
        <span className={s.pin} data-pinned={pinned ? "" : undefined}>
          <IconButton icon={pinned ? "pinFilled" : "pin"} label={pinText} tone="muted" {...(onPin ? { onPress: onPin } : {})} />
        </span>
      ) : null}
    </div>
  );
}
