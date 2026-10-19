# Design-system audit

> [!NOTE]
> **TL;DR.** Focus Notes has a **good design-system foundation, real adoption, and incomplete assurance**. Its three-tier tokens, closed JSON views, shared component packages, accessible behavior libraries, and generated catalogs are substantive strengths. The weak point is the claim of strictness: several prohibited styling patterns pass the boundary checker, state coverage is not enforced, list-item schemas are not checked, and approved pixel baselines are absent from this checkout. Improve those checks before investing in more components or another component-workbench tool.

<div class="slate-metrics">
  <div class="slate-metric">
    <p class="slate-metric__value">1,868</p>
    <p class="slate-metric__label">Token definitions pass tier validation</p>
  </div>
  <div class="slate-metric">
    <p class="slate-metric__value">67</p>
    <p class="slate-metric__label">Registered component contracts</p>
  </div>
  <div class="slate-metric">
    <p class="slate-metric__value">350</p>
    <p class="slate-metric__label">Gallery fixtures, not complete state coverage</p>
  </div>
  <div class="slate-metric">
    <p class="slate-metric__value">216</p>
    <p class="slate-metric__label">Focused unit tests passed during this audit</p>
  </div>
</div>

## Verdict and scope

<div class="slate-compare">
  <div class="slate-compare__col">
    <p class="slate-compare__head">Definition: strong</p>
    <ul>
      <li>Clear ownership, tiers, token semantics, and composition rules.</li>
      <li>Accessibility, modes, responsiveness, motion, and waits are designed in.</li>
      <li>Contracts and schemas make the system usable by both code and agents.</li>
    </ul>
  </div>
  <div class="slate-compare__col">
    <p class="slate-compare__head">Application: good, not airtight</p>
    <ul>
      <li>Desktop, web, reader, and product site reuse the system.</li>
      <li>Several documented guarantees are stronger than their actual checks.</li>
      <li>Passing today's checks does not prove complete token or visual compliance.</li>
    </ul>
  </div>
</div>

**Assessment date:** 19 October 2026. **Inspected revision:** `046a27aa`, initially clean working tree. This is the owner's requested audit report, not a new product requirement or an accepted implementation decision. Recommendations below remain proposals.

The audit inspected the design-system specification, token builder and sources, component contracts, representative controls and styles, registries, JSON schema generation, renderer, validation, gallery generation, accessibility and baseline journeys, and CI configuration. It ran focused checks and in-memory negative probes. It did not modify app behavior, install dependencies, publish anything, or inspect private notes.

**Important limit:** this is an architecture, implementation, and assurance audit, not a new visual acceptance pass or WCAG certification. Existing accessibility and journey test code is evidence of coverage design, not evidence that those journeys passed at this revision. No fresh desktop screenshots, assistive-technology sessions, or complete app journey runs were performed.

### Maturity scorecard

Ratings are qualitative engineering judgments, not measured compliance percentages or comparisons with other apps. **Strong** means the inspected implementation and checks substantively support the practice; **established** means it is implemented with material gaps; **partial** means a documented guarantee lacks adequate enforcement or proof.

| Dimension | Definition | Application and assurance | Judgment |
| --- | --- | --- | --- |
| Architecture and ownership | Strong | Strong | One UI implementation boundary, closed view documents, and dedicated runtime. |
| Token tiers and theming | Strong | Strong | Alias-tier checks, mode sources, generated references, and contrast tests are real. |
| Strict token-only styling | Strong | Partial | The checker misses multiple ordinary ways to introduce literal or cross-component styling. |
| Reusable component library | Strong | Established | Multiple real consumers; some primitives carry large feature-specific responsibilities. |
| Contracts and type safety | Strong | Partial | JSON closure is effective; list shapes and implementation-to-contract parity are incomplete. |
| Accessibility and adaptive behavior | Strong | Established | React Aria, names, focus declarations, contrast checks, and journey coverage; no new rendered certification here. |
| State and visual regression protection | Strong | Partial | Fixtures and capture tooling exist; declared-state coverage and approved pixel comparison are not dependable gates. |
| Documentation and change governance | Strong | Established | Traceability, migrations, and generated catalogs are useful; narrative catalog and guarantees have drifted. |

## What is genuinely good

### Tokens have meaningful architecture, not just named constants

[The token builder](../../../packages/tokens/build.mjs) rejects duplicate base definitions, unknown alias targets, reference aliases, semantic aliases to non-reference tiers, raw component values, and component aliases to non-semantic tiers. That makes the reference → semantic → component dependency direction enforceable in token data.

The builder generates CSS custom properties, TypeScript references, schema token enums, resolved theme colors, breakpoints, and selected timing and geometry values. Runtime code therefore need not invent its own copies of those values. The ten built-in themes have [contrast-guard tests](../../../packages/core/test/themes.test.ts); all passed in this audit.

Mode sources include contrast, forced colors, reduced motion, reduced transparency, coarse pointer, platform, software compositing, reading fonts, paragraph spacing, and window framing. This is materially better than a light/dark palette alone. It does not prove that every combination renders correctly.

### The app really consumes a reusable system

The [UI package](../../../packages/ui/package.json) owns presentation and behavior adapters. [The renderer](../../../packages/ui-runtime/src/render.ts) maps data to registered components rather than embedding app-specific DOM. [Schema generation](../../../packages/ui-runtime/src/schema.ts) closes component props and events: arbitrary `className`, `style`, undeclared components, and literal interface copy in view documents are rejected.

The app registry, [reader registry](../../../packages/ui/src/reader.ts), and [site registry](../../../packages/ui/src/site.ts) reuse common implementations while exposing different subsets. Site-specific components and tokens are separated from the app's main output. This is good consumer-boundary and bundle-ownership design; no new bundle-size measurement was made.

| Current inventory | Count | Interpretation |
| --- | ---: | --- |
| Primitives | 44 | Implemented contracts, not the older narrative inventory. |
| Layouts | 15 | Structural composition is reusable. |
| Host components | 4 | Imperative editor and window integration has an explicit place. |
| Compounds | 3 | Toolbar, Trigger, and Dialog compose lower layers. |
| Block components | 1 | NoteContent currently groups multiple note-rendering responsibilities. |
| Product app views | 4 | Does not mean four user-facing screens; a view can contain many states. |
| Reader/share pages | 3 | Separate from product-site pages. |
| Product-site pages | 2 | Included in UI validation. |
| JSON fragments | 0 | The fragment mechanism is not currently evidence of actual reuse. |
| Gallery fixtures | 350 | Combined with nine product documents and the gallery index: 360 validated documents. |

Counts came from [registered contracts](../../../packages/ui/src/contracts.ts), the view-package exports, and [gallery generation](../../../packages/ui-runtime/src/gallery.ts). They measure inventory, not quality or exhaustive coverage.

### Library choices fit the problem

| Choice | Why it fits | Boundary to preserve |
| --- | --- | --- |
| React Aria Components | Reuses interaction and accessible-widget behavior without imposing a visual theme. | Wrappers still need keyboard, focus, labeling, and rendered tests. |
| vanilla-extract | Static, typed style definitions fit central UI ownership. | TypeScript-valid CSS is not automatically token-only CSS. |
| Style Dictionary | A shared pipeline produces consumable token artifacts. | Tier validation is not full token-format interoperability certification. |
| Ajv and JSON Schema | Closed, machine-readable view contracts work for code and agent authors. | Container validation must not be mistaken for list-item type validation. |
| Shared runtime gallery | Fixtures exercise the same view-to-component path as the app. | Discovery and rendering are not visual regression gates by themselves. |
| Fluent icons and bundled fonts | Central icon naming and packaged typography support consistency. | Keep additions inside existing registries and licensing checks. |

These choices are present in the [UI manifest](../../../packages/ui/package.json), [token manifest](../../../packages/tokens/package.json), and runtime. The license check passed across 615 packages, with notices current for 196 packages. That is evidence of repository license enforcement, not a dependency vulnerability review.

**Do not replace this stack merely to adopt a fashionable workbench.** Storybook or another library would not, by itself, close the enforcement, state-coverage, or baseline gaps below.

## Findings

Priority is about design-system reliability, not security severity. **P1** should precede claims of strict enforcement; **P2** should be addressed as the affected shared library evolves.

### DS-A01 · P1 · Token-only styling is not fully enforced

**Status (19 October, D-197):** the checker now parses files with TypeScript and rejects every probe below: raw numbers and durations in `.css.ts`, any handwritten plain `.css`, every style-write API outside UI, and another component's tokens through any binding name. Zero, percentages, token references, and runtime geometry inside UI stay valid. [The checker's tests](../../../tools/test/check-boundaries.test.mjs) hold each probe and control.

**Evidence:** [the boundary checker](../../../tools/check-boundaries.mjs) uses lexical regular expressions. Its raw-value checks run only for `.css.ts`, inspect a limited set of units and numeric properties, and identify token ownership through the exact identifier `tokens`. Plain `.css` files are permitted in styled directories but their values are not inspected. Outside UI, the style-write rule recognizes direct property assignment, not `setProperty`.

In-memory probes ran the actual checker body with only its file enumeration and source read replaced. No probe was written into app source.

| Probe | Expected under the documented rule | Observed |
| --- | --- | --- |
| `.css.ts`: `padding: 13, borderWidth: 3` | Reject raw visual values | Accepted |
| `.css.ts`: `transitionDuration: "1s"` | Reject raw duration | Accepted |
| Allowed-directory `.css`: `color: #ff0000; padding: 13px` | Reject raw styling | Accepted |
| App code: `element.style.setProperty("color", "red")` | Reject styles outside UI | Accepted |
| Import `tokens as designTokens`, then read another component's token | Reject cross-component ownership | Accepted |
| Control: `.css.ts` hex literal | Reject | Rejected |

**Impact:** a green boundary check is not proof that a contribution follows token ownership or literal-value rules. These are demonstrated checker holes, not a claim that all those prohibited examples already exist in production.

**Recommendation:** add negative tests for these cases first. Use syntax-aware checks for style definitions, import bindings, token ownership, and style writes; prohibit handwritten plain CSS unless it has an explicitly validated use. Keep an explicit distinction between authored visual constants and legitimate runtime values such as measured geometry, slider percentages, and validated user theme colors.

**Acceptance:** every invalid probe fails, while existing measured-position and custom-theme behavior remains valid. Do not indiscriminately ban every runtime `px` value.

### DS-A02 · P1 · Fixture coverage does not cover declared states

**Evidence:** [checkFixtureCoverage](../../../packages/ui-runtime/src/check.ts) checks enum values and fixture presence, skips host components, and never reads `contract.states`. [Fixture data](../../../packages/ui/src/contract.ts) has no explicit state-coverage declaration or interaction recipe. Adding an uncovered state to the Button contract produced **zero reported gaps**.

**Impact:** hover, focus-visible, pressed, entering, exiting, busy, and other named states can be declared without a test that reaches them. The 350 fixtures must not be reported as exhaustive state coverage.

**Recommendation:** give fixtures explicit state coverage and, where needed, interaction steps. Validate state names and require each declared state to be covered or explicitly excepted. Hosts need meaningful integration coverage rather than a blanket exemption.

**Acceptance:** adding a new uncovered state fails validation; removing the only coverage for focus-visible, busy, or a host interaction also fails.

### DS-A03 · P1 · Pixel regression protection is not an ordinary gate

**Evidence:** [the baseline journey](../../../apps/desktop/e2e/baselines.spec.ts) skips unless `FOCUS_NOTES_CAPTURE_BASELINES=1`. It compares pixels only when [isApproved](../../../apps/desktop/e2e/baselines.ts) finds an approved image. No tracked files exist under the expected approved-baseline directory in this checkout. [Normal CI](../../../.github/workflows/ci.yml) runs journeys but does not enable this opt-in baseline suite.

Existing visual-quality and accessibility journeys are valuable and are not being dismissed. Geometry assertions, captures, and human review are different kinds of assurance from an approved pixel comparison.

**Impact:** the documented promise of failure on unapproved visual changes is not established by this baseline path. Missing approved images yield captures, not failing comparisons.

**Recommendation:** select a small stable set of shared controls and important surfaces, obtain owner-reviewed Windows baselines, and run comparison in a deliberate CI gate. Fail on missing required baselines; keep candidate capture separate from comparison. Expand modes and viewport coverage incrementally rather than blocking on every possible combination.

**Acceptance:** a controlled visual change causes a comparison failure; a missing required baseline is explicit; candidate generation never approves images automatically.

### DS-A04 · P2 · Structured bindings validate arrays, not their item contracts

**Evidence:** `PropSpec` declares list categories such as `commandItems` and `menuSections`, but [schema generation](../../../packages/ui-runtime/src/schema.ts) only requires a read expression, and [binding validation](../../../packages/ui-runtime/src/check.ts) checks that it resolves to an array. It does not compare the item's schema with `spec.of`.

A probe view bound a declared `string[]` view-model field to both Toolbar lists. It passed `checkUi`. Changing the field's container type to `string` was rejected as a positive control.

**Impact:** a schema-valid view can pass incompatible data into a reusable component. The list category currently documents intent more strongly than the checker guarantees.

**Recommendation:** define shared item schemas and validate binding compatibility, including required fields and nested menu structures. Reuse existing data models rather than building a second incompatible model vocabulary.

**Acceptance:** the `string[]` probe fails; valid command-item and menu-section bindings pass; useful diagnostics identify the incompatible field.

### DS-A05 · P2 · Contracts do not prove implementation-prop parity

**Evidence:** [ButtonProps](../../../packages/ui/src/primitives/Button/Button.tsx) is handwritten separately from [the Button contract](../../../packages/ui/src/primitives/Button/contract.ts). [Registry entries](../../../packages/ui/src/registry.ts) and runtime dependencies use `ComponentType<any>`. [Generated artifacts](../../../packages/ui-runtime/src/generated.ts) are JSON contracts, catalog, and view schema, not implementation prop types generated from the contract.

**Impact:** JSON views are closed, but an incompatible React prop rename or type change need not be caught at the registry-to-contract boundary. This is a missing guarantee, not a demonstrated current Button prop failure.

**Recommendation:** use a typed registration helper or compile-time conformance tests relating contract types to component inputs and event adapters. Keep runtime-resolved strings distinct from authored message-reference objects.

**Acceptance:** an intentional incompatible prop change fails typecheck without needing a rendered failure.

### DS-A06 · P2 · The documented busy-state protocol is not shared by the sampled controls

**Evidence:** [the component catalog](components.md#contracts) specifies one shared busy hook with `ack`, `on`, and `done` phases, `data-busy`, and token timing. [Button](../../../packages/ui/src/primitives/Button/Button.tsx) suppresses activation and exposes `aria-busy`, but renders the same content. [IconButton](../../../packages/ui/src/primitives/IconButton/IconButton.tsx) immediately swaps its glyph for Spinner and can change its label. Neither sampled component implements the documented shared phase protocol.

**Impact:** the same boolean has different visible behavior across important controls, and the catalog overstates a common implementation. The task tracker may own other wait feedback; this finding is specifically about the sampled component-level promise, not a claim that all operations lack progress feedback.

**Recommendation:** establish the actual intended shared busy policy, reconcile the contract and catalog, and reuse task-tracker timing if staged feedback is needed. Do not add independent component timers.

**Acceptance:** short, waiting, completed, failed, and repeated operations have explicit expected behavior, tested for both controls and reduced motion.

### DS-A07 · P2 · The narrative catalog and enforcement claims have drifted

**Evidence:** [the catalog summary](components.md) describes 40 primitives, six hosts, 13 layouts, nine blocks, and 38 compounds; the current registered counts are 44, four, 15, one, and three. Some rows explain planned or consolidated implementations, but the opening calls the list complete. [The overview](overview.html) promises generated component TypeScript types, complete state fixtures, and pixel checks on every fixture across modes, beyond the guarantees verified above.

**Impact:** authors and agents can choose a nonexistent standalone component or assume protection that the repository does not currently provide.

**Recommendation:** distinguish implemented, composed, and planned entries. Project machine-owned inventories from contracts, preserve human guidance for usage and anti-patterns, and label proposed guarantees honestly. For complex primitives such as FileTree and VersionCompare, review cohesion when they change; do not split them solely to increase the compound count.

**Acceptance:** documented implemented names and counts agree with generated contracts, and every enforcement claim links to an executable check with matching scope.

## Prioritized improvement path

<ol class="slate-steps">
  <li class="slate-step">
    <p class="slate-step__title">1. Make the strictness claims true</p>
    <p>Add the boundary-check negative probes, fix their enforcement gaps, and add declared-state coverage checks. These protect every future component contribution.</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">2. Establish a small real visual gate</p>
    <p>Approve stable Windows baselines for core controls and key surfaces; separate candidate capture from required comparisons. Preserve existing journey and accessibility coverage.</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">3. Close the contract-to-code gap</p>
    <p>Validate list item schemas and compile-time prop compatibility. Reconcile the sampled controls' busy behavior with the documented task protocol.</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">4. Keep guidance aligned with shipped code</p>
    <p>Generate inventory facts, label planned catalog entries, and retain concise human guidance about component choice, composition, content, and accessibility.</p>
  </li>
</ol>

These are suggested work slices, not newly assigned requirement IDs or committed roadmap packages. Any implementation should follow the existing articulation and decision process. No broad framework migration, mandatory Storybook adoption, or large component rewrite is justified by this audit.

## Validation evidence and reproducibility

| Check run during this audit | Result | What it establishes |
| --- | --- | --- |
| `pnpm check` | Passed | Boundaries over 861 files; chain and plan checks; licenses and notices; generated entries; UI schemas and fixture enums. |
| `node packages\tokens\build.mjs --check` | Passed: 1,868 tokens | Current token-tier rules, not full CSS or DTCG-format conformance. |
| `pnpm exec vitest run packages\ui-runtime\test packages\ui\test packages\views\test` | Passed: 25 files, 173 tests | Focused component-helper, runtime, schema, and view coverage. |
| `pnpm --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/views --filter @focus-notes/tokens run typecheck` | Passed: all four packages | Existing package type checks and token-rule validation. |
| `pnpm exec vitest run packages\core\test\themes.test.ts packages\core\test\theme-manager.test.ts packages\core\test\custom-themes.test.ts` | Passed: three files, 43 tests | Theme inventory, contrast guard, reading settings, and custom-theme tests. |
| In-memory enforcement probes | Nine expected outcomes confirmed | Five boundary false negatives, one rejected boundary control, uncovered-state acceptance, wrong list-shape acceptance, and rejected list-container control. |
| `git ls-files -- apps/desktop/e2e/baselines` | No tracked files | No committed approved baselines at the path the inspected baseline code expects. |
| `node .\slate\scripts\runtime-host.mjs check --repo . --host documentations` | Passed | Documentation runtime matches its pinned package. |
| Report structure, local links, and anchors | Passed | Unique manifest route, one H1, existing relative targets and anchors, no inline styles or scripts. |
| Headless Chromium documentation render | Passed in light and dark at 1280 × 900 | One H1, four metric tiles, no page-level horizontal overflow; screenshots inspected; overview-to-report navigation works. This checks the report, not the app. |
| `git diff --check` | Passed | No whitespace errors in the tracked documentation edits. |
| `node .\slate\scripts\validate-document-attributions.mjs --repo . --host documentations` | Could not run: missing `parse5` dependency | No new excerpt-reference pills were authored. Ordinary links and local anchors were checked separately; this does not replace the full attribution validator. |

The test-editor tool initially reported no discoverable tests for the selected files; the repository's Vitest CLI then ran the focused suites successfully. This is a tooling-discovery limitation, not an app-test failure.

The probe runner was kept in this audit session's files, outside the repository. To reproduce its key experiments without changing production files:

1. For boundaries, execute the actual checker in a VM, replacing only its discovered-file list and source-read function with each sample in DS-A01. The hex control must fail.
2. Call `checkFixtureCoverage` with the real Button contract plus an invented state and unchanged fixtures. The current result is an empty problem list.
3. Give a probe view a declared view-model field with schema `{ type: "array", items: { type: "string" } }`, and bind it to Toolbar's `items` and `more`. Supply required labels, a valid AppRoot, and a valid focus target. The current result is no problems. A non-array field must fail.

**Intentionally not run:** full desktop/web builds, full journey suites, benchmarks, fresh app screenshots, and manual NVDA/VoiceOver sessions. The requested deliverable changes documentation only; focused checks supplied evidence for the audit without opening or taking over the owner's app. No broad claim of current pixel quality, measured performance, WCAG conformance, or vulnerability freedom follows from this report.

## Reference standards and interpretation

The benchmark is an explicit, reusable, accessible system with machine-checkable contracts and proportionate regression protection, not maximum component count or maximum process.

- [DTCG Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/): reference for exchange-format types and aliases. It is a community specification, not a W3C Standard. The repository uses DTCG-style `$type`/`$value`/alias sources, but this audit does not certify complete conformance to that version.
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/): reference for widget behavior, names, roles, states, and keyboard interaction. Using React Aria is a good starting point, not a substitute for testing the assembled app.
- [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): explains the 24 CSS-pixel minimum and exceptions. Existing journey checks show awareness of this requirement, not new proof of compliance here.
- Repository authorities: [Design system](overview.html), [Tokens](tokens.md), [Component catalog](components.md), [Views as data](views-as-data.md), and [Definition of done](../../plan/definition-of-done.md).

External references were retrieved on 19 October 2026. Implementation observations refer to the inspected revision above; they should be rechecked after the corresponding code changes.
