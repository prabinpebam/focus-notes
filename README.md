# Focus Notes

A calm, Markdown-native writing app: a blank canvas, a single red trigger at the top center, and a focus mode that highlights only the row you are writing. Notes are plain Markdown in GitHub: private by default, published to the user's own GitHub Pages site, or shared with named people through a magic link or a passcode. Agents can help through MCP and a command-line tool, within permissions the writer grants. You write in your browser, from your own GitHub Pages site, or in a desktop app (Electron) if you want a dedicated desktop experience. Every user's Focus Notes is their own isolated instance in their own GitHub account (their repositories, their GitHub Pages site, their sign-in), with nothing hosted by this project.

**Status:** M1 (writing) is nearly done, and the web app runs on GitHub Pages (stage MW). See the [roadmap](documentations/plan/roadmap.md) and [AGENTS.md](AGENTS.md) for building and testing.

**License:** [MIT](LICENSE). Security reports: see [SECURITY.md](SECURITY.md). Instructions for AI agents: [AGENTS.md](AGENTS.md).

## Get your own Focus Notes (in the browser)

1. Choose **Use this template** (or **Fork**) at the top of this page to copy the repository into your account. Keep it public: GitHub Pages on free plans serves only public repositories. Your notes go in a separate repository, private by default.
2. In your copy, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy app → Run workflow** (it also runs on every push to `main`). When it finishes, open `https://<your-username>.github.io/<repository>/`.
4. Start writing. Notes stay in your browser until you choose **Connect GitHub…** in the toolbar's ⋯ menu, which walks you through making your notes repository and a token limited to it, both from pre-filled GitHub pages.

How it works, and why it needs a token rather than *Sign in with GitHub*: [Web app](documentations/architecture/web-app.md). To try the app locally: `pnpm install`, `pnpm tokens`, then `pnpm web`.

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
