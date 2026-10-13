# Focus Notes

A calm, Markdown-native writing app: a blank canvas, a single red trigger at the top center, and a focus mode that highlights only the row you are writing. Notes are plain Markdown in GitHub: private by default, published to the user's own GitHub Pages site, or shared with named people through a magic link or a passcode. Agents can help through MCP and a command-line tool, within permissions the writer grants. You write in a desktop app (Electron). Every user's Focus Notes is their own isolated instance in their own GitHub account (their repositories, their GitHub Pages site, their sign-in), with nothing hosted by this project.

**Status:** documentation only. No application code yet.

**License:** [MIT](LICENSE). Security reports: see [SECURITY.md](SECURITY.md). Instructions for AI agents: [AGENTS.md](AGENTS.md).

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
