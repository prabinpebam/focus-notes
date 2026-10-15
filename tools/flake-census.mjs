#!/usr/bin/env node
/**
 * The flake census's summary (D-152): reads Playwright JSON reports (one per shard, each journey
 * run N times with --repeat-each) and lists every journey with how many of its runs failed and
 * each distinct first line of the failures, flakiest first. Written as Markdown to standard output
 * (and to the job summary by the flake-census workflow); `--json <file>` also writes the counts.
 *
 *   node tools/flake-census.mjs census/shard-1.json census/shard-2.json … [--json census/summary.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/** The first line of a failure's message, without colours or the locator's call log. */
export function firstLine(message) {
  return String(message ?? "").replace(ANSI, "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 300) ?? "(no message)";
}

/** Every test run in a Playwright JSON report, with its file, line, title, and outcome. */
export function* runs(report) {
  const walk = function* (suite, titles) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        // The last result is the run's outcome (retries are off in the journeys, so it's the only one).
        const result = test.results?.at(-1);
        if (!result || result.status === "skipped" || test.status === "skipped") continue;
        const ok = test.status === "expected" || test.status === "flaky";
        yield {
          id: `${spec.file}:${spec.line}`,
          title: [...titles, spec.title].filter(Boolean).join(" › "),
          ok,
          message: ok ? undefined : firstLine(result.error?.message ?? result.errors?.[0]?.message ?? result.status),
        };
      }
    }
    for (const child of suite.suites ?? []) yield* walk(child, [...titles, child.title]);
  };
  // Each top-level suite is a file; the suites inside it are its describe blocks.
  for (const suite of report.suites ?? []) yield* walk(suite, []);
}

/** Runs and failures per journey, flakiest first; each distinct failure message with its count. */
export function census(reports) {
  const by = new Map();
  for (const report of reports) {
    for (const r of runs(report)) {
      const e = by.get(r.id) ?? { id: r.id, title: r.title, runs: 0, failed: 0, messages: {} };
      e.runs++;
      if (!r.ok) {
        e.failed++;
        e.messages[r.message] = (e.messages[r.message] ?? 0) + 1;
      }
      by.set(r.id, e);
    }
  }
  return [...by.values()].sort((a, b) => b.failed / b.runs - a.failed / a.runs || b.failed - a.failed || a.id.localeCompare(b.id));
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

/** The census as Markdown: the totals, then a row for each journey that failed at least once. */
export function markdown(rows) {
  const runsTotal = rows.reduce((n, r) => n + r.runs, 0);
  const failing = rows.filter((r) => r.failed > 0);
  const lines = [`## Flake census`, "", `${rows.length} journeys, ${runsTotal} runs; ${failing.length} failed at least once.`, ""];
  if (!failing.length) return lines.join("\n");
  lines.push("| Journey | Failed | Failures |", "| --- | ---: | --- |");
  for (const r of failing) {
    const msgs = Object.entries(r.messages).map(([m, n]) => `${n} × ${cell(m)}`).join("<br>");
    lines.push(`| \`${cell(r.id)}\` ${cell(r.title)} | ${r.failed} of ${r.runs} | ${msgs} |`);
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--json");
  const jsonOut = at >= 0 ? args.splice(at, 2)[1] : undefined;
  if (!args.length) {
    process.stderr.write("Usage: node tools/flake-census.mjs <report.json>… [--json <summary.json>]\n");
    process.exit(2);
  }
  const rows = census(args.map((f) => JSON.parse(readFileSync(f, "utf8"))));
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(rows, null, 2)}\n`);
  process.stdout.write(`${markdown(rows)}\n`);
}
