# Rewrite providers

> [!NOTE]
> **TL;DR.** Rewrite and Settings → AI talk to 26 kinds of AI service, from the [ai-integration kit](https://prabinpebam.github.io/loushing/items/ai-integration/)'s text catalogue at 1613a55, in six request shapes: OpenAI-compatible Chat Completions, Anthropic Messages, Gemini generateContent, Azure OpenAI deployments, Ollama chat and Cohere v2 chat (D-257). Every request is made by the desktop main process with the platform's `fetch`; keys are sealed with Electron `safeStorage` and never reach the window. Addresses are https, or http only to this computer; redirects are refused. Focus Notes is a client only: it never installs, downloads, launches, hosts or runs a model (D-233). Built on 31 October; a private-notes switch and first-send consent are planned.

Serves UC-RWR-05, UC-RWR-08 and UC-RWR-09 (AIS-01 to AIS-15, RWR-70, RWR-83). The settings people see are in [Settings → AI](../experience/ai-settings.md); how the answer reaches the note is in [Rewrite engine](rewrite-engine.md).

## What people expect

That the service they chose, and only it, sees the words they selected; that a key typed once stays secret; that a server already running on their computer is found without typing its port; and that "Saved" doesn't pretend to mean "working".

## The catalogue

`packages/core/src/ai-providers.ts` lists the kinds as data; the window sees only this data and each connection's view, never a key.

| ID | Service | Group | Shape | Address | Key | Models listed from |
| --- | --- | --- | --- | --- | --- | --- |
| `ollama` | Ollama | Local | Ollama | `http://127.0.0.1:11434`, editable | none | `/api/tags` |
| `lm-studio` | LM Studio | Local | OpenAI | `http://127.0.0.1:1234/v1`, editable | optional | `/models` |
| `llama-cpp` | llama.cpp server | Local | OpenAI | `http://127.0.0.1:8080/v1`, editable | optional | `/models` |
| `vllm` | vLLM | Local | OpenAI | `http://127.0.0.1:8000/v1`, editable | optional | `/models` |
| `sglang` | SGLang | Local | OpenAI | `http://127.0.0.1:30000/v1`, editable | optional | `/models` |
| `localai` | LocalAI | Local | OpenAI | `http://127.0.0.1:8080/v1`, editable (not probed: llama.cpp's port) | optional | `/models` |
| `jan` | Jan | Local | OpenAI | `http://127.0.0.1:1337/v1`, editable | optional | `/models` |
| `docker-model-runner` | Docker Model Runner | Local | OpenAI | `http://127.0.0.1:12434/engines/v1`, editable | none | `/models` |
| `openai` | OpenAI | Cloud | OpenAI | `https://api.openai.com/v1` | required | `/models` |
| `anthropic` | Anthropic Claude | Cloud | Anthropic | `https://api.anthropic.com` | required | `/v1/models` |
| `gemini` | Google Gemini | Cloud | Gemini | `https://generativelanguage.googleapis.com` | required | `/v1beta/models` (generateContent only) |
| `azure-openai` | Azure OpenAI | Cloud | Azure | your resource, editable; deployment and API version | required | none: the deployment is the model |
| `mistral` | Mistral AI | Cloud | OpenAI | `https://api.mistral.ai/v1` | required | `/models` |
| `cohere` | Cohere | Cloud | Cohere | `https://api.cohere.com` | required | `/v1/models?endpoint=chat` |
| `groq` | Groq | Cloud | OpenAI | `https://api.groq.com/openai/v1` | required | `/models` |
| `together` | Together AI | Cloud | OpenAI | `https://api.together.xyz/v1` | required | `/models` |
| `fireworks` | Fireworks AI | Cloud | OpenAI | `https://api.fireworks.ai/inference/v1` | required | `/models` |
| `deepseek` | DeepSeek | Cloud | OpenAI | `https://api.deepseek.com/v1` | required | `/models` |
| `xai` | xAI Grok | Cloud | OpenAI | `https://api.x.ai/v1` | required | `/models` |
| `cerebras` | Cerebras | Cloud | OpenAI | `https://api.cerebras.ai/v1` | required | `/models` |
| `perplexity` | Perplexity | Cloud | OpenAI | `https://api.perplexity.ai` | required | none: type the model |
| `nvidia` | NVIDIA NIM | Cloud | OpenAI | `https://integrate.api.nvidia.com/v1` | required | `/models` |
| `cloudflare` | Cloudflare Workers AI | Cloud | OpenAI | `https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1`; account ID of 1 to 64 letters and digits | required | `/models` |
| `openrouter` | OpenRouter | Gateway | OpenAI | `https://openrouter.ai/api/v1` | required | `/models` |
| `huggingface` | Hugging Face | Gateway | OpenAI | `https://router.huggingface.co/v1` | required | `/models` |
| `compatible` | Other OpenAI-compatible service | Gateway | OpenAI | yours | optional | `/models` |

**Not offered** (from `handoffs/air-integration-gaps.md`, 31 October): Amazon Bedrock (Converse with AWS request signing and the AWS identity chain), Vertex AI (Google sign-in or application default credentials), Microsoft Foundry Models with Entra sign-in (Azure OpenAI with a key is covered), Replicate and fal (asynchronous prediction queues, not a text answer), MLX LM (an in-process library on macOS, not a server). The kit lists no CLI or MCP bridges (Copilot, Claude Code, Codex); one would need its own entry, a spawned process with no shell, and its own consent. Speech, image and video services don't apply: Rewrite is text only.

## Request shapes

`generateCall`, `streamCall` and `modelsCall` in `apps/desktop/src/main/ai-rewrite.ts`. Every request carries the fixed instruction as the system message and the prompt and text as the user message ([Rewrite engine](rewrite-engine.md#in-the-main-process)).

| Shape | Generate | Auth header | Streaming | A streamed piece of text |
| --- | --- | --- | --- | --- |
| OpenAI | `POST {base}/chat/completions`, `model`, `messages`, `max_tokens` | `Authorization: Bearer` when there's a key | `stream: true`, server-sent events | `choices[0].delta.content` |
| Anthropic | `POST {base}/v1/messages`, `system`, `messages`, `max_tokens` | `x-api-key`, `anthropic-version: 2023-06-01` | `stream: true`, server-sent events | `content_block_delta` → `delta.text` |
| Gemini | `POST {base}/v1beta/models/{model}:generateContent`, `systemInstruction`, `contents`, `maxOutputTokens` | `x-goog-api-key` | `:streamGenerateContent?alt=sse` | `candidates[0].content.parts[].text` |
| Azure | `POST {base}/openai/deployments/{deployment}/chat/completions?api-version={version}` (default 2024-10-21) | `api-key` | `stream: true`, server-sent events | as OpenAI |
| Ollama | `POST {base}/api/chat`, `options.num_predict` | `Authorization: Bearer` when there's a key | `stream: true`, newline-delimited JSON | `message.content` |
| Cohere | `POST {base}/v2/chat`, `max_tokens` | `Authorization: Bearer` | `stream: true`, server-sent events | `content-delta` → `delta.message.content.text` |

A service that ignores streaming and answers with one JSON body is read with the same shape's non-streaming reader and inserted once.

## Addresses and requests

- **Addresses** (`normalizeUrl`, AIS-06): https, or plain http only to `127.0.0.1`, `localhost` or `[::1]`; no user name, password, query or fragment; trailing slashes dropped. Fixed cloud addresses can't be changed.
- **Every request** uses `redirect: "error"`, so a service can't send the text somewhere else.
- **Timeouts:** 90 s for a rewrite, 20 s for a Test, 8 s for a model list, 800 ms per port for Find on this computer.
- **Status codes:** 401 and 403 → `unauthorized`; 404 → `model-missing` for a local server, `not-found` for others; 429 → `rate-limited`; any other failure → `provider-{status}`; a body that isn't JSON → `provider-format`. The window turns each code into words ([Settings → AI → Errors](../experience/ai-settings.md#errors)).
- **No retries, no fallback:** a failed request is reported, never repeated or sent to another connection.
- **Local isn't proof of local:** a server on `127.0.0.1` may still pass text to the cloud. Ollama's models with a `remote_host` or `remote_model` are marked "· Cloud" in the model list.

## Keys and storage

`ai.json` in the app's data folder, written atomically (AIS-05, AIS-15):

- each connection: `id`, service, name, address, model, deployment, API version, account ID, the key sealed with `safeStorage.encryptString`, and the last Test (`ok`, `at`);
- `writer`: the Writer's ID.

The window sends a key only inside `ai:save`, from SecureKeyField's `save` event; core deletes it from the command's arguments as soon as it's read. Main seals it at once and returns the connections' views, which say only `hasKey`. A key is never carried to another service's connection. If `safeStorage` isn't available, saving a key fails with `secure-storage-unavailable`. Up to 30 connections. The first build's single service (one OpenAI-compatible address, model and key) is read as the connection `first`, the Writer if it was (AIS-12).

## Find on this computer

`discover` asks each local kind that has a usual port (all but LocalAI) for its model list, all at once, 800 ms each, with no key. A server that answers 401 or 403 is listed with no models: it's there, it wants a token. Nothing leaves the computer: every address is loopback (AIS-07).

## Test connection

`test(id)` sends the saved connection one generation: system "Reply with the single word OK.", user "Connection test.", up to 16 tokens, 20 s. No note text. It records `{ ok, at }` on the connection either way; the error, if any, shows on its row (AIS-09).

## IPC

The desktop preload bridge adds `ai` (the core `PlatformBridge.ai`): `settings`, `save`, `remove`, `writer`, `test`, `discover`, `models`, `rewriteStart(id, { text, instruction })`, `rewriteCancel(id)` and `onRewriteEvent(listener)`. Main's handlers are `ai:settings`, `ai:save`, `ai:remove`, `ai:writer`, `ai:test`, `ai:discover`, `ai:models`, `ai:rewriteStart`, `ai:rewriteCancel`; events go out on `ai:rewriteEvent` as `{ id, type: "delta" | "done" | "error", text?, code? }`, only to the window that started the rewrite. The browser app has no `ai` bridge, so the commands are disabled there (RWR-71).

## Consent and private notes (planned)

Not built (WP-AI.13, D-238 proposed):

- **Don't send private notes** (AIS-13): on by default. Rewrite checks the note's root before sending; a private note sends nothing and says so.
- **First-send confirmation** (AIS-14): main remembers, per connection, the address, model and key it was confirmed for; any change asks again.

Until then the safeguards are: nothing is connected by default; every form and row says where text goes; and only the prompt and the selection are sent.

## Security review (to do)

SEC-09, WP-AI.9: the `ai:*` handlers' input checks and sender, address and redirect rules, DNS rebinding of a loopback name, `safeStorage` use, the prompt framing against injection in the selected text, and that the answer is only ever inserted as text (no HTML, no tools, no fetches).

## Decisions

- **D-257:** every text service kind in the kit; supersedes D-236 and D-249's single OpenAI-compatible contract, and D-242's owner gate.
- **D-233:** an integration client only; kept.
- **D-238:** consent names the destination; proposed, not built.
- **D-239:** cost caps; superseded by D-256's limits (RWR-82). There's no daily or money cap: the service's own billing applies.
