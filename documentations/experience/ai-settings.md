# Settings → AI

> [!NOTE]
> **TL;DR.** Settings → AI connects 26 kinds of service; keys stay sealed on this device, discovery finds already-running local servers, and Test sends only a made-up request. One remembered **Default** here is the **Writer** in the Rewrite prompt. Every prompt shows service, model and **This computer** or **Cloud**. The person decides what to send, including private notes; no private-notes blocking option remains (D-261, D-262). D-266 removes first-send disclaimer/consent in the inline prompt (WP-AI.14). The owner approved exact d40b78a3 UX/UI at 19:59 on 1 November; its combined runtime/test/config head passed complete Windows CI 41325681712, with separate certification limits recorded below.

| Promise | Scenario | User can | Surface | Requirements and decisions |
| --- | --- | --- | --- | --- |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-05 | IA-VIEW-REWRITESETTINGS, IA-CMP-REWRITESTATUS, IA-CMP-AIKEY | AIS-01 to AIS-06, AIS-08 to AIS-12, AIS-15, PRV-05; DD-RWR-05 to DD-RWR-07 |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-08 | IA-CMP-AIDISCOVER | AIS-07; DD-RWR-08 |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-09 | IA-CMP-REWRITEPROMPT, IA-VIEW-REWRITESETTINGS | AIS-13, AIS-14; DD-RWR-09 |

Rewrite itself is in [Rewrite with AI](rewrite-with-ai.md). How each service is called, and the ones not offered, are in [Rewrite providers](../architecture/rewrite-providers.md). The kit behind the catalogue is [ai-integration](https://prabinpebam.github.io/loushing/items/ai-integration/), pinned at 1613a55.

## The section

**Current approval, 1 November 19:59:** exact d40b78a3 UX/UI is accepted.
Production hardening preserves its list, CLI companion, glyphs and disclosure.
The current 217-unit and six-journey checks prove native Default focus/identity,
the shared Writer round-trip and retained editor/panel/scroller nodes.
Signed-in Copilot discovery announces translated availability without restoring
redundant visual prose. The [gate evidence](../plan/gate-evidence.md#current-production-candidate-checks)
records complete exact-head full-gate proof and live-account limitations; older pending-review statements
below describe their historical integration boundaries.

<h3 id="single-list-default-choice-d-267-planned">Single-list default choice (D-267)</h3>

**As built in c4335741 and integrated into own-candidate:** this anatomy is implemented with the ItemCard primitive's native radio choice area. Radio labels wrap identity only; Test/Change/Remove stay sibling actions. The native same-name group supports 30 rows, arrow keys and Space. Checked state remains bound to the saved Writer ID; shared `chooseWriter` uses the existing bridge and tracker, reports failures, and refreshes both view models. Deleting the default now clears the ID instead of silently choosing the first remaining connection; editing a remaining connection does not invent a new default. First-save selection is retained for a new first connection. See [measured checks](../plan/definition-of-done.md#settings-ai-single-list-stage) and [combined candidate evidence](../plan/rewrite-acceptance.md#settings-list-combined-candidate-1-november). All five combined journeys pass; the owner-review refresh follows validation. Owner acceptance remains pending.

CP-RWR-01 → SC-RWR-04 → UC-RWR-05 / UC-RWR-08 → IA-VIEW-REWRITESETTINGS / IA-CMP-REWRITESTATUS / IA-CMP-AIDISCOVER → DD-RWR-07 / DD-RWR-08 → AIS-16, in WP-AI.15 / MAI.

The 17:29 feedback revision places **Find on this PC** and **Scans this PC for running AI services you can use.** in one named semantic row above the connections list; they wrap as a group when needed. Discovery results remain directly below that row. **Add connection is the final item**, after every list, setup form, explanation and necessary status; nothing follows it. Signed-in supported Copilot is added once, while servers still offer **Set up**. Unknown, unsupported and signed-out results keep their reasons. Remove redundant signed-in/privacy success prose and the empty local-setup sentence; preserve row locality, necessary errors and setup controls. Successful Copilot discovery still announces its availability and Cloud destination to assistive technology without adding visual prose.

| Row part | Behaviour |
| --- | --- |
| Choice area | Keyboard-accessible radio-like choice named with the connection and **Default**; checked semantics reflect the saved Writer ID. Space selects the focused row; arrow keys move between choices. |
| Identity | Keep the icon, name, service, model, destination/locality, key state and last Test. Selection uses existing semantic tokens plus a **Default** badge, never colour alone. |
| Actions | **Test connection**, **Change**, **Remove** remain sibling controls outside the choice target, not buttons nested in a radio/button. Editing, testing or removing never also selects the row. |
| Saving | Keep the previous saved choice checked until persistence succeeds. Radio nodes remain focusable and inert with `aria-disabled`; the mounted progress LiveRegion does not change list height. Success is announced, not repeated as a sentence. Only existing row state/paint changes: editor, panel, input and scroll survive. On failure retain the choice and show the reason with retry available. |
| Empty / one / many | Empty offers Add or Find, no invented default. The existing first-save rule selects the first connection. Multiple rows have exactly one checked default when a Writer exists. Removing it leaves no default until another is chosen. |

**One truth:** Default is the existing device-local Writer ID, not a second preference or store. Choosing a row calls the existing Writer command. Rewrite's remembered integration picker writes the same ID; reopening Settings reflects that choice, and choosing in Settings determines the next Rewrite. Neither discovery nor selecting a default sends note text.

**Build boundary:** implemented over immutable 86631980, preserving D-264/D-265/D-266, with no editor/geometry changes or restored private-note blocking/first-send consent.

Connection rows now identify the service with its monochrome brand icon where permissive artwork is available, otherwise a neutral server, cloud or connection mark (D-263, AIS-03). Names, destinations and status stay visible: an icon never promises a working connection or on-device inference. This extends CP-RWR-01 → SC-RWR-04 → UC-RWR-05 → IA-VIEW-REWRITESETTINGS / IA-CMP-REWRITESTATUS → DD-RWR-07 → AIS-03, planned in WP-AI.11 / MAI.

| Identity | Icon |
| --- | --- |
| Ollama, LM Studio, vLLM | Their service marks |
| Anthropic Claude, Google Gemini, Mistral AI, DeepSeek, Perplexity | Their service marks |
| OpenRouter, Hugging Face | Their service marks |
| llama.cpp, SGLang, LocalAI, Jan, Docker Model Runner | Neutral code/server mark |
| OpenAI, Azure OpenAI, Cohere, Groq, Together AI, Fireworks AI, xAI, Cerebras, NVIDIA NIM, Cloudflare Workers AI | Neutral cloud mark |
| Other OpenAI-compatible service, unknown/custom kinds | Neutral connection mark |

Docker, NVIDIA and Cloudflare logo terms require authorization; none has been obtained. OpenAI/Azure and the other neutral kinds have no approved artwork in this increment; that is an artwork gap, not an unsupported connection. The [component catalog](../design/system/components.md#integration-icons) and [D-263](../plan/decisions.md) record the source and terms. CLI identity aliases for Copilot, Claude Code, Codex and Gemini are available to the picker, but this icon change adds no CLI transport.

The historical pre-D-267 anatomy below is retained for comparison; the single-list anatomy above supersedes its Writer menu, Use as Writer action and local section.

| Part | What it shows | Actions |
| --- | --- | --- |
| Intro | "Rewrite sends the text you select to an AI service you choose: a server on this computer, or a cloud service with your own key. Focus Notes never runs a model itself." | — |
| **Writer (used by Rewrite)** | The Writer's name, or "No connection yet" | A menu of the connections |
| **AI connections** | One row per connection, or "No AI connections yet. Add one, or find a server running on this computer." | Per row: **Use as Writer**, **Test connection**, **Change**, **Remove** |
| **On this computer** | "Finds Ollama, LM Studio, llama.cpp, vLLM, SGLang, Jan and Docker Model Runner on their usual ports. Nothing leaves this computer." and what was found | **Find on this computer**; **Set up** on each server found |
| **Add connection** | The form, when open | **Save connection**, **Cancel** |
| Status | The last thing that happened: "Connection saved. Test it to check it answers.", "Ollama is now the Writer.", "Connection removed. Your notes are unchanged." | — |

### A connection row

Each row (IA-CMP-REWRITESTATUS, AIS-03) has:

- the name you gave it;
- "{service} · {model} · This computer" or "· Cloud". Locality follows the model and address (D-262), not the service group. Ollama `:cloud`/`-cloud` models, cloud-routing metadata, or an `ollama.com` host are Cloud; otherwise a loopback/private-LAN endpoint is This computer. A typed local model requires no discovery. OpenAI-compatible endpoints use the same address classification; other remote hosts are Cloud;
- a **Writer** or **Saved** badge;
- the key: "Key saved in the system keychain", "No key saved" or "No key needed";
- the last Test: "Saved. Connection not checked.", "Testing…", "Checked {time}: it answered.", "Last check {time} failed." or "Test failed: {reason}".

"Saved" never means "connected": only a Test that answered says so.

## Connect a service

<ol class="slate-steps">
  <li class="slate-step">
    <p class="slate-step__title">Find it or add it</p>
    <p>For a server on this computer, choose <strong>Find on this computer</strong>, then <strong>Set up</strong> on the server found. Otherwise choose <strong>Add connection</strong>.</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Choose the service</p>
    <p><strong>Service</strong> is a menu in three groups: On this computer, Cloud APIs, Gateways and other services. The form then shows only that service's fields. Choosing another service starts the form afresh, so no address or key carries over.</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Fill in its fields</p>
    <p><strong>Name</strong>; <strong>Address</strong> for local servers, Azure and other compatible services; <strong>Model</strong>, with <strong>Find models</strong> and <strong>Choose a model</strong>; <strong>Deployment name</strong> and <strong>API version</strong> for Azure; <strong>Account ID</strong> for Cloudflare; <strong>API key</strong> when the service takes one. The form says where text goes: "Selected text goes to api.openai.com · Cloud".</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Save, then Test</p>
    <p><strong>Save connection</strong> is ready once the required fields are filled ("Fill in the address and model first"). Then <strong>Test connection</strong>. The first connection you save becomes the Writer; for another, choose <strong>Use as Writer</strong>. If you remove the Writer, Rewrite has none until you choose one.</p>
  </li>
</ol>

## The services

26 API/server kinds from the ai-integration kit, plus the supported GitHub Copilot CLI integration (AIS-02, D-257, D-264). The CLI adapter is on `fix-ai-copilot-cli`, pending combined Settings integration.

| Group | Services | Address | Key |
| --- | --- | --- | --- |
| On this computer | Ollama (`127.0.0.1:11434`), LM Studio (`:1234/v1`), llama.cpp server (`:8080/v1`), vLLM (`:8000/v1`), SGLang (`:30000/v1`), LocalAI (`:8080/v1`), Jan (`:1337/v1`), Docker Model Runner (`:12434/engines/v1`) | Yours to change; the usual one filled in | Optional; none for Ollama and Docker Model Runner |
| Cloud APIs | OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, Mistral AI, Cohere, Groq, Together AI, Fireworks AI, DeepSeek, xAI Grok, Cerebras, Perplexity, NVIDIA NIM, Cloudflare Workers AI | Fixed by the service; Azure's is your resource; Cloudflare's takes your account ID | Required |
| Cloud integration on this computer | GitHub Copilot (on this computer) | GitHub's service through the supported installed CLI | No key field; runtime-owned existing login |
| Gateways and other services | OpenRouter, Hugging Face, Other OpenAI-compatible service | Fixed, or yours for Other | Required, or optional for Other |

The group's note says what that means for your words: "Runs on this computer. Choose a model you've installed; models marked Cloud send text off this computer.", "Your text goes to this service with your own API key. Its terms and charges apply." or "Your text goes to this service, which may pass it to other providers. Its terms and charges apply."

**Not offered, and why:** Amazon Bedrock (AWS signing), Vertex AI (Google sign-in), Foundry with Entra, Replicate/fal (job queues), MLX LM (in-process hosting) and blanket command-line/MCP bridges. D-264 adds only proven Copilot support: Claude subscription reuse is dropped without Anthropic approval; Gemini OAuth reuse is held; Codex is deferred until no-actions support is proven.

## Keys

You type a key into the **API key** field (IA-CMP-AIKEY). It leaves the field once, when you choose **Save connection**: the main process seals it with the system key store (Electron `safeStorage`), the field clears, and the key is never sent back to the window, written to a log or put in your notes (AIS-05). When you change a connection, leave the field empty to keep the saved key ("A key is saved in the system keychain. Leave this empty to keep it, or enter a new one to replace it."). If the key store can't be used: "Couldn't use the system keychain on this computer. Enter the key again." A key is never copied to a connection of another service, or to another address: when you change a saved connection's address, the key field says "Enter the key again for the new address. The saved key is never sent to it.", and saving without a new key drops the old one (a service that needs a key says "Enter the key again for the new address."; D-259). **Remove** deletes the connection and its sealed key.

## Find on this computer

### Supported CLI login discovery (D-264)

The owner's **Find on this computer** action also checks the supported installed Copilot version and its runtime-owned authentication, with no prompt, login flow, cloud-model list or credential read. It keeps the earlier results while checking; the CLI probe has a 5 s failure bound plus bounded runtime shutdown. Signed-in Copilot is added directly, once, and becomes the active integration only if none is set. An existing choice is unchanged. Generate sends directly with the active integration disclosure (D-266); there is no first-send consent gate.

The Copilot connection always says **Cloud**, has no API key or editable endpoint, and starts with model `auto` (the CLI default). **Find models** explicitly lists the GitHub service's models. Signed-out, unsupported and unknown results say why and do not claim readiness or activate. Sign-in stays in the person's normal terminal; the app never copies tokens or uses the person's active configuration as a fallback. Errors include CLI missing, unsupported version, not signed in and quota; original text is restored on Rewrite failure or Stop.

**Find on this computer** (IA-CMP-AIDISCOVER, AIS-07) asks each local server's usual port for its models, waiting at most 800 ms each, and never looks beyond this computer. It says "Looking for AI servers on this computer…", then "Found 2 servers on this computer." with a row per server ("3 models · http://127.0.0.1:11434", or "Running, no models yet · …") and **Set up**, or "No AI server is answering on this computer. Start Ollama, LM Studio or another local server, then look again." **Set up** opens the form with the address and the first model that runs locally. A server that asks for a token still counts as found. LocalAI shares llama.cpp's port, so it isn't asked separately.

### The scan while it looks

**Approved by the owner, 5 November 02:43; integrated separately from the rejected toolbar** (DD-RWR-12, AIS-07). The scan is a waiting operation (up to 1.5 s for the ports, 5 s for the Copilot CLI, plus bounded owned-runtime shutdown), so Settings shows its work honestly instead of one spinner:

- **A radar** over this computer's mark: a sweep turns, and a blip lights for each server that answers. It never shows a blip it hasn't found.
- **One row per place it asks**: Ollama (11434), LM Studio (1234), llama.cpp (8080), vLLM (8000), SGLang (30000), Jan (1337), Docker Model Runner (12434) and the GitHub Copilot CLI, the same list `packages/core/src/ai-providers.ts` probes. Each turns *Checking…*, then a model count, *Available*, *Not running* or *Could not check*. A row settles immediately on its real answer, with no staged delay.
- **A live count** ("Found 2 so far"), announced politely once at the end, not on every row.
- **Its ends:** found (the existing rows with **Set up**, or the existing automatic signed-in Copilot connection), none (no running service), or error (failed rows and a recovery reason, keeping completed results). **Find on this PC** runs another scan. Prior results remain while a replacement scan starts.
- **Cancel scan** is available throughout the wait. It aborts this window's HTTP and CLI probes, retains completed results, marks pending rows *Not checked*, and prevents late answers from overwriting the stopped or next scan. Closing or navigating the window also aborts its scan.
- **Reduced motion** stops the sweep and the blips' pulse; the rows and count still change.

The built-app `ai-discovery.spec.ts` journey drives Settings normally and observes checking, partial found counts, found, none, scoped errors and cancellation. Protocol fakes run inside the test process; the installed Copilot CLI is not found on its isolated PATH. No account login, cloud request, generation or real GitHub action is tested or implied.

The renderer's scan duration is retained in local diagnostics as `fn:ai.discover.window`, with counts and percentiles only. Cancel belongs to the scan's own controls, not the native menu bar. The CLI's scan row says **On this computer**, without offering outside software.

## Models

**Find models** lists what the service offers, up to 500, within 8 seconds: for a saved connection, or for the form you're filling in, with the key you typed, or the saved key only while the address is still the saved one (AIS-08). "Finding available models…", then "12 models available." or "No models are available. Install or load one, or type a model you have access to." Ollama models that run in the cloud show "· Cloud", so a local server can't quietly send text away. Azure lists none: its deployment is the model.

## Test connection

Before you run it, Settings says what it does: "Test sends one short made-up request ("Connection test.") to the connection's address and asks for a one-word reply. No note text is sent. A cloud service may bill it." (AIS-09). It waits up to 20 seconds and records the time and the result on the row.

## Addresses

An address is https, or plain http only to `127.0.0.1`, `localhost` or `[::1]`, with no user name, password, query or fragment: "Use an https:// address, or http://127.0.0.1 or http://localhost for a server on this computer." Requests never follow a redirect (AIS-06).

## Errors

Each failure has its own words and next step (AIS-11). Saving that fails leaves your previous settings as they were.

| Problem | Words |
| --- | --- |
| No Writer | "No Writer yet. Add a connection in Settings → AI." |
| Key store | "Couldn't use the system keychain on this computer. Enter the key again." |
| Key refused | "The service refused the key. Check it in Settings → AI." |
| Key missing | "This service needs an API key." |
| Key for a new address | "Enter the key again for the new address." |
| Too slow | "The service took too long to answer. Try again." |
| Nothing listening | "Nothing is answering at that address. Start the server, or check the address in Settings → AI." |
| Address not found | "Couldn't find the service's address. Check your internet connection and the address." |
| Secure connection | "The service's secure connection couldn't be verified, so nothing was sent." |
| Redirected | "The service tried to send the request somewhere else, so nothing was sent." |
| Can't reach | "Couldn't reach the service. Check the address and your connection, or start the local server." |
| Model missing | "The server doesn't have that model. Choose an installed model." |
| Not found | "The service doesn't know that model or address. Check them in Settings → AI." |
| Busy | "The service is busy or out of quota. Try again in {n} seconds." when it says how long, else "Wait a moment, then try again." |
| Service fault | "The service had a problem. Wait a moment, then try again." |
| Request refused | "The service turned the request down. Check the model in Settings → AI." |
| Too long | "The text is too long for this service. Select less and try again." Also when an answer is longer than Focus Notes reads (D-260). |
| Unreadable answer | "The service's answer couldn't be read. Check the address and the service in Settings → AI." |
| Error mid-answer | "The service stopped with an error. Try again." |
| No consent (retired by D-266) | Removed with AIS-14's consent gate; not an error in the inline flow. |
| Connection gone | "That connection is gone. Choose another in Settings → AI." |
| Bad address | "Use an https:// address, or http://127.0.0.1 or http://localhost for a server on this computer." |
| No model, deployment or account | "Choose or type a model.", "Enter the deployment name from Azure.", "Enter your Cloudflare account ID." |
| Bad key | "That key can't be used. Paste it again without line breaks." |
| Too many | "You have the most connections allowed. Remove one first." (30) |
| Anything else | "The service couldn't answer. Try again." |

## Where it's kept

`ai.json` in the app's data folder: each connection's service, name, address, model, cloud-routing metadata, deployment, API version, account ID, sealed key, last Test and what its consent covers, plus the remembered Writer. It's per device, never synced or committed, and listed in the [data inventory](../architecture/security-and-privacy.md) (AIS-15). A single OpenAI-compatible service saved by the first build becomes a connection, and the Writer if it was (AIS-12). Old `keepPrivate` keys are ignored when loading and stripped by the next ordinary settings write; no owner's real settings are migrated by a test (D-261).

## Private notes and disclosure

WP-AI.13 supplies D-261/D-262's disclosure; WP-AI.14 specifies removal of first-send consent (D-266). Existing `ai-app`, `ai-contract` and `air-safeguards` evidence covers the earlier implementation, not the pending removal:

- **User judgement** (AIS-13): no private-notes blocking switch or core/IPC gate. The Rewrite prompt shows the selected integration, model and locality every time, and the person decides whether to send from public, private or shared notes. This does not authorize logging private note text or publishing it to Git.
- **No first-send confirmation** (AIS-14, D-266; built locally, candidate acceptance pending): the active integration icon, service, model and This computer/Cloud are the disclosure. Generate sends directly on first and later use, including after connection changes. Remove the first-time warning/disclaimer, consent text, extra Send and consent-required gate. Old consent can load compatibly but is no longer authority to send or a reason to block. Cancel sends nothing.

The connection picker changes the same device-local Writer as Settings. It keeps prompt input, updates the active integration line and records `fn:ai.chooseWriter`; "Remembering your choice…" is announced during the save. Generate waits for the saved choice; errors keep the previous Writer and toast the reason.

## Decisions

- **D-257:** every text service kind in the ai-integration kit; supersedes D-236 and D-249.
- **D-233:** an integration client only; Focus Notes never installs, downloads, launches, hosts or runs a model.
- **D-259:** key/address isolation remains; private-note blocking and unknown-model cloud labels are superseded by D-261/D-262, and first-send consent by D-266.
- **D-261:** user judgement instead of a private-notes blocking option.
- **D-262:** per-model/per-host disclosure and a remembered picker in the prompt.
- **D-260:** request time limits, capped answers, the error words' reason codes, and the 26 built kinds only.
- **D-238:** historical consent proposal, superseded by D-266.
- **D-266:** active integration and user judgement replace first-send warning/disclaimer and consent; implementation pending in WP-AI.14.
