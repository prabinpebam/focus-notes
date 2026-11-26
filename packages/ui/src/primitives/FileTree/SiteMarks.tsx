import { Icon } from "../Icon/Icon.tsx";
import type { TreeItem } from "../../data.ts";
import * as s from "./FileTree.css.ts";

/**
 * D-431: a file's shared and published marks, icons only at the row's end, one name for both ("Shared and
 * published"), read after the row's label and shown as the marks' tooltip. Used by the tree and Opened files.
 */
export function SiteMarks({ item, nameId, lead = ", ", trail = "" }: { item: TreeItem; nameId?: string; lead?: string; trail?: string }) {
  if (!item.siteLabel || (!item.shared && !item.published)) return null;
  return (
    <span className={s.siteMarks} title={item.siteLabel} data-site-marks={[item.shared ? "shared" : "", item.published ? "published" : ""].filter(Boolean).join(" ")}>
      <span className={s.siteIcons} aria-hidden="true">
        {item.shared ? <Icon name="share" size="s" /> : null}
        {item.published ? <Icon name="globe" size="s" /> : null}
      </span>
      <span id={nameId} className={s.srOnly}>{lead}{item.siteLabel}{trail}</span>
    </span>
  );
}
