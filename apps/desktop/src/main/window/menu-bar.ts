/**
 * macOS's native menu bar (DSK-05): built from the menu the renderer generates from its command
 * registry (core's menu-bar.ts), with the keys as Electron accelerators. Choosing an item asks the
 * renderer to run the command, so menus, keys, and the toolbar all run the same commands. While the
 * menu keeps its shape, only the enabled and checked states change, so an open menu stays open.
 * Windows and Linux have no menu bar (Desktop app → Window behavior).
 */
import type { MenuItemConstructorOptions } from "electron";
import { MENU_ROLES, type MenuBarItem, type MenuBarModel, type MenuRole } from "@focus-notes/core/menu-bar";

const KEY_NAMES: Record<string, string> = { Esc: "Escape", Del: "Delete" };
const KEY = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Enter|Escape|Backspace|Delete|Home|End|PageUp|PageDown|Tab|Space|Plus|[=\-\\/.,;'`[\]])$/;
const MODS: Record<string, string> = { mod: "Command", ctrl: "Control", alt: "Alt", shift: "Shift" };

/**
 * A registry chord resolved for macOS ("Mod+Shift+L", "Ctrl+Mod+F") as an Electron accelerator
 * ("Command+Shift+L", "Control+Command+F"). Undefined for a key Electron can't show.
 */
export function toAccelerator(chord: string): string | undefined {
  const parts = chord.split("+");
  const last = parts.pop() ?? "";
  const key = KEY_NAMES[last] ?? (last.length === 1 ? last.toUpperCase() : last);
  if (!KEY.test(key)) return undefined;
  const mods = parts.map((p) => MODS[p.toLowerCase()]);
  if (mods.some((m) => !m) || new Set(mods).size !== mods.length) return undefined;
  const order = ["Control", "Alt", "Shift", "Command"];
  return [...(mods as string[]).sort((a, b) => order.indexOf(a) - order.indexOf(b)), key].join("+");
}

const ROLES: readonly string[] = MENU_ROLES;
const ID = /^[a-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)*$/;
const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;

/** The menu as the renderer sent it, checked: its shape, its words, its roles, and its size. */
export function checkMenuModel(raw: unknown): MenuBarModel | undefined {
  let count = 0;
  const item = (v: unknown, depth: number): MenuBarItem | undefined => {
    if (!v || typeof v !== "object" || ++count > 1000) return undefined;
    const i = v as Record<string, unknown>;
    const chord = i.chord === undefined || (typeof i.chord === "string" && i.chord.length <= 40);
    switch (i.kind) {
      case "separator":
        return { kind: "separator" };
      case "command":
        if (typeof i.id !== "string" || !ID.test(i.id) || !text(i.label) || !chord || typeof i.enabled !== "boolean") return undefined;
        if ((i.checked !== undefined && typeof i.checked !== "boolean") || (i.radio !== undefined && i.radio !== true)) return undefined;
        return { kind: "command", id: i.id, label: i.label as string, enabled: i.enabled, ...(i.chord ? { chord: i.chord as string } : {}), ...(typeof i.checked === "boolean" ? { checked: i.checked } : {}), ...(i.radio ? { radio: true as const } : {}) };
      case "role":
        if (!ROLES.includes(i.role as string) || !chord || (i.id !== undefined && (typeof i.id !== "string" || !ID.test(i.id))) || (i.label !== undefined && !text(i.label))) return undefined;
        return { kind: "role", role: i.role as MenuRole, ...(i.id ? { id: i.id as string } : {}), ...(i.label ? { label: i.label as string } : {}), ...(i.chord ? { chord: i.chord as string } : {}) };
      case "submenu": {
        if (depth > 2 || !text(i.label) || !Array.isArray(i.items)) return undefined;
        const items = i.items.map((x) => item(x, depth + 1));
        return items.every(Boolean) ? { kind: "submenu", label: i.label as string, items: items as MenuBarItem[] } : undefined;
      }
      default:
        return undefined;
    }
  };
  const m = raw as { menus?: unknown };
  if (!m || typeof m !== "object" || !Array.isArray(m.menus) || m.menus.length > 12) return undefined;
  const menus: MenuBarModel["menus"] = [];
  for (const v of m.menus as unknown[]) {
    const x = v as Record<string, unknown>;
    if (!x || typeof x.id !== "string" || !ID.test(x.id) || !text(x.label) || !Array.isArray(x.items)) return undefined;
    if (x.kind !== undefined && x.kind !== "app" && x.kind !== "window" && x.kind !== "help") return undefined;
    const items = x.items.map((i) => item(i, 1));
    if (!items.every(Boolean)) return undefined;
    menus.push({ id: x.id, label: x.label as string, ...(x.kind ? { kind: x.kind as "app" | "window" | "help" } : {}), items: items as MenuBarItem[] });
  }
  return { menus };
}

/** Chooses an item: by its key, or by pointing. */
export type Choose = (id: string, byKey: boolean) => void;

/** Electron's template for the menu. The Window and Help menus are the system's, so it adds the window list and Help's search. */
export function menuTemplate(model: MenuBarModel, choose: Choose): MenuItemConstructorOptions[] {
  const item = (i: MenuBarItem): MenuItemConstructorOptions => {
    if (i.kind === "separator") return { type: "separator" };
    if (i.kind === "submenu") return { label: i.label, submenu: i.items.map(item) };
    const accelerator = i.chord ? toAccelerator(i.chord) : undefined;
    if (i.kind === "role") return { role: i.role, ...(i.id ? { id: i.id } : {}), ...(i.label ? { label: i.label } : {}), ...(accelerator ? { accelerator } : {}) };
    return {
      id: i.id,
      label: i.label,
      enabled: i.enabled,
      ...(accelerator ? { accelerator } : {}),
      ...(i.checked !== undefined ? { type: i.radio ? ("radio" as const) : ("checkbox" as const), checked: i.checked } : {}),
      click: (_item, _window, event) => choose(i.id, Boolean(event?.triggeredByAccelerator)),
    };
  };
  return model.menus.map((m) => ({
    label: m.label,
    ...(m.kind === "window" ? { role: "window" as const } : m.kind === "help" ? { role: "help" as const } : {}),
    submenu: m.items.map(item),
  }));
}

/** What the menu bar needs of Electron's Menu. */
export interface MenuApi<M extends MenuLike> {
  buildFromTemplate(template: MenuItemConstructorOptions[]): M;
  setApplicationMenu(menu: M): void;
}
export interface MenuLike {
  getMenuItemById(id: string): { enabled: boolean; checked: boolean } | null;
}

/** The commands' states, which can change while the menu keeps its shape. */
const states = (model: MenuBarModel) => {
  const out = new Map<string, { enabled: boolean; checked?: boolean }>();
  const walk = (items: MenuBarItem[]) => {
    for (const i of items) {
      if (i.kind === "submenu") walk(i.items);
      else if (i.kind === "command") out.set(i.id, { enabled: i.enabled, ...(i.checked !== undefined ? { checked: i.checked } : {}) });
    }
  };
  for (const m of model.menus) walk(m.items);
  return out;
};
const shape = (model: MenuBarModel) => JSON.stringify(model, (k, v) => (k === "enabled" || k === "checked" ? undefined : v));

export class AppMenuBar<M extends MenuLike> {
  readonly #api: MenuApi<M>;
  readonly #choose: Choose;
  #menu: M | undefined;
  #shape = "";
  #states = new Map<string, { enabled: boolean; checked?: boolean }>();

  constructor(api: MenuApi<M>, choose: Choose) {
    this.#api = api;
    this.#choose = choose;
  }

  /** Sets the menu bar from the renderer's menu; false if the menu isn't one it accepts. */
  set(raw: unknown): boolean {
    const model = checkMenuModel(raw);
    if (!model) return false;
    this.#states = states(model);
    const s = shape(model);
    if (this.#menu && s === this.#shape) {
      for (const [id, st] of this.#states) {
        const mi = this.#menu.getMenuItemById(id);
        if (!mi) continue;
        mi.enabled = st.enabled;
        if (st.checked !== undefined) mi.checked = st.checked;
      }
      return true;
    }
    this.#shape = s;
    this.#menu = this.#api.buildFromTemplate(menuTemplate(model, (id, byKey) => {
      // A checkbox flips itself when chosen; it shows the command's state until the renderer reports the new one.
      const mi = this.#menu?.getMenuItemById(id);
      const checked = this.#states.get(id)?.checked;
      if (mi && checked !== undefined) mi.checked = checked;
      this.#choose(id, byKey);
    }));
    this.#api.setApplicationMenu(this.#menu);
    return true;
  }
}
