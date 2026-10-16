# Writing help articles

How every article in the Focus Notes help centre and every line on the product site is written: the voice, the content types, a template for each, and the checks an article must pass. It distils the Microsoft and Apple style guides, the GitHub Docs content model, Diátaxis, GOV.UK and plainlanguage.gov, Nielsen Norman Group's guidance on help, and Carroll's minimalism (D-168).

> [!NOTE]
> **TL;DR.**
> - **Write for the task, not the feature.** Titles are verb-first and in sentence case, 10 words or fewer: "Connect your GitHub account", not "GitHub integration".
> - **One article, one content type:** getting started, how-to, concept, troubleshooting, reference, FAQ or what's new. Background goes in a concept article that the how-to links to.
> - **Plain words at about grade 8 or below.** Every technical word (GitHub, repository, Markdown, Git, passcode, MCP) is explained in a few words on first use.
> - **Steps are numbered, one action each, starting with the verb,** and the result is stated after them.
> - **Troubleshooting starts from what the reader sees,** in the message's exact words, then gives the likely causes in order and the simplest fix first.
> - **Every article carries** *Applies to*, prerequisites where needed, two to four related articles, the last-updated date and the release it describes, and *Was this helpful?* with no tracking.

## Voice

- **Calm, direct and kind.** The way Focus Notes speaks in the app ([Foundations → Words](foundations.md#words)): short sentences, one idea each, no exclamation marks, no "please", no blame.
- **Second person and present tense.** "You can pin the Files panel," "Focus Notes saves your note within a second."
- **Name things as the app does,** with its exact labels in bold: **Save to cloud**, **Make public**, **Try again**. Keys use the key style: <kbd>Ctrl</kbd>+<kbd>K</kbd>, and the macOS keys alongside.
- **Say what Focus Notes does with people's data, exactly.** "Your private notes are sealed before they leave your computer," never "your data is safe." Use *sealed* for private notes everywhere, not a mix of *encrypted*, *locked* and *protected*.
- **Be honest about limits.** If something isn't possible, say so and say what to do instead, as the app's [unsupported boundaries](../product/spec/scenarios.md#unsupported-boundaries) do.
- **Don't market inside help.** Help articles explain and instruct. The landing page sells, and it may only claim what the release does.

## Plain words

- **Reading level about grade 8 or below.** CI measures Flesch–Kincaid for each article and fails above grade 9.
- **Explain technical words on first use,** in a few plain words:
  - *GitHub, a free website that stores files for you*;
  - *a repository, a folder of files on GitHub*;
  - *Markdown, plain text with a few symbols for formatting*.
- **Words the main path avoids:** commit, push, pull, clone, token, credential, instance, CLI. If an article must use one, it explains it.
- **Words to avoid everywhere:**
  - "simply", "just", "easy" and "obviously", which blame the reader when it isn't;
  - "click here", "see below" and "as mentioned";
  - Latin abbreviations ("e.g.", "i.e.", "etc."): write "for example" and "that is".

## Content types

| Type | Answers | Title pattern | Length |
| --- | --- | --- | --- |
| **Getting started** | "How do I begin?" | "Get started with Focus Notes" | 400–700 words, 5 minutes |
| **How-to** | "How do I do this one thing?" | Verb-first task: "Pin the Files panel" | 100–400 words |
| **Concept** | "How does this work, and what does it mean for me?" | "How …" or a noun phrase: "How saving and backing up work", "Public and private notes" | 400–1,200 words |
| **Troubleshooting** | "Something's wrong. What do I do?" | The message itself or the symptom: "Can't connect to GitHub", "“That folder already has other files”" | As long as the causes need |
| **Reference** | "What's the exact key, setting or file?" | A noun: "Keyboard shortcuts" | Tables, no story |
| **FAQ** | Quick questions before or after installing | The question, as people ask it | 1–3 sentences each, linking to the full article |
| **What's new** | "What changed in this release?" | "What's new in Focus Notes ⟨version⟩" | One sentence per change, in what it means for the reader |

## Templates

Each template's parts appear in this order. An article never mixes two types; it links to the other article instead.

**Getting started**
1. One sentence on what you'll have at the end.
2. *Before you start:* the system you need and a GitHub account, with how to make one.
3. Four to six numbered steps, one screenshot for each new screen.
4. *You're done:* what you should now see.
5. *Next:* two or three articles.

**How-to**
1. One sentence: what this does and why you'd want it.
2. *Applies to* (Desktop app on Windows, macOS, Linux; In your browser).
3. Prerequisites, only if there are any.
4. Numbered steps: one action each, the verb first, the place before the action ("In the Files panel, select **Pin**"), and the keyboard way in the same step.
5. *Result:* what changes on screen.
6. Tips or limits, if any, after the steps, never inside them.
7. Related articles.

**Concept**
1. The idea in one or two plain sentences.
2. A picture or diagram, if it helps.
3. How it works, in short sections with headings that make sense on their own.
4. *What this means for you:* the practical consequences.
5. Links to the how-to articles that act on it.
6. *For the curious:* a link to the specification, if there is one.

**Troubleshooting**
1. The symptom, with the message's exact words in quotes, and a screenshot if the message is in the app.
2. *Which one matches what you see?*: a short decision list that jumps to a section.
3. One section per cause, most likely first. Each has a title ("Git isn't installed"), one sentence on why it happens, numbered fix steps with the simplest first, and how to check it worked.
4. *Still stuck?*: how to copy the diagnostic report from Settings → About, and *Report a problem*, which opens a pre-filled GitHub issue.

**Reference**
1. One sentence on what the table lists.
2. Tables grouped by where they apply, with the same column order throughout: Action | Windows and Linux | macOS.

**FAQ**
- Each question has its own anchor so it can be linked to, an answer of one to three sentences, and a link to the article that covers it fully. The FAQ is never the only place an instruction is written.

**What's new**
- Newest first, grouped *New*, *Improved*, *Fixed* and *Security*. Each item says what the reader can now do ("You can now pin the Files panel and keep writing beside it"), not what was implemented.

## Every article

| Part | Rule |
| --- | --- |
| **ID and address** | A stable ID (`connect-github`) and an address under its category (`/help/get-started/connect-github/`). The ID never changes. If the title or category does, the old address redirects (HLP-03). |
| **Front matter** | `id`, `title`, `type`, `category`, `appliesTo`, `updated`, `release`, `summary`, `synonyms` (for search), `related`. |
| **Headings** | Sentence case, in order with no skipped levels, each one making sense alone. Sections other features link to have stable anchors. |
| **Steps** | Numbered, one action each, the verb first, and the expected result stated. Notes go after the step, never inside it. |
| **Screenshots** | From the screenshot pipeline (D-169), never hand-made, with one highlight at most, alt text that says what the image shows, light and dark. Only where they help: one per new screen in a procedure, none for a single click. |
| **Links** | Descriptive text, never "here". Internal links go by article ID. External links go only to GitHub, Git and the systems' own help. |
| **Footer** | *Applies to*, related articles, *Was this helpful?* (opens a pre-filled GitHub issue; no counter or tracking, HLP-07), the last-updated date and the release. |

## Checking an article

The [help article definition of done](../plan/definition-of-done.md#help-article-definition-of-done) is the checklist. CI checks what a machine can:
- the front matter;
- the content type's required parts;
- reading level;
- link and ID resolution;
- alt text;
- heading order;
- screenshot freshness.

A person checks the rest: whether the steps work on the current release, and whether someone who has never used Git can follow them.
