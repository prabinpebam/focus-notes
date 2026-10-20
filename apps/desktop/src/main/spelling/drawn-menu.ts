/**
 * The right-click menu in text on Windows and Linux (D-204, EDT-14): the shell decides its items and
 * sends them to the page, which draws them in the design system (TextMenu) so the menu follows the
 * theme. The shell stays the authority: a chosen item comes back as the menu's id and the item's id,
 * and only an item the latest menu offered, and that's available, does anything. A link's address
 * and the word the OS spell checker named stay here: the page only ever names the item. Each
 * right-click closes the menu before anything else, and a menu the page dismissed is gone.
 */
import { textMenuChoice, type TextMenuAction, type TextMenuEntry, type TextMenuModel } from "@focus-notes/core/text-menu";

export class DrawnTextMenu {
  private current: (TextMenuModel & { link: string; word: string | undefined }) | undefined;
  private next = 1;
  private readonly send: (m: TextMenuModel) => void;

  constructor(send: (m: TextMenuModel) => void) {
    this.send = send;
  }

  /** No menu: a new right-click came (before anything is awaited), so nothing older can be chosen. */
  close(): void {
    this.current = undefined;
  }

  /** The page dismissed menu `id`; a newer menu stays. */
  closed(id: unknown): void {
    if (this.current?.id === id) this.current = undefined;
  }

  /**
   * Opens a new menu at (x, y) in page pixels; returns its id. `link`: the address right-clicked, if
   * any; `word`: the word the OS spell checker named (Windows), which a suggestion replaces.
   */
  open(x: number, y: number, entries: TextMenuEntry[], link = "", word?: string): number {
    const id = this.next++;
    this.current = { id, x: Math.round(x), y: Math.round(y), entries, link, word };
    this.send({ id, x: this.current.x, y: this.current.y, entries });
    return id;
  }

  /** Fills in the menu showing (the OS spell checker's answer came after it opened); an older menu's is dropped. */
  update(id: number, entries: TextMenuEntry[], word?: string): void {
    if (this.current?.id !== id) return;
    this.current = { ...this.current, entries, word };
    this.send({ id, x: this.current.x, y: this.current.y, entries });
  }

  /** What the page's choice does, once checked, with the menu's link; a menu answers once. */
  choose(id: unknown, item: unknown): { action: TextMenuAction; link: string; word: string | undefined } | undefined {
    const action = textMenuChoice(this.current, id, item);
    if (!action || !this.current) return undefined;
    const { link, word } = this.current;
    this.current = undefined;
    return { action, link, word };
  }
}
