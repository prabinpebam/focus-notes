# Rewrite providers

The planned, policy-first boundary between note rewriting and a person-chosen model endpoint. Provider, privacy, consent and cost choices on this page are **Proposed (owner)**, not permission to send notes anywhere.

> [!NOTE]
> **TL;DR.** Off until setup. Recommend one bring-your-own OpenAI-compatible adapter, no Focus Notes server, no account and no silent cloud fallback. Only desktop main can call the explicitly approved endpoint. Credentials stay in an OS-encrypted local store; profiles hold references only. Every real-provider work package waits for owner approval; fake-provider engine/UI/history work does not. Covers RWR-25/RWR-26 and RWR-41 through RWR-48. [Engine](rewrite-engine.md) owns target/apply safety; [history](rewrite-history.md) owns durable versions.

## What people expect

| Expectation | Source and implication |
| --- | --- |
| I know where my writing goes | PRV-01, D-21, owner's rewrite request; named endpoint/model and transmitted-byte estimate before consent |
| Local does not secretly mean cloud | The brief's local-attestation constraint: a nearby HTTP server can proxy elsewhere; address classification is not proof of on-device inference |
| Keys do not become synced settings | [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), consulted 30 October 2026: OS-bound local encryption, main-process API; not a universal credential vault |
| I can test this without an account or a bill | [ai-integration](https://github.com/prabinpebam/ai-integration), offline-first method, plus existing deterministic desktop journey fakes |

## Policy first

RWR-41, RWR-42, RWR-46. Recommended default: **no enabled profile**. Setup offers an attested local endpoint or a named remote endpoint, using the same single text-only OpenAI-compatible chat-completions shape. These are interoperability targets, not claims that any named runner/provider has been live-tested.

| Option | V1 position | Owner gate |
| --- | --- | --- |
| Scripted fixture | Built-in development/journey adapter, no socket and no key | None; cannot be mistaken for a real model |
| Ollama, LM Studio, llama.cpp compatible server | Candidate local integrations; explicit endpoint/model and attestation, no automatic discovery/install/download | Approve destination policy and package/model licensing separately |
| Cloud compatible endpoint | Person supplies URL, model, key if required, pricing and retention-policy acknowledgement | Approve privacy/consent/cost contract and public product claims |
| Native on-device runtime | Later adapter, not an HTTP compatibility claim | Separate feasibility/license decision |
| Network-local/LAN | Deferred: a private-network host is not this device; later exact authenticated HTTPS route needs remote-style per-use private consent | Separate operator/location/auth/consent approval |
| Hybrid routing | Not v1: there is no fallback, model selection by note sensitivity or route changing on a failure | Separate explicit routing decision |

Setup does not probe `/models`, send a test prompt, download a model or call a provider until the person explicitly chooses a connection check after the live gate. A connection check is a named operation with the same destination/credential rules, no note text and no billable inference. An endpoint without a non-inference check can only be verified during the first explicitly consented rewrite; show "Not checked", not "Connected".

## Profiles and credentials

RWR-41. All rewrite configuration is **device-only**, outside `SYNCED_KEYS`, workspace Git and export bundles. Do not reuse `private/.focus-notes/settings.json` merely because it is private; its keys are synced.

| Local record | Shape and bounds |
| --- | --- |
| Profile | `{version:1,id,label,kind:"fixture"|"attested-local"|"remote",adapter:"chat-completions-text-v1",endpoint,model,credentialRef?,capabilityRevision,contextTokens,maxOutputTokens,pricing?,policyRevision}` |
| Endpoint | Absolute normalized base URL, at most 2,048 characters, no userinfo/query/fragment. Exact scheme/host/port/path prefix; no arbitrary request URL accepted from renderer per rewrite |
| Model/label | Model 1..128 characters; label 1..80; no hidden model auto-selection |
| Limits | At most 10 profiles; verified context required (unknown disables route), output default/max 4,096; provider's smaller reviewed limit wins |
| Credential reference | Random `credential:<uuid>`; no secret in profile, consent, command args, environment variables, URL or logs |
| Secret | `<userData>/rewrite/credentials/<uuid>.bin`, OS-encrypted envelope with version; atomic write, user-only access permissions, never a workspace path |
| Consents | Local destination fingerprint and policy revision, scope, timestamp, expiration; no source text or prompt |
| Presets/effect | Local records specified by the [UX](../experience/rewrite-with-ai.md#presets); no auto-sync, prompt history off |

Credential setup IPC is `rewrite:credential:set {profileId,secret}` → `{credentialRef,present:true}` and `rewrite:credential:remove {profileId}` → `{present:false}`. Only the exact app top frame may call it; reject secret over 16 KiB, clear the input immediately after acknowledgement, never return/reveal stored plaintext. A person-entered key necessarily passes transiently through that input; no key is ever streamed back with model events. Main resolves/decrypts just before a request and removes references from in-memory request state after completion. JavaScript cannot promise physical memory zeroization.

Use the Electron version's supported `safeStorage` API, reusing the existing draft encryption abstraction where appropriate. Encryption/decryption errors block keyed requests as `auth-failed`; missing secure OS storage never falls back to plaintext. On any future Linux port, `basic_text` is not acceptable. Windows DPAPI protects against another Windows account, not malware running as this user. Upgrading to a newer asynchronous safeStorage API is a separate compatibility change, not a dependency assumed by this spec.

For private checkpoints/history, unavailable secure encryption yields `private-blocked`. Removing a key disables its profiles without deleting the person's notes/history. Changing endpoint/model, restoring settings or updating policy invalidates matching consent; a credential reference copied from another device is unavailable, not a request to recover a key from Git.

## Adapter contract

RWR-25, RWR-26. Main owns HTTP, abort, TLS, credentials, rate/cost reservations, output framing and streaming decoder. `packages/core` owns lifecycle/commands; `packages/editor` owns projection and source map; `packages/ui`/`packages/views` own sealed components/data/messages. Preload is typed intent-only IPC, as in [engine channels](rewrite-engine.md#ipc-contract).

```typescript
type RewriteErrorCode =
  | "no-provider" | "consent-required" | "private-blocked" | "offline"
  | "auth-failed" | "rate-limited" | "cost-limit" | "timeout"
  | "provider-error" | "refused" | "too-large" | "stale-target"
  | "read-only" | "conflict-pending" | "invalid-output" | "cancelled";

type RewriteEvent =
  | { type: "started" }
  | { type: "delta"; text: string }
  | { type: "progress"; completed: number; total: number }
  | { type: "completed"; finish: "stop"; usage?: { input: number; output: number } }
  | { type: "failed"; error: { code: RewriteErrorCode; retryable: boolean;
      retryAfterMs?: number; detail: "transport" | "storage" | "validation" | "policy" } };

interface RewriteInput {
  requestId: string;
  instruction: string;
  targetMarkdown: string;
  maxOutputTokens: number;
}
interface RewriteAdapter {
  generate(input: RewriteInput, signal: AbortSignal): AsyncIterable<RewriteEvent>;
}
```

The adapter instance is constructed only in main from a validated profile and secret resolver; input cannot override profile URL, headers or system frame. All events are wrapped with session/request/sequence IDs. Exactly one terminal event; EOF without a terminal, invalid JSON, missing content, unsupported tool calls or a length/content-filter finish is failure, not complete. Adapter exceptions map once to a sanitized code; raw provider bodies never cross IPC or logs.

The external adapter is deliberately named **`chat-completions-text-v1`**, not a universal compatibility promise. Pin a reviewed capability record per runner/build/model/endpoint: system-role support, output-bound parameter, tokenizer/context, termination, usage/hidden billable units and disabled tools/upstreams. Unknown required capability leaves the route disabled. Native Anthropic, Gemini, Azure-specific auth and Windows APIs need future explicit adapters.

Compatible HTTP operation: `POST <validated-base>/chat/completions`, JSON with exact configured `model`, `messages`, `stream:true`, `n:1` and the reviewed bounded output parameter (`max_tokens` or `max_completion_tokens`, never silently substituted). Optional temperature `0.4` is sent only where the capability record permits it; it does not guarantee determinism. Separate system/user/data framing follows [output validation](rewrite-engine.md#output-validation). No tools, images, files, retrieval, browser, conversation history or reasoning transcript requested. Append only `choices[0].delta.content`; nonzero/multiple choices or tool arguments are `invalid-output`. SSE decoder handles split UTF-8/lines, comments and bounded `data:` events; `data: [DONE]` must follow a valid finish reason, not stand in for one. `length` maps to `too-large`, structured/content-filter refusal to `refused`, unknown/absent terminal to `invalid-output`.

Do not silently rewrite incompatible API fields or try a second endpoint. A profile whose API lacks this contract is unsupported until an explicit adapter with fixtures is added. No vendor SDK is required; any future dependency must pass permissive-license/feed checks.

## Routing and egress

RWR-42. **Renderer policy does not change:** retain `connect-src 'self'`, existing network-denying `allowedRequest`, navigation and permission restrictions. Do not add a provider origin to CSP. Main uses a separate guarded transport; Electron renderer webRequest filtering does not protect Node fetch.

| Check | Rule |
| --- | --- |
| Allowlist | Enabled profile IDs resolve to exact normalized origin and path prefix. Request path is fixed `/chat/completions`; no wildcard hosts, provider-selected URLs or user instruction URLs |
| Remote | HTTPS only, default certificate verification; reject HTTP, invalid certificates, userinfo, fragments, proxy tunnel overrides and credential-bearing URLs |
| Attested local | HTTP allowed only for explicitly configured numeric `127.0.0.1` or `::1`, exact port. No hostname aliases, alternate numeric spellings, private-network/LAN, unspecified/multicast/link-local/metadata addresses or IPv4-mapped IPv6 bypass. |
| DNS | Resolve on each new connection, classify all returned addresses, reject mixed public/private answers inconsistent with profile kind; pin validated address for that connection while preserving TLS hostname verification |
| Redirect | `redirect:"error"` for every status; no cross-origin or same-origin redirects followed, no credential forwarding |
| Proxies | No inherited environment/system proxy for attested-local requests; a new proxy route requires an explicit separately approved profile/policy, not silent routing |
| Local attestation | "This endpoint keeps my note text on this device." This is the person's statement, not a technical guarantee. Known/unknown remote upstreams cannot be labelled local; reclassify only when every named destination is reviewed, otherwise block. |
| Fallback | Never cloud-fallback, downgrade TLS, choose another model or retry another destination on local failure |
| Output | Never performs egress: no image auto-load, link preview, tool call, remote import or callback URL |

URL/DNS/redirect rules apply to connection checks too. A changed canonical endpoint/model/profile revision invalidates consent and cost estimates before any send. Unknown destination classification is refused, not guessed local.

## Consent and private notes

RWR-43, RWR-46. Consent is distinct from a network connection. Show named profile, normalized destination/model, Public/Private, actual expanded target/chunk count, transmitted bytes, no adjacent context, estimated upper charge/unknown pricing, and the warning that the endpoint's own retention policy applies. A public note is still the person's writing; being on GitHub is not provider consent.

| Note / profile | Consent absent | Consent present | Persistence |
| --- | --- | --- | --- |
| Public / fixture | Allowed, explicitly labelled demo | Same | No network consent |
| Private / fixture | Allowed only with encrypted checkpoint capability | Same | No network; private fixture data never logs |
| Public / attested-local | Ask endpoint attestation and destination consent | Allowed while endpoint/model/policy unchanged | Device-only consent, expires after 30 days |
| Public / remote | Ask named-destination consent and retention acknowledgement | Allowed within same consent scope; cost confirmation independent | Device-only consent, expires after 30 days |
| Private / attested-local | Ask private-local opt-in and endpoint attestation | Allowed for this attested profile, encrypted history required | Device-only policy consent, 30 days; chip always says Private |
| Private / remote | Default blocked until person enables "Ask before sending private notes" | **Per-use** named-destination consent, bound to source/target hash and request in memory, expires after 5 minutes or one use | No remembered blanket private-remote approval or note-identifying hashes in persistent consent ledger |
| Shared private note / any real profile | Same private rules; sharing grant is not consent | Only writable owner-local note is eligible | No audience details/grant secrets sent |
| Read-only shared/instance note | `read-only` regardless of profile/consent | Cannot override by consenting | Copy through existing authorized workflow first |

Per-use private consent covers the explicitly displayed **whole-file operation's chunk plan**, not future attempts: each sequential chunk must match that frozen plan and reserved total; Try again requires new consent. Public 30-day approval is revoked by destination/model/kind/policy change, sign-out/reset or manual revoke. A changed target invalidates per-use approval and estimate. Auth failure does not authorize trying another identity/provider.

Never persist custom prompt text, partial output, provider response body, raw token stream or refusal prose in logs/Git/consent records. Complete variations exist only in the deliberate encrypted/private local history contract; accepted content exists in its normal note. Transient request buffers are not a hidden prompt history. No telemetry, analytics, crash upload or remote diagnostics is added.

## Limits and errors

RWR-26, RWR-44, RWR-47. These are proposed product safeguards, not guarantees about a provider's billing. The [engine limits](rewrite-engine.md#long-files-and-limits) are authoritative for input/output/chunks.

| Guard | Proposed numeric default |
| --- | --- |
| Concurrent inference | One/workspace, one outstanding chunk; no background prefetch |
| Rate | At least 2 s between starts, at most 10 provider requests/minute and 100/day/device, including chunks/manual retries; connection checks 6/minute separately |
| Input estimate | Offline approved tokenizer or a route-verified conservative upper-bound rule, never the characters/4 heuristic. UTF-8 byte count is a candidate bound, not universal proof for arbitrary tokenizers. Unknown tokenizer semantics disable the route. |
| Context | Input upper bound + maximum output must fit 90% of verified profile context; 512-token system/framing allowance; no silent truncation |
| Cost | USD 0.10/operation and USD 1.00/day/device default admission threshold, configurable down to zero; raising requires explicit settings confirmation and cannot relax reviewed policy ceilings |
| Daily tokens | 200,000 input-plus-reserved-output tokens/device even when price is unknown; local profile uses same throughput cap |
| Confirmation | Each operation above 4,000 estimated input tokens, more than one chunk or USD 0.02 estimated upper charge; strict unknown pricing blocks rather than offering an unbounded approval |
| Reservation | Reserve full aggregate chunk input/output/cost before first request, atomically in local ledger; one estimate ID valid 5 min, bound to source/profile/model/pricing revision |
| Timeouts | Connect 5 s; headers 15 s; first text 60 s from dispatch; idle text 20 s; absolute request 180 s; whole operation 600 s. Earliest deadline wins; heartbeat is not text. |
| Retry | No automatic inference retries, including 429/5xx/network timeout. Manual Retry performs fresh consent/estimate; another billable attempt is visible. |
| 429 | Respect Retry-After, minimum 2 s, absent/invalid →30 s; up to 300 s countdown UI, larger shows later time. Never schedule an inference resend. Known quota/billing exhaustion is `cost-limit`. |

Pricing stores explicit input/output USD per million tokens, all billable units/factors, source URL and checked date. Unknown/stale-over-30-days pricing is marked unknown, never $0; strict remote sending is blocked as `cost-limit` unless a defensible full-operation upper bound or provider-enforced account budget exists. A person-entered guessed maximum is not a bound. Relaxing this uncertainty is a separate owner decision, not ordinary consent. Use integer micro-USD ledger arithmetic; non-USD routes need a reviewed own-currency budget or dated conversion, not invented exchange rates. Cancellation may not stop provider billing; disclose that client admissions do not control a vendor invoice or out-of-app usage.

Ledger uses UTC day, persisted monotonic last-day floor (clock rollback does not reset allowance). Commit reservations before sending; crash or missing usage retains the maximum reservation until day's expiry, never refunds optimistically. Trusted bounded usage may reduce it after completion. A local profile may declare monetary pricing not applicable, but still records request/token reservations and does not claim free electricity or no runner charges. No hidden daily reset by deleting a profile.

### Error taxonomy

All copy is a planned message key under `rewrite.error.<code>` in the [UX message register](../design/rewrite-with-ai.md#message-keys). No raw provider error strings are displayed. Original/prompt are retained unless the person explicitly closes; no error applies partial text.

| Code | Cause | Retry rule | User-visible outcome / exact default copy |
| --- | --- | --- | --- |
| `no-provider` | No enabled usable profile | After setup | "Set up a provider to rewrite text." → Set up |
| `consent-required` | Missing/expired destination approval | After confirmation | "Review where this text will be sent." → Review |
| `private-blocked` | Private policy/storage/attestation refuses | Change policy/unlock; never bypass | "This provider can't rewrite private notes with your current settings." → Settings |
| `offline` | Connectivity/DNS/unreachable endpoint, before/after deltas | Manual; no cloud fallback | "Can't reach this provider. Check the connection and try again." |
| `auth-failed` | 401/403, missing key, unavailable key store | After key/storage correction | "Couldn't sign in to this provider. Check its key in Settings." |
| `rate-limited` | Local cap or HTTP 429 | Manual after retry time/day | "Too many requests. Try again after {time}." |
| `cost-limit` | Reservation exceeds caps or unknown charge not confirmed | Reduce request/change cap/confirm | "This rewrite exceeds your limit. Review the estimate or choose less text." |
| `timeout` | Connect/first-token/idle/total deadline | Manual, cost warning | "The provider took too long. Your original text is unchanged." |
| `provider-error` | 5xx, protocol/unsupported API, local checkpoint failure | Manual after cause addressed | "Couldn't complete the rewrite. Your original text is unchanged." |
| `refused` | Structured refusal/content filter | Edit prompt/select different text | "The provider couldn't rewrite this text. Try a different instruction." |
| `too-large` | Input/output/context/chunk/history limits | Smaller target/free local history | "This rewrite is too large. Select less text and try again." |
| `stale-target` | Identity/hash/existence or target changed | Reselect/review disk conflict | "This text changed while rewriting. Select it again to keep both versions safe." |
| `read-only` | Workspace/note permissions | Writable authorized note only | "This note is read only." |
| `conflict-pending` | Existing resolver holds target | Resolve first | "Resolve this note's changes before rewriting." |
| `invalid-output` | Unsafe/unsupported Markdown, invalid/truncated/empty response | Manual or edit instruction | "The reply couldn't be used as Markdown. Your original text is unchanged." |
| `cancelled` | Person stops, leaves note or closes session | Explicit new attempt | Status, not alert: "Rewrite stopped. Your original text is unchanged." |

An offline operating-system hint does not disable a loopback profile: actual guarded local connection determines reachability. It may warn for a remote profile but never sends automatically when connectivity returns. A failure after some deltas removes the entire projection; previous complete variations remain.

## Fixtures and kit

RWR-45. Apply the **ai-integration method**, not an inference runtime or mandatory SDK. Offline research used upstream revision `1613a55775f3dd06f157a73a7b2db0ddc0f68ea7` on 30 October 2026, MIT, Node 22+ and Git. The catalogue's dated documentation research is not live-tested provider evidence. No inference, key creation, discovery or real connection check ran.

| Method step | Planned Focus Notes artifact / offline proof |
| --- | --- |
| Policy before provider | This page's default-off/private/egress matrix; owner-gate decision record, not provider marketing |
| Nonsecret profiles | Versioned fixture profile with `credentialRef`, schema validation rejects inline secrets |
| Routing/egress | Single approved route, no fallback; transport tests trap DNS/redirect/proxy/metadata escapes |
| Credential references | Fake secret resolver in tests; no real key, env token or account |
| Operation contract | Bounded streaming union, error taxonomy, consent/estimate binding, cancellation |
| Fixture-first | Scripted provider cases below, never live/billable probes |
| Rollout/rollback | Fake-only slices before gate; real egress flag defaults off and can be disabled without losing notes/history |

### Offline provenance

The following exact commands ran in the separate scratch clone of that revision (AIR-R3 research), not the app. Paths to the synthetic profile refer to that scratch research artifact; they are not shipped settings. A later builder recreates a nonsecret planning profile from these contracts, runs the same validators, and keeps runtime deployment readiness false until capability gaps are resolved.

| Command from kit root | Recorded result and what it proves |
| --- | --- |
| `node skills/ai-integration/scripts/ai.mjs catalogue validate` | Passed, 45 entries; catalogue schema only |
| `node skills/ai-integration/scripts/ai.mjs catalogue query --environment hybrid --allow openai,ollama-local,lm-studio,llama-cpp --modality text` | Four docs-only candidates; hybrid is planning shortlist, not runtime fallback |
| `node skills/ai-integration/scripts/ai.mjs catalogue freshness --as-of 2026-10-30 --max-age 90` | 118 within-window source associations, four unverified; not 122 independently verified URLs |
| `node skills/ai-integration/scripts/ai.mjs profile validate ..\air-profile.json` | Valid planning schema, `integrationTested:false`, eight explicit model/build/hardware gaps |
| `node skills/ai-integration/scripts/ai.mjs profile plan ..\air-profile.json` | Offline scaffold generated; not a ready endpoint or working Focus Notes feature |
| `node skills/ai-integration/scripts/ai.mjs catalogue source-check --allow openai,ollama-local,lm-studio,llama-cpp` | `network:false`, 19 documentation URLs previewed; no `--network` |
| `node --test` | 34 kit tests passed, zero failed/skipped; proves kit tooling only |
| `node tools/install.mjs "E:\Projects\side-projects\focus-notes" --target github --dry-run` | 17 managed payload files proposed, no repository writes; no agents/hooks/runtime installed |

Upstream method sources at that revision: `references/workflow.md` (policy/selection), `provider-notes.md` and `providers.json` (dated options), `security.md` (references/egress/injection), `modalities.md` (operation/stream), `ux.md` (consent/waits/cost), `maintenance.md` (evaluation/rollback). Applying these contracts is mandatory; installing a fourth pinned kit is optional later work, separate from this spec.

Fixture scripts: `success`, `slow-first-token`, `slow-stream`, `stall-connect`, `stall-idle`, `timeout-total`, every error code, `cancel-race`, `late-completion`, `duplicate-sequence`, `wrong-window`, `truncated-utf8`, `malformed-sse`, `missing-finish`, `refusal`, `unsafe-html`, `unsafe-link`, `prompt-injection`, `oversize-input`, `oversize-output`, `chunk-failure`, `unknown-usage`, `history-full`, `key-store-locked`, `dns-rebind` and `redirect-key-leak`. Fake deltas use a deterministic fake clock. Test strings are synthetic, never the owner's notes.

`FOCUS_NOTES_E2E=1` forces the fixture adapter and refuses all real provider transports even when a profile exists. Packaged production does not accept a renderer-selected fixture bypass. Unit suites inject adapters/transport/clock/secret store; journeys use main-process seams like existing `fre-fakes.ts` and assert state barriers before releasing deltas. Real provider rollout tests are separately owner-approved and never prerequisites for writing this spec.

## Rollout and rollback

RWR-46. WP-AI.1 through WP-AI.6 build the fake-visible engine, prompt, effect, history, file operations and setup. They may be reviewed without an account. WP-AI.7 records explicit owner approvals; WP-AI.8 is the first slice allowed to enable real transport. Provider choice does not delay a saved fake-first spec or candidate preview.

| Gate | Required owner-approved evidence, not presently claimed |
| --- | --- |
| Provider/privacy | Named destination classes, local attestation wording, private/shared-note matrix, no fallback, retention disclosure |
| Auth/cost | Key store behavior, pricing/reservations, charge disclaimer, request/day caps |
| Security | Independent IPC/egress/key/log/injection/private-history review and fixture proofs; no broad renderer network exemption |
| Store | Inspect manifest capability requirements for packaged network/local endpoint access; add minimum needed capability only with approval, or keep Store transport disabled |
| Published claims | Update app Help, `site/privacy.md`, Store listing/privacy disclosures and data inventory together with enabled behavior; no claim that current no-third-party-request policy already permits model egress |

Rollback disables new `rewrite:start` calls and aborts active transports, restores canonical original/independent edits, retains complete encrypted history and accepts no new provider calls. It does not roll back note commits or delete accepted writing. A privacy/security failure disables the affected route; never silently substitutes another one.

## Platform scope

RWR-48. Desktop/Windows first (D-112, D-211). Main owns secrets and transport; the browser app is explicitly unavailable for rewriting in the first release and sends no text to models. A later web feasibility slice must resolve secure credentials, origin/egress, private access, consent and durable recovery before proposing an adapter; copying desktop settings into localStorage is not that design.

The Microsoft Store build is not implicitly exempt from endpoint policy or privacy updates. Fake UI may ship behind a disabled capability, but real calls require the same gate plus reviewed packaging/disclosure changes.

## Decisions

| ID | Status | Choice and source |
| --- | --- | --- |
| D-249 | Proposed (owner) | BYO narrow `chat-completions-text-v1` adapter, loopback-only local v1 (LAN deferred), safeStorage references, exact-origin egress, private per-use remote consent, strict unknown-price blocking and USD 0.10/1.00 admission thresholds. Sources: D-21/PRV-01, Electron safeStorage and ai-integration revision above. A transient key-entry field is allowed only for explicitly entered keys, cleared on acknowledgement; stored keys never return to renderer. This avoids an unproven native-dialog dependency while stating the real boundary honestly. No provider approved. |

See the [acceptance matrix](../plan/rewrite-acceptance.md), [security model](security-and-privacy.md) and [desktop boundary](desktop-and-git.md).
