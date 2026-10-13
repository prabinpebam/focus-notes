# Focus Notes

A calm, Markdown-native writing app: a blank canvas, a single red trigger at the top center, and a focus mode that highlights only the row you are writing. Notes are plain Markdown in GitHub, public or private. You write in a desktop app (Electron); public notes are published on GitHub Pages.

**Status:** documentation only. No application code yet.

**License:** [MIT](LICENSE).

## Documentation

The project docs are a [Slate](https://github.com/prabinpebam/slate) site in [`documentations/`](documentations/). The human-written source of truth is [`documentations/seed-specs.md`](documentations/seed-specs.md).

To read the docs locally, clone with submodules, serve the repository over loopback HTTP, and open the docs host:

```powershell
git clone --recurse-submodules <repo-url>
python -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080/documentations/
```

After updating the `slate/` submodule, re-sync and check the generated runtime:

```powershell
node .\slate\scripts\runtime-host.mjs sync --repo . --host documentations
node .\slate\scripts\runtime-host.mjs check --repo . --host documentations
```
