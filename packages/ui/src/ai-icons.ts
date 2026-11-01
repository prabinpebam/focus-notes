import type { IconName } from "./icon-names.ts";

/** Connection identities only, never a claim of readiness, hosting or endorsement (D-263). */
export const AI_CONNECTION_ICONS = {
  ollama: "aiOllama", "lm-studio": "aiLmStudio", "llama-cpp": "code",
  vllm: "aiVllm", sglang: "code", localai: "code", jan: "code",
  "docker-model-runner": "code", openai: "cloud", anthropic: "aiClaude",
  gemini: "aiGemini", "azure-openai": "cloud", mistral: "aiMistral",
  cohere: "cloud", groq: "cloud", together: "cloud", fireworks: "cloud",
  deepseek: "aiDeepseek", xai: "cloud", cerebras: "cloud",
  perplexity: "aiPerplexity", nvidia: "cloud", cloudflare: "cloud",
  openrouter: "aiOpenrouter", huggingface: "aiHuggingface", compatible: "link",
  "github-copilot": "aiCopilot", copilot: "aiCopilot", "copilot-cli": "aiCopilot",
  claude: "aiClaude", "claude-code": "aiClaudeCode", "claude-cli": "aiClaudeCode",
  codex: "code", "codex-cli": "code", "openai-codex": "code",
  "google-gemini": "aiGemini", "gemini-cli": "aiGemini",
} as const satisfies Record<string, IconName>;

/** Unknown/custom integrations retain a neutral connection mark, never another brand's logo. */
export function aiConnectionIcon(kind: string): IconName {
  return Object.hasOwn(AI_CONNECTION_ICONS, kind)
    ? AI_CONNECTION_ICONS[kind as keyof typeof AI_CONNECTION_ICONS]
    : "link";
}
