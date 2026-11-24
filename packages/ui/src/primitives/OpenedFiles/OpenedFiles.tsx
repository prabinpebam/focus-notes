import { useId } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import { MenuButton } from "../MenuButton/MenuButton.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import type { MenuSection, TreeItem } from "../../data.ts";
import * as s from "./OpenedFiles.css.ts";

export interface OpenedFilesProps {
  /** The header's words and the list's name: "Opened files". */
  label: string;
  /** One tab per open note: `label` is its name, `title` its path (the tooltip), `current` the active one. */
  items: TreeItem[];
  /** The header's ⋯ menu: Close all. */
  menu?: MenuSection[];
  menuLabel?: string;
  /** The close button's tooltip, and the start of its name: "Close" (read as "Close Spec ideas"). */
  closeLabel: string;
  id: string;
  onActivate?: (p: { id: string }) => void;
  onClose?: (p: { id: string }) => void;
  onMenuAction?: (p: { id: string }) => void;
}

/**
 * Opened files (owner, 23 November; D-410): the notes open now, as bordered tab buttons above Pinned in
 * the Files panel. A single click activates a tab; its × closes it, shown on hover and keyboard focus,
 * its place kept so the name never moves. The header's ⋯ holds Close all, with no confirmation (the owner:
 * it's under a menu and loses nothing). With nothing open, the section isn't there at all.
 * @tier primitive
 * @a11y A labelled list of buttons; the active tab has aria-current="page"; each × is its own button,
 * named "Close" and the note's name.
 */
export function OpenedFiles({ label, items, menu = [], menuLabel = "", closeLabel, id, onActivate, onClose, onMenuAction }: OpenedFilesProps) {
  const base = useId();
  if (items.length === 0) return null;
  const headerId = `${id}-header`;
  return (
    <section className={s.root} aria-labelledby={headerId} id={id}>
      <div className={s.header}>
        <span className={s.headerLabel} id={headerId}>{label}</span>
        {menu.length > 0 ? <MenuButton icon="more" label={menuLabel || label} sections={menu} {...(onMenuAction ? { onAction: onMenuAction } : {})} /> : null}
      </div>
      <ul className={s.list} aria-labelledby={headerId}>
        {items.map((item, i) => {
          const nameId = `${base}-n${i}`;
          const closeId = `${base}-c${i}`;
          return (
            <li key={item.id} className={s.tab} data-current={item.current ? "" : undefined}>
              <AriaButton
                className={s.activate}
                aria-current={item.current ? "page" : undefined}
                aria-labelledby={nameId}
                onPress={() => onActivate?.({ id: item.id })}
              >
                <span className={s.icon} aria-hidden="true"><Icon name="document" size="s" /></span>
                <span className={s.name} id={nameId} dir="auto" title={item.title || item.label}>{item.label}</span>
              </AriaButton>
              <Tooltip label={closeLabel}>
                <AriaButton className={s.close} id={closeId} aria-label={closeLabel} aria-labelledby={`${closeId} ${nameId}`} onPress={() => onClose?.({ id: item.id })}>
                  <Icon name="dismiss" size="s" />
                </AriaButton>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
