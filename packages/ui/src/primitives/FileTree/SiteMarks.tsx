import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { DescriptionTooltip } from "../Tooltip/Tooltip.tsx";
import type { TreeItem } from "../../data.ts";
import * as s from "./FileTree.css.ts";

const marksOf = (item: TreeItem) =>
  item.siteLabel && !item.editing ? [item.shared ? "shared" : "", item.published ? "published" : ""].filter(Boolean).join(" ") : "";

/** The row or tab a glyph belongs to: its keyboard focus shows the badges' tooltip. */
const HOST = '[role="treeitem"], [data-tab-id]';

/**
 * D-431 (owner, 26 November): a file's icon with its shared and published marks as badges on the icon's
 * bottom-right corner, in the accent: a person for shared, a globe for published; a file that's both has
 * the globe above the person on the icon's end edge. The icon is cut away around each badge (a mask), so a
 * badge stays legible on any row fill without a border or fill of its own. The badges stay while the row's
 * pin replaces its icon (hover, focus). Their tooltip (owner, 26 November 22:57) is the marks in plain words,
 * the row's accessible description word for word: after a pause on the badges, at once while the row or tab
 * has keyboard focus. Used by the tree (and so Pinned and Recent) and Opened files.
 */
export function FileGlyph({ item, className, children }: { item: TreeItem; className?: string | undefined; children: ReactNode }) {
  const marks = marksOf(item);
  const about = marks ? item.siteDescription ?? "" : "";
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const host = about ? anchor.current?.closest<HTMLElement>(HOST) : null;
    if (!host) return;
    const update = () => setFocused(host.matches(":focus-visible"));
    const off = () => setFocused(false);
    update();
    host.addEventListener("focus", update);
    host.addEventListener("blur", off);
    return () => { host.removeEventListener("focus", update); host.removeEventListener("blur", off); setFocused(false); };
  }, [about]);
  return (
    <span className={`${s.glyph} ${className ?? ""}`} data-site-badges={marks || undefined} aria-hidden="true">
      {children}
      {marks ? (
        // An empty title: the row's own tooltip (its path) never shows over the badges' one.
        <span ref={anchor} className={s.badges} title="" data-site-marks={marks}
          onPointerEnter={(e) => { if (e.pointerType !== "touch") setHovered(true); }}
          onPointerLeave={() => setHovered(false)}>
          {item.published ? <span className={s.badge} data-badge="published"><Icon name="globeBadge" size="s" /></span> : null}
          {item.shared ? <span className={s.badge} data-badge="shared"><Icon name="personBadge" size="s" /></span> : null}
        </span>
      ) : null}
      {about ? <DescriptionTooltip label={about} anchor={anchor} focused={focused} hovered={hovered} /> : null}
    </span>
  );
}

/** The marks' one name ("Shared", "Published", "Shared and published"), read after the file's name and never shown. */
export function SiteMarksName({ item, nameId, lead = ", ", trail = "" }: { item: TreeItem; nameId?: string; lead?: string; trail?: string }) {
  if (!marksOf(item)) return null;
  return <span id={nameId} className={s.srOnly}>{lead}{item.siteLabel}{trail}</span>;
}

/** The marks in plain words, the row's or tab's accessible description (aria-describedby): the badges' tooltip, word for word. */
export function SiteMarksDescription({ item, id }: { item: TreeItem; id: string }) {
  if (!marksOf(item) || !item.siteDescription) return null;
  return <span id={id} hidden>{item.siteDescription}</span>;
}

/** Whether a row or tab has the marks' description to point at. */
export const hasSiteDescription = (item: TreeItem) => Boolean(marksOf(item) && item.siteDescription);
