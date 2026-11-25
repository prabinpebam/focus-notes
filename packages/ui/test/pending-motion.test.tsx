import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compileStyles } from "../../../tools/spacing/compile-css.mjs";
import { SaveState } from "../src/primitives/SaveState/SaveState.tsx";

// Standalone wait signs that are themselves the spinner; nothing else may turn (D-356).
const TURNING = /primitives\/(Spinner|StepMark|ScanRadar)\//;

function keyframes(css: string) {
  const found: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1, i = re.lastIndex;
    while (depth > 0 && i < css.length) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0, i++;
    found.push({ name: m[1]!, body: css.slice(re.lastIndex, i - 1) });
  }
  return found;
}

describe("D-356: the pending pattern moves only the border arc", () => {
  let styles: { file: string; css: string }[];
  beforeAll(async () => { styles = await compileStyles(); }, 120_000);

  it("no control or its content rotates; only standalone spinners turn", () => {
    const turning = styles.flatMap(({ file, css }) => keyframes(css)
      .filter(k => /rotate|transform:[^;]*turn/.test(k.body))
      .map(k => `${file} @keyframes ${k.name}`));
    expect(turning.filter(entry => !TURNING.test(entry))).toEqual([]);
  });

  it("the border arc sweeps a gradient angle, never a transform", () => {
    const commit = styles.find(({ file }) => file.endsWith("CommitMark/CommitMark.css.ts"))!.css;
    const pending = /\[data-border-progress=pending\][^{]*\{[^}]*animation-name:\s*([\w-]+)/.exec(commit.replaceAll('"', ""));
    expect(pending?.[1]).toBeTruthy();
    const sweep = keyframes(commit).find(k => k.name === pending![1])!;
    expect(sweep.body).not.toMatch(/transform|rotate/);
  });

  it("SaveState animates nothing of its own and shows the shared arc while backing up", () => {
    const own = styles.find(({ file }) => file.endsWith("SaveState/SaveState.css.ts"))!.css;
    expect(own).not.toMatch(/@keyframes|animation/);
    const html = renderToStaticMarkup(<SaveState state="syncing" label="Backing up" interactive={false} />)
      + renderToStaticMarkup(<SaveState state="syncing" label="Backing up" text="Backing up…" />);
    expect(html.match(/data-border-progress="pending"/g)).toHaveLength(1);
  });
});
