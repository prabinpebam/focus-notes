/**
 * D-126: the account's picture for the setup's profile card is fetched by the main process, only
 * from GitHub's avatar host, and handed to the window as a data URL; it's cached for offline, and
 * anything else (another host, not an image, too large, offline) gives none, so the card shows the
 * initials.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avatarLoader } from "../src/main/first-run/avatar.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const URL = "https://avatars.githubusercontent.com/u/7?v=4";

function setup(respond: (url: string) => Response | Promise<Response>) {
  const file = join(mkdtempSync(join(tmpdir(), "fn-avatar-")), "avatar.json");
  const asked: { url: string; init?: RequestInit }[] = [];
  const load = avatarLoader({ file, fetch: async (url, init) => (asked.push({ url, ...(init ? { init } : {}) }), respond(url)) });
  return { file, asked, load };
}

describe("D-126: the account's picture", () => {
  it("comes from GitHub's avatar host as a data URL, with no credentials or redirects, and is kept for offline", async () => {
    const t = setup(() => new Response(PNG, { headers: { "content-type": "image/png" } }));
    const data = await t.load(URL, 7);
    expect(data).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
    expect(t.asked[0]!.url).toBe(`${URL}&s=128`);
    expect(t.asked[0]!.init).toMatchObject({ redirect: "error", credentials: "omit" });
    expect(JSON.parse(readFileSync(t.file, "utf8"))).toEqual({ version: 1, id: 7, data });
    // Offline later: the kept picture, for this account only.
    const offline = avatarLoader({ file: t.file, fetch: () => Promise.reject(new Error("offline")) });
    expect(await offline(URL, 7)).toBe(data);
    expect(await offline(URL, 8)).toBeUndefined();
  });
  it("is none from any other host, for what isn't an image, for what's too large, or offline", async () => {
    const other = setup(() => new Response(PNG, { headers: { "content-type": "image/png" } }));
    expect(await other.load("https://example.com/a.png", 7)).toBeUndefined();
    expect(other.asked).toEqual([]);
    expect(await setup(() => new Response("<html>", { headers: { "content-type": "text/html" } })).load(URL, 7)).toBeUndefined();
    expect(await setup(() => new Response(Buffer.alloc(600 * 1024), { headers: { "content-type": "image/png" } })).load(URL, 7)).toBeUndefined();
    expect(await setup(() => Promise.reject(new Error("offline"))).load(URL, 7)).toBeUndefined();
  });
});
