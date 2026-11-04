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

## Scorecard

<div class="slate-metrics">
  <div class="slate-metric"><span class="slate-metric__value">19</span><span class="slate-metric__label">areas scored</span></div>
  <div class="slate-metric"><span class="slate-metric__value">4</span><span class="slate-metric__label">strong</span></div>
  <div class="slate-metric"><span class="slate-metric__value">12</span><span class="slate-metric__label">partial</span></div>
  <div class="slate-metric"><span class="slate-metric__value">3</span><span class="slate-metric__label">missing the core rule</span></div>
</div>

The waits the app was designed around are handled well: the note save, conflicts, the AI rewrite and Spotlight. What's weak is everything **after** a person changes a value: settings and project choices apply with no confirmation, and when they fail nothing says so. Errors that do surface mostly go to a toast that disappears on its own.

| Area | Code | Rating | What's there | The main gap |
| --- | --- | --- | --- | --- |
| Tokens and timing | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Light, dark, contrast light and dark, more contrast, forced colours and reduced motion as modes; `wait.signDelay` 300 ms, `wait.signMinimum` 500 ms, `wait.doneDuration` 1.5 s, `motion.shimmer` | No confirm minimum (200 ms), commit pause (500 ms), long-notice time (8 s), commit colour, or empty-wrapper minimum sizes |
| Component state sets | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Button and IconButton busy with `aria-busy`, `aria-disabled` and a delayed spinner (D-199); ItemCard and FileTree busy borders | Switch, SegmentedControl, ThemeGallery, TextField, Slider, ColorField and PickerButton have no pending, confirmed or failed state; `useBusy` has no failed phase |
| The note save | Main | <span class="slate-badge slate-badge--success">Strong</span> | SaveState with saved locally, pending, syncing, synced, offline and error; the text is kept; Retry on failure; a problem mark on the trigger | The failure toast still disappears after 10 s |
| App settings (appearance, fonts, scale, focus, outline, Files options) | Main | <span class="slate-badge slate-badge--danger">Missing</span> | The value changes on screen at once | No confirmation; a failed save is silent and the screen keeps a value that wasn't kept |
| Project settings (name, colour, logo, watermark, font, theme) | Branch | <span class="slate-badge slate-badge--danger">Missing</span> | Saves on change; a bad logo says why under the field | No confirmation; a failed save silently snaps the value back |
| Sharing: share item, first share, Invite, Publish, site preview | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Invite runs through the task tracker; the share list and history have empty text | Withdraw asks first instead of offering Undo; the site preview's four lists have no empty state; Publish and Apply have no steps or progress |
| Open | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Placeholders on the first load, the old list kept while it reloads, "Opening project…", a danger StatusRow | No Retry ("Close Open and try again"); one generic failure for open, pin and choose; empty text with no action |
| New project and Local notes | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Pending and error states; import says what it copied | No Retry, no steps for repository creation, no Cancel |
| Files | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Inline rename errors on the field; move and delete ask; recently deleted can restore | Failures are toasts; move and rename have no confirmed beat and no Undo; "Your notes will appear here." has no action |
| Spotlight | Main | <span class="slate-badge slate-badge--success">Strong</span> | Results at once; "Nothing matches “…”" names the query | Could offer "New note named …" from the empty result |
| AI rewrite | Main | <span class="slate-badge slate-badge--success">Strong</span> | Streams, Stop, Cancel restores the original | The no-provider and failed-provider paths don't say the original is kept |
| Images | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Edit has saving and error states | A read failure is a toast with no Retry; the frame shows no broken-image state |
| Sync and Git | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Every sync problem has words and an action (sign in, resolve, retry) | Clone, first push and pull show no steps or progress; errors leave with the toast |
| Conflicts | Main | <span class="slate-badge slate-badge--success">Strong</span> | The note is held, nothing is overwritten, the resolver opens with both versions | None at this level |
| First run and startup | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Setup steps with error and fail actions, pending part states | The first-run white frame (in the wait inventory); a view that crashes shows its fallback with no Reload or Report |
| Notifications | Main | <span class="slate-badge slate-badge--danger">Missing</span> | One toast host, an action, Close, a pause on hover and focus, F6 to reach it | At most 2 shown, older ones dropped; errors auto-dismiss; info and error tones only; no queue, coalescing or landmark |
| Empty states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | 44 lists declare an empty branch | Every one is a muted sentence in no wrapper, with no action and no minimum size |
| Loading (shimmer) | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | A Skeleton primitive (line, tile, avatar) with finite passes; used in the canvas and Open | Settings sections, the share item and history load with words ("Loading…", "Preparing…") instead of shimmer |
| Accessibility of states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | `aria-busy`, `aria-disabled` instead of `disabled`, a polite live region, `role="alert"` for error toasts | No Notifications landmark; 9 bare `:hover` rules outside `(hover: hover)`; confirmations aren't announced because none exist |
