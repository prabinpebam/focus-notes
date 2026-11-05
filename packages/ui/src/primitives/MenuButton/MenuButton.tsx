import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { FloatingContext } from "../../layouts/Layer/floating.ts";
import { VisuallyHidden } from "react-aria";
import { DescriptionTooltip } from "../Tooltip/Tooltip.tsx";
import { controlLabel } from "../control.css.ts";
import { Button, Header, Keyboard, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator, SubmenuTrigger, Text } from "react-aria-components";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Skeleton } from "../Skeleton/Skeleton.tsx";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import type { IconName } from "../../icon-names.ts";
import type { CommandItem, MenuSection as Section } from "../../data.ts";
import { ownHomeEnd } from "../../behaviors/menu-keys.ts";
import { useBusy } from "../../behaviors/busy.ts";
import { BorderProgress } from "../CommitMark/BorderProgress.tsx";
import { CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./MenuButton.css.ts";

export interface MenuButtonProps {
  /** For the icon variant. */
  icon?: IconName;
  /** The accessible name (and the tooltip of the icon variant). */
  label: string;
  /** "icon" (default), "pill": a quiet text pill showing `text` (UI-12), "text": `text` and a chevron (Turn into), or "select": the same in a bordered box, as a form's field. */
  variant?: "icon" | "pill" | "text" | "select";
  text?: string;
  /** Where the menu opens from the trigger. */
  placement?: "bottom end" | "bottom start" | "top start";
  sections: Section[];
  shortcut?: string;
  /** @deprecated Retained for old view documents; never removes padding or moves paint (D-354). */
  bleed?: boolean;
  busy?: boolean;
  /** Own-border feedback for a persisted choice; recovery stays outside the compact trigger. */
  commit?: CommitState;
  onAction?: (payload: { id: string }) => void;
}

function MenuDescription({ reason, focused, hovered }: { reason: string; focused: boolean; hovered: boolean }) {
  const anchor = useRef<HTMLElement | null>(null);
  return <>
    <VisuallyHidden><Text slot="description"><span ref={el => { anchor.current = el?.closest<HTMLElement>('[role^="menuitem"]') ?? null; }}>{reason}</span></Text></VisuallyHidden>
    <DescriptionTooltip label={reason} anchor={anchor} focused={focused} hovered={hovered} />
  </>;
}

/** A submenu of mutually exclusive choices (a theme, a font): its items are radio items. */
function Submenu({ item, checkable, onAction }: { item: CommandItem; checkable: boolean; onAction?: ((payload: { id: string }) => void) | undefined }) {
  const children = item.items ?? [];
  const boundary = useWindowBoundary();
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
        {({ isFocused, isHovered }) => <>
        {/* Lined up with the other items: a check column only when the menu has one. */}
        {checkable ? <span className={s.check} aria-hidden="true" /> : null}
        <span className={s.label}>{item.label}</span>
        <span className={s.shortcut} aria-hidden="true"><Icon name="chevronRight" /></span>
        {item.reason ? <MenuDescription reason={item.reason} focused={isFocused} hovered={isHovered} /> : null}
        </>}
      </MenuItem>
      <Popover className={s.popover} placement={placement} offset={4} {...boundary} data-floating-child="" data-surface="popover">
        <ChoiceMenu label={item.label} items={children} onAction={onAction} />
      </Popover>
    </SubmenuTrigger>
  );
}

/** A submenu's choices, one of them checked (Light theme → Paper). Mounted as it opens, so it can watch its own scrolling. */
function ChoiceMenu({ label, items, onAction }: { label: string; items: CommandItem[]; onAction?: ((payload: { id: string }) => void) | undefined }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <Menu
      ref={(el: HTMLDivElement | null) => {
        ref.current = el;
        ownHomeEnd(el);
      }}
      className={s.menu}
      aria-label={label}
      selectionMode="single"
      shouldCloseOnSelect
      selectedKeys={items.filter((i) => i.checked).map((i) => i.id)}
      disabledKeys={items.filter((i) => i.disabled).map((i) => i.id)}
      onAction={(key) => onAction?.({ id: String(key) })}
    >
      {items.map((c) => (
        <MenuItem key={c.id} id={c.id} className={s.item} textValue={c.label}>
          {({ isSelected, isFocused, isHovered }) => (
            <>
              <span className={s.check} aria-hidden="true">{isSelected ? "✓" : ""}</span>
              <span className={s.label}>{c.label}</span>
              {c.reason ? <MenuDescription reason={c.reason} focused={isFocused} hovered={isHovered} /> : null}
            </>
          )}
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * An unavailable item stays focusable, so keyboard and screen-reader users reach it and hear why it's
 * unavailable (APG: focusability of disabled controls). React Aria takes disabled items out of focus,
 * so the state is set on the element here, and choosing it does nothing and keeps the menu open.
 */
/** A check item over things that disagree (images in a selection, D-334): read as mixed, not unchecked. React Aria sets aria-checked from the selection, so a mixed item overrides it on its own element. */
const markMixed = (mixed: boolean) => (el: HTMLDivElement | null) => {
  if (el && mixed) el.setAttribute("aria-checked", "mixed");
};

const markUnavailable = (unavailable: boolean) => (el: HTMLDivElement | null) => {
  if (!el) return;
  if (unavailable) el.setAttribute("aria-disabled", "true");
  else el.removeAttribute("aria-disabled");
};

/**
 * A section's items in runs: a command that opens something (Theme…) is a plain menu item even in
 * a group of checked choices, so each run of one kind is its own section under the group's name.
 */
function runsOf(items: CommandItem[]): { checkable: boolean; items: CommandItem[] }[] {
  const selectable = items.some((i) => i.checked !== undefined);
  const runs: { checkable: boolean; items: CommandItem[] }[] = [];
  for (const item of items) {
    const checkable = selectable && (item.checked !== undefined || Boolean(item.items));
    const last = runs[runs.length - 1];
    if (last && last.checkable === checkable) last.items.push(item);
    else runs.push({ checkable, items: [item] });
  }
  return runs;
}

/**
 * A menu of commands in sections, with submenus, checked states, and shortcuts: what MenuButton opens,
 * and what other components that open menus themselves (TableControls) show.
 */
export function CommandMenu({ label, sections, onAction, autoFocus }: { label: string; sections: Section[]; onAction?: ((payload: { id: string }) => void) | undefined; autoFocus?: boolean }) {
  const checkable = sections.some((sec) => sec.items.some((i) => i.checked !== undefined));
  const unavailable = new Set(sections.flatMap((sec) => sec.items.filter((i) => (i.disabled || i.commit === "pending") && !i.items).map((i) => i.id)));
  // Opened from the keyboard, it starts on its first item that does something (the system menu's
  // Move while Restore is unavailable): unavailable items stay reachable, but aren't where it starts.
  const all = sections.flatMap((sec) => sec.items);
  const start = all.find((i) => !unavailable.has(i.id))?.id;
  const later = Boolean(autoFocus && start !== undefined && start !== all[0]?.id);
  // Only as it opens: the item takes focus when it's first drawn (the collection draws its items
  // after the menu), and the menu's own focus handling follows it.
  const started = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const startHere = (id: string) => (el: HTMLDivElement | null) => {
    if (!el || !later || id !== start || started.current) return;
    started.current = true;
    el.focus();
  };
  return (
        <Menu ref={(el: HTMLDivElement | null) => { menuRef.current = el; ownHomeEnd(el); }} className={s.menu} aria-label={label} shouldCloseOnSelect {...(autoFocus && !later ? { autoFocus: "first" as const } : {})} onAction={(key) => { if (!unavailable.has(String(key))) onAction?.({ id: String(key) }); }}>
          {sections.map((sec, index) => (
            <Fragment key={sec.id}>
              {index > 0 ? <Separator className={s.separator} /> : null}
              {runsOf(sec.items).map((run, r) => (
                <MenuSection
                  className={s.section}
                  key={`${sec.id}:${r}`}
                  id={r === 0 ? sec.id : `${sec.id}:${r}`}
                  aria-label={sec.label}
                  {...(run.checkable
                    ? { selectionMode: "multiple" as const, selectedKeys: run.items.filter((i) => i.checked && !i.items).map((i) => i.id) }
                    : {})}
                >
                  {sec.label && r === 0 ? <Header className={s.header}>{sec.label}</Header> : null}
                  {run.items.map((item) => item.items ? <Submenu key={item.id} item={item} checkable={checkable} onAction={onAction} /> : (
                    <MenuItem
                      key={item.id}
                      id={item.id}
                      className={s.item}
                      textValue={item.label}
                      ref={(el: HTMLDivElement | null) => {
                        markUnavailable(Boolean(item.disabled || item.commit === "pending"))(el);
                        markMixed(Boolean(item.mixed && !item.checked))(el);
                        startHere(item.id)(el);
                      }}
                      {...(item.disabled || item.commit === "pending" ? { shouldCloseOnSelect: false } : {})}
                      aria-busy={item.commit === "pending" || undefined}
                    >
                      {({ isSelected, isFocused, isHovered }) => (
                        <>
                          {checkable ? <span className={s.check} aria-hidden="true">{isSelected ? "✓" : item.mixed ? "–" : ""}</span> : null}
                          {/* The name is everything the item shows, its shortcut and an unavailable item's reason included (WCAG 2.5.3).
                              The spaces (unrendered between flex items) keep its words apart, so any part
                              that shows, when a short window clips the item, is still words of the name. */}
                          <Text slot="label" className={s.label}>
                            <span className={s.labelRow}>
                              {item.loading ? <Skeleton width="short" /> : null}
                              <span className={s.labelText}>{item.label}</span>
                              {item.shortcut ? <>{" "}<Keyboard className={s.shortcut}>{item.shortcut}</Keyboard></> : null}
                            </span>
                          </Text>
                          {item.reason ? <MenuDescription reason={item.reason} focused={isFocused} hovered={isHovered} /> : null}
                          {item.commit ? <CommitMark state={item.commit} /> : null}
                        </>
                      )}
                    </MenuItem>
                  ))}
                </MenuSection>
              ))}
            </Fragment>
          ))}
        </Menu>
  );
}

/** An icon button that opens a menu of commands, each with its state and shortcut (IA-CMP-OVERFLOW). */
export function MenuButton({ icon = "more", label, variant = "icon", text, placement = "bottom end", sections, shortcut, bleed, busy, commit, onAction }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const pending = busy || commit === "pending";
  useEffect(() => { if (pending) setOpen(false); }, [pending]);
  const { attrs, ref } = useBusy({ busy: pending, label });
  const boundary = useWindowBoundary();
  const floating = useContext(FloatingContext);
  const surface = floating ? ` ${s.floating}` : "";
  const words = <><span className={controlLabel}>{text ?? label}</span>{pending ? <BorderProgress state="pending" /> : commit && commit !== "rest" ? <BorderProgress state={commit} /> : null}</>;
  const trigger = { ...attrs, ref, "aria-label": label, "data-commit": commit };
  return (
    <MenuTrigger isOpen={open && !pending} onOpenChange={(next) => { if (!next || !pending) setOpen(next); }}>
      {variant === "pill"
        ? <Button {...trigger} className={`${s.pill} ${s.busyAnchor}${surface}`} data-floating-control={floating ? "" : undefined}>{words}</Button>
        : variant === "select"
          ? <Button {...trigger} className={`${s.select} ${s.busyAnchor}${surface}`} data-floating-control={floating ? "" : undefined}>{words}<Icon name="chevronDown" size="s" /></Button>
          : variant === "text"
          ? <Button {...trigger} className={`${s.text} ${s.busyAnchor}${surface}`} data-floating-control={floating ? "" : undefined}>{words}<Icon name="chevronDown" size="s" /></Button>
          : <IconButton icon={icon} label={label} busy={busy} commit={commit} {...(shortcut ? { shortcut } : {})} />}
      <Popover className={s.popover} placement={placement} offset={8} {...boundary} data-floating-child="" data-surface="popover">
        <CommandMenu label={label} sections={sections} onAction={onAction} />
      </Popover>
    </MenuTrigger>
  );
}
