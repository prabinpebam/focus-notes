/**
 * D-408: dialogs, alert cards and popover cards use the shared two-column layout. Inside a Dialog, a
 * DialogPanel, a PopoverPanel's content or a popover-shaped Surface:
 *   - a title with a leading icon or visual (an Inline that starts with one and holds a Heading) must be
 *     IconLayout (or a Dialog's `visual` slot), so nothing wraps under the icon;
 *   - a row of action buttons sits at the trailing edge (IconLayout's `actions`, a Dialog's `footer`, or an
 *     Inline with justify "end"), with the primary last (D-374).
 * Exempt (D-408): the bottom notification pill (Toast, D-357), the writing window's conflict choices bar,
 * the full-window Layer#recover and Layer#firstRun screens, EmptyState, StatusRow and panelFailure.
 */
type Node = Record<string, unknown>;
export interface IconLayoutProblem { doc: string; at: string; message: string }

const CONTAINERS = new Set(["Dialog", "DialogPanel", "PopoverPanel"]);
const ICONISH = new Set(["Icon", "StepMark", "AppMark", "ProjectMark", "ImageFrame"]);
const EXEMPT_TYPES = new Set(["Toast", "EmptyState", "StatusRow", "NotificationRegion"]);
// The conflict choices bar is Dialog#conflict's toolbar slot, which the walk below never treats as actions.
const EXEMPT_IDS = new Set(["recover", "firstRun", "panelFailure"]);

/**
 * Views not yet on the shared layout, by document id: the area migrations empty this list (D-408).
 * Each entry is a known-pending violation, not an exemption.
 */
export const ICON_LAYOUT_PENDING: ReadonlySet<string> = new Set<string>([
  "canvas", "settings", "rewrite", "newNote", "shareItem", "projects",
  "gallery.mock.pnw.deleteDone", "gallery.mock.pnw.deleteOfflineDone", "gallery.mock.pnw.deleteErrPartialGithub",
  "gallery.mock.open.view", "gallery.mock.open.cardStates",
  "gallery.mock.share.invite", "gallery.mock.share.invitePersonal",
]);

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);
const props = (n: Node) => (isNode(n.props) ? n.props : {}) as Record<string, unknown>;
const isContainer = (n: Node) => CONTAINERS.has(String(n.type)) || (n.type === "Surface" && props(n).shape === "popover");
const exempt = (n: Node) => EXEMPT_TYPES.has(String(n.type)) || (typeof n.id === "string" && EXEMPT_IDS.has(n.id));

/** The node itself when it has a type, or the template an `each` renders. */
const unwrap = (v: unknown): Node | undefined => (isNode(v) ? (isNode(v.render) && !v.type ? v.render : v) : undefined);
const kids = (n: Node): Node[] => (Array.isArray(n.children) ? n.children.map(unwrap).filter((c): c is Node => Boolean(c)) : []);

function hasHeading(n: Node, depth = 0): boolean {
  if (n.type === "Heading") return true;
  if (depth > 2) return false;
  return kids(n).some((c) => hasHeading(c, depth + 1));
}

function checkButtons(row: Node[], trailing: boolean, doc: string, at: string, out: IconLayoutProblem[]) {
  const buttons = row.filter((c) => c.type === "Button");
  if (!buttons.length || buttons.length !== row.length) return;
  const primary = buttons.findIndex((b) => props(b).variant === "primary");
  if (primary < 0 && buttons.length < 2) return;
  if (!trailing) out.push({ doc, at, message: "actions must sit at the trailing edge: IconLayout's actions, a Dialog's footer, or an Inline with justify \"end\" (D-408)" });
  if (primary >= 0 && primary !== buttons.length - 1) out.push({ doc, at, message: "the primary action must be last, at the trailing edge (D-374, D-408)" });
}

function walk(v: unknown, doc: string, at: string, inside: boolean, trailing: boolean, out: IconLayoutProblem[]) {
  const n = unwrap(v);
  if (!n) return;
  if (exempt(n)) return;
  const here = inside || isContainer(n);
  if (here && n.type !== "IconLayout") {
    const children = kids(n);
    if (n.type === "Inline" && children.length > 1 && ICONISH.has(String(children[0]!.type)) && children.slice(1).some((c) => hasHeading(c))) {
      out.push({ doc, at, message: "a title with a leading icon in a dialog or card must use IconLayout (or Dialog's visual slot), so nothing wraps under the icon (D-408)" });
    }
    if (n.type === "Inline") checkButtons(children, trailing || props(n).justify === "end", doc, at, out);
  }
  if (n.type === "IconLayout" && isNode(n.slots) && Array.isArray(n.slots.actions)) {
    checkButtons(n.slots.actions.map(unwrap).filter((c): c is Node => Boolean(c)), true, doc, `${at}/slots/actions`, out);
  }
  kids(n).forEach((c, i) => walk(c, doc, `${at}/children/${i}`, here, false, out));
  if (isNode(n.slots)) {
    for (const [name, list] of Object.entries(n.slots)) {
      if (!Array.isArray(list)) continue;
      // A popover's trigger is not part of its card; a dialog's toolbar holds controls, not actions.
      const slotInside = here && !(n.type === "PopoverPanel" && name === "trigger") && !(name === "toolbar" || (n.type === "DialogPanel" && name === "fixed"));
      const slotTrailing = (n.type === "IconLayout" && name === "actions") || (CONTAINERS.has(String(n.type)) && name === "footer");
      list.forEach((c, i) => walk(c, doc, `${at}/slots/${name}/${i}`, slotInside, slotTrailing, out));
    }
  }
}

export function checkIconLayout(docs: Record<string, unknown>): IconLayoutProblem[] {
  const out: IconLayoutProblem[] = [];
  for (const [id, d] of Object.entries(docs)) {
    if (ICON_LAYOUT_PENDING.has(id) || !isNode(d)) continue;
    walk(d.root ?? d, id, "/root", false, false, out);
  }
  return out;
}

/** Pending entries that no longer violate: migrations remove them so the list only shrinks. */
export function staleIconLayoutPending(docs: Record<string, unknown>): string[] {
  return [...ICON_LAYOUT_PENDING].filter((id) => {
    const d = docs[id];
    if (!isNode(d)) return true;
    const out: IconLayoutProblem[] = [];
    walk(d.root ?? d, id, "/root", false, false, out);
    return out.length === 0;
  });
}
