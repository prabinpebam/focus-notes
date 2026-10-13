# The articulation chain

How every UX and UI decision in Focus Notes is grounded. It's a chain of reasoning from what we promise customers down to what an engineer can test, and each link records why it exists.

> [!NOTE]
> **TL;DR.** Six levels, each answering "why?" for the one below it: **Customer promise** (`CP-*`) → **Scenario / job to be done** (`SC-*`) → **User can…** (`UC-*`) → **View or component** (`IA-*`) → **Design decision** (`DD-*`) → **Requirement** (the existing `EDT-01`-style IDs, with acceptance checks). Things we deliberately don't do are **Unsupported boundaries** (`UNSUP-*`). Nothing exists without a parent: a button with no user-can, or a user-can with no scenario, is either missing its reason or shouldn't be built. The ID formats and table layouts follow Slate's spec-reference convention.

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-labelledby="chain-title chain-desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport">
<title id="chain-title">The six-level articulation chain with one worked example</title>
<desc id="chain-desc">Six stacked levels connected by downward arrows: customer promise, scenario, user can, view or component, design decision, and requirement. Beside each level is one link of a worked example about inserting a table row, from the promise that editing feels fluid down to the testable requirement TBL-07.</desc>
<g id="chain-links" data-slate-svg-step="1" data-slate-svg-effect="draw" fill="none" stroke="var(--color-neutral-fg-3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M190 104 V124"/><path d="M182 116 L190 124 L198 116"/>
<path d="M190 194 V214"/><path d="M182 206 L190 214 L198 206"/>
<path d="M190 284 V304"/><path d="M182 296 L190 304 L198 296"/>
<path d="M190 374 V394"/><path d="M182 386 L190 394 L198 386"/>
<path d="M190 464 V484"/><path d="M182 476 L190 484 L198 476"/>
</g>
<g id="chain-levels" data-slate-svg-step="0" data-slate-svg-effect="fade-rise" font-family="var(--font-family-base)" text-anchor="middle">
<rect id="chain-cp" x="60" y="34" width="260" height="70" rx="14" fill="var(--color-brand-bg)"/>
<text x="190" y="64" fill="var(--color-on-brand)" font-size="19" font-weight="700" data-slate-fit-target="chain-cp" data-slate-fit-padding="12">Customer promise</text>
<text x="190" y="89" fill="var(--color-on-brand)" font-size="15" data-slate-fit-target="chain-cp" data-slate-fit-padding="12">CP · why we exist</text>
<rect id="chain-sc" x="60" y="124" width="260" height="70" rx="14" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5"/>
<text x="190" y="154" fill="var(--color-neutral-fg-1)" font-size="19" font-weight="700" data-slate-fit-target="chain-sc" data-slate-fit-padding="12">Scenario / JTBD</text>
<text x="190" y="179" fill="var(--color-neutral-fg-2)" font-size="15" data-slate-fit-target="chain-sc" data-slate-fit-padding="12">SC · when and why</text>
<rect id="chain-uc" x="60" y="214" width="260" height="70" rx="14" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5"/>
<text x="190" y="244" fill="var(--color-neutral-fg-1)" font-size="19" font-weight="700" data-slate-fit-target="chain-uc" data-slate-fit-padding="12">User can…</text>
<text x="190" y="269" fill="var(--color-neutral-fg-2)" font-size="15" data-slate-fit-target="chain-uc" data-slate-fit-padding="12">UC · the capability</text>
<rect id="chain-ia" x="60" y="304" width="260" height="70" rx="14" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5"/>
<text x="190" y="334" fill="var(--color-neutral-fg-1)" font-size="19" font-weight="700" data-slate-fit-target="chain-ia" data-slate-fit-padding="12">View or component</text>
<text x="190" y="359" fill="var(--color-neutral-fg-2)" font-size="15" data-slate-fit-target="chain-ia" data-slate-fit-padding="12">IA · where it lives</text>
<rect id="chain-dd" x="60" y="394" width="260" height="70" rx="14" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5"/>
<text x="190" y="424" fill="var(--color-neutral-fg-1)" font-size="19" font-weight="700" data-slate-fit-target="chain-dd" data-slate-fit-padding="12">Design decision</text>
<text x="190" y="449" fill="var(--color-neutral-fg-2)" font-size="15" data-slate-fit-target="chain-dd" data-slate-fit-padding="12">DD · how, and why so</text>
<rect id="chain-req" x="60" y="484" width="260" height="70" rx="14" fill="var(--color-status-success-bg)" stroke="var(--color-status-success-stroke)" stroke-width="1.5"/>
<text x="190" y="514" fill="var(--color-status-success-fg)" font-size="19" font-weight="700" data-slate-fit-target="chain-req" data-slate-fit-padding="12">Requirement</text>
<text x="190" y="539" fill="var(--color-status-success-fg)" font-size="15" data-slate-fit-target="chain-req" data-slate-fit-padding="12">REQ · how we test it</text>
</g>
<g id="chain-example" data-slate-svg-step="2" data-slate-svg-effect="fade-rise" font-family="var(--font-family-base)" font-size="17">
<text x="360" y="64" fill="var(--color-neutral-fg-1)" font-weight="700">CP-FLOW-01</text>
<text x="360" y="89" fill="var(--color-neutral-fg-2)">Shaping text and tables feels fluid, like Loop.</text>
<text x="360" y="154" fill="var(--color-neutral-fg-1)" font-weight="700">SC-TABLE-02</text>
<text x="360" y="179" fill="var(--color-neutral-fg-2)">When a table needs a row mid-way, add it right there.</text>
<text x="360" y="244" fill="var(--color-neutral-fg-1)" font-weight="700">UC-TABLE-03</text>
<text x="360" y="269" fill="var(--color-neutral-fg-2)">User can insert a row or column at any boundary.</text>
<text x="360" y="334" fill="var(--color-neutral-fg-1)" font-weight="700">IA-CMP-TABLE</text>
<text x="360" y="359" fill="var(--color-neutral-fg-2)">Table: a + insertion point on the hovered boundary.</text>
<text x="360" y="424" fill="var(--color-neutral-fg-1)" font-weight="700">DD-TABLE-02</text>
<text x="360" y="449" fill="var(--color-neutral-fg-2)">Show + only at the hovered edge, after 150 ms.</text>
<text x="360" y="514" fill="var(--color-neutral-fg-1)" font-weight="700">TBL-07</text>
<text x="360" y="539" fill="var(--color-neutral-fg-2)">Lands at that boundary; one undo step.</text>
</g>
</svg>
<figcaption>Each level answers "why?" for the level below it. The example on the right follows one table interaction from promise to test.</figcaption>
</figure>

<details class="slate-figure-data">
<summary>Data</summary>
<table>
<thead><tr><th>Level</th><th>Prefix</th><th>Example</th></tr></thead>
<tbody>
<tr><td>Customer promise</td><td>CP</td><td>CP-FLOW-01: shaping text and tables feels fluid, like Loop</td></tr>
<tr><td>Scenario / job to be done</td><td>SC</td><td>SC-TABLE-02: when a table needs a row mid-way, add it right there</td></tr>
<tr><td>User can…</td><td>UC</td><td>UC-TABLE-03: insert a row or column at any boundary</td></tr>
<tr><td>View or component</td><td>IA</td><td>IA-CMP-TABLE: + insertion point on the hovered boundary</td></tr>
<tr><td>Design decision</td><td>DD</td><td>DD-TABLE-02: show + only at the hovered edge, after 150 ms</td></tr>
<tr><td>Requirement</td><td>Existing IDs (EDT, TBL, …)</td><td>TBL-07: lands at that boundary in one undo step</td></tr>
</tbody>
</table>
</details>

<h2 data-reader-personas="product design engineering">The six levels</h2>

| Level | Answers | Written as | Owned by | Lives on |
| --- | --- | --- | --- | --- |
| **Customer promise** (`CP-*`) | Why does this product deserve a place in someone's life? | One sentence from the customer's side, in the present tense: *"Nothing on screen competes with your words."* | Product | [Customer promises](customer-promises.md) |
| **Scenario / job to be done** (`SC-*`) | When does the promise matter, and to whom? | *"When ⟨situation⟩, I want to ⟨motivation⟩, so I can ⟨outcome⟩"*, plus who it's for and the behavior they should see | Product and UX | [Scenarios](scenarios.md) |
| **User can…** (`UC-*`) | What must people be able to do to get that job done? | *"User can ⟨verb⟩ ⟨object⟩ ⟨qualifier⟩"*, with a priority and an observable acceptance check | Product and UX | [User can](user-can.md) |
| **View or component** (`IA-*`) | Where in the product does the capability live? | A named view (a screen-level surface) or component (a reusable part) | Design | [Information architecture](../../design/information-architecture.html) |
| **Design decision** (`DD-*`) | Why does it look and behave exactly this way? | Decision, the user-can it serves, rationale, and the alternatives rejected | Design | Each view or component page |
| **Requirement** (`EDT-01`, `TBL-07`, …) | How do we know it's built right? | A testable statement with a priority | Engineering | [Requirements](../requirements.md) |
| **Unsupported boundary** (`UNSUP-*`) | What do we deliberately *not* do, and what happens instead? | The situation, what the product does instead, and the alternative offered | Product | [Scenarios → Boundaries](scenarios.md#unsupported-boundaries) |

<h2 data-reader-personas="product design engineering">Traceability rules</h2>

1. **Every scenario serves exactly one promise.** If a scenario seems to serve two, it's really two scenarios, or one promise is redundant.
2. **Every user-can traces to at least one scenario.** A capability no scenario needs is scope creep. Either write the missing scenario or cut the capability.
3. **Every view and component traces to at least one user-can.** Anything on screen that no user-can needs is chrome, and it breaks [CP-CALM-01](customer-promises.md).
4. **Every design decision names the user-can it serves and the alternatives it rejected.** "Because it looks nice" isn't a rationale. "Because it keeps the selection visible (`UC-FMT-01`), where a fixed top bar would move the eye away" is.
5. **Every requirement traces to at least one user-can.** The User can table lists the requirements for each capability, and the [Requirements](../requirements.md) page is the engineering view of the same scope. Two kinds of requirement are exceptions. **Enabling requirements** serve the project rather than a user capability: licensing (`LIC-*`), documentation (`DOC-*`), the product repository's build (`PKG-04`), and release mechanics (`DST-03` to `DST-07`). **Cross-cutting quality requirements** apply to every capability: security (`SEC-*`), privacy (`PRV-*`), performance (`PRF-*`), quality (`QLT-*`), accessibility (`A11Y-*`), language (`I18N-*`), and the design system (`DSY-*`). Each of their sections names the promises it serves.
6. **Boundaries are explicit.** When a reasonable person would expect something we don't do (merged table cells, underline), it's an `UNSUP-*` entry with the behavior and alternative, not a silent gap.
7. **Change starts at the highest level it touches.** A new feature starts with a scenario, never with a button. A changed promise ripples down and is reviewed level by level.
8. **IDs are permanent.** Retired items keep their IDs and are marked *Retired*. IDs are never reused.

<h2 data-reader-personas="product design">Writing each level well</h2>

| Level | Good | Not good enough | Why |
| --- | --- | --- | --- |
| Promise | "Nothing you write is lost, and nothing private is published by accident." | "Robust sync engine." | A promise is felt by the customer, not built by us. |
| Scenario | "When I delete something by mistake, I want to get it back easily, so cleanup isn't scary." | "User deletes a file." | Without the situation and the motivation, any design satisfies it. |
| User can | "User can restore notes deleted in the last 30 days from Recently deleted." | "Trash bin." | It must be a verb with a testable scope, not a feature name. |
| Design decision | "Recently deleted lives inside the Files panel, not Settings, because people look for lost files where files are (`UC-FILE-09`). Rejected: a Settings page (out of the way); an OS trash (doesn't hold Git history)." | "Add a Recently deleted section." | Without the reason and the alternatives, the next person can't judge a change. |

<h2 data-reader-personas="product design engineering">ID scheme</h2>

| Prefix | Format | Example |
| --- | --- | --- |
| `CP` | `CP-<THEME>-<NN>` | `CP-CALM-01` |
| `SC` | `SC-<AREA>-<NN>` | `SC-THEME-03` |
| `UC` | `UC-<AREA>-<NN>` | `UC-FILE-09` |
| `UNSUP` | `UNSUP-<AREA>-<NN>` | `UNSUP-TABLE-02` |
| `IA` | `IA-VIEW-<NAME>` or `IA-CMP-<NAME>` | `IA-VIEW-THEME`, `IA-CMP-FORMAT` |
| `DD` | `DD-<AREA>-<NN>` | `DD-FMT-03` |
| Requirements | The existing `<AREA>-<NN>` | `TBL-07` |

The `CP`, `SC`, `UC`, `UNSUP`, and `IA` formats, and the table column order on the promise, scenario, and user-can pages, match Slate's spec-reference convention. Slate can show a hover preview for an inline `UC-FILE-09`. Today that preview only works at one fixed location from another project, so here the IDs show as plain code until Slate makes that location configurable.

<h2 data-reader-personas="product design">Personas used in scenarios</h2>

These are **working personas**: assumptions drawn from the seed spec and the owner's decisions, not research findings. Check them before relying on them for trade-offs.

| Persona | Who | What matters most |
| --- | --- | --- |
| **Writer** (primary) | The owner and people like them: write every day (journal, essays, specs), comfortable with GitHub, want calm and ownership. | Fast start, no friction, nothing lost. |
| **Power user** | Lives in VS Code, Raycast, and terminals, and expects a command palette and familiar shortcuts. | Speed and keyboard reach. |
| **Tinkerer** | Enjoys making tools their own, and arrives with favorite color schemes and fonts. | Control and expression without breaking things. |
| **Comfort-sensitive writer** | Low vision, light sensitivity, dyslexia, or very long writing sessions. | Size, contrast, font, and spacing control that can be trusted. |
| **Reader** | Gets a public or private link and has no account. | Clean, readable page in their preferred light or dark mode. |

<h2 data-reader-personas="engineering">Checking the chain</h2>

A script (written in M0) reads the promise, scenario, user-can, information architecture, and requirements pages and fails CI if:

- an ID is referenced but not defined, or defined twice;
- a scenario has no promise, a user-can has no scenario, or a view, component, or requirement has no user-can;
- a design decision row doesn't name a `UC-*`.

Until the script exists, the same checks are done by hand when any of these pages change.
