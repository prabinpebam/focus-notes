import { expect, it, vi } from "vitest";
import { Account } from "../src/main/first-run/account.ts";
import { syntheticStartup, loopbackFetch } from "../src/main/synthetic-startup.ts";

it("requires explicit invisible E2E and disposable paths before enabling packaged isolation", () => {
  expect(syntheticStartup({})).toBe(false);
  expect(() => syntheticStartup({ FOCUS_NOTES_E2E_OFFLINE: "1" })).toThrow();
  expect(syntheticStartup({ FOCUS_NOTES_E2E_OFFLINE: "1", FOCUS_NOTES_E2E: "1",
    FOCUS_NOTES_USER_DATA: "synthetic-profile", FOCUS_NOTES_DOCS: "synthetic-notes" })).toBe(true);
});

it("denies discovery before Git worker, native helper, fetch or avatar work", async () => {
  const unexpected = vi.fn(() => { throw Error("native account work must not start"); });
  const account = new Account({ discovery: "disabled", git: unexpected, tools: unexpected,
    fetch: unexpected, avatar: unexpected, home: "unused", env: {} });
  expect(await account.status()).toEqual({ gcm: false, gh: false, via: "helper" });
  expect(await account.api()).toBeUndefined();
  expect(await account.token()).toBeUndefined();
  await expect(account.gitCheck()).rejects.toThrow("synthetic-account-disabled");
  await expect(account.signIn(false)).rejects.toThrow("synthetic-account-disabled");
  expect(unexpected).not.toHaveBeenCalled();
});

it("denies external and alternate loopback spellings before transport, forbids automatic redirects", async () => {
  const transport = vi.fn(async () => new Response("synthetic"));
  const attempts: string[] = [];
  const request = loopbackFetch(transport, attempts);
  for (const url of ["https://api.github.com/user", "https://avatars.githubusercontent.com/u/7",
    "http://localhost:4", "http://2130706433:4", "http://127.0.0.1.evil.invalid/"]) {
    await expect(request(url)).rejects.toThrow("synthetic-startup-denied");
  }
  expect(transport).not.toHaveBeenCalled();
  await request("http://127.0.0.1:1234/v1", { redirect: "follow" });
  expect(transport).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:1234/v1", { redirect: "error" });
  expect(attempts).toHaveLength(5);
});
