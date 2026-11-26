import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon.tsx";
import type { TreeItem } from "../../data.ts";
import * as s from "./FileTree.css.ts";

const marksOf = (item: TreeItem) =>
  item.siteLabel && !item.editing ? [item.shared ? "shared" : "", item.published ? "published" : ""].filter(Boolean).join(" ") : "";

/**
 * D-431 (owner, 26 November): a file's icon with its shared and published marks as badges on the icon's
 * bottom-right corner: a person for shared, a globe for published; a file that's both has the globe above
 * the person on the icon's end edge. The icon is cut away around each badge (a mask), so a badge stays
 * legible on any row fill without a border or fill of its own. The badges' tooltip is the marks' one name.
 * Used by the tree (and so Pinned and Recent) and Opened files.
 */
export function FileGlyph({ item, className, children }: { item: TreeItem; className?: string | undefined; children: ReactNode }) {
  const marks = marksOf(item);
  return (
    <span className={`${s.glyph} ${className ?? ""}`} data-site-badges={marks || undefined} aria-hidden="true">
      {children}
      {marks ? (
        <span className={s.badges} title={item.siteLabel} data-site-marks={marks}>
          {item.published ? <span className={s.badge} data-badge="published"><Icon name="globeBadge" size="s" /></span> : null}
          {item.shared ? <span className={s.badge} data-badge="shared"><Icon name="personBadge" size="s" /></span> : null}
        </span>
      ) : null}
    </span>
  );
}

/** The marks' one name ("Shared", "Published", "Shared and published"), read after the file's name and never shown. */
export function SiteMarksName({ item, nameId, lead = ", ", trail = "" }: { item: TreeItem; nameId?: string; lead?: string; trail?: string }) {
  if (!marksOf(item)) return null;
  return <span id={nameId} className={s.srOnly}>{lead}{item.siteLabel}{trail}</span>;
}
