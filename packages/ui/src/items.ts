/**
 * The item each list kind holds (DS-A04, D-198), derived from the data types list props already
 * use (data.ts and the components' own item types), so a shape can't drift from its type: a field
 * added, removed, made optional, or retyped there fails typecheck here. ui:check compares a list
 * prop's read against these: a view can't pass a string[] where command items belong.
 */
import type { ColorValue, CommandItem, KeyBinding, MenuSection, Option, ResultItem, ThemeTile, TreeItem, VersionBlock } from "./data.ts";
import type { SiteTheme } from "./primitives/SiteThemeShowcase/SiteThemeShowcase.tsx";
import type { BlockNode } from "./blocks/NoteContent/NoteContent.tsx";
import type { ListOf } from "./contract.ts";

export type FieldKind = "string" | "number" | "boolean" | "array" | "object";
type KindOf<T> = [T] extends [string] ? "string" : [T] extends [number] ? "number" : [T] extends [boolean] ? "boolean" : [T] extends [readonly unknown[]] ? "array" : "object";
/** Each field's kind; an optional field's ends in "?". */
type Fields<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? `${KindOf<NonNullable<T[K]>>}?` : KindOf<T[K]> };

export interface ItemShape {
  fields: Readonly<Record<string, `${FieldKind}` | `${FieldKind}?`>>;
  /** Fields that are lists of another kind: a menu section's items, a submenu. */
  lists?: Readonly<Record<string, ListOf>>;
}

const shape = <T>(fields: Fields<T>, lists?: Partial<Record<keyof T & string, ListOf>>): ItemShape => ({ fields: fields as ItemShape["fields"], ...(lists ? { lists: lists as Record<string, ListOf> } : {}) });

/**
 * The item type each list kind holds, so the registry can check a component's list props against
 * what the renderer passes (DS-A05, D-199). A list kind without an entry here fails typecheck.
 */
export interface ListItemTypes {
  commandItems: CommandItem; menuSections: MenuSection; options: Option; keyCaps: string; keyBindings: KeyBinding;
  resultItems: ResultItem; treeItems: TreeItem; versionBlocks: VersionBlock; themeTiles: ThemeTile; colorValues: ColorValue;
  noteBlocks: BlockNode; siteThemes: SiteTheme;
}
export type ListItemOf<L extends ListOf> = ListItemTypes[L];

/** A list of plain strings, such as key caps. */
export const STRING_ITEMS = "string" as const;

export const ITEM_SHAPES: Readonly<Record<ListOf, ItemShape | typeof STRING_ITEMS>> = {
  commandItems: shape<CommandItem>({
    id: "string", label: "string", icon: "string?", shortcut: "string?", checked: "boolean?", disabled: "boolean?", reason: "string?",
    items: "array?", busy: "boolean?", busyLabel: "string?",
  }, { items: "commandItems" }),
  menuSections: shape<MenuSection>({ id: "string", label: "string?", items: "array" }, { items: "commandItems" }),
  options: shape<Option>({ id: "string", label: "string" }),
  keyCaps: STRING_ITEMS,
  keyBindings: shape<KeyBinding>({ id: "string", chord: "string" }),
  resultItems: shape<ResultItem>({
    id: "string", label: "string", description: "string?", icon: "string?", shortcut: "string?", disabled: "boolean?", header: "boolean?",
    highlights: "array?", descriptionHighlights: "array?", state: "string?",
  }),
  treeItems: shape<TreeItem>({
    id: "string", kind: "string", level: "number", label: "string", description: "string?", title: "string?", parent: "string?",
    expanded: "boolean?", hasChildren: "boolean?", selected: "boolean?", current: "boolean?", pending: "boolean?", readOnly: "boolean?",
    draggable: "boolean?", droppable: "boolean?", editing: "boolean?", accessory: "number?",
  }),
  versionBlocks: shape<VersionBlock>({ id: "string", text: "string", changed: "boolean" }),
  themeTiles: shape<ThemeTile>({
    id: "string", label: "string", kind: "string", slot: "string?", badge: "string", description: "string?", sample: "string?", colors: "array?", group: "string?",
  }, { colors: "colorValues" }),
  colorValues: shape<ColorValue>({ id: "string", value: "string" }),
  // A block's content holds blocks again, to any depth: checked at the top level only.
  noteBlocks: shape<BlockNode>({ type: "string", attrs: "object?", content: "array?", marks: "array?", text: "string?" }),
  siteThemes: shape<SiteTheme>({
    id: "string", label: "string", scheme: "string", src: "string", srcSet: "string?", avifSet: "string?", sizes: "string?", alt: "string",
    width: "number?", height: "number?",
  }),
};
