# Connect an AI service

Set up the AI service that rewrites your words: one running on this computer, or a service online that you use with your own key.

> [!NOTE]
> **TL;DR.** Open **Settings** → **AI**. For a service on this computer, like Ollama, select **Find on this computer**, then **Set up**. For an online service, select **Add connection**, choose the service, paste your key, and select **Save connection**. Then select **Test connection**.

**Applies to:** the desktop app on Windows, macOS and Linux.

**Before you start:** you need one of these:

- an AI app running on this computer, like Ollama or LM Studio, with a model in it;
- or an account with an online AI service, like OpenAI or Anthropic, and an API key from it. An API key is a long code the service gives you so it knows the requests are yours.

Focus Notes doesn't install or run AI models. It connects to a service you already have.

## Connect a service on this computer

1. Open **Settings**, then select **AI**.
2. Select **Find on this computer**.
3. Next to the service found, select **Set up**.
4. Check the **Model**. To pick another, select **Find models**, then **Choose a model**.
5. Select **Save connection**.

**Result:** the service is in **AI connections**, marked "On this computer". The first one you save is the **Writer**, the one Rewrite uses.

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

- In **Writer (used by Rewrite)**, choose a connection. Or select **Use as Writer** next to it.

## Good to know

- Each connection says where your words go: "On this computer" or "Cloud".
- A service on this computer can still send words online. Models marked "Cloud" do.
- Online services have their own terms and charges.
- To change a connection, select **Change**. Leave **API key** empty to keep the saved key.
- To delete a connection and its key, select **Remove**. Your notes don't change.
- Focus Notes works with 26 kinds of service, like Ollama, LM Studio, OpenAI, Anthropic, Google Gemini, Azure OpenAI, Mistral, Groq and OpenRouter. It doesn't work with Amazon Bedrock or Vertex AI yet.

## If the test fails

- "Couldn't reach the service." Start the app on this computer, or check that you're online. Then test again.
- "The service refused the key." Paste the key again, then select **Save connection**.
- "The server doesn't have that model." Select **Find models** and choose one it has.

## Related

- [Rewrite selected text with AI](rewrite-with-ai.md)
- [Reference](reference.md)
- For the curious: [Settings → AI specification](../experience/ai-settings.md)

[Back to Help](index.md)
