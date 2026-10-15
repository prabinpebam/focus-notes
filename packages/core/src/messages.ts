import { IntlMessageFormat } from "intl-messageformat";

/** Interface strings in ICU MessageFormat (I18N-01). Views use keys, never literal text. */
export type Messages = Record<string, string>;

export class MessageCatalog {
  #cache = new Map<string, IntlMessageFormat>();

  readonly locale: string;
  private readonly messages: Messages;

  constructor(locale: string, messages: Messages) {
    this.locale = locale;
    this.messages = messages;
  }

  has(key: string): boolean {
    return key in this.messages;
  }

  keys(): string[] {
    return Object.keys(this.messages);
  }

  format(key: string, args?: Record<string, unknown>): string {
    const source = this.messages[key];
    if (source === undefined) throw new Error(`Missing message ${key}`);
    let fmt = this.#cache.get(key);
    if (!fmt) {
      fmt = new IntlMessageFormat(source, this.locale);
      this.#cache.set(key, fmt);
    }
    return String(fmt.format(args as Record<string, string | number> | undefined));
  }

  /** The argument names a message uses, for ui:check. */
  argumentsOf(key: string): string[] {
    const source = this.messages[key];
    if (source === undefined) return [];
    const names = new Set<string>();
    const walk = (nodes: unknown[]): void => {
      for (const n of nodes as { type: number; value?: unknown; options?: Record<string, { value: unknown[] }> }[]) {
        // Argument-carrying element types: argument, number, date, time, select, plural.
        if ([1, 2, 3, 4, 5, 6].includes(n.type) && typeof n.value === "string") names.add(n.value);
        for (const opt of Object.values(n.options ?? {})) walk(opt.value);
      }
    };
    walk(new IntlMessageFormat(source, this.locale).getAst() as unknown[]);
    return [...names];
  }
}
