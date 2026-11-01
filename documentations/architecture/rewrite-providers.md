# Rewrite providers

> [!NOTE]
> **TL;DR.** Rewrite supports 26 service kinds in six request shapes (D-257), with requests and sealed keys confined to main. Every prompt shows the chosen integration, model and This computer/Cloud, and remembers a picked connection (D-262). Private-note blocking is removed: the person decides what to send (D-261). First-send disclaimer/consent removal is specified in WP-AI.14 (D-266), not yet built; URL/TLS, key/address isolation, redirect, error and timeout rules stay. Focus Notes is a client only; it never runs a model.

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
- **Timeouts** (`AI_LIMITS`): each request has a response limit (until the answer starts), an idle limit (a started answer going quiet) and a total. Rewrite: 30 s, 30 s, 5 min to a cloud service; 120 s, 60 s, 10 min to a server on this computer, which may be loading a model. Test: 20 s (90 s on this computer); a model list: 8 s to answer, 10 s in all; Find on this computer: 800 ms per port, 1.5 s in all. Each closes the request.
- **Status codes** (`statusError`): 401 and 403 → `unauthorized`; 404 → `model-missing` for a local server, `not-found` for others; 408 and 504 → `timeout`; 413 → `too-long`; 429 → `rate-limited` with Retry-After's seconds (a number or an HTTP date, or `retry-after-ms`); other 5xx → `server-error`; other 4xx → `bad-request`. A body that isn't the expected JSON → `provider-format`.
- **Whole answers are capped** (`readJson`, D-260): an answer read in one piece is read only so far, by its declared length first and then as it arrives: 2 MiB for Test and Find on this computer, 4 MiB for a model list (OpenRouter's is large), 512 KiB for a rewrite answered in one piece, whose text may then be at most 64 KiB, like a stream. Past that → `too-long`, and the request closes.
- **Connection failures** (`transportError`, from fetch's cause): `ECONNREFUSED` → `refused`; `ENOTFOUND` and `EAI_*` → `dns`; certificate and TLS errors → `tls`; a redirect → `redirected`; anything else → `network`. The window turns each code into words ([Settings → AI → Errors](../experience/ai-settings.md#errors)); only these codes leave main, never the service's text (`reasonOf`).
- **Thinking models:** Ollama gets `think: false` (else a thinking model's words go only to `message.thinking`, found against Ollama 0.35 on 31 October); OpenAI's own API gets `max_completion_tokens` (its reasoning models refuse `max_tokens`), and it and Gemini get four times the token limit, since thinking counts in it; Rewrite leaves out a leading `<think>…</think>` block.
- **Proof:** `apps/desktop/test/ai-contract.test.ts` runs all 26 kinds against protocol-faithful fakes on 127.0.0.1 (`ai-fakes.ts`, each citing its provider's docs): the documented URL and auth header, streamed deltas cut at every byte including inside UTF-8 characters and SSE lines, the end events, Test, model lists, discovery, every error above, Stop and each timeout closing the socket, and keys that never leave main. `ai-ollama.live.test.ts` runs the same path against a real local Ollama with `FOCUS_NOTES_LIVE_AI=1` and skips otherwise.
- **No retries, no fallback:** a failed request is reported, never repeated or sent to another connection.
- **Local isn't proof of local** (D-259): a server on `127.0.0.1` may still pass text to the cloud. Ollama's models with a `remote_host` or `remote_model` are marked "· Cloud" in the model list. A saved Ollama connection counts as on this computer only once main has seen its model in Ollama's own list as local (Find on this computer, *Find models*, or *Test connection*, which also lists the models) and records `modelLocal`; until then, or after a change of address or to a model the list hasn't shown, its row, the form and the consent say "Cloud" (`modelCloud` in the connection's view).

## Keys and storage

`ai.json` in the app's data folder, written atomically (AIS-05, AIS-15):

- each connection: `id`, service, name, address, model, deployment, API version, account ID, the key sealed with `safeStorage.encryptString`, the last Test (`ok`, `at`), `modelLocal` (an Ollama model main saw listed as local), and `consent`: what the person agreed to send selected text to (the service, address, model and a hash of the sealed key, `consentScope`);
- `writer`: the Writer's ID;
- Legacy `keepPrivate` is ignored on read and stripped on the next ordinary settings write (D-261). D-266 will make legacy `consent` non-authoritative; the other connection fields and sealed keys stay intact.

The window sends a key only inside `ai:save`, from SecureKeyField's `save` event; core deletes it from the command's arguments as soon as it's read. Main seals it at once and returns the connections' views, which say only `hasKey`. A key is never carried to another service's connection, nor to another address (D-259): changing a connection's address or account drops its saved key and last Test, so a service that needs a key refuses to save until one is typed (`key-new-address`: "Enter the key again for the new address."), and the form says so as soon as the address changes. *Find models* for a draft uses the saved key only when the draft's address is the saved one. If `safeStorage` isn't available, saving a key fails with `secure-storage-unavailable`. Up to 30 connections. The first build's single service (one OpenAI-compatible address, model and key) is read as the connection `first`, the Writer if it was (AIS-12).

## Find on this computer

`discover` asks each local kind that has a usual port (all but LocalAI) for its model list, all at once, 800 ms each, with no key. Only a server that answers in its own list shape counts (Ollama's `models`, the others' `data`), so a web page or other JSON on the port isn't listed. A server that answers 401 or 403 is listed with no models: it's there, it wants a token. Nothing leaves the computer: every address is loopback (AIS-07).

## Test connection

`test(id)` sends the saved connection one generation: system "Reply with the single word OK.", user "Connection test.", up to 16 tokens, 20 s (90 s on this computer). No note text. An answer in the service's own shape passes even if it's empty, since a thinking model may spend 16 tokens thinking. It records `{ ok, at }` on the connection either way; the error, if any, shows on its row (AIS-09).

## IPC

The preload `PlatformBridge.ai` exposes `settings`, `save`, `remove`, `writer`, `test`, `discover`, `models`, `consent(id)`, `rewriteStart(id, { text, instruction, path })`, `rewriteCancel(id)` and `onRewriteEvent(listener)`. There is no privacy-setting method or handler. Settings and the prompt picker both use `ai:writer`, serially persisting the selected connection in device-local `ai.json`. Events remain `{ id, type: "delta" | "done" | "error", text?, code?, retryAfter? }` on `ai:rewriteEvent`, only to the originating window. Failures carry reason codes, not service text. The browser app still has no AI bridge (RWR-71).

## Consent and private notes

D-261/D-262's user judgement and disclosure are built; D-266's consent removal is specified in WP-AI.14 and is not yet proven by existing `ai-contract`, `ai-app` and `air-safeguards` tests:

- **User judgement** (AIS-13): no private-note setting, renderer case or main path gate. Every prompt names the selected integration and model, with a locality badge. The person decides whether to send a private or shared selection; Cancel sends nothing. Legacy `keepPrivate` keys are dropped on read and the next write, never rewritten in the owner's real profile by validation.
- **First-send consent removed** (AIS-14, D-266; planned): remove first-time disclaimer/consent text, extra Send confirmation and consent-required main/core/IPC gate (including the obsolete `consent(id)` path). Generate calls the selected, saved Writer directly on first or later use. Active icon, service, model and locality remain visible. Old consent fields may read compatibly but neither authorize traffic nor block sends. Key/address isolation, URL/redirect rules, request limits, cancellation and selected-text-only requests are unchanged. Test legacy connections with missing/stale consent and prove exactly one request to the visible integration, never a fallback.

### Model and endpoint locality

`aiRunsInCloud` in the shared core provider catalogue is used by Settings, the prompt and main's connection/model-list views. Ollama names ending in `:cloud` or `-cloud`, remote-model metadata or a host at `ollama.com` are Cloud. Otherwise, loopback or explicit private-LAN hosts are This computer; remote hosts are Cloud. Other editable services, including OpenAI-compatible endpoints, follow the host rather than their catalogue group. A local typed model needs no discovery. A LAN connection still obeys the existing https requirement; plain HTTP remains loopback-only. This is a configured-destination disclosure, not evidence that a service never forwards requests.

## Security review

SEC-09, WP-AI.9: the `ai:*` handlers' input checks and sender, address and redirect rules, DNS rebinding of a loopback name, `safeStorage` use, the prompt framing against injection in the selected text, and that the answer is only ever inserted as text (no HTML, no tools, no fetches). The first review (31 October) found four things, all fixed (D-259, D-260): the private-note decision rested on the window's word (main now decides from the path); a saved key followed an edited address; whole answers were read without a size cap; and a cloud-routed Ollama model was called "On this computer".

## Decisions

- **D-257:** every text service kind in the kit; supersedes D-236 and D-249's single OpenAI-compatible contract, and D-242's owner gate.
- **D-233:** an integration client only; kept.
- **D-259:** consent and key/address isolation remain; the private-note gate and unknown-model cloud assumption are superseded by D-261 and D-262.
- **D-261:** user judgement with explicit integration/model disclosure, not private-note blocking.
- **D-262:** remembered prompt picker and per-model/per-host locality.
- **D-260:** the three request clocks, capped whole answers, one reason code per failure, thinking models, and the 26 built kinds only.
- **D-238:** consent names the destination; built as D-259.
- **D-239:** cost caps; superseded by D-256's limits (RWR-82). There's no daily or money cap: the service's own billing applies.
