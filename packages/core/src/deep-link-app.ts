/**
 * Deep links in the app (WP-7.3, AGT-06, D-165): the shell checks a link (`parseDeepLink`) and
 * resolves its note inside the open workspace; here it's only shown. `open` loads the note and goes
 * to the heading its anchor names; `search` opens Spotlight with the query. Nothing here writes.
 */
import type { PlatformBridge } from "./bridge.ts";
import { headingAnchor } from "./deep-link.ts";
import { parseAtx } from "./scan.ts";

interface Ctx {
  bridge: PlatformBridge;
  openAt: (path: string, at: { heading?: { index: number; text: string } }) => Promise<void>;
  /** Spotlight in notes mode with the query as it is: never read for command or heading prefixes. */
  searchNotes: (query: string) => void;
}

/** The note's headings as the editor counts them (top-level ATX headings outside fenced code), by anchor. */
export function headingByAnchor(markdown: string, anchor: string): { index: number; text: string } | undefined {
  let fence: string | undefined;
  let index = 0;
  const seen = new Map<string, number>();
  for (const line of markdown.split(/\r?\n/)) {
    if (line.length > 4096) continue;
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (f) {
      if (!fence) fence = f[0];
      else if (f[0] === fence) fence = undefined;
      continue;
    }
    if (fence) continue;
    const h = parseAtx(line);
    if (!h || h.text === undefined) continue;
    const base = headingAnchor(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if ((n ? `${base}-${n}` : base) === anchor) return { index, text: h.text };
    index++;
  }
  return undefined;
}

export function registerDeepLinks(ctx: Ctx) {
  const { bridge } = ctx;
  async function take(): Promise<void> {
    const link = await bridge.deepLinks?.take().catch(() => undefined);
    if (!link) return;
    // A link's query only ever searches notes: `>make public` is text to find, not a command (D-165).
    if (link.kind === "search") return ctx.searchNotes(link.q);
    const heading = link.heading ? headingByAnchor(await bridge.readNote(link.path).catch(() => ""), link.heading) : undefined;
    await ctx.openAt(link.path, heading ? { heading } : {});
  }
  bridge.deepLinks?.onArrive(() => void take());
  return { take };
}
