/**
 * The AI connections Settings → AI offers, from the ai-integration kit's provider catalogue
 * (1613a55, text-capable entries). Focus Notes never hosts a model: each is a service a person runs
 * or pays for. `shape` is the request the main process makes; the window only sees this data.
 */

export type AiShape = "openai" | "anthropic" | "gemini" | "azure" | "ollama" | "cohere";
export type AiGroup = "local" | "cloud" | "gateway";
export type AiField = "endpoint" | "model" | "deployment" | "apiVersion" | "account";

export interface AiProvider {
  id: string;
  /** The service's own name. */
  label: string;
  group: AiGroup;
  shape: AiShape;
  /** The base the request is made under; `{account}` is filled from the account field. */
  endpoint: string;
  /** The endpoint is the person's to set (local servers, Azure, any compatible service). */
  endpointEditable: boolean;
  key: "required" | "optional" | "none";
  /** Fields beyond endpoint and model. */
  fields: readonly AiField[];
  /** Listed by Find on this computer (a local server's default port). */
  discover?: { url: string; models: string };
}

const local = (id: string, label: string, endpoint: string, models: string, key: AiProvider["key"] = "optional", shape: AiShape = "openai"): AiProvider =>
  ({ id, label, group: "local", shape, endpoint, endpointEditable: true, key, fields: [], discover: { url: endpoint, models } });
const cloud = (id: string, label: string, endpoint: string, shape: AiShape = "openai", group: AiGroup = "cloud"): AiProvider =>
  ({ id, label, group, shape, endpoint, endpointEditable: false, key: "required", fields: [] });

export const AI_PROVIDERS: readonly AiProvider[] = [
  local("ollama", "Ollama", "http://127.0.0.1:11434", "/api/tags", "none", "ollama"),
  local("lm-studio", "LM Studio", "http://127.0.0.1:1234/v1", "/models"),
  local("llama-cpp", "llama.cpp server", "http://127.0.0.1:8080/v1", "/models"),
  local("vllm", "vLLM", "http://127.0.0.1:8000/v1", "/models"),
  local("sglang", "SGLang", "http://127.0.0.1:30000/v1", "/models"),
  { ...local("localai", "LocalAI", "http://127.0.0.1:8080/v1", "/models"), discover: undefined },
  local("jan", "Jan", "http://127.0.0.1:1337/v1", "/models"),
  local("docker-model-runner", "Docker Model Runner", "http://127.0.0.1:12434/engines/v1", "/models", "none"),
  cloud("openai", "OpenAI", "https://api.openai.com/v1"),
  cloud("anthropic", "Anthropic Claude", "https://api.anthropic.com", "anthropic"),
  cloud("gemini", "Google Gemini", "https://generativelanguage.googleapis.com", "gemini"),
  { id: "azure-openai", label: "Azure OpenAI", group: "cloud", shape: "azure", endpoint: "", endpointEditable: true, key: "required", fields: ["deployment", "apiVersion"] },
  cloud("mistral", "Mistral AI", "https://api.mistral.ai/v1"),
  cloud("cohere", "Cohere", "https://api.cohere.com", "cohere"),
  cloud("groq", "Groq", "https://api.groq.com/openai/v1"),
  cloud("together", "Together AI", "https://api.together.xyz/v1"),
  cloud("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1"),
  cloud("deepseek", "DeepSeek", "https://api.deepseek.com/v1"),
  cloud("xai", "xAI Grok", "https://api.x.ai/v1"),
  cloud("cerebras", "Cerebras", "https://api.cerebras.ai/v1"),
  cloud("perplexity", "Perplexity", "https://api.perplexity.ai"),
  cloud("nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1"),
  { ...cloud("cloudflare", "Cloudflare Workers AI", "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"), fields: ["account"] },
  cloud("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai", "gateway"),
  cloud("huggingface", "Hugging Face", "https://router.huggingface.co/v1", "openai", "gateway"),
  { id: "compatible", label: "Other OpenAI-compatible service", group: "gateway", shape: "openai", endpoint: "", endpointEditable: true, key: "optional", fields: [] },
];

export const aiProvider = (id: unknown): AiProvider | undefined => AI_PROVIDERS.find((p) => p.id === id);

/** Azure OpenAI's default data-plane API version (GA). */
export const AZURE_API_VERSION = "2024-10-21";

/** A connection as Settings shows it: never its key. */
export interface AiConnectionView {
  id: string;
  provider: string;
  name: string;
  endpoint: string;
  model: string;
  deployment: string;
  apiVersion: string;
  account: string;
  hasKey: boolean;
  /** The last Test: when, and whether it passed. */
  lastTest?: { ok: boolean; at: string };
}

export interface AiFound {
  provider: string;
  endpoint: string;
  models: { id: string; cloud: boolean }[];
}
