// Generates THIRD_PARTY_NOTICES.md (LIC-02): every production dependency that ships with the app,
// with its license text. `--check` fails when the file is out of date.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "THIRD_PARTY_NOTICES.md");
const byLicense = JSON.parse(execSync("pnpm licenses list --prod --json", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

const entries = [];
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    p.versions.forEach((version, i) => {
      const dir = p.paths?.[i] ?? p.paths?.[0];
      let text = "";
      if (dir && existsSync(dir)) {
        const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i.test(f) || /^licen[cs]e[-.]/i.test(f));
        if (file) text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim();
      }
      entries.push({ name: p.name, version, license, homepage: p.homepage ?? "", text });
    });
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));

// Code copied into the app rather than installed: each with where it is and its license (LIC-02).
const VENDORED = [
  ...Object.values(JSON.parse(readFileSync(join(root, "packages/ui/src/ai-brand-paths.json"), "utf8"))).map((icon) => ({
    name: `Simple Icons: ${icon.title}`, version: "90646e4bf7f3b89df6c37e65baf3e7bc759a517c",
    license: icon.license, homepage: icon.source,
    what: `Unmodified monochrome path in packages/ui/src/ai-brand-paths.json (D-263). Original source: ${icon.upstream}. Brand guidelines/source terms: ${icon.guidelines}. Used only to identify a connection, never to imply sponsorship or readiness. CC0 does not license trademark rights.`,
    text: icon.license === "MIT"
      ? `MIT License\n\nCopyright (c) GitHub Inc.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`
      : `Simple Icons contributors dedicate their artwork under CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/.\nPinned licence: https://github.com/simple-icons/simple-icons/blob/90646e4bf7f3b89df6c37e65baf3e7bc759a517c/LICENSE.md\nDisclaimer (individual brand rights remain): https://github.com/simple-icons/simple-icons/blob/90646e4bf7f3b89df6c37e65baf3e7bc759a517c/DISCLAIMER.md`,
  })),
  {
    name: "EFF large wordlist", version: "2016-07-18", license: "CC-BY-3.0-US", homepage: "https://www.eff.org/dice",
    what: "The 7,776 words of `eff_large_wordlist.txt`, unmodified apart from dropping the dice numbers, in `packages/seal/src/words.ts`, for generated passcodes (SHR-07, D-52).",
    text: `"EFF's Long Wordlist" by the Electronic Frontier Foundation (https://www.eff.org/dice),
used under the Creative Commons Attribution 3.0 United States license
(https://creativecommons.org/licenses/by/3.0/us/).`,
  },
  {
    name: "@primer/octicons", version: "19.40.0", license: "MIT", homepage: "https://primer.style/octicons",
    what: "Only the `mark-github` icon's SVG path, unmodified, in `packages/ui/src/github-mark.tsx` (D-126). GitHub's logo guidelines apply to its use.",
    text: `MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
];

// Programs the Microsoft Store package carries and the app starts, never links (PKG-13, D-228).
const gitBundle = JSON.parse(readFileSync(join(root, "apps", "desktop", "build", "git-bundle.json"), "utf8"));

const body = [
  "# Third-party notices",
  "",
  "Focus Notes is MIT licensed. It includes the following open-source packages, each under its own license.",
  "Generated by `node tools/notices.mjs`; don't edit by hand.",
  "",
  `${entries.length} packages.`,
  "",
  ...entries.flatMap((e) => [
    `## ${e.name} ${e.version}`,
    "",
    `License: ${e.license}${e.homepage ? `  \nHomepage: ${e.homepage}` : ""}`,
    "",
    ...(e.text ? ["```text", e.text.replace(/```/g, "'''"), "```", ""] : ["(The package has no license file; its manifest declares the license above.)", ""]),
  ]),
  "# Copied into the app",
  "",
  ...VENDORED.flatMap((e) => [`## ${e.name} ${e.version}`, "", `License: ${e.license}  \nHomepage: ${e.homepage}`, "", e.what, "", "```text", e.text, "```", ""]),
  "## AI integration neutral fallbacks (D-263)",
  "",
  "Existing Fluent UI System Icons from @fluentui/react-icons 2.0.344 (MIT; full licence above). These are not brand logos.",
  "",
  "| Icon | Source | Kinds and terms |",
  "| --- | --- | --- |",
  "| code | https://github.com/microsoft/fluentui-system-icons/blob/main/assets/Code/SVG/ic_fluent_code_20_regular.svg | llama.cpp, SGLang, LocalAI, Jan, Codex: no verified permissive brand artwork obtained. Docker Model Runner: https://www.docker.com/legal/trademark-guidelines/ requires authorization for logos. |",
  "| cloud | https://github.com/microsoft/fluentui-system-icons/blob/main/assets/Cloud/SVG/ic_fluent_cloud_20_regular.svg | OpenAI/Azure, Cohere, Groq, Together, Fireworks, xAI, Cerebras: no approved artwork obtained (OpenAI terms: https://openai.com/brand/). NVIDIA: https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage/ and Cloudflare: https://www.cloudflare.com/trademark/ require written authorization. |",
  "| link | https://github.com/microsoft/fluentui-system-icons/blob/main/assets/Link/SVG/ic_fluent_link_20_regular.svg | Other compatible or unknown integrations have no single brand. |",
  "",
  "# Programs in the Microsoft Store package",
  "",
  `The Microsoft Store package also carries Git, from GitHub Desktop's dugite-native ${gitBundle.tag} (\`${gitBundle.asset}\`, SHA-256 \`${gitBundle.sha256}\`), unmodified, at \`resources\\git\`. These are separate programs that Focus Notes starts; none is linked into it. The installer and the portable download don't include them.`,
  "",
  "Each license's full text ships in the package beside the program it covers. The complete source of each program is at the link given. On request, by an issue at https://github.com/prabinpebam/focus-notes/issues, for three years after each Store release, the owner will also provide a copy of the complete corresponding source of the GPL programs that release carries.",
  "",
  ...gitBundle.components.flatMap((c) => [`## ${c.name} ${c.version}`, "", `License: ${c.license}  \nHomepage: ${c.homepage}  \nSource: ${c.source}`, "", c.what, ""]),
  "## Microsoft DirectX runtime libraries shipped with Electron",
  "",
  "Electron 42.4.1 for Windows carries d3dcompiler_47.dll (10.0.26100.7705), dxcompiler.dll (1.9.2602.0) and dxil.dll (1.8.2502.11). These are runtime binaries, not the MIT-licensed DirectX headers.",
  "",
  "Redistribution: Windows SDK Distributable Code terms and its REDIST list, https://learn.microsoft.com/en-us/legal/windows-sdk/redist (the x64 D3D entries). The Windows SDK license requires significant primary functionality, protective end-user terms, the distributor's copyright notice and indemnification of Microsoft; Windows-only distribution, trademark and Excluded License restrictions also apply. Focus Notes copyright: Copyright (c) 2026 Prabin Pebam.",
  "",
  "DirectX Shader Compiler source: https://github.com/microsoft/DirectXShaderCompiler/tree/v1.9.2602 (LICENSE.TXT includes the LLVM NCSA license). The v1.8.2502 binary release carries LICENSE-LLVM.txt (NCSA), LICENSE-MIT.txt and LICENSE-MS.txt (Microsoft distributable-code terms): https://github.com/microsoft/DirectXShaderCompiler/releases/tag/v1.8.2502 . The Windows SDK terms/list above cover redistribution of the named binaries; source/header licenses are not a substitute. These terms are not replaced by Electron's MIT license.",
  "",
  "## Electron, Chromium and FFmpeg source and reciprocal licenses (D-269)",
  "",
  "The unmodified Electron 42.4.1 runtime carries a dynamically loaded, separately replaceable ffmpeg.dll under LGPL-2.1-or-later, plus Chromium code under MPL-2.0 and other licenses. This narrow repository-policy exception is proposed, not owner-approved; the owner must confirm it before Store submission. It does not authorize GPL-enabled FFmpeg, additional codec libraries or changes to these runtime components.",
  "",
  "Full license texts and copyright notices, including LGPL-2.1 and MPL-2.0, accompany the app in LICENSES.chromium.html; Electron's MIT text is in LICENSE.electron.txt. Keep both files and this notice with the runtime. Focus Notes does not prohibit reverse engineering for debugging modifications to LGPL components; the separately replaceable DLL must remain replaceable. MPL-covered source files remain under MPL-2.0. No modifications to those components are made by Focus Notes.",
  "",
  "Corresponding source for this runtime (not a moving branch):",
  "",
  "- Electron 42.4.1: https://github.com/electron/electron/tree/v42.4.1 ; dependency pins and build configuration: https://github.com/electron/electron/blob/v42.4.1/DEPS",
  "- Chromium 148.0.7778.265: https://chromium.googlesource.com/chromium/src/+/148.0.7778.265/ ; dependency pins: https://chromium.googlesource.com/chromium/src/+/148.0.7778.265/DEPS",
  "- FFmpeg f45bab87ce4c5fafc67fd53fcde777578d01bfa0 (pinned by that Chromium DEPS): https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/f45bab87ce4c5fafc67fd53fcde777578d01bfa0/ ; source license: COPYING.LGPLv2.1 and README.chromium in that tree. Electron's patches and build scripts are in its exact tag above.",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== body) {
    console.error("THIRD_PARTY_NOTICES.md is out of date. Run: node tools/notices.mjs");
    process.exit(1);
  }
  console.log(`Notices: ${entries.length} packages, up to date.`);
} else {
  writeFileSync(out, body);
  console.log(`Notices: wrote ${entries.length} packages.`);
}
