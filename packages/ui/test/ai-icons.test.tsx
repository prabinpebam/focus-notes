import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AI_CONNECTION_ICONS, aiConnectionIcon } from "../src/ai-icons.ts";
import { ICON_NAMES } from "../src/icon-names.ts";
import { AI_BRAND_ICONS } from "../src/ai-brand-icons.tsx";
import { Icon } from "../src/primitives/Icon/Icon.tsx";
import paths from "../src/ai-brand-paths.json";
import { AI_PROVIDERS } from "../../core/src/ai-providers.ts";

describe("AI integration icons", () => {
  it("covers every supported kind explicitly and never aliases an unknown kind to a brand", () => {
    for (const { id } of AI_PROVIDERS) {
      expect(Object.hasOwn(AI_CONNECTION_ICONS, id), id).toBe(true);
      expect(ICON_NAMES).toContain(aiConnectionIcon(id));
    }
    expect(aiConnectionIcon("unknown")).toBe("link");
    expect(aiConnectionIcon("toString")).toBe("link");
    expect(aiConnectionIcon("__proto__")).toBe("link");
  });

  it("maps researched CLI identities without pretending they are supported connections", () => {
    expect(aiConnectionIcon("github-copilot")).toBe("aiCopilot");
    expect(aiConnectionIcon("claude-code")).toBe("aiClaudeCode");
    expect(aiConnectionIcon("gemini-cli")).toBe("aiGemini");
    expect(aiConnectionIcon("codex")).toBe("code");
    expect(AI_PROVIDERS.some(({ id }) => id === "codex")).toBe(false);
  });

  it("uses neutral fallbacks when logos require permission or lack verified terms", () => {
    for (const id of ["cloudflare", "nvidia", "openai", "azure-openai"]) {
      expect(aiConnectionIcon(id)).toBe("cloud");
    }
    expect(aiConnectionIcon("docker-model-runner")).toBe("code");
  });

  it("ships only pinned paths with permissive notices and no SVG markup in the data", () => {
    expect(Object.keys(AI_BRAND_ICONS)).toEqual(Object.keys(paths));
    for (const entry of Object.values(paths)) {
      expect(["CC0-1.0", "MIT"]).toContain(entry.license);
      expect(entry.source).toContain("90646e4bf7f3b89df6c37e65baf3e7bc759a517c");
      expect(entry.path).not.toMatch(/[<>]/);
      expect(entry.guidelines).toMatch(/^https:/);
    }
  });

  it("inherits colour in every context and exposes a name only when the icon stands alone", () => {
    for (const name of Object.keys(AI_BRAND_ICONS) as (keyof typeof AI_BRAND_ICONS)[]) {
      const decorative = renderToStaticMarkup(<Icon name={name} />);
      expect(decorative).toContain('fill="currentColor"');
      expect(decorative).toContain('aria-hidden="true"');
      expect(decorative).toContain('focusable="false"');
      const labelled = renderToStaticMarkup(<Icon name={name} label={paths[name].title} />);
      expect(labelled).toContain('role="img"');
      expect(labelled).toContain(`aria-label="${paths[name].title}"`);
      expect(labelled).not.toContain("aria-hidden");
    }
  });
});
