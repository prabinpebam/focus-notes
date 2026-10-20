/**
 * The right-click menu in text on Windows and Linux (D-204, EDT-14): the shell decides its items and
 * sends them to the page, which draws them in the design system (TextMenu) so the menu follows the
 * theme. The shell stays the authority: a chosen item comes back as the menu's id and the item's id,
 * and only an item the latest menu offered, and that's available, does anything. A link's address
 * stays here: the page only ever names the item.
 */
import { textMenuChoice, type TextMenuAction, type TextMenuEntry, type TextMenuModel } from "@focus-notes/core/text-menu";

export class DrawnTextMenu {
  private current: (TextMenuModel & { link: string }) | undefined;
  private next = 1;
  private readonly send: (m: TextMenuModel) => void;

  constructor(send: (m: TextMenuModel) => void) {
    this.send = send;
  }

  /** Opens a new menu at (x, y) in page pixels; returns its id. `link`: the address right-clicked, if any. */
  open(x: number, y: number, entries: TextMenuEntry[], link = ""): number {
    const id = this.next++;
    this.current = { id, x: Math.round(x), y: Math.round(y), entries, link };
    this.send({ id, x: this.current.x, y: this.current.y, entries });
    return id;
  }

  /** Fills in the menu showing (the OS spell checker's answer came after it opened); an older menu's is dropped. */
  update(id: number, entries: TextMenuEntry[]): void {
    if (this.current?.id !== id) return;
    this.current = { ...this.current, entries };
    this.send({ id, x: this.current.x, y: this.current.y, entries });
  }

  /** What the page's choice does, once checked, with the menu's link; a menu answers once. */
  choose(id: unknown, item: unknown): { action: TextMenuAction; link: string } | undefined {
    const action = textMenuChoice(this.current, id, item);
    if (!action || !this.current) return undefined;
    const link = this.current.link;
    this.current = undefined;
    return { action, link };
  }
}
