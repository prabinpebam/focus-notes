/**
 * DSY-06: all app UI is view documents rendered by the UI runtime. Every IA view built so far is a
 * view document (or a node in one), every view document passes the schema, and no application code
 * outside packages/ui holds markup or styles (the boundary check).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { views } from "../src/index.ts";

const root = join(import.meta.dirname, "..", "..", "..");

/**
 * The IA views built through M1 and MW, and where each lives: the canvas document, with the panels
 * and dialogs it opens as its nodes. Views from later stages (Spotlight, Settings, Share, the theme
 * manager, history, first run, the public page) join this list as they're built.
 */
const BUILT: { ia: string; view: string; node?: { type: string; id: string } }[] = [
  { ia: "IA-VIEW-CANVAS", view: "canvas" },
  { ia: "IA-VIEW-FILES", view: "canvas", node: { type: "Sheet", id: "files" } },
  { ia: "IA-VIEW-SHORTCUTS", view: "canvas", node: { type: "Dialog", id: "shortcuts" } },
  { ia: "IA-VIEW-GETSTARTED", view: "canvas", node: { type: "Dialog", id: "about" } },
  { ia: "IA-VIEW-SETTINGS", view: "settings" },
  { ia: "IA-VIEW-THEME", view: "theme" },
];

function find(node: unknown, pred: (n: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, pred);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const n = node as Record<string, unknown>;
  if (pred(n)) return n;
  for (const v of Object.values(n)) {
    const hit = find(v, pred);
    if (hit) return hit;
  }
  return undefined;
}

describe("all app UI is view documents (DSY-06)", () => {
  it("every IA view built so far is a view document or a node in one", () => {
    for (const b of BUILT) {
      const doc = views[b.view] as { ia?: string; root: unknown } | undefined;
      expect(doc, b.ia).toBeDefined();
      if (!b.node) expect(doc!.ia).toBe(b.ia);
      else expect(find(doc!.root, (n) => n.type === b.node!.type && n.id === b.node!.id), b.ia).toBeDefined();
    }
  });

  it("every view document on disk is registered, so the runtime renders only these", () => {
    const files = readdirSync(join(root, "packages", "views", "views")).filter((f) => f.endsWith(".view.json"));
    expect(files.map((f) => f.replace(".view.json", "")).sort()).toEqual(Object.keys(views).sort());
  });

  it("no markup or styles outside packages/ui, and every view passes ui:check", () => {
    // Both exit non-zero, naming the offending files, on any violation.
    expect(() => execFileSync(process.execPath, [join(root, "tools", "check-boundaries.mjs")], { cwd: root, stdio: "pipe" })).not.toThrow();
    expect(() => execFileSync(process.execPath, [join("src", "cli", "ui-check.ts")], { cwd: join(root, "packages", "ui-runtime"), stdio: "pipe" })).not.toThrow();
  }, 60_000);

  it("the desktop and web entries mount views and hold no markup or styles of their own", () => {
    for (const app of ["desktop", "web"]) {
      const all = readdirSync(join(root, "apps", app, "src"), { recursive: true }).map(String);
      expect(all.filter((f) => /\.(tsx|jsx|css)$/.test(f)), app).toEqual([]);
    }
  });
});
