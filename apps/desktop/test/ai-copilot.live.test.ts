import { describe, expect, it } from "vitest";
import { CopilotIntegration } from "../src/main/ai-copilot.ts";

describe.skipIf(process.env.FOCUS_NOTES_LIVE_AI !== "1")("installed Copilot CLI with the user's existing login", () => {
  it("detects and streams only a dummy sentence with no tools", async () => {
    const cli = new CopilotIntegration();
    expect(await cli.discover()).toMatchObject({ status: "signed-in" });
    const chunks: string[] = [];
    for await (const text of cli.stream(
      "Rewrite only the supplied sentence. Return only the shorter sentence.",
      "Make this shorter: The quick brown fox jumps over the lazy dog today.",
      "auto",
      new AbortController().signal,
      { response: 30_000, idle: 30_000, total: 60_000 },
    )) chunks.push(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("").trim()).not.toBe("");
  }, 70_000);
});
