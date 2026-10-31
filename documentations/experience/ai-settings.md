# Settings → AI

> [!NOTE]
> **TL;DR.** Settings → AI is where you connect the AI service Rewrite uses: a server already running on this computer (Ollama, LM Studio and six more), a cloud API with your own key (OpenAI, Anthropic, Gemini, Azure OpenAI and eleven more), or a gateway (OpenRouter, Hugging Face, any OpenAI-compatible service): 26 kinds in all. **Find on this computer** fills in local servers for you, keys are sealed in the system key store and never shown again, **Test connection** sends one made-up request and no note text, and one connection is the **Writer**. Focus Notes never runs a model. Built on 31 October (D-257), in the owner's review build. A private-notes switch and a first-send confirmation are planned.

| Promise | Scenario | User can | Surface | Requirements and decisions |
| --- | --- | --- | --- | --- |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-05 | IA-VIEW-REWRITESETTINGS, IA-CMP-REWRITESTATUS, IA-CMP-AIKEY | AIS-01 to AIS-06, AIS-08 to AIS-12, AIS-15, PRV-05; DD-RWR-05 to DD-RWR-07 |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-08 | IA-CMP-AIDISCOVER | AIS-07; DD-RWR-08 |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-09 | IA-VIEW-REWRITECONSENT, IA-VIEW-REWRITESETTINGS | AIS-13, AIS-14 (not built); DD-RWR-09 |

Rewrite itself is in [Rewrite with AI](rewrite-with-ai.md). How each service is called, and the ones not offered, are in [Rewrite providers](../architecture/rewrite-providers.md). The kit behind the catalogue is [ai-integration](https://prabinpebam.github.io/loushing/items/ai-integration/), pinned at 1613a55.

## The section

Settings on the desktop always lists **AI** (AIS-01). From top to bottom:

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
- "{service} · {model} · On this computer" or "· Cloud";
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

26 kinds, from the ai-integration kit's text-capable catalogue (AIS-02, D-257).

| Group | Services | Address | Key |
| --- | --- | --- | --- |
| On this computer | Ollama (`127.0.0.1:11434`), LM Studio (`:1234/v1`), llama.cpp server (`:8080/v1`), vLLM (`:8000/v1`), SGLang (`:30000/v1`), LocalAI (`:8080/v1`), Jan (`:1337/v1`), Docker Model Runner (`:12434/engines/v1`) | Yours to change; the usual one filled in | Optional; none for Ollama and Docker Model Runner |
| Cloud APIs | OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, Mistral AI, Cohere, Groq, Together AI, Fireworks AI, DeepSeek, xAI Grok, Cerebras, Perplexity, NVIDIA NIM, Cloudflare Workers AI | Fixed by the service; Azure's is your resource; Cloudflare's takes your account ID | Required |
| Gateways and other services | OpenRouter, Hugging Face, Other OpenAI-compatible service | Fixed, or yours for Other | Required, or optional for Other |

The group's note says what that means for your words: "Runs on this computer. Choose a model you've installed; models marked Cloud send text off this computer.", "Your text goes to this service with your own API key. Its terms and charges apply." or "Your text goes to this service, which may pass it to other providers. Its terms and charges apply."

**Not offered, and why:** Amazon Bedrock (needs AWS request signing), Vertex AI (needs Google sign-in), Microsoft Foundry with Entra sign-in (Azure OpenAI with a key is covered), Replicate and fal (job queues, not a text answer), MLX LM (a library, not a server) and command-line or MCP bridges (not in the kit).

## Keys

You type a key into the **API key** field (IA-CMP-AIKEY). It leaves the field once, when you choose **Save connection**: the main process seals it with the system key store (Electron `safeStorage`), the field clears, and the key is never sent back to the window, written to a log or put in your notes (AIS-05). When you change a connection, leave the field empty to keep the saved key ("A key is saved in the system keychain. Leave this empty to keep it, or enter a new one to replace it."). If the key store can't be used: "Couldn't use the system keychain on this computer. Enter the key again." A key is never copied to a connection of another service. **Remove** deletes the connection and its sealed key.

## Find on this computer

**Find on this computer** (IA-CMP-AIDISCOVER, AIS-07) asks each local server's usual port for its models, waiting at most 800 ms each, and never looks beyond this computer. It says "Looking for AI servers on this computer…", then "Found 2 servers on this computer." with a row per server ("3 models · http://127.0.0.1:11434", or "Running, no models yet · …") and **Set up**, or "No AI server is answering on this computer. Start Ollama, LM Studio or another local server, then look again." **Set up** opens the form with the address and the first model that runs locally. A server that asks for a token still counts as found. LocalAI shares llama.cpp's port, so it isn't asked separately.

## Models

**Find models** lists what the service offers, up to 500, within 8 seconds: for a saved connection, or for the form you're filling in, with the key you typed (AIS-08). "Finding available models…", then "12 models available." or "No models are available. Install or load one, or type a model you have access to." Ollama models that run in the cloud show "· Cloud", so a local server can't quietly send text away. Azure lists none: its deployment is the model.

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
| Too slow | "The service took too long to answer. Try again." |
| Can't reach | "Couldn't reach the service. Check the address and your connection, or start the local server." |
| Model missing | "The server doesn't have that model. Choose an installed model." |
| Not found | "The service doesn't know that model or address. Check them in Settings → AI." |
| Busy | "The service is busy or out of quota. Wait a moment, then try again." |
| Bad address | "Use an https:// address, or http://127.0.0.1 or http://localhost for a server on this computer." |
| No model, deployment or account | "Choose or type a model.", "Enter the deployment name from Azure.", "Enter your Cloudflare account ID." |
| Bad key | "That key can't be used. Paste it again without line breaks." |
| Too many | "You have the most connections allowed. Remove one first." (30) |
| Anything else | "The service couldn't answer. Try again." |

## Where it's kept

`ai.json` in the app's data folder: each connection's service, name, address, model, deployment, API version, account ID, sealed key and last Test, and which one is the Writer. It's per device, never synced or committed, and listed in the [data inventory](../architecture/security-and-privacy.md) (AIS-15). A single OpenAI-compatible service saved by the first build becomes a connection, and the Writer if it was (AIS-12).

## Planned: private notes and consent

Not built (WP-AI.13):

- **Don't send private notes** (AIS-13): a switch in this section, on by default. While it's on, Rewrite in a private note sends nothing; the dialog says "This note is private. Rewrite doesn't send private notes." and offers **Change in Settings**.
- **First-send confirmation** (AIS-14, IA-VIEW-REWRITECONSENT): the first time Rewrite sends to a connection, and again after its address, model or key changes, one dialog names the service, its address and On this computer or Cloud. **Send** goes ahead and is remembered for that connection; **Cancel** sends nothing.

These follow D-238 (consent names the destination), which the owner hasn't settled; the words above are proposals.

## Decisions

- **D-257:** every text service kind in the ai-integration kit; supersedes D-236 and D-249.
- **D-233:** an integration client only; Focus Notes never installs, downloads, launches, hosts or runs a model.
- **D-238:** consent names the destination; proposed, not built.
