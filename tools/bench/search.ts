/**
 * SPT-07's measures, on the 5,000-note fixture, through the search worker's own messages on a
 * worker thread (the same code and engine as the app's Web Worker, round trips included):
 *
 * - `SPT-07.openMs`: what Spotlight waits for from the index when it opens, the first answer from
 *   an index that has just finished building (the panel itself is built once and kept, WP-4.2).
 * - `SPT-07.titleQueryP95Ms`: per keystroke, titles, headings, folders, and commands, typed a letter
 *   at a time, with typos.
 * - `SPT-07.fullTextP95Ms`: full text with snippets, typed a word at a time, with typos.
 * - `SPT-07.indexBuildMs`: from the first change to every note's text indexed (reported, no budget).
 * - `FND-04.findAllP95Ms`: Find in all notes, every match in 5,000 notes counted and the first 1,000
 *   listed with their lines, for words, phrases, whole words, case, and regular expressions.
 */
import { fixtureNotes } from "./fixtures.ts";
import { searchThread } from "./search-client.ts";
import type { IndexOp, SearchItem } from "../../packages/core/src/search/types.ts";

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const round = (x: number) => Math.round(x * 100) / 100;

/** About as many commands and settings as Spotlight lists. */
const ITEMS: SearchItem[] = Array.from({ length: 150 }, (_, i) => ({ id: `cmd.${i}`, title: `Command number ${i} toggle`, keywords: ["action", `k${i}`] }));

/** A typo: two neighbouring letters swapped, or one changed. */
const typo = (w: string, i: number) => (w.length < 5 ? w : i % 2 ? w.slice(0, 2) + w[3] + w[2] + w.slice(4) : `${w.slice(0, -1)}x`);

export async function measureSearch(runs = 3): Promise<Record<string, number>> {
  const notes = fixtureNotes();
  const titles = notes.filter((_, i) => i % 125 === 0).map((n) => /^# (.+)$/m.exec(n.markdown)![1]!);
  const bodies = notes.filter((_, i) => i % 125 === 7).map((n) => n.markdown.split("\n").find((l) => /^[A-Z][a-z]+( [a-z]+){6}/.test(l))!.split(" "));
  const open: number[] = [];
  const build: number[] = [];
  const title: number[] = [];
  const text: number[] = [];
  const find: number[] = [];
  for (let run = 0; run < runs; run++) {
    const index = searchThread();
    try {
      const t0 = performance.now();
      index.apply([{ op: "items", kind: "command", items: ITEMS }, ...notes.map((n): IndexOp => ({ op: "note", path: n.path, rel: n.path, root: "private" }))]);
      index.apply(notes.map((n): IndexOp => ({ op: "text", path: n.path, markdown: n.markdown })));
      await index.whenIndexed();
      build.push(performance.now() - t0);
      const timed = async (q: Parameters<typeof index.query>[0]) => {
        const t = performance.now();
        await index.query(q);
        return performance.now() - t;
      };
      open.push(await timed({ text: titles[0]!.slice(0, 3), scope: "titles" }));
      for (const [i, t] of titles.entries()) {
        for (let n = 1; n <= Math.min(t.length, 14); n++) title.push(await timed({ text: t.slice(0, n), scope: "titles" }));
        title.push(await timed({ text: t.split(" ").map(typo).join(" ").slice(0, 14) + (i % 3 ? "" : " "), scope: "titles" }));
      }
      for (const [i, words] of bodies.entries()) {
        for (let n = 1; n <= 3; n++) text.push(await timed({ text: words.slice(1, 1 + n).join(" "), scope: "text" }));
        text.push(await timed({ text: words.slice(1, 3).map(typo).join(" "), scope: "text" }));
        text.push(await timed({ text: words.slice(2, 4).join(" ").slice(0, 3 + (i % 4)), scope: "text" }));
      }
      const found = async (q: Parameters<typeof index.find>[0]) => {
        const t = performance.now();
        await index.find(q);
        return performance.now() - t;
      };
      for (const [i, words] of bodies.entries()) {
        find.push(await found({ text: words[1]! }));
        find.push(await found({ text: words.slice(1, 3).join(" "), caseSensitive: i % 2 === 0 }));
        find.push(await found({ text: words[2]!, wholeWord: true }));
        find.push(await found({ text: `${words[1]!.slice(0, 3)}\\w+`, regex: true }));
      }
      // The most common word: every note matches, and the listing stops at 1,000.
      find.push(await found({ text: "the" }));
    } finally {
      index.dispose();
    }
  }
  return {
    "SPT-07.openMs": round(median(open)),
    "SPT-07.titleQueryP95Ms": round(p95(title)),
    "SPT-07.fullTextP95Ms": round(p95(text)),
    "SPT-07.indexBuildMs": Math.round(median(build)),
    "FND-04.findAllP95Ms": round(p95(find)),
  };
}
