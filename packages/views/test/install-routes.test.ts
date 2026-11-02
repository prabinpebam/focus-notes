/**
 * PKG-13, D-228: the Microsoft Store package carries Git, and Store policy 10.1.5 doesn't allow it
 * to offer software from outside the Store. Every place in a view that offers to install something
 * (an install page, the install command, Copy) shows only when `vm.firstRun.canInstall` is true,
 * which it never is when Git came with the app.
 */
import { describe, expect, it } from "vitest";
import { INSTALL_PAGES } from "../../core/src/first-run.ts";
import { fragments, messages, pages, sitePages, views } from "../src/index.ts";

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

  function aiCopyProblems(documents: Record<string, unknown>, catalogue: Record<string, string>): string[] {
    const problems: string[] = [];
    const banned = /\b(?:install(?:ed|ation)?|download(?:s|ing)?)\b|https?:\/\/(?!localhost\b|127\.0\.0\.1\b)[^\s"<>]+/i;
    const check = (text: string, at: string): void => {
      if (banned.test(text)) problems.push(`${at}: ${text}`);
    };
    const aiKey = (key: string): boolean => /^(?:ai\.|rewrite\.|command\.ai\.|command\.rewrite\.)/.test(key);
    for (const [key, text] of Object.entries(catalogue)) if (aiKey(key)) check(text, key);
    const walk = (value: unknown, at: string, ai: boolean): void => {
      if (typeof value === "string") {
        if (ai) check(value, at);
        return;
      }
      if (Array.isArray(value)) return value.forEach((child, i) => walk(child, `${at}/${i}`, ai));
      if (!isObj(value)) return;
      const ownBindings = JSON.stringify({ props: value.props, on: value.on, each: value.each, when: value.when });
      const here = ai || /"(?:vm\.ai(?:\.|")|vm\.rewrite(?:\.|")|ai\.|rewrite\.)/.test(ownBindings);
      if (typeof value.t === "string" && (here || aiKey(value.t))) {
        const text = catalogue[value.t];
        if (text !== undefined) check(text, `${at}/t:${value.t}`);
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === "$schema") continue;
        walk(child, `${at}/${key}`, here);
      }
    };
    for (const [name, doc] of Object.entries(documents)) walk(doc, name, /ai|rewrite/i.test(name));
    return problems;
  }

  describe("PKG-13: AI copy never promotes outside software", () => {
    it("checks every locale and AI-bound view, page and fragment, including Rewrite", () => {
      const documents = { ...views, ...pages, ...sitePages, ...fragments };
      const english = messages.en;
      if (!english) throw new Error("The English catalogue is required for the AI copy guard.");
      expect(Object.keys(english).filter((key) => key.startsWith("ai.")).length).toBeGreaterThan(100);
      expect(JSON.stringify(documents)).toContain("vm.ai");
      expect(documents).toHaveProperty("rewrite");
      for (const catalogue of Object.values(messages)) expect(aiCopyProblems(documents, catalogue)).toEqual([]);
    });

    it("rejects unused AI messages, translated non-AI keys and literal text in nested AI fragments", () => {
      const documents = {
        settings: { children: [{ type: "Stack", each: { get: "vm.ai.connections" }, children: [
          { type: "Text", props: { value: { t: "other.hint" } } },
          { type: "Text", props: { value: "Download a local AI app" } },
          { type: "Link", props: { href: "https://example.com/software" } },
        ] }] },
      };
      expect(aiCopyProblems(documents, { "ai.unused": "Install a model", "other.hint": "Install the CLI" })).toHaveLength(4);
      expect(aiCopyProblems({ rewrite: { props: { value: "Choose another connection" } } }, {
        "ai.error.invalid-url": "Use an https:// address, or http://127.0.0.1 or http://localhost.",
      })).toEqual([]);
    });
  });

  it("every one shows only when vm.firstRun.canInstall is true", () => {
    expect(all.filter((r) => !r.gated).map((r) => `${r.name}${r.at}: ${r.route}`)).toEqual([]);
  });
});
