import { describe, expect, it } from "vitest";
import { sharedImageDestinations } from "../src/main/share/media.ts";

describe("which images a shared note seals (WP-9.6)", () => {
  it("takes image destinations as written, never links, code or a crop's kept original", () => {
    const text = [
      "# Day", "",
      "<!-- image: original=..%2F..%2Fassets%2Fimages%2Foriginal.png -->",
      "![Desk](../../assets/images/q7m4k2.png \"Morning\")", "",
      "![Angle](<../../assets/images/a b.png>) and [a link](../../assets/images/linked.png)", "",
      "![Ref][r]", "",
      "    ![In code](../../assets/images/code.png)", "",
      "[r]: ../../assets/images/ref.png",
    ].join("\n");
    expect(sharedImageDestinations(text)).toEqual([
      "../../assets/images/q7m4k2.png", "../../assets/images/a b.png", "../../assets/images/ref.png",
    ]);
  });
});
