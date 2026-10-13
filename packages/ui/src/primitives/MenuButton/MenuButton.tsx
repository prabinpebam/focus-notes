import { Fragment } from "react";
import { Header, Keyboard, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from "react-aria-components";
import { IconButton } from "../IconButton/IconButton.tsx";
import type { IconName } from "../../icon-names.ts";
import type { MenuSection as Section } from "../../data.ts";
import * as s from "./MenuButton.css.ts";

export interface MenuButtonProps {
  icon: IconName;
  label: string;
  sections: Section[];
  shortcut?: string;
  onAction?: (payload: { id: string }) => void;
}

/** An icon button that opens a menu of commands, each with its state and shortcut (IA-CMP-OVERFLOW). */
export function MenuButton({ icon, label, sections, shortcut, onAction }: MenuButtonProps) {
  const checkable = sections.some((sec) => sec.items.some((i) => i.checked !== undefined));
  return (
    <MenuTrigger>
      <IconButton icon={icon} label={label} {...(shortcut ? { shortcut } : {})} />
      <Popover className={s.popover} placement="bottom end" offset={8}>
        <Menu className={s.menu} aria-label={label} onAction={(key) => onAction?.({ id: String(key) })} disabledKeys={sections.flatMap((sec) => sec.items.filter((i) => i.disabled).map((i) => i.id))}>
          {sections.map((sec, index) => (
            <Fragment key={sec.id}>
              {index > 0 ? <Separator className={s.separator} /> : null}
              <MenuSection
                id={sec.id}
                aria-label={sec.label ?? sec.id}
                {...(sec.items.some((i) => i.checked !== undefined)
                  ? { selectionMode: "multiple" as const, selectedKeys: sec.items.filter((i) => i.checked).map((i) => i.id) }
                  : {})}
              >
                {sec.label ? <Header className={s.header}>{sec.label}</Header> : null}
                {sec.items.map((item) => (
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
