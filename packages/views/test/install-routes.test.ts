/**
 * PKG-13, D-228: the Microsoft Store package carries Git, and Store policy 10.1.5 doesn't allow it
 * to offer software from outside the Store. Every place in a view that offers to install something
 * (an install page, the install command, Copy) shows only when `vm.firstRun.canInstall` is true,
 * which it never is when Git came with the app.
 */
import { describe, expect, it } from "vitest";
import { INSTALL_PAGES } from "../../core/src/first-run.ts";
import { fragments, pages, sitePages, views } from "../src/index.ts";

type Json = Record<string, unknown>;
const GATE = "vm.firstRun.canInstall";
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** What a node offers to install, if anything: an install page, the command, or copying it. */
function installRoute(node: Json): string | undefined {
  const text = JSON.stringify({ on: node.on, props: node.props });
  for (const page of INSTALL_PAGES) if (text.includes(`"page":"${page}"`)) return `page ${page}`;
  if (text.includes('"run":"firstRun.copyCommand"')) return "copyCommand";
  if (text.includes('"vm.firstRun.installCommand"') || text.includes('"vm.firstRun.installText"')) return "installCommand";
  return undefined;
}

/** Walks a document; `gated` is whether an ancestor (or the node) shows only when installing is allowed. */
function routes(doc: unknown): { at: string; route: string; gated: boolean }[] {
  const found: { at: string; route: string; gated: boolean }[] = [];
  const walk = (v: unknown, at: string, gated: boolean): void => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}/${i}`, gated));
    if (!isObj(v)) return;
    const when = v.when;
    const here = gated || (isObj(when) && when.get === GATE);
    if (typeof v.type === "string") {
      const route = installRoute(v);
      if (route) found.push({ at, route, gated: here });
    }
    const switchOn = isObj(v.switch) ? v.switch.get : undefined;
    for (const [k, child] of Object.entries(v)) {
      if (k === "on" || k === "props" || k === "when" || k === "switch") continue;
      if (k === "cases" && isObj(child) && switchOn === GATE) {
        for (const [c, n] of Object.entries(child)) walk(n, `${at}/cases/${c}`, here || c === "true");
        continue;
      }
      walk(child, `${at}/${k}`, here);
    }
  };
  walk(doc, "", false);
  return found;
}

describe("PKG-13, D-228: install routes show only where installing is allowed", () => {
  const all = Object.entries({ ...views, ...pages, ...sitePages, ...fragments }).flatMap(([name, doc]) => routes(doc).map((r) => ({ ...r, name })));

  it("finds the first run's install routes, so the check can't pass by finding nothing", () => {
    expect(all.map((r) => r.route).sort()).toEqual(expect.arrayContaining(["copyCommand", "page gcm", "page gh", "page git"]));
  });

  it("every one shows only when vm.firstRun.canInstall is true", () => {
    expect(all.filter((r) => !r.gated).map((r) => `${r.name}${r.at}: ${r.route}`)).toEqual([]);
  });
});
