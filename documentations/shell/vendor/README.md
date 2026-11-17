# Vendored dependencies

Runtime libraries are vendored here so the viewer works fully offline, with no CDN or network
request. Both the single-file and split builds reference these files locally.

| File | Component | Version | License | License text |
| --- | --- | --- | --- | --- |
| `marked.min.js` | [marked](https://github.com/markedjs/marked) | 14.1.4 | MIT | [LICENSES/marked.LICENSE.md](LICENSES/marked.LICENSE.md) |
| `highlight.min.js` | [highlight.js](https://github.com/highlightjs/highlight.js) | 11.9.0 | BSD-3-Clause | [LICENSES/highlight.js.LICENSE.txt](LICENSES/highlight.js.LICENSE.txt) |
| `github.min.css` | highlight.js GitHub theme (light) | 11.9.0 | BSD-3-Clause | [LICENSES/highlight.js.LICENSE.txt](LICENSES/highlight.js.LICENSE.txt) |
| `github-dark.min.css` | highlight.js GitHub theme (dark) | 11.9.0 | BSD-3-Clause | [LICENSES/highlight.js.LICENSE.txt](LICENSES/highlight.js.LICENSE.txt) |
| `purify.min.js` | [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.11 | Apache-2.0, elected from Apache-2.0 OR MPL-2.0 | [LICENSES/DOMPurify.LICENSE.txt](LICENSES/DOMPurify.LICENSE.txt) |
| `material-symbols-outlined.ttf` | [Material Symbols Outlined](https://github.com/google/material-design-icons) | 2.958 | Apache-2.0 | [LICENSES/material-symbols.LICENSE.txt](LICENSES/material-symbols.LICENSE.txt) |
| `react-grab-primitives.min.js` | [react-grab](https://github.com/aidenybai/react-grab) primitives, with inlined [bippy](https://github.com/aidenybai/bippy) and [@jridgewell/sourcemap-codec](https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec) | react-grab 0.2.0, bippy 0.6.1, sourcemap-codec 1.5.x | MIT | [LICENSES/react-grab.LICENSE.txt](LICENSES/react-grab.LICENSE.txt), [LICENSES/bippy.LICENSE.txt](LICENSES/bippy.LICENSE.txt), [LICENSES/sourcemap-codec.LICENSE.txt](LICENSES/sourcemap-codec.LICENSE.txt) |

`react-grab-primitives.min.js` is generated, not downloaded: `npm run build:picker` bundles the
exact `react-grab` development dependency pinned in `package.json` (installed from the approved
package source) with esbuild. It exports only the framework-agnostic hit-testing, selector,
freeze, and optional React-context primitives used by the revision element picker, and the
reader loads it only when a reader starts selecting elements. `npm run test:third-party-notices`
rebuilds it in memory and fails if the committed file differs.

The bundled Canvas runtime has its own generated notices in
[`../canvas/THIRD_PARTY_NOTICES.txt`](../canvas/THIRD_PARTY_NOTICES.txt).

## Keeping notices correct

- Keep `LICENSES/` with these files whenever the shell is copied or published.
  `runtime-host sync` copies and drift-checks the whole directory.
- When adding, removing, or upgrading a vendored file, update this table, the matching license
  text, and `VENDORED_COMPONENTS` in `scripts/third-party-notices.mjs`, then run
  `npm run test:third-party-notices`. The test fails when a shipped file is unrecorded, its
  version no longer matches, or its license text is missing.
