# Risks

What could make Focus Notes fail, how likely and how bad each risk is, and what the plan does about it. Review this register at the end of every milestone.

> [!NOTE]
> **TL;DR.** The biggest risks are **scope** (a large product for a small team), the **custom window management on Windows**, **Markdown round-trip fidelity** with a rich editor, **supply-chain trust** (users' publish workflows run project code with their secrets), **share passcodes** that can be attacked offline, **onboarding friction** (Git, sign-in helpers, unsigned builds), and **dependence on GitHub**. Each has a mitigation and an early check in the roadmap.

| ID | Risk | Likelihood | Impact | Mitigation | Checked in |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Scope is large for a small team.** The first release now includes desktop, sharing, sync, and publishing. | High | High | The milestones each ship something usable. P1 items are strictly deferred. Cut candidates are listed in the roadmap's definition of done. | Every milestone |
| R-02 | **Custom window management on Windows feels non-native** (resize jitter, DPI bugs, snapping fidelity, accessibility of the custom controls). | Medium | High | The M0 spike across Windows 10, Windows 11, and Ubuntu with mixed-DPI monitors. Use proven building blocks (pointer capture, Electron's screen APIs). Accessibility tests for the controls and the system menu. | M0, M3 |
| R-03 | **Markdown round-trip fidelity** with a rich editor (whitespace, list markers, escapes, tables) | High | High | The byte-for-byte corpus from M0. Untouched blocks are written back from their source text. Constructs that can't be kept are preserved as raw blocks. | M0, M1 |
| R-04 | **Supply-chain compromise** of the publish workflow or releases, which run with users' secrets | Low | Severe | Pinned commit SHAs, checksums, attestations, signed builds, updates by pull request only, protected release environment, two-factor authentication on the maintainer account | M0, M5 |
| R-05 | **Share passcodes cracked offline** (static hosting can't rate-limit) | Medium (for weak passcodes) | High | Generated passcodes by default, a strength check for custom ones, PBKDF2 at 600,000 iterations, expiry by default. Users are told sealed sharing isn't for regulated or confidential material. | M5 |
| R-06 | **Onboarding friction:** no Git, no sign-in helper on macOS or Linux, unsigned-app warnings | High | Medium | Install help in the first run, three sign-in paths, signing budget planned before 1.0, a clear Get started page | M3, M5 |
| R-07 | **Git conflicts and repository states** confuse non-technical writers, or lose work | Medium | High | Note-level conflict choices, never leaving a rebase half-done, the recovery journal, Recently deleted, and integration tests for every repository state | M3 |
| R-08 | **Dependence on GitHub:** API or Pages changes, rate limits, account suspension, the 60-day schedule rule | Medium | High | Plain Markdown in Git means any Git host keeps the notes readable. Conditional API requests and backoff. Keepalive warnings. GitHub.com only is a documented boundary (UNSUP-PLAT-01). | Ongoing |
| R-09 | **Private-note leaks** through publishing, XSS, or agents | Low | Severe | Leak check on every deploy, sanitization and CSP, agents denied private access by default, security review before 1.0 | M5, M7 |
| R-10 | **Prompt injection through note content** leads an agent to misuse its tools | Medium | Medium | No destructive or sharing tools, content labeled as data, attribution, and Undo | M7 |
| R-11 | **Public notes repository reveals metadata** (the private repository's name, publish times) | Certain | Low | Documented in the privacy commitments. The private repository can have any name. | M5 |
| R-12 | **Electron size, memory, and battery** expectations | Medium | Medium | Performance budgets enforced in CI, no polling, lazy-loaded views | M1 onward |
| R-13 | **Licensing changes upstream** (for example Tiptap) | Low | Medium | Pinned versions (MIT releases stay MIT), the license check in CI, a plain ProseMirror fallback | Ongoing |
| R-14 | **Accessibility gaps** in custom widgets (the trigger, tables, window controls) | Medium | High | ARIA Authoring Practices patterns, automated and manual screen-reader passes every release | M2 onward |
| R-15 | **Workspace format drift** between app versions on different computers | Medium | Medium | `formatVersion`, migrations, and older apps refusing to write newer formats | M3 |
