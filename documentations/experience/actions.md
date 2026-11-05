# Actions: find and act

**Draft, for owner review (6 November 2026).** The feature the owner's Spotlight note asks for: one dialog, **Actions**, tagline **Find and act**, that opens any file or folder in the project and runs a curated set of actions that all work and can't be confused. The rules behind it are the [Actions framework](../architecture/actions-framework.md).

> [!NOTE]
> **TL;DR.** <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>⌘/</kbd>) opens **Actions**. Type to find a file or folder (Enter opens it; a folder opens in Files, focused) or an action (Enter does it, or starts its flow). With text selected, *This selection* comes first (*Bold*, *Add link…*, *Rewrite with AI…*); then *This note* (*Share this note…*, *Publish this note…*), *This project* (*Project settings…*, *Rename project…*) and *App* (*Sign in to GitHub…*, *Connect to AI…*, *Keyboard shortcuts*, *Customize toolbar…*). Only about 45 proven actions are listed, each with a label no other action shares; today's ~200 rows, with *Cancel*, *Retry* and duplicate *Share…*, go. This page is being written: the starter set, flows, views and requirements follow.

<!-- sections continue below -->
