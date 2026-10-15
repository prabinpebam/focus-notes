# Perceived performance: no frozen waits, no glitches

How Focus Notes stays calm while work takes time. It covers what a person must see within 100 ms, 1 s and 10 s, which feedback pattern each kind of wait gets, how windows and views change without a blank or white frame, and the inventory of every wait in the app with its pattern and measure. It's the design half of performance. The measuring half, with the budgets and the benchmark, is [Performance and quality](performance-and-quality.md), and the signs themselves are [Feedback and dialogs → Waits](../design/components/feedback-and-dialogs.md#waits). Adapted from the owner's perceived-performance framework for his personal site (D-149).

> [!NOTE]
> **TL;DR.**
> - **Speed is felt, not measured.** A 3 s sign-in that names each step feels faster than a 1 s one that freezes. Every action gets the feedback its wait deserves, and no more.
> - **There are four classes of wait** (Nielsen's response-time limits and the Doherty threshold):
>   - **instant** (under 100 ms): no indicator;
>   - **responsive** (100 ms to 1 s): an inline state, never a flashing spinner;
>   - **waiting** (1 to 10 s): names the work at its place, and the window stays usable;
>   - **long** (over 10 s, or several steps): steps, progress and elapsed time, in the background, cancellable where the work can stop.
> - **Never a frozen screen.** Every operation in the [wait inventory](#the-wait-inventory) goes through the one task tracker with its class's pattern (PRF-08, PRF-13). A step that can only say "busy" is a defect.
> - **Never a blank, white or unstyled frame (DSK-09, D-148):**
>   - The window shows only once its first themed frame is painted.
>   - Switching workspaces, finishing setup, removing a workspace, signing out and changing the theme happen **in place**, never by reloading the page.
>   - Views swap complete: the old one stays until the new one is ready.
>   - Resizing, maximizing, snapping and full screen never show unpainted area.
> - **Snappy: the window and every control follow the hand (PRF-14, D-151).**
>   - A dragged or resized window stays attached to the pointer, within a frame, and is where it was released in the frame of release.
>   - Every control answers on pointer-down, in the next frame.
>   - The main process never stalls more than a frame.
> - **Never block input, never lose it, never lie.** Typing is echoed at once. "Saved on this computer" means it's on disk; "Backed up" means it's pushed.
> - **Every pattern has a measure**, so each promise is checked, not hoped. A frame-integrity journey records frames through every transition and fails on a blank one. A "no silent wait" journey slows every inventory operation and checks its sign.

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" role="img" aria-labelledby="fnpp-bands__title fnpp-bands__desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnpp-bands__title">Four classes of wait, and the feedback each gets</title>
<desc id="fnpp-bands__desc">A timeline from 0 to more than 10 seconds split into four bands. Instant, under 100 milliseconds: the result itself, no indicator, for typing and opening a menu. Responsive, 100 milliseconds to 1 second: an inline state shown only after 300 milliseconds, for saving or opening a note. Waiting, 1 to 10 seconds: an indicator that names the work while the window stays usable, for finding your notes or getting a sign-in code. Long, over 10 seconds or several steps: steps with progress and elapsed time, in the background, with a way to cancel, for creating your notes, downloading them, or saving to GitHub.</desc>
<g id="fnpp-bands__instant" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-1" x="30" y="40" width="210" height="200" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="50" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">Instant</text>
<text x="50" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">under 100 ms</text>
<text x="50" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">The result itself</text>
<text x="50" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">No indicator</text>
<text x="50" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">Type, open a menu</text>
</g>
<g id="fnpp-bands__responsive" data-slate-svg-step="2" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-2" x="270" y="40" width="210" height="200" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="290" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Responsive</text>
<text x="290" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">100 ms to 1 s</text>
<text x="290" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Inline state change</text>
<text x="290" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Shown after 300 ms</text>
<text x="290" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Save, open a note</text>
</g>
<g id="fnpp-bands__waiting" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-3" x="510" y="40" width="210" height="200" rx="16" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="530" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Waiting</text>
<text x="530" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">1 to 10 s</text>
<text x="530" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Names the work</text>
<text x="530" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Window stays usable</text>
<text x="530" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="12" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Find notes, get a code</text>
</g>
<g id="fnpp-bands__long" data-slate-svg-step="4" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-4" x="750" y="40" width="220" height="200" rx="16" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="770" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Long</text>
<text x="770" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">over 10 s, or steps</text>
<text x="770" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Steps and progress</text>
<text x="770" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Background, cancel</text>
<text x="770" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="12" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Create, download, push</text>
</g>
<g id="fnpp-bands__axis" data-slate-svg-step="5" data-slate-svg-effect="draw">
<path d="M30 270 L970 270" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<polygon points="979,270 970,275 970,265" fill="var(--color-neutral-fg-2)" />
</g>
<text x="30" y="292" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">0</text>
<text x="255" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">100 ms</text>
<text x="495" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">1 s</text>
<text x="735" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">10 s</text>
</svg>
<figcaption>The four classes of wait. The boundaries are Nielsen's response-time limits (0.1 s, 1 s, 10 s). The 300 ms delay before an indicator (<code>wait.signDelay</code>) keeps a fast result from flashing one.</figcaption>
</figure>

<details class="slate-figure-data">
<summary>The classes, as a table</summary>

| Class | Wait | What the person sees | Examples in Focus Notes |
|---|---|---|---|
| Instant | under 100 ms | The result itself, with no indicator | Typing, moving the caret and the focus band, opening a menu or Spotlight, toggling focus mode, changing the theme or text size |
| Responsive | 100 ms to 1 s | An inline state change, shown only past 300 ms | Opening a note, writing to disk, a structural change in Files, copying a link |
| Waiting | 1 to 10 s | An indicator at the place that names the work, with the old view kept and the window usable | Getting a sign-in code, finding your notes on GitHub, unlocking, sealing a share, listing repositories |
| Long | over 10 s, or several steps | Named steps with the current one shown, determinate progress where it's known, and elapsed time, in the background, cancellable or leavable | Creating your notes, downloading (cloning) them, waiting for approval on GitHub, saving to GitHub, publishing, an update download |

</details>

## Why perceived performance

A person doesn't experience milliseconds. They experience whether the app **answered**, whether it's **still working**, and whether what it says is **true**. The research behind that is old and stable:

- **Response-time limits** (Nielsen, 1993, after Miller, 1968):
  - under **0.1 s**, an action feels direct;
  - under **1 s**, the flow of thought holds, though the delay is noticed;
  - past **10 s**, attention leaves, and the person needs to know how long it will take.
- **The Doherty threshold** (Doherty and Thadani, IBM, 1982): productivity climbs sharply when the system answers within about **400 ms**.
- **Progress indicators** (Nielsen Norman Group): use a looping indicator for waits of about 2 to 10 s, and a determinate one (percent done, or steps) past 10 s. People tolerate long waits much better when they can see progress.

In Focus Notes, the problem the owner measured by hand isn't only that some work is slow. **Slow work is silent or disruptive**:

- Setup steps sit on one unnamed "busy" state while Git and GitHub work for many seconds.
- Finding your notes runs a GitHub request per repository with nothing to show for it.
- Finishing setup reloads the page, which flashes the whole window white.

Faster code fixes some of that. Honest feedback fixes the rest, and buys time for the code.

## Principles, in order when they conflict

1. **Never block input, never lose it.** Typing is echoed by the editor itself, never after a round trip. A refresh never replaces the note, a field or a selection the person is using. If it would, it waits, and says why.
2. **Acknowledge within 100 ms.** Every action changes something visible at once: the pressed control (the busy state's `ack` phase), the selection, or the new row in Files. If the real result takes longer, that acknowledgement stands in for it.
3. **Never show a blank, white or unstyled frame (DSK-09).** Keep the old view until the new one is ready ([below](#glitch-free-windows-and-views)).
4. **Say what is happening, where it happens.** The affected control or region shows the sign: a busy button, a pending row, a region updating, or the account pill for saving to GitHub. Its words name the work ("Looking for your notes on GitHub…", not "Loading…"). Nothing processes without a visible sign, and there's no status bar (DD-FB-02).
5. **Be true.** "Saved on this computer" means the write finished, and "Backed up" means the push finished (D-132). An optimistic view, such as a moved note shown before its commit, is allowed only when a failure puts it back and says so (PRF-09).
6. **Match the indicator to the wait.** Instant work gets no indicator. Responsive work gets none that flashes (`wait.signDelay`). A wait gets named work. A long wait gets steps, progress and time.
7. **Do the work before it's asked for.** What the next screen will need starts as soon as it's known. For example, *Your notes* starts listing repositories the moment the account is connected, during *Connect*'s confirmation. Hovering or focusing an action that opens a list fetches it.
8. **Preserve context.** Scroll position, focus, the open note, the caret, the selection and the expanded folders survive every refresh, and every workspace switch where they still apply.
9. **Fail loudly, recover quietly.** A failure says what happened and the one thing to do, and keeps the person's input. A retry that succeeds just clears the message.

## Snappy: the window and every control follow the hand

A drag that trails the pointer, or a window that floats to where it was released, feels like a rubber band, however fast everything else is. **Direct manipulation has the strictest budget of all: it must look attached to the hand** (PRF-14, D-151). The owner found that a fast drag left the window behind and that it settled after the release.

**Why it lags today.** Moving the window is app-built (D-14):
1. The page gets the pointer move and waits for its next animation frame.
2. It sends the position to the main process.
3. The main process moves the window.

Each move is therefore at least two frames behind the pointer. When moving the transparent window takes longer than a frame, positions queue up in the main process, and the window keeps moving after the pointer stops. The snap preview is also shown again on every move, not only when its zone changes.

| Rule | How it holds | Measure |
|---|---|---|
| **The window is attached to the pointer** | Moving and resizing follow the system's cursor, not a relay of page events. One message starts the drag; after that, the main process reads the cursor itself (`screen.getCursorScreenPoint()`) once per display frame, at the display's refresh rate, and only while the drag lasts (PRF-04 forbids timers at rest). Where the platform's own move loop is faster, the system moves the window instead: on Windows, the native move started from the band, with the app's snapping driven by `will-move` and applied on `moved`; snapping and restoring a maximized window under the pointer keep working. WP-5.9 measures both approaches and keeps the faster one (D-151). | `fn:window.dragLag`: the distance between the cursor and the point of the window under it, in a scripted fast drag (CI, screen level, D-141): p95 at most one frame of travel at 3,000 px/s, i.e. 50 px at 60 Hz, and 0 px within one frame of the pointer stopping |
| **Never a queue** | Only the latest position is ever applied. A move that arrives while the last one is still being applied replaces it, and nothing is applied after the release. | `fn:window.settle`: from the release to the window's final position, at most one frame |
| **Moving never repaints the page** | A move changes only the window's position, never its size, so the page doesn't lay out or paint. The snap preview window is shown only when its zone changes and hidden once, and the window isn't raised again on every move. | The paint count during a 2 s drag: 0 page paints; preview `show` calls equal to zone changes |
| **Resizing keeps up** | Resizing uses the same loop. The page lays out at the new size within the same frame, with no work on the resize path but layout: the editor doesn't re-measure the note on every frame, and the focus band and the top-edge blur follow by CSS, not script. | `fn:window.resizeFrame` p95 ≤ 16 ms; `fn:window.dragLag` for edges |
| **The main process never stalls** | The main process moves windows and answers every bridge call, so blocking it makes everything feel slow. It never does synchronous file, Git or crypto work. Heavy work runs in Git's own processes, worker threads or a utility process. | `fn:main.loopLag`: the main process's event-loop delay during setup, backups, a 10,000-note scan and a drag. p99 ≤ 16 ms, max ≤ 50 ms |
| **Every control answers in the next frame** | A press shows on pointer-down, not after the click: the pressed state, the menu open, the toggle flipped. Hover and focus states change within a frame. An animation never delays the result it shows: the result is in place first, and the motion (`motion.micro` to `motion.enter`) runs while the person can already act, and can be interrupted. | Input to next paint (INP, measured in the journeys for every toolbar, menu, Spotlight and Settings action): p95 ≤ 50 ms, never over 100 ms; no long task (over 50 ms) during an interaction |
| **The first input after a pause is as fast as the rest** | Code for the toolbar, menus and Spotlight is loaded and warmed during start-up's warm-up (PRF-10), so their first use isn't slower than their tenth. | INP of each control's first use vs its fifth: within 20% |

**How it's checked.**
- **On CI, at screen level (D-141):** the drag-lag and settle measures drive a real pointer, captured by the system: a straight fast drag, a zig-zag, a drag onto each snap zone, and an edge resize.
- **In the inactive-window journeys:** the main-process loop lag, the paint counts and INP, safe to run on the owner's computer.
- **In the benchmark:** each is a measure in `pnpm bench`, with its budget in `tools/bench/budgets.json`, and the slow-computer run (CPU slowed 4×) reports it too.

<h2 id="glitch-free-windows-and-views">Glitch-free windows and views</h2>

A brief white flash across the whole window is the most visible imperfection a desktop app can have. On Windows and Linux the window is transparent and app-built (D-14), so any frame the page hasn't painted is either see-through or Chromium's default white. These rules make every frame a finished one (DSK-09, D-148):

| Rule | How it holds | Checked by |
| --- | --- | --- |
| **The first frame is a finished frame** | The window is created hidden. The page's first paint is already the theme's canvas, with the theme resolved before the first paint: the main process passes the resolved theme with the page's address, so the boot styles from `packages/ui` paint the right canvas colour with no script. The window shows only after the renderer reports the first frame with the app's layout drawn (`fn:window.firstFrame`), not on DOM ready. On macOS, the native window's `backgroundColor` is the theme's canvas. | The frame-integrity journey at launch, cold and warm, in light and dark |
| **No page reloads for state changes** | Finishing setup, opening another workspace, removing the workspace, signing out, running setup again, and changing the theme or language never call `webContents.reload()`. The main process sends the new state over the bridge. The renderer rebuilds its stores and views off screen and swaps them in one frame. A reload is allowed only to recover from a renderer crash, and then the window keeps its last frame (a captured image of it) until the new page has painted. | A repository check that fails on any other `reload(` in `apps/desktop/src/main`; the journey through each transition |
| **Views swap complete** | A view, a setup step, or the setup-to-app change mounts its next content first and replaces the old content when that's ready (double-buffering). Nothing is unmounted to a blank area while its replacement loads. A view that needs more than 300 ms keeps the old one with the region-updating sign. One that opens empty shows its skeleton at once ([Waits](../design/components/feedback-and-dialogs.md#waits)). Setup steps don't remount the whole tree. | The frame-integrity journey: setup's steps, opening Settings, Files, Spotlight, Share |
| **Theme changes all at once** | Light, Dark, System, a custom theme and the OS switching it change every colour together, with the native `backgroundColor` and the window shadow's colours. The whole window may cross-fade from the finished old frame to the finished new one over `motion.theme` (180 ms, [Foundations](../design/foundations.md)). No single element transitions its own colour, so no frame mixes the two themes or shows a half-painted part. | The journey toggles the theme 10 times and checks every frame |
| **The window never shows unpainted area** | On resize, maximize (the app's emulated maximize included), snap, restore, full screen, a DPI change, or a move to another monitor, the bounds change in one call, never in visible steps. The canvas always covers the window inside the shadow margin, and layout follows the new size within a frame (ResizeObserver work in `requestAnimationFrame`). Where Chromium can't repaint as fast as the operating system resizes, the edge shows the canvas colour, never white or see-through. | Screen-level frame-integrity journeys on CI (D-141): resize from each edge, maximize, vertical maximize, snap, full screen |
| **No flash of other fonts or shifting layout** | The bundled fonts load before the first frame (local files, `font-display: block` for the app's own faces). Pictures keep their box (the profile picture, its initials first). Late content never moves the caret or the note. | The frame-integrity journey's layout-shift check (no shift after the first frame in setup and the app) |
| **Reduced motion** | Swaps are instant. With motion allowed, a swap may cross-fade over `motion.micro`, but always between two finished frames. | The journey with reduced motion on |

**The frame-integrity journey** records the window's frames through the transitions above (through the DevTools screencast, an inactive window, no screen capture, so it's safe on the owner's computer). It fails when any frame:

- has an area of at least 2% of the window that is white, see-through, or a colour outside the current theme's palette for that area;
- has the app's main region blank while a transition is in flight;
- shows a layout shift after the first frame.

Its report lists the frame, the transition and the region. It runs on every pull request that touches `apps/desktop`, `packages/ui` or `packages/ui-runtime`. The screen-level variants (window bounds and monitors) run on CI only (D-141).

## Patterns

Each pattern says when to use it, how it shows, and the measure that holds it. The signs are the shared ones from [Feedback and dialogs → Waits](../design/components/feedback-and-dialogs.md#waits), driven by the one task tracker, never a component's own spinner.

| Pattern | Use when | How it shows | Holds it |
|---|---|---|---|
| **Direct echo** | Typing, selecting, toggling, opening a menu | The control's own state, with no indicator | PRF-01 (keystroke to paint); DSY-11 (a view's first frame within 100 ms) |
| **Save state** | Writing to disk, and backing up to GitHub | The save icon on the account pill (D-132): *Saved on this computer* at once, *Backing up…* while a backup runs, then *Backed up at ⟨time⟩*; when the person asked (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), the label opens beside the icon for about 2 s; problems stay until fixed | PRF-03; `fn:sync.push` |
| **Optimistic change** | A move, rename, delete, create or duplicate in Files | The tree changes at once with a pending sign on the row; the commit confirms it; a refusal puts it back and says why | PRF-09 (within 100 ms) |
| **Stale while updating** | A region redrawn after a change elsewhere (an external edit, a pull, a theme preview) | The old content stays, with the thin updating line past 300 ms; the new content swaps in complete | PRF-11 (within 500 ms) |
| **Double-buffered swap** | A view, a setup step, a workspace, setup to app | The next content is built off screen and swapped in one frame; scroll, focus and caret carried over | DSK-09: no blank frame in the frame-integrity journey; `fn:workspace.switch` |
| **Skeleton** | Opening a view or a list whose content takes over 300 ms | The view's real layout at once, with skeleton rows where content will be (for example, *We found your notes* shows three skeleton rows) | `fn:view.open.*` |
| **Named wait** | 1 to 10 s of known work | At the place: words that name the work ("Getting a code from GitHub…", "Looking for your notes on GitHub… 12 of 30"), with the count when there is one, and the elapsed time after 3 s | The waiting-class measures |
| **Steps** | Long work, or work with several parts | The current step always visible as words ("Downloading your notes · 3 of 9"), a step list that ticks parts off (in setup, the list is shown, not hidden behind *Show details*), determinate progress where the work reports it (`git clone --progress` percent), elapsed time, [Cancel] where the work can stop, and the window usable around it | `fn:setup.*`, `fn:clone` |
| **Background task** | Work the person needn't watch (backup, fetch, publish deploy, update download) | Silent while it's going well; the account pill or trigger dot shows a problem; a result note only when the person asked for it | `fn:sync.*`; PRF-04 (idle CPU) |
| **Prefetch on intent** | The next screen's data is predictable | Start it when the intent is known (the account connected, a hover or focus on *Open another repository…*), so the click shows it at once | The prefetched step's `fn:view.open.*` from a hover |
| **First-start notice** | Start-up work past 1 s before the note is ready (a large workspace, a slow disk) | The canvas and the title bar at once, then the note's skeleton, then the note. Never a blank or white window. | PRF-02 |

## Rules for building

- **Declare the class.** A new operation that can take longer than 100 ms is added to [the wait inventory](#the-wait-inventory) in the same pull request, with its class, pattern, place, words and measure.
- **Measure it.** Mark it `fn:<area>.<action>` ([Marks and spans](performance-and-quality.md#marks-and-spans)) and give the benchmark or the journey a target.
- **Go through the tracker.** `tracker.run(target, message, fn, doneMessage)` for single waits, and the tracker's steps for long ones (a step name, `n of total`, and progress when known). One boolean `busy` for a whole screen isn't enough: it can't name the work.
- **Stream progress from the main process.** A long bridge call reports its steps and progress as events (`onReport`, `onProgress`), never just a final answer. Git runs with `--progress` where it has it, and GitHub calls report their counts.
- **Never reload the page** to change state, and never unmount a view before its replacement is ready (DSK-09).
- **Keep the window usable.** During a long wait the title bar band still drags and shows its controls. The person can leave or cancel where the work allows, and quitting resumes it where it left off (setup does, D-98).
- **Words:** name the work in plain words ("Downloading your notes", not "Cloning repository" on the main path, D-124); say the count when there is one; never apologise in a loop.
- **Accessibility:** a wait is announced after 1 s and at its end, never each tick (`wait.announceDelay`). Progress has a `ProgressBar` with its value. Reduced motion stills the moving signs.

<h2 id="the-wait-inventory">The wait inventory</h2>

Every operation that can take longer than 100 ms, with its class, pattern and words. **Status** is what's built today (15 October 2026). Rows marked *gap* are WP-5.8's to close (PRF-13). The "no silent wait" journey slows each operation through the test bridge and checks its sign and words.

| Operation | Class | Pattern and place | Words on the main path | Measure | Status |
| --- | --- | --- | --- | --- | --- |
| Start-up | Waiting at worst | First-start notice: themed canvas, then the note | none under 1 s; the note's skeleton past 1 s | PRF-02, `fn:window.firstFrame` | Partial: the window shows on ready-to-show; no first-frame report |
| Checking Git (Connect) | Responsive | Silent; shows only when missing or too old | none | `fn:setup.git` | Built |
| Getting a sign-in code | Waiting | Named wait on *Connect to GitHub* (busy button) | "Getting a code from GitHub…" | `fn:setup.code` | Gap: one `busy` |
| Waiting for approval | Long, user-driven | The code card with GitHub's ringed mark, elapsed time, [Cancel] | "Waiting for you to approve on GitHub…" | none (the person's time) | Built, without elapsed time or Cancel |
| Reading the account | Responsive | The profile card's skeleton | "Connecting to your account…" | `fn:setup.account` | Gap: one `busy` |
| Finding your notes | Waiting | Prefetched at Connect; skeleton rows; count | "Looking for your notes on GitHub… 12 of 30" | `fn:setup.findNotes` | Gap: one `busy`, started on arrival, a request per repository |
| Creating your notes | Long | Steps, always shown, current one named, elapsed time | "Copying the template · 2 of 9" | `fn:setup.create` and each part | Partial: parts under *Show details* only |
| Downloading your notes (clone) | Long | Steps with determinate progress from `git clone --progress` | "Downloading your notes · 45%" | `fn:clone` | Gap: one `busy` |
| Opening a folder | Responsive | Named wait if past 1 s | "Checking this folder…" | `fn:setup.folder` | Gap: one `busy` |
| Finishing setup, opening another workspace | Responsive to waiting | Double-buffered swap, in place | "Opening your notes…" past 1 s | `fn:workspace.switch` (≤ 500 ms typical) | Gap: reloads the page (the white flash) |
| Removing the workspace, signing out | Responsive | In place, then *Your notes* or *Connect* | "Removing…", "Signing out…" | `fn:workspace.remove`, `fn:auth.signOut` | Gap: removing reloads the page |
| Opening a note | Instant to responsive | Direct, the region-updating line past 300 ms | none | PRF-03, PRF-10 | Built |
| Writing to disk | Responsive, background | Save state: *Saved on this computer* | none | PRF-03 | Built (D-132) |
| Backing up to GitHub (*Save to cloud*, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, and automatic backups) | Waiting to long when asked, background otherwise | Save state on the account pill; past 3 s, the open label adds the elapsed time | "Backing up…", then "Backed up" | `fn:sync.commit`, `fn:sync.push` | Built (D-132, D-133); elapsed time to add |
| Fetch and pull | Background | Silent; open notes reload in place | none, unless a problem | `fn:sync.pull` | Built |
| Structural changes in Files | Responsive | Optimistic change with pending rows | none | PRF-09 | Built |
| Opening from GitHub (the picker) | Waiting, then long | Skeleton list prefetched on hover, then steps to download | "Looking for your repositories…", then as cloning | `fn:view.open.repoPicker`, `fn:clone` | Gap |
| Spotlight before the index is ready | Waiting | Results from titles at once; a quiet count while the rest is indexed | "Still reading 1,200 of 5,000 notes" | SPT-07, PRF-10 | Partial: no count |
| Find in all notes | Responsive | Results stream in, first within 300 ms | none | FND-04 | Built |
| Unlocking, exporting, importing, resolving a conflict | Waiting | Named wait through the tracker | "Unlocking…", "Exporting…", "Importing…" | the tracker's marks | Built (D-77) |
| Sealing and sharing | Waiting | Busy button through the tracker | "Sharing…" | `fn:share.seal` | Gap: check every share action |
| Publishing (the deploy on GitHub) | Long, remote, background | The note's public state with *Publishing…* and a link to the run; done when the page answers | "Publishing… usually about a minute" | PRF-06 | Partial |
| Report a problem | Responsive | Busy button | "Preparing the report…" | `fn:diagnostics.report` | Built (D-140) |
| Downloading an update | Long, background | The update note's progress | "Downloading the update · 40%" | none | Planned (DSK-07) |

## Where it stands

**Built:**
- the task tracker, its timing tokens and the busy states (WP-1.4, D-77);
- the optimistic structural changes (PRF-09);
- the one cached Git status that no view waits for (PRF-07);
- the save state on the account pill (D-132);
- the snapshot and warm-up behind fast reopening (PRF-10).

**Still to come:**
- **WP-5.9 (PRF-14, D-151):** a window that follows the hand. It's the most felt, and it goes first.
- **WP-5.8 (DSK-09, PRF-13, D-148, D-149):** the gaps in [the inventory](#the-wait-inventory) and the [glitch-free window rules](#glitch-free-windows-and-views), before the first public release. Setup comes first in it, because it's the first thing a new person sees, and finishing setup currently flashes the window white.
