import { Fragment } from "react";
import { Button, Header, Keyboard, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator, SubmenuTrigger } from "react-aria-components";
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
  return (
    <SubmenuTrigger>
      <MenuItem id={item.id} className={s.item} textValue={item.label}>
        <span className={s.check} aria-hidden="true" />
        <span className={s.label}>{item.label}</span>
        <span className={s.shortcut} aria-hidden="true"><Icon name="chevronRight" /></span>
      </MenuItem>
      <Popover className={s.popover} placement="end top" offset={4} data-floating-child="">
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

/** An icon button that opens a menu of commands, each with its state and shortcut (IA-CMP-OVERFLOW). */
export function MenuButton({ icon = "more", label, variant = "icon", text, placement = "bottom end", sections, shortcut, onAction }: MenuButtonProps) {
  const checkable = sections.some((sec) => sec.items.some((i) => i.checked !== undefined));
  return (
    <MenuTrigger>
      {variant === "pill"
        ? <Button className={s.pill} aria-label={label}>{text ?? label}</Button>
        : variant === "text"
          ? <Button className={s.text} aria-label={label}>{text ?? label}<Icon name="chevronDown" size="s" /></Button>
          : <IconButton icon={icon} label={label} {...(shortcut ? { shortcut } : {})} />}
      <Popover className={s.popover} placement={placement} offset={8} data-floating-child="">
        <Menu className={s.menu} aria-label={label} shouldCloseOnSelect onAction={(key) => onAction?.({ id: String(key) })} disabledKeys={sections.flatMap((sec) => sec.items.filter((i) => i.disabled && !i.items).map((i) => i.id))}>
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
                  <MenuItem key={item.id} id={item.id} className={s.item} textValue={item.label}>
                    {({ isSelected }) => (
                      <>
                        {checkable ? <span className={s.check} aria-hidden="true">{isSelected ? "✓" : ""}</span> : null}
                        <span className={s.label}>{item.label}</span>
                        {item.shortcut ? <Keyboard className={s.shortcut}>{item.shortcut}</Keyboard> : null}
                      </>
                    )}
                  </MenuItem>
                ))}
              </MenuSection>
            </Fragment>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
