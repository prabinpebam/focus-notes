/**
 * Writes the first-run catalogue's review page (`fre-catalog.spec.ts`): a self-contained
 * `index.html` beside the screenshots, grouped by step, light and dark side by side, with a note
 * box per state kept in the browser's localStorage and an Export comments button, and a
 * `README.md` listing the states that weren't reached. A review artifact for the owner, outside the
 * app: never part of its interface.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CatalogState {
  id: string;
  n: number;
  step: string;
  stepTitle: string;
  state: string;
  label: string;
  when: string;
  primary: boolean;
}
export interface Shot { id: string; theme: "light" | "dark"; size: "default" | "small" | "large"; file: string }
export interface Measure { words: number; maxLines: number; anchor: number; anchorScore: number; economyScore: number }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const SIZE_LABEL = { default: "Default window (1100 × 780)", small: "Smallest (480 × 360)", large: "Large (1600 × 1000)" } as const;

export function writeReview(out: string, opts: { states: CatalogState[]; shots: Shot[]; measures: Record<string, Measure>; commit: string; subject: string; unreachable: Record<string, string>; captured: string; notes: string[] }) {
  const { states, shots, measures, commit, subject, unreachable, captured, notes } = opts;
  const steps = [...new Map(states.map((s) => [s.step, s.stepTitle])).entries()];
  const reached = states.filter((s) => shots.some((x) => x.id === s.id));
  const img = (s: Shot | undefined) => (s ? `<a href="${esc(s.file)}" target="_blank"><img loading="lazy" src="${esc(s.file)}" alt="${esc(s.file)}"></a><code>${esc(s.file)}</code>` : `<div class="missing">not captured</div>`);
  const section = (s: CatalogState) => {
    const of = (size: Shot["size"], theme: Shot["theme"]) => shots.find((x) => x.id === s.id && x.size === size && x.theme === theme);
    const m = measures[s.id];
    const score = m ? `<span class="score" title="Measured on the default light capture: visual anchor (criterion 1) and text economy (criterion 4) of the VVS; the other three criteria are judged by eye">anchor ${m.anchorScore}/20 (${m.anchor} px) · economy ${m.economyScore}/20 (${m.words} words, longest paragraph ${m.maxLines} lines)</span>` : "";
    const rows = (["default", "small", "large"] as const).filter((size) => of(size, "light") || of(size, "dark")).map((size) => `
      <div class="size">${SIZE_LABEL[size]}</div>
      <div class="pair"><figure><figcaption>Light</figcaption>${img(of(size, "light"))}</figure><figure><figcaption>Dark</figcaption>${img(of(size, "dark"))}</figure></div>`).join("");
    return `
    <section class="state" id="s-${esc(s.id)}">
      <h3><span class="n">${String(s.n).padStart(2, "0")}</span> ${esc(s.label)} ${s.primary ? '<span class="tag">main path</span>' : ""}</h3>
      <p class="when">${esc(s.when)}</p>
      ${score}
      ${rows}
      <label class="note">Your notes on ${String(s.n).padStart(2, "0")} ${esc(s.label)}<textarea data-id="${esc(s.id)}" data-label="${String(s.n).padStart(2, "0")} ${esc(s.stepTitle)}: ${esc(s.label)}" rows="3" placeholder="Type a comment; it's kept in this browser."></textarea></label>
    </section>`;
  };
  const missing = Object.entries(unreachable);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Focus Notes first run and setup: review</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f5f2; --fg: #1d1d1b; --muted: #66645e; --card: #fff; --line: #dcd9d2; --accent: #c2410c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171716; --fg: #ecebe7; --muted: #a4a29b; --card: #222220; --line: #3a3936; --accent: #fb923c; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); }
  header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 24px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 18px; margin: 0; flex: 1 1 auto; }
  header button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
  header button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  main { padding: 16px 24px 80px; max-width: 2200px; margin: 0 auto; }
  .meta { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
  .meta code { font-size: 13px; }
  nav ol { columns: 3 260px; margin: 0; padding-left: 20px; }
  nav a { color: var(--fg); }
  h2 { margin: 40px 0 8px; padding-top: 8px; border-top: 2px solid var(--line); }
  .state { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .state h3 { margin: 0; font-size: 16px; }
  .n { display: inline-block; min-width: 2.2em; color: var(--muted); font-variant-numeric: tabular-nums; }
  .tag { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 10px; background: var(--accent); color: #fff; vertical-align: middle; }
  .when { margin: 4px 0 8px; color: var(--muted); }
  .score { display: inline-block; font-size: 12px; color: var(--muted); border: 1px dashed var(--line); border-radius: 4px; padding: 1px 6px; margin-bottom: 8px; }
  .size { font-size: 12px; font-weight: 600; color: var(--muted); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: var(--muted); }
  figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; background: repeating-conic-gradient(#8881 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
  figure code { display: block; font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
  .missing { padding: 24px; border: 1px dashed var(--line); color: var(--muted); text-align: center; }
  .note { display: block; margin-top: 10px; font-size: 12px; color: var(--muted); }
  .note textarea { display: block; width: 100%; margin-top: 4px; font: inherit; font-size: 14px; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px; resize: vertical; }
  .note textarea:not(:placeholder-shown) { border-color: var(--accent); }
  #exported { position: fixed; inset: 10% 15%; z-index: 3; display: none; flex-direction: column; gap: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; box-shadow: 0 10px 40px #0006; }
  #exported.open { display: flex; }
  #exported textarea { flex: 1; font: 13px/1.4 ui-monospace, monospace; background: var(--bg); color: var(--fg); }
  .unreached li { margin: 4px 0; }
</style>
</head>
<body>
<header>
  <h1>Focus Notes: first run and setup, every state</h1>
  <span id="count"></span>
  <button class="primary" id="export">Export comments</button>
  <button id="clear">Clear comments</button>
</header>
<main>
  <div class="meta">
    <div><strong>Commit captured:</strong> <code>${esc(commit)}</code> ${esc(subject)}</div>
    <div><strong>Captured:</strong> ${esc(captured)} · ${reached.length} states · ${shots.length} images · every state light and dark at the default window, the main path also at the smallest and a large window.</div>
    <div>Images are the whole window, including its transparent shadow margin (the checkerboard). Click an image to open it full size. Comments are kept in this browser (localStorage); Export comments copies them all as text.</div>
    <details><summary>How the harder states were reached</summary><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>
  </div>
  <nav class="meta"><strong>Steps</strong><ol>${steps.map(([id, t]) => `<li><a href="#step-${esc(id)}">${esc(t)}</a></li>`).join("")}${missing.length ? `<li><a href="#unreached">Not reached</a></li>` : ""}</ol></nav>
  ${steps.map(([id, t]) => `<h2 id="step-${esc(id)}">${esc(t)}</h2>${reached.filter((s) => s.step === id).map(section).join("")}`).join("\n")}
  ${missing.length ? `<h2 id="unreached">Not reached</h2><ul class="unreached">${missing.map(([id, why]) => `<li><strong>${esc(states.find((s) => s.id === id)?.label ?? id)}</strong>: ${esc(why)}</li>`).join("")}</ul>` : ""}
</main>
<div id="exported" role="dialog" aria-label="Exported comments"><strong>Comments (copied to the clipboard if the browser allowed it)</strong><textarea readonly></textarea><button id="close">Close</button></div>
<script>
  const KEY = "focus-notes-fre-review:";
  const boxes = [...document.querySelectorAll("textarea[data-id]")];
  const count = () => { document.getElementById("count").textContent = boxes.filter((b) => b.value.trim()).length + " comments"; };
  for (const b of boxes) {
    b.value = localStorage.getItem(KEY + b.dataset.id) ?? "";
    b.addEventListener("input", () => { if (b.value) localStorage.setItem(KEY + b.dataset.id, b.value); else localStorage.removeItem(KEY + b.dataset.id); count(); });
  }
  count();
  document.getElementById("export").addEventListener("click", async () => {
    const text = ["Focus Notes first-run review, commit ${esc(commit)}", ""].concat(boxes.filter((b) => b.value.trim()).map((b) => b.dataset.label + "\\n" + b.value.trim() + "\\n")).join("\\n");
    const panel = document.getElementById("exported");
    panel.querySelector("textarea").value = text;
    panel.classList.add("open");
    panel.querySelector("textarea").select();
    try { await navigator.clipboard.writeText(text); } catch { document.execCommand("copy"); }
  });
  document.getElementById("close").addEventListener("click", () => document.getElementById("exported").classList.remove("open"));
  document.getElementById("clear").addEventListener("click", () => {
    if (!confirm("Clear every comment on this page?")) return;
    for (const b of boxes) { b.value = ""; localStorage.removeItem(KEY + b.dataset.id); }
    count();
  });
</script>
</body>
</html>
`;
  writeFileSync(join(out, "index.html"), html);
  const readme = [
    "# Focus Notes: first run and setup, every state",
    "",
    `Captured ${captured} from commit \`${commit}\` (${subject}) by \`apps/desktop/e2e/fre-catalog.spec.ts\` (FOCUS_NOTES_CAPTURE_FRE=1), with the journeys' fake GitHub and sign-in helpers.`,
    "",
    `Open \`index.html\` to review: ${reached.length} states, ${shots.length} images. Files are named \`NN-<step>-<state>.<theme>.<size>.png\`, numbered in flow order; sizes are \`default\` (1100 × 780), \`small\` (480 × 360) and \`large\` (1600 × 1000), the last two for the main path only.`,
    "",
    "## States that couldn't be reached",
    "",
    ...(missing.length ? missing.map(([id, why]) => `- **${states.find((s) => s.id === id)?.label ?? id}** (\`${id}\`): ${why}`) : ["None: every state in the catalogue was captured."]),
    "",
    "## How the harder states were reached",
    "",
    ...notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
  writeFileSync(join(out, "README.md"), readme);
}
