import type { SVGProps } from "react";
import paths from "./ai-brand-paths.json";

/** Unmodified brand paths, sized and named by Icon, in the inherited text colour (D-263). */
function glyph(name: keyof typeof paths) {
  return function BrandGlyph(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" data-icon={name} {...props}>
        <path d={paths[name].path} />
      </svg>
    );
  };
}

export const AI_BRAND_ICONS = {
  aiOllama: glyph("aiOllama"), aiLmStudio: glyph("aiLmStudio"),
  aiVllm: glyph("aiVllm"),
  aiAnthropic: glyph("aiAnthropic"), aiClaude: glyph("aiClaude"),
  aiClaudeCode: glyph("aiClaudeCode"), aiGemini: glyph("aiGemini"),
  aiMistral: glyph("aiMistral"), aiDeepseek: glyph("aiDeepseek"),
  aiPerplexity: glyph("aiPerplexity"), aiOpenrouter: glyph("aiOpenrouter"),
  aiHuggingface: glyph("aiHuggingface"), aiCopilot: glyph("aiCopilot"),
};
