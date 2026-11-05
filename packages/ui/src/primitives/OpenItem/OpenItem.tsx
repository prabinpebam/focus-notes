import { ICONS } from "../../icons.ts";
import type { IconName } from "../../icon-names.ts";
import type { CommitState } from "../CommitMark/CommitMark.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { ProjectMark } from "../ProjectMark/ProjectMark.tsx";
import type { ProjectAccent, ProjectLogo } from "../ProjectMark/presets.ts";
import { Skeleton } from "../Skeleton/Skeleton.tsx";
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
  /** Pin or unpin saving (ui-states): the pin's own border is the pending arc, then a success or danger outline. */
  pinCommit?: CommitState;
  /** The open action's accessible name, when the title alone doesn't say it. */
  label?: string;
  /** A project linked to GitHub: its owner/repo, from the folder's own Git remote (D-346). Empty: no GitHub line. */
  repo?: string;
  /** The GitHub line's accessible name: Open owner/repo on GitHub. */
  repoLabel?: string;
  /** A project's size, files, media files and folders, on one line (D-346). Empty: no line. */
  stats?: string;
  /** The size line is still being counted: a placeholder line stands in its place. */
  statsBusy?: boolean;
  id?: string;
  onPress?: () => void;
  onPin?: () => void;
  onReveal?: () => void;
  onOpenRepo?: () => void;
}

const SEP = /[\\/](?=[^\\/]+[\\/]?$)/;

/**
 * A project card or a recent file row in Open (owner, 4 November): the whole item opens it; pin shows top right on hover.
 * A project may add its size line and its GitHub line under the path (D-346), quiet like the path, never enclosed; the
 * size line sits between the two links so their targets never overlap (spacing SP-6).
 */
export function OpenItem({ kind = "file", title, detail, path, pathLabel, logo = "none", src, initials, accent = "app", icon = "documentText", pinned = false, pinLabel, unpinLabel, pinCommit, label, repo, repoLabel, stats, statsBusy = false, id, onPress, onPin, onReveal, onOpenRepo }: OpenItemProps) {
  const Glyph = ICONS[icon];
  const PathIcon = ICONS.folder;
  const RepoIcon = ICONS.github;
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
        {kind === "project" && statsBusy
          ? <span className={s.statsSlot} aria-hidden="true"><Skeleton shape="text" width="medium" /></span>
          : kind === "project" && stats ? <span className={s.detail} title={stats}>{stats}</span> : null}
        {kind === "project" && repo ? (
          <button type="button" className={s.path} title={repoLabel ?? repo} aria-label={repoLabel ?? repo} onClick={onOpenRepo}>
            <RepoIcon className={s.pathIcon} aria-hidden="true" />
            <span className={s.pathHead} data-personal="">{repo}</span>
          </button>
        ) : null}
      </span>
      {pinText ? (
        <span className={s.pin} data-pinned={pinned ? "" : undefined} data-commit={pinCommit && pinCommit !== "rest" ? pinCommit : undefined}>
          <IconButton icon={pinned ? "pinFilled" : "pin"} label={pinText} tone="muted" {...(pinCommit ? { commit: pinCommit } : {})} {...(onPin ? { onPress: onPin } : {})} />
        </span>
      ) : null}
    </div>
  );
}
