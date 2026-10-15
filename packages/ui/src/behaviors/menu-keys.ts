/**
 * Home and End in a menu move focus to its first or last item, and React Aria scrolls that item into
 * view itself. React Aria (3.52) leaves those two keys' default action on in a menu (its handler
 * returns false once it has moved focus), so the browser also runs its own smooth Home or End scroll
 * of the menu. Pressed in quick succession, that animation carries on after focus has moved: the menu
 * swings past its end and back, and for a moment the focused item, its ring with it, is cut off at the
 * menu's edge (DEF-9). The menu owns these keys, so their default action is prevented.
 */
export const ownsKey = (e: Pick<KeyboardEvent, "key">): boolean => e.key === "Home" || e.key === "End";

const owned = new WeakSet<Element>();

/** A callback ref for a menu's element: its Home and End move focus only, never the browser's scroll too. */
export function ownHomeEnd(el: HTMLElement | null): void {
  if (!el || owned.has(el)) return;
  owned.add(el);
  // On the menu's own element, so it runs before React Aria's handler (which doesn't check it).
  el.addEventListener("keydown", (e) => {
    if (ownsKey(e)) e.preventDefault();
  });
}
