# Focus Notes

A calm, Markdown-native writing app: a blank canvas, a single red trigger at the top center, and a focus mode that highlights only the row you are writing. Notes are plain Markdown in GitHub: private by default, published to the user's own GitHub Pages site, or shared with named people through a magic link or a passcode. Agents can help through MCP and a command-line tool, within permissions the writer grants. You write in your browser, from your own GitHub Pages site, where your notes are kept in that browser and your public and private notes open read-only; the desktop app (Electron) is the one that saves your notes to GitHub. Every user's Focus Notes is their own isolated instance in their own GitHub account (their repositories, their GitHub Pages site, their sign-in), with nothing hosted by this project.

**Status:** M1 (writing) is nearly done, and the web app runs on GitHub Pages (stage MW). See the [roadmap](documentations/plan/roadmap.md) and [AGENTS.md](AGENTS.md) for building and testing.

**License:** [MIT](LICENSE). Security reports: see [SECURITY.md](SECURITY.md). Instructions for AI agents: [AGENTS.md](AGENTS.md).

## Use Focus Notes yourself

This repository is the app's source, and its GitHub Pages site is the owner's own instance. To use Focus Notes, get **your own** instance; nothing is shared with anyone else's:

1. Make your instance from the Focus Notes **template repository**, [`focus-notes-workspace`](https://github.com/prabinpebam/focus-notes-workspace) (*Use this template*). Keep it public: GitHub Pages on free plans serves only public repositories. Private notes go in a private repository linked to it.
2. In your instance, open **Settings → Pages** and set **Source** to **GitHub Actions**, then run **Actions → Deploy app**. It deploys the released app, so you never build the app yourself.
3. Open `https://<your-username>.github.io/<repository>/` and start writing. What you write there stays in that browser, offline and with no account; the browser never signs in to GitHub.
4. To save notes to your repositories, download the **desktop app** from the latest [release](https://github.com/prabinpebam/focus-notes/releases/latest). Its setup signs in through Git's own tools, makes your private repository, sets your **vault passphrase** (which opens your private notes, read-only, in any browser), and imports the notes you exported from a browser with ⋯ → *Export my notes…*.

Want to improve Focus Notes? Fork this repository; its *Deploy app* workflow builds the app from source.

How it works, and why the browser keeps its own notes rather than signing in to GitHub: [Web app](documentations/architecture/web-app.md). To try the app locally: `pnpm install`, `pnpm tokens`, then `pnpm web`.

## Documentation

The project docs are a [Slate](https://github.com/prabinpebam/slate) site in [`documentations/`](documentations/). The human-written source of truth is [`documentations/seed-specs.md`](documentations/seed-specs.md).

To read the docs locally, clone with submodules, serve the repository over loopback HTTP, and open the docs host:

```powershell
git clone --recurse-submodules https://github.com/prabinpebam/focus-notes.git
python -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080/documentations/
```

After updating the `slate/` submodule, re-sync and check the generated runtime:

```powershell
node .\slate\scripts\runtime-host.mjs sync --repo . --host documentations
node .\slate\scripts\runtime-host.mjs check --repo . --host documentations
```
