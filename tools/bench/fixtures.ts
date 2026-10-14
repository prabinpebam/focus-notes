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
