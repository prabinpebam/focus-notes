# Standards and conventions

The established standards, specifications, and conventions Focus Notes follows, so the implementation builds on proven ground instead of inventing its own.

> [!NOTE]
> **TL;DR.** **CommonMark and GFM** for notes, **JSON Schema 2020-12** for every config file, **W3C Design Tokens** format for themes, **WCAG 2.2 AA** and the **ARIA Authoring Practices** for accessibility, **OWASP ASVS** and **Electron's security checklist** for security, **Web Crypto** algorithms with OWASP-recommended parameters for sharing, **SemVer**, **Conventional Commits**, and **Keep a Changelog** for releases, **SLSA provenance**, **SBOMs**, and **OpenSSF Scorecard** for the supply chain, and **MCP**, **AGENTS.md**, and **llms.txt** for agents (D-50). Anything the spec defines that one of these already covers should defer to the standard.

| Area | Standard | How Focus Notes uses it |
| --- | --- | --- |
| Note format | CommonMark 0.31 and GitHub Flavored Markdown | The on-disk format for every note ([Content model](content-model.md)) |
| Front matter | YAML 1.2 (minimal subset) | Only `id` is written by the app |
| Components | Generic directives proposal (`remark-directive`) | Future image and gallery blocks (D-11) |
| IDs and dates | ULID for note IDs. ISO 8601 with time zone for every timestamp. | Front matter, grants, logs |
| Configuration files | JSON Schema 2020-12 | Settings, themes, keybindings, `access.json`, invite template (AGT-08) |
| Theme tokens | W3C Design Tokens Community Group format (`$value`, `$type`) | Theme files (D-53) |
| Unicode | NFC for file names and text comparison. NFKC with case folding for audience names. | Files, search, share lookup |
| Accessibility | WCAG 2.2 AA, WAI-ARIA 1.2, ARIA Authoring Practices Guide | Every view and component |
| Platform conventions | Apple Human Interface Guidelines, Windows app design guidelines, GNOME HIG (Linux) | Keyboard, window behavior, menus |
| Application security | OWASP ASVS 4.0 Level 2, Electron security checklist, OWASP Cheat Sheets | [Security and privacy](security-and-privacy.md) |
| Agent security | OWASP Top 10 for LLM Applications (prompt injection) | [Agents](agents.md#risks-specific-to-agents) |
| Cryptography | Web Crypto API: AES-256-GCM (NIST SP 800-38D), HKDF (RFC 5869), PBKDF2 (RFC 8018) at OWASP's 600,000 iterations for SHA-256 | [Sealing and share links](repository-and-publishing.html#sealing-and-share-links) |
| CI security | GitHub's security hardening for Actions (actions pinned to SHAs, least-privilege `permissions:`) | Product CI and users' publish workflows |
| Supply chain | SLSA build provenance (GitHub artifact attestations), CycloneDX SBOM, OpenSSF Scorecard | Releases |
| Versioning | Semantic Versioning 2.0 | App, reusable workflow, and reader bundle versions |
| Commits and changelog | Conventional Commits, Changesets, Keep a Changelog | Product repository |
| Licensing | SPDX license identifiers, REUSE-style notices | The license check and `THIRD_PARTY_NOTICES` |
| Agents | Model Context Protocol, `AGENTS.md`, `llms.txt` | [Agents and automation](agents.md) |
| Web feeds | RSS 2.0, sitemaps.org, Open Graph | Public notes site (P1) |
| Security reports | `SECURITY.md` with GitHub private vulnerability reporting | Product repository |

## Conventions this project defines

These have no external standard, so the spec owns them:

- [The articulation chain](../product/spec/chain.md) and its ID scheme
- Command IDs (`note.new`, `focus.toggle`) and keybinding contexts ([Keyboard shortcuts](../experience/keyboard-shortcuts.md))
- The workspace layout and `.focus-notes/` folder ([Content model](content-model.md))
- The sealing format and keyring envelope, adapted from `personal-site`
