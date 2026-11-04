# UI states audit

> [!NOTE]
> **TL;DR.** An audit of the design system and every surface of the app against the `ui-states` skill (every change confirmed where it happened, every failure recoverable, every empty space explained), with `design-system`, `perceived-performance` and `ui-copy` alongside. **In progress:** the scope and method are below; the scorecard, the ranked findings, the missing primitives and the order of work are being written section by section.

## Scope, sources and method

**Assessment date:** 4 November 2026. This is the owner's requested audit (4 November, 12:19), not an accepted decision: every fix below is a proposal until the owner picks it.

<div class="slate-compare">
  <div class="slate-compare__col">
    <p class="slate-compare__head">Code audited</p>
    <ul>
      <li><strong>Main</strong> at <code>25b87f07</code>: what the owner's Preview runs.</li>
      <li><strong>Branch</strong> <code>vq-open-cards</code> at <code>f636e524</code>: the newest work. It contains <code>vq-review</code> <code>53f8d879</code> (Files, the location pill, images, sharing, Invite, Publish, projects, New project, Local notes) plus the Open cards.</li>
      <li>Each finding says which code it comes from: <span class="slate-badge">Main</span> <span class="slate-badge slate-badge--info">Branch</span> or both.</li>
    </ul>
  </div>
  <div class="slate-compare__col">
    <p class="slate-compare__head">Rules applied</p>
    <ul>
      <li><code>ui-states</code>: scopes, the commit, load and outcome tracks, component states, the notification pill, errors, empty states, focus and announcements.</li>
      <li><code>design-system</code> and the <code>design-system-auditor</code> checklist: tokens only, the six layers, states in every context.</li>
      <li><code>perceived-performance</code> and the project's <a href="../architecture/perceived-performance.md">wait inventory</a>; <code>ui-copy</code> and the Words section of <a href="foundations.md">foundations</a>.</li>
    </ul>
  </div>
</div>

### Areas

| Layer | What was read |
| --- | --- |
| Design system | `packages/tokens` (semantic, component, modes, themes), `packages/ui` (primitives, layouts, compounds, host), `packages/ui-runtime`, against [the design system](system/overview.html) and the [visual vs verbose score](visual-score.html) |
| App, by scope | The writing window, Files, Open, Settings (every section), Share, the first-share step, Invite, Publish and the site preview, New project, Local notes, the AI rewrite, Spotlight, conflicts, sync and Git, images, first run and the Store build |
| Per operation | What it shows while it waits, when it's done and when it fails; how a person recovers; what fills the space when there's nothing to show |

### Method and limits

- **Read, not run.** Evidence is the code, the view documents, the message catalogue and the gallery mocks. No tests, journeys or app instances were run (the owner's rule for unapproved designs, and this is an audit).
- **Scope levels** follow `ui-states`: field, component, section, view, app, and background.
- **Impact** ranks findings by what the owner feels while writing: losing or doubting a note first, then not knowing whether a change took, then a dead end after a failure, then empty or jumpy layouts, then polish.
- **Effort** is S (under an hour, one component or view), M (a few hours, a primitive plus its uses) or L (a day or more, a shared mechanism across surfaces).
- This page replaces nothing: the earlier [design-system audit](system/audit.md) of 19 October covers architecture and enforcement; this one covers states.
