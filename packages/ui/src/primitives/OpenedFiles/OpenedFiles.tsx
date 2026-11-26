import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button as AriaButton, Popover } from "react-aria-components";
import { CommandMenu } from "../MenuButton/MenuButton.tsx";
import * as menuStyles from "../MenuButton/MenuButton.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import { anchor as anchorStyle, anchorX, anchorY } from "../FileTree/FileTree.css.ts";
import { Icon } from "../Icon/Icon.tsx";
import { MenuButton } from "../MenuButton/MenuButton.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { FileGlyph, SiteMarksName } from "../FileTree/SiteMarks.tsx";
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
  /** A tab's menu (owner, 26 November): the Files row menu of the same file, then Close tab. */
  tabMenu?: MenuSection[];
  tabMenuLabel?: string;
  /** The file `tabMenu` is for; a tab whose file it isn't shows only Close tab. */
  tabMenuFor?: string;
  closeTabLabel?: string;
  id: string;
  onActivate?: (p: { id: string }) => void;
  onClose?: (p: { id: string }) => void;
  onMenuAction?: (p: { id: string }) => void;
  /** A tab's menu is opening: its file becomes the Files selection, so the row menu is built for it. */
  onTabMenu?: (p: { id: string }) => void;
  onTabMenuAction?: (p: { id: string }) => void;
}

const CLOSE_TAB = "openedFiles.closeTab";
const varName = (v: string) => v.replace(/^var\((.*)\)$/, "$1");

/**
 * Opened files (owner, 23 November; D-410): the notes open now, as bordered tab buttons above Pinned in
 * the Files panel. A single click activates a tab; its × closes it, shown on hover and keyboard focus,
 * its place kept so the name never moves. The header's ⋯ holds Close all, with no confirmation (the owner:
 * it's under a menu and loses nothing). With nothing open, the section isn't there at all.
 * @tier primitive
 * @a11y A labelled list of buttons; the active tab has aria-current="page"; each × is its own button,
 * named "Close" and the note's name. A tab's right-click, Shift+F10 or Menu key opens its file's Files
 * menu (the same items as its row there) and Close tab; focus returns to the tab as it closes.
 */
export function OpenedFiles({ label, items, menu = [], menuLabel = "", closeLabel, tabMenu = [], tabMenuLabel = "", tabMenuFor = "", closeTabLabel = "", id, onActivate, onClose, onMenuAction, onTabMenu, onTabMenuAction }: OpenedFilesProps) {
  const base = useId();
  const boundary = useWindowBoundary();
  const [menuAt, setMenuAt] = useState<{ id: string; point: boolean; x: number; y: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  /** Open now, before the render that shows it: a key's echoed context-menu event finds it open. */
  const menuOpen = useRef(false);
  const hasTabMenu = Boolean(closeTabLabel && onClose);
  if (items.length === 0) return null;
  const activateEl = (itemId: string) => document.querySelector<HTMLElement>(`#${CSS.escape(id)} [data-tab-id="${CSS.escape(itemId)}"]`);
  const openTabMenu = (itemId: string, point = false, x = 0, y = 0) => {
    if (!hasTabMenu) return;
    onTabMenu?.({ id: itemId });
    menuOpen.current = true;
    setMenuAt({ id: itemId, point, x, y });
  };
  /** Focus goes back to the tab as the menu closes, unless what it ran took it (a name field, a dialog). */
  const tabMenuClosed = (itemId: string) => {
    menuOpen.current = false;
    setMenuAt(null);
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) activateEl(itemId)?.focus({ preventScroll: true });
    });
  };
  const tabKeyDown = (e: KeyboardEvent, itemId: string) => {
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") { e.preventDefault(); openTabMenu(itemId); }
  };
  const tabContextMenu = (e: MouseEvent, itemId: string) => {
    if (!hasTabMenu) return;
    // Never the browser's own menu over a tab.
    e.preventDefault();
    // From the keyboard: the key's own request, already open from its keydown, or under the tab.
    if (e.button !== 2) { if (!menuOpen.current) openTabMenu(itemId); return; }
    const r = e.currentTarget.getBoundingClientRect();
    openTabMenu(itemId, true, e.clientX - r.left, e.clientY - r.top);
  };
  const menuItem = menuAt ? items.find((i) => i.id === menuAt.id) : undefined;
  const sections: MenuSection[] = menuItem ? [...(tabMenuFor === menuItem.id ? tabMenu : []), { id: "openedTab", items: [{ id: CLOSE_TAB, label: closeTabLabel, icon: "dismiss" }] }] : [];
  const headerId = `${id}-header`;
  return (
    <section className={s.root} aria-labelledby={headerId} id={id} data-opened-files="">
      <div className={s.header}>
        <span className={s.headerLabel} id={headerId}>{label}</span>
        {menu.length > 0 ? <MenuButton icon="more" label={menuLabel || label} sections={menu} {...(onMenuAction ? { onAction: onMenuAction } : {})} /> : null}
      </div>
      <ul className={s.list} aria-labelledby={headerId}>
        {items.map((item, i) => {
          const nameId = `${base}-n${i}`;
          const closeId = `${base}-c${i}`;
          const marksId = `${base}-m${i}`;
          const marked = Boolean(item.siteLabel && (item.shared || item.published));
          return (
            <li key={item.id} className={s.tab} data-current={item.current ? "" : undefined} data-menu-open={menuAt?.id === item.id ? "" : undefined}
              ref={(el) => { if (el && menuAt?.id === item.id && !menuAt.point) anchor.current = el; }}
              onKeyDown={(e) => tabKeyDown(e, item.id)}
              onContextMenu={(e) => tabContextMenu(e, item.id)}>
              <AriaButton
                className={s.activate}
                data-tab-id={item.id}
                aria-current={item.current ? "page" : undefined}
                aria-labelledby={marked ? `${nameId} ${marksId}` : nameId}
                onPress={() => onActivate?.({ id: item.id })}
              >
                <FileGlyph item={item} className={s.icon}><Icon name="document" size="s" /></FileGlyph>
                <span className={s.name} id={nameId} dir="auto" title={item.title || item.label}>{item.label}</span>
                {marked ? <SiteMarksName item={item} nameId={marksId} /> : null}
              </AriaButton>
              <Tooltip label={closeLabel}>
                <AriaButton className={s.close} id={closeId} aria-label={closeLabel} aria-labelledby={`${closeId} ${nameId}`} onPress={() => onClose?.({ id: item.id })}>
                  <Icon name="dismiss" size="s" />
                </AriaButton>
              </Tooltip>
              {menuAt?.id === item.id && menuAt.point ? (
                <span className={anchorStyle} aria-hidden="true" ref={(el) => {
                  if (!el) return;
                  el.style.setProperty(varName(anchorX), `${menuAt.x}px`);
                  el.style.setProperty(varName(anchorY), `${menuAt.y}px`);
                  anchor.current = el;
                }} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {menuAt && menuItem ? (
        <Popover triggerRef={anchor} isOpen onOpenChange={(open) => { if (!open) tabMenuClosed(menuAt.id); }}
          placement="bottom start" offset={4} className={menuStyles.popover} {...boundary}
          data-surface="popover" aria-label={tabMenuFor === menuItem.id && tabMenuLabel ? tabMenuLabel : menuItem.label} data-floating-child="">
          <CommandMenu label={tabMenuFor === menuItem.id && tabMenuLabel ? tabMenuLabel : menuItem.label} sections={sections} autoFocus
            onAction={({ id: command }) => {
              const tab = menuAt.id;
              if (command === CLOSE_TAB) onClose?.({ id: tab }); else onTabMenuAction?.({ id: command });
              tabMenuClosed(tab);
            }} />
        </Popover>
      ) : null}
    </section>
  );
}
