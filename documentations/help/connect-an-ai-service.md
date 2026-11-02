# Connect an AI service

Service icons help you recognize a connection. Some services use a neutral cloud, server or link icon because their logo needs permission or approved artwork is not available. The service name and address, not its icon, tell you where your words go; an icon does not mean the connection has passed **Test connection**.

Set up the AI service that rewrites your words: a server on this computer, GitHub Copilot you already use in your terminal, or an online service with your own key.

> [!NOTE]
> **TL;DR.** Open **Settings** → **AI**, then **Find on this PC**. A supported signed-in **GitHub Copilot** is added directly; local servers offer **Set up**. Copilot says **Cloud** because your words go to GitHub. Online APIs still use **Add connection** and your own key. **Test connection** sends only made-up text.

**Applies to:** the desktop app on Windows, macOS and Linux.

**Before you start:** you need one of these:

- an AI app running on this computer, like Ollama or LM Studio, with a model in it;
- or GitHub Copilot, if you already use it in your terminal;
- or an account with an online AI service, like OpenAI or Anthropic, and an API key from it. An API key is a long code the service gives you so it knows the requests are yours.

Focus Notes doesn't install or run AI models. It connects to a service you already have.

## Connect a service on this computer

1. Open **Settings**, then select **AI**.
2. Select **Find on this PC**.
3. Next to the service found, select **Set up**.
4. Check the **Model**. To pick another, select **Find models**, then **Choose a model**.
5. Select **Save connection**.

**Result:** the service is in **AI connections**, marked "This computer" for a local model or "Cloud" for a cloud model. The first one you save is marked **Default**, the one Rewrite uses.

## Connect GitHub Copilot on this computer

1. Open **Settings** → **AI**.
2. Select **Find on this PC**.
3. If a supported signed-in Copilot is found, it appears in your connections without pasting a key. It becomes the active integration only if you have not chosen one.

**Result:** **GitHub Copilot (on this computer)** says **Cloud**. The installed program runs here; GitHub's service rewrites the words. Focus Notes uses the login the program already owns, not a copied token. Rewrite shows the active integration and Generate sends directly, including the first time. Finding Copilot never sends your notes or starts sign-in.

If it says to sign in, use Copilot in your normal terminal, then look again. A login that cannot be used with isolated configuration is not activated. The supported version for this adapter is CLI **1.0.105**; Focus Notes does not download or update it.

Claude subscription logins are not reused. Gemini CLI login reuse is on hold, and Codex integration is deferred; their existing API connections remain separate.

## Connect an online service

1. Open **Settings**, then select **AI**.
2. Select **Add connection**.
3. In **Service**, choose your service, like **OpenAI** or **Anthropic Claude**.
4. In **API key**, paste your key.
5. Select **Find models**, then **Choose a model**. Or type the model's name.
6. Select **Save connection**.

**Result:** the service is in **AI connections**, marked "Cloud". Your key is locked in your computer's keychain. Focus Notes never shows it again.

## Check that it works

- Next to the connection, select **Test connection**.

**Result:** after a few seconds the row says "it answered". The test sends one short made-up message, never your notes. An online service may charge a tiny amount for it.

## Choose which one rewrites

The single-list Settings update is built on own-ai-default-list-build (D-267), pending integration into the owner's app.

- In **Settings** → **AI**, select a connection row. Its **Default** badge shows which one Rewrite uses. With the keyboard, move between choices with the arrow keys and select with Space.
- You can also choose **AI integration** in the Rewrite prompt when you have more than one connection. Both places change the same remembered choice on this computer; reopening Settings shows it.
- **Test connection**, **Change** and **Remove** act only on that connection, without changing the default.
- While a choice is being remembered, the old default remains selected. If saving fails, the reason appears and you can try again.
- Removing the default leaves no default. Choose another before rewriting.

Use **Find on this PC**, with one explanation: **Scans this PC for running AI services you can use.** There is no separate **On this computer** section. Discovery still does not send your notes; unsupported or unknown services are not claimed ready.

## Good to know

- Every Rewrite prompt shows the active service, model and "This computer" or "Cloud".
- Ollama has local and cloud models. A model ending in `:cloud` or `-cloud`, one Ollama lists as cloud-routed, or a connection to `ollama.com`, is marked "Cloud". Other local Ollama models don't need a test or discovery before they are marked "This computer".
- OpenAI-compatible services use their address too: localhost or a private-network address is "This computer"; a remote address is "Cloud". This identifies the configured destination, not a guarantee that the service never forwards requests.
- You decide what to send, including words from private notes. Focus Notes sends only your selection and prompt, never the rest of the note.
- Online services have their own terms and charges.
- To change a connection, select **Change**. Leave **API key** empty to keep the saved key.
- To delete a connection and its key, select **Remove**. Your notes don't change.
- Focus Notes offers 26 API/server kinds plus the supported Copilot CLI integration. It doesn't work with Amazon Bedrock or Vertex AI yet.

## If the test fails

- "Couldn't reach the service." Start the app on this computer, or check that you're online. Then test again.
- "The service refused the key." Paste the key again, then select **Save connection**.
- "The server doesn't have that model." Select **Find models** and choose one it has.
- Copilot not found: choose another connection.
- Copilot not signed in: sign in in your normal terminal, then look again.
- Copilot quota reached: check your Copilot plan or allowance, then try again. Your original words stay unchanged.

## Related

- [Rewrite selected text with AI](rewrite-with-ai.md)
- [Reference](reference.md)
- For the curious: [Settings → AI specification](../experience/ai-settings.md)

[Back to Help](index.md)
