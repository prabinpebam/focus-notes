import { Fragment, useState } from "react";
import { Button, Header, Keyboard, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator, SubmenuTrigger, Text } from "react-aria-components";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Icon } from "../Icon/Icon.tsx";
import type { IconName } from "../../icon-names.ts";
import type { CommandItem, MenuSection as Section } from "../../data.ts";
import * as s from "./MenuButton.css.ts";

export interface MenuButtonProps {
  /** For the icon variant. */
  icon?: IconName;
  /** The accessible name (and the tooltip of the icon variant). */
  label: string;
  /** "icon" (default), "pill": a quiet text pill showing `text` (UI-12), or "text": `text` and a chevron (Turn into). */
  variant?: "icon" | "pill" | "text";
  text?: string;
  /** Where the menu opens from the trigger. */
  placement?: "bottom end" | "bottom start" | "top start";
  sections: Section[];
  shortcut?: string;
  onAction?: (payload: { id: string }) => void;
}

/** A submenu of mutually exclusive choices (a theme, a font): its items are radio items. */
function Submenu({ item, onAction }: { item: CommandItem; onAction?: ((payload: { id: string }) => void) | undefined }) {
  const children = item.items ?? [];
  // Beside the menu where there's room for one as wide; in a narrow window (320 px, WCAG 1.4.10),
  // below its item, over the menu. Measured as the item is reached, before the submenu opens.
  const [placement, setPlacement] = useState<"end top" | "bottom start">("end top");
  const measure = (target: EventTarget | null) => {
    const menu = target instanceof Element ? target.closest('[role="menu"]')?.getBoundingClientRect() : undefined;
    if (menu) setPlacement(Math.max(innerWidth - menu.right, menu.left) >= menu.width ? "end top" : "bottom start");
  };
  return (
    <SubmenuTrigger>
      <MenuItem id={item.id} className={s.item} textValue={item.label} onFocus={(e) => measure(e.target)} onHoverStart={(e) => measure(e.target)}>
        <span className={s.check} aria-hidden="true" />
        <span className={s.label}>{item.label}</span>
        <span className={s.shortcut} aria-hidden="true"><Icon name="chevronRight" /></span>
      </MenuItem>
      <Popover className={s.popover} placement={placement} offset={4} data-floating-child="">
        <Menu
          className={s.menu}
          aria-label={item.label}
          selectionMode="single"
          shouldCloseOnSelect
          selectedKeys={children.filter((i) => i.checked).map((i) => i.id)}
          disabledKeys={children.filter((i) => i.disabled).map((i) => i.id)}
          onAction={(key) => onAction?.({ id: String(key) })}
        >
          {children.map((c) => (
            <MenuItem key={c.id} id={c.id} className={s.item} textValue={c.label}>
              {({ isSelected }) => (
                <>
                  <span className={s.check} aria-hidden="true">{isSelected ? "✓" : ""}</span>
                  <span className={s.label}>{c.label}</span>
                </>
              )}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </SubmenuTrigger>
  );
}

/**
 * An unavailable item stays focusable, so keyboard and screen-reader users reach it and hear why it's
 * unavailable (APG: focusability of disabled controls). React Aria takes disabled items out of focus,
 * so the state is set on the element here, and choosing it does nothing and keeps the menu open.
 */
const markUnavailable = (unavailable: boolean) => (el: HTMLDivElement | null) => {
  if (!el) return;
  if (unavailable) el.setAttribute("aria-disabled", "true");
  else el.removeAttribute("aria-disabled");
};

/**
 * A menu of commands in sections, with submenus, checked states, and shortcuts: what MenuButton opens,
 * and what other components that open menus themselves (TableControls) show.
 */
export function CommandMenu({ label, sections, onAction, autoFocus }: { label: string; sections: Section[]; onAction?: ((payload: { id: string }) => void) | undefined; autoFocus?: boolean }) {
  const checkable = sections.some((sec) => sec.items.some((i) => i.checked !== undefined));
  const unavailable = new Set(sections.flatMap((sec) => sec.items.filter((i) => i.disabled && !i.items).map((i) => i.id)));
  return (
        <Menu className={s.menu} aria-label={label} shouldCloseOnSelect {...(autoFocus ? { autoFocus: "first" as const } : {})} onAction={(key) => { if (!unavailable.has(String(key))) onAction?.({ id: String(key) }); }}>
          {sections.map((sec, index) => (
            <Fragment key={sec.id}>
              {index > 0 ? <Separator className={s.separator} /> : null}
              <MenuSection
                id={sec.id}
                aria-label={sec.label ?? sec.id}
                {...(sec.items.some((i) => i.checked !== undefined)
                  ? { selectionMode: "multiple" as const, selectedKeys: sec.items.filter((i) => i.checked && !i.items).map((i) => i.id) }
                  : {})}
              >
                {sec.label ? <Header className={s.header}>{sec.label}</Header> : null}
                {sec.items.map((item) => item.items ? <Submenu key={item.id} item={item} onAction={onAction} /> : (
                  <MenuItem
                    key={item.id}
                    id={item.id}
                    className={s.item}
                    textValue={item.label}
                    ref={markUnavailable(Boolean(item.disabled))}
                    {...(item.disabled ? { shouldCloseOnSelect: false } : {})}
                  >
                    {({ isSelected }) => (
                      <>
                        {checkable ? <span className={s.check} aria-hidden="true">{isSelected ? "✓" : ""}</span> : null}
                        {/* The name is everything the item shows, its shortcut and an unavailable item's reason included (WCAG 2.5.3). */}
                        <Text slot="label" className={s.label}>
                          <span className={s.labelRow}>
                            <span className={s.labelText}>{item.label}</span>
                            {item.shortcut ? <Keyboard className={s.shortcut}>{item.shortcut}</Keyboard> : null}
                          </span>
                          {item.disabled && item.reason ? <span className={s.reason}>{item.reason}</span> : null}
                        </Text>
                      </>
                    )}
                  </MenuItem>
                ))}
              </MenuSection>
            </Fragment>
          ))}
        </Menu>
  );
}

/** An icon button that opens a menu of commands, each with its state and shortcut (IA-CMP-OVERFLOW). */
export function MenuButton({ icon = "more", label, variant = "icon", text, placement = "bottom end", sections, shortcut, onAction }: MenuButtonProps) {
  return (
    <MenuTrigger>
      {variant === "pill"
        ? <Button className={s.pill} aria-label={label}>{text ?? label}</Button>
        : variant === "text"
          ? <Button className={s.text} aria-label={label}>{text ?? label}<Icon name="chevronDown" size="s" /></Button>
          : <IconButton icon={icon} label={label} {...(shortcut ? { shortcut } : {})} />}
      <Popover className={s.popover} placement={placement} offset={8} data-floating-child="">
        <CommandMenu label={label} sections={sections} onAction={onAction} />
      </Popover>
    </MenuTrigger>
  );
}
