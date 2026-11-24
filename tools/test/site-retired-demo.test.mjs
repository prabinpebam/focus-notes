/**
 * WEB-01 (D-292): the browser demo is retired at its root. Its old address sends visitors to the
 * landing page's downloads, with no editor, script or placeholder page left behind.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as builder from "../site/build.mjs";
import { renderSite } from "../../apps/web/site/render.ts";

const content = join(import.meta.dirname, "..", "..", "site");
let out;
beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "fn-site-demo-"));
  await builder.buildSite({ content, out, renderer: { renderSite } });
});
afterAll(async () => { await rm(out, { recursive: true, force: true }); });

it("WEB-01, D-292: /demo/ redirects to the downloads, and the builder has no demo to place", async () => {
  const html = await readFile(join(out, "demo", "index.html"), "utf8");
  expect(html).toMatch(/<meta http-equiv="refresh" content="0; url=\.\.\/#download" \/>/);
  expect(html).not.toMatch(/<script|contenteditable|Try the demo/i);
  expect(builder.SITE_PAGES).not.toContain("demo");
  expect("placeDemo" in builder).toBe(false);
  expect(await builder.checkSite(out, { assume: ["documentations/", "app/"] })).toEqual([]);
});
