/** Notes the benchmarks and journeys share (PRF-03). Plain TypeScript, so Node runs it as it is. */

/** A 10,000-word note of the usual shapes: headings, paragraphs, lists, a task, a quote, and code. */
export function tenThousandWords(): string {
  const para = "Writing calmly means the words come first and the tool stays out of the way of every sentence. ";
  const parts = ["# Long note", ""];
  let words = 2;
  // Counted over the source, which has a few more tokens (#, -, ```) than the rendered text.
  for (let i = 0; words < 10_400; i++) {
    if (i % 12 === 0) parts.push(`## Section ${i / 12 + 1}`, "");
    else if (i % 12 === 5) parts.push("- a first point to keep", "- a second point to keep", "- [ ] a task to do", "");
    else if (i % 12 === 9) parts.push("> A quoted line that stays as it was written.", "");
    else if (i % 12 === 11) parts.push("```", "const keep = true;", "```", "");
    else parts.push(para.repeat(3).trim(), "");
    words = parts.join(" ").split(/\s+/).filter(Boolean).length;
  }
  return parts.join("\n");
}

/** A small, seeded random number generator (mulberry32), so a fixture is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Words writers use, and made-up ones from syllables, so the vocabulary is as large as a real workspace's. */
const COMMON = ("focus writing garden reading notes plan launch draft essay journal idea habit morning evening calm " +
  "project review meeting research book chapter outline question answer travel recipe budget health sleep music " +
  "design system theme color layout pattern sketch story character scene dialogue memory archive weekly monthly").split(" ");
const SYLLABLES = "ka lo mi ne su ra te vo zi pa do ri lu fe ma no si ta ve be co da ge hi ju".split(" ");

export interface FixtureNote {
  /** Relative to the workspace root, with `/`. */
  path: string;
  markdown: string;
}

/**
 * A workspace of `count` notes for the search index (SPT-07): about 40 folders, two levels deep;
 * titled notes of 150 to 450 words with three to six headings, lists, a link, and sometimes code
 * and front matter. The words are common ones and about 4,000 made-up ones. Seeded: the same
 * notes on every run.
 */
export function fixtureNotes(count = 5000, seed = 7): FixtureNote[] {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const made: string[] = [];
  for (let i = 0; i < 4000; i++) {
    let w = "";
    for (let n = 2 + Math.floor(rnd() * 3); n > 0; n--) w += pick(SYLLABLES);
    made.push(w);
  }
  const word = () => (rnd() < 0.3 ? pick(COMMON) : pick(made));
  const words = (n: number) => Array.from({ length: n }, word).join(" ");
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const folders = Array.from({ length: 8 }, (_, i) => `${pick(COMMON)}-${i}`).flatMap((top) => Array.from({ length: 5 }, (_, j) => `${top}/${pick(COMMON)}-${j}`));
  const taken = new Set<string>();
  const notes: FixtureNote[] = [];
  for (let i = 0; i < count; i++) {
    const title = cap(words(2 + Math.floor(rnd() * 4)));
    let stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const dir = rnd() < 0.1 ? "" : `${pick(folders)}/`;
    while (taken.has(dir + stem)) stem += "-2";
    taken.add(dir + stem);
    const parts = rnd() < 0.2 ? ["---", `id: n${i.toString(36)}`, "---", ""] : [];
    parts.push(`# ${title}`, "");
    let budget = 150 + Math.floor(rnd() * 300);
    for (let h = 0, heads = 3 + Math.floor(rnd() * 4); h < heads && budget > 0; h++) {
      parts.push(`## ${cap(words(1 + Math.floor(rnd() * 3)))}`, "");
      const n = Math.min(budget, 20 + Math.floor(rnd() * 60));
      budget -= n;
      parts.push(`${cap(words(n))}.`, "");
      if (rnd() < 0.3) parts.push(`- ${words(4)}`, `- [ ] ${words(3)}`, `- see [${words(2)}](../${pick(made)}.md)`, "");
      if (rnd() < 0.08) parts.push("```", `const ${pick(made)} = ${Math.floor(rnd() * 100)};`, "```", "");
    }
    notes.push({ path: `${dir}${stem}.md`, markdown: parts.join("\n") });
  }
  return notes;
}
