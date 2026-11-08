import { describe, expect, it } from "vitest";
import { githubReferenceUrl } from "../src/github-links.ts";

describe("GitHub reference destinations (D-393)", () => {
  it.each([
    ["ada/notes", "https://github.com/ada/notes"],
    ["@ada", "https://github.com/ada"],
    ["ada-lovelace", "https://github.com/ada-lovelace"],
    ["ada/notes.v2", "https://github.com/ada/notes.v2"],
  ])("opens %s exactly", (reference, url) => {
    expect(githubReferenceUrl(reference)).toBe(url);
  });
  it.each([undefined, null, 42, "", "@", "ada/", "/notes", "-ada", "ada-", "ada/..",
    "ada/notes.git", "ada/notes/issues", "https://github.com/ada/notes", "ada/notes?x=1",
    "ada/notes#x", "ada%2Fevil", "ada\\notes", "ada/ notes", " ada", "ada@example.com"])(
    "refuses invalid reference %s", (reference) => {
      expect(() => githubReferenceUrl(reference)).toThrow("Invalid GitHub reference");
    },
  );
});
