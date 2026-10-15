/**
 * PRF-06 (WP-5.1, D-139): publishing 1,000 public and 200 shared notes takes 5 minutes or less.
 * The real publisher (`packages/seal`'s `publish`, as the Deploy app workflow runs it) on a generated
 * instance: 1,000 public notes rendered to pages with the page renderer and indexed, 200 private
 * notes in 20 folders sealed for 10 share audiences (by link and by passcode) and the owner's vault,
 * then the leak check over the whole site. From the call to the site written, in Node.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publish } from "../../packages/seal/src/publish.ts";

const root = join(import.meta.dirname, "..", "..");
const reader = join(root, "apps", "web", "dist-reader");

const b64 = (n: number, seed: number) => Buffer.from(Array.from({ length: n }, (_, i) => (seed * 31 + i * 7) & 255)).toString("base64url");
const PUBLIC_WORDS = ["focus", "garden", "quiet", "morning", "river", "lantern", "paper", "harbor", "orbit", "meadow", "signal", "copper"];
// Private notes use other words: the leak check would rightly stop a site whose public notes quote them.
const PRIVATE_WORDS = ["velvet", "quartz", "falcon", "juniper", "saffron", "tundra", "basalt", "cobalt", "zephyr", "walnut", "ember", "fjord"];
const sentence = (i: number, n = 14, words = PUBLIC_WORDS) => Array.from({ length: n }, (_, k) => words[(i * 5 + k * 3) % words.length]).join(" ");

function note(title: string, i: number, links: string[], words = PUBLIC_WORDS): string {
  const paras = Array.from({ length: 6 }, (_, k) => `${sentence(i + k, 14, words)} *${words[k % words.length]}* and **${words[(k + 3) % words.length]}**.`);
  return [`# ${title}`, "", ...paras.flatMap((p) => [p, ""]), "## Notes", "", ...links.map((l) => `- See [${l}](${l})`), "", "- [ ] a task", "- [x] done", "", "```", `const ${words[i % words.length]} = ${i};`, "```", ""].join("\n");
}

/** Writes the instance: notes/ with 1,000 public notes, private/ with 200 notes and access.json. */
function instance(): { dir: string; notes: string; priv: string } {
  const dir = mkdtempSync(join(tmpdir(), "fn-bench-publish-"));
  const notes = join(dir, "notes");
  const priv = join(dir, "private");
  for (let i = 0; i < 1000; i++) {
    const folder = `topic-${i % 25}`;
    const p = join(notes, folder, `note-${i}.md`);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, `${i % 10 === 0 ? `---\nexcerpt: ${sentence(i, 8)}\n---\n` : ""}${note(`Public note ${i}`, i, [`note-${(i + 1) % 1000}.md`])}`);
  }
  for (let i = 0; i < 200; i++) {
    const p = join(priv, "notes", `folder-${i % 20}`, `private-${i}.md`);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, note(`Shared plan ${i} kept between friends`, i + 5000, [], PRIVATE_WORDS));
  }
  const created = "2026-10-01T00:00:00.000Z";
  const grants = [
    { id: "ownerbench", name: "You", owner: true, salt: b64(16, 1), passcodeKey: b64(32, 2), scope: { all: true }, createdAt: created },
    // Ten audiences, two folders each: all 200 private notes are shared.
    ...Array.from({ length: 10 }, (_, g) => ({
      id: `share${g}bench`, name: `Audience ${g}`, salt: b64(16, 10 + g), createdAt: created,
      scope: { folders: [`folder-${2 * g}`, `folder-${2 * g + 1}`] },
      ...(g % 2 ? { passcode: { value: `copper-lantern-meadow-${g}`, generated: true } } : { link: { secret: b64(32, 40 + g) } }),
    })),
  ];
  writeFileSync(join(priv, "access.json"), JSON.stringify({ version: 1, grants }, null, 2));
  return { dir, notes, priv };
}

export async function measurePublish(runs = 1): Promise<Record<string, number>> {
  // The page renderer is built with the web app; the bench builds it if it isn't there.
  if (!existsSync(join(reader, "render.mjs"))) {
    const r = spawnSync("pnpm", ["--filter", "@focus-notes/web", "exec", "vite", "build", "--config", "vite.reader.config.ts"], { cwd: root, stdio: "ignore", shell: true });
    if (r.status !== 0) throw new Error("PRF-06: couldn't build the page renderer (apps/web/dist-reader).");
  }
  const times: number[] = [];
  for (let run = 0; run < Math.max(1, runs); run++) {
    const { dir, notes, priv } = instance();
    try {
      const start = performance.now();
      const result = await publish({ site: join(dir, "site"), notes, private: priv, owner: "bench", reader, siteUrl: "https://bench.github.io/notes/", build: "bench" });
      times.push(performance.now() - start);
      if (result.publicPages !== 1000 || result.shares !== 10 || !result.vault) throw new Error(`PRF-06: unexpected publish result ${JSON.stringify(result)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { "PRF-06.publishMs": Math.round([...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!) };
}
