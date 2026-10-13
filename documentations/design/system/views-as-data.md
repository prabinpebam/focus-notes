# Views as data

Every screen in Focus Notes is a JSON document. The UI runtime reads it, checks it, and maps each node onto a design-system component, binding it to typed state and wiring its events to commands. This page defines that format, how it's validated and rendered, and what it deliberately can't do.

> [!NOTE]
> **TL;DR.** A **view document** names a view model and describes a tree of **nodes**. A node is a component, a fragment, a repeat (`each`), or a choice (`switch`). Prop values are enums, token names, registry IDs, **message keys** (`{"t": …}`), **reads** (`{"get": …}`), **two-way bindings** (`{"bind": …}`), or a small **expression** subset. Events run **actions**, of which there are two kinds: run a command, or set view-local state. There is no code, markup, style, literal text, or raw value anywhere in a view. The build validates every view against a schema generated from the component contracts, resolves every reference, and type-checks every binding against the view model's schema. At run time, the renderer maps nodes to components, and the publisher uses the same views to produce static pages. Each view model declares the content it shows, so a change redraws only the views and nodes that show it. Covers DSY-06 to DSY-08, DSY-11, DSY-13, and PRF-11.

<h2 data-reader-personas="design engineering">A first look</h2>

The Appearance page of Settings, complete:

```json
{
  "$schema": "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json",
  "id": "settings.appearance",
  "ia": "IA-VIEW-SETTINGS",
  "viewModel": "vm.appearance",
  "root": {
    "type": "Stack", "props": { "gap": "xl" },
    "children": [
      { "type": "Heading", "props": { "level": 2, "value": { "t": "settings.appearance.title" } } },
      { "use": "fragment.settingsRow",
        "params": { "label": { "t": "settings.appearance.mode" } },
        "slots": { "control": [
          { "type": "SegmentedControl", "props": {
              "label": { "t": "settings.appearance.mode" },
              "options": { "get": "vm.appearance.modeOptions" },
              "value": { "bind": "vm.appearance.mode" } } }
        ] } },
      { "use": "fragment.settingsRow",
        "params": { "label": { "t": "settings.appearance.lightTheme" } },
        "slots": { "control": [
          { "type": "Select", "props": {
              "label": { "t": "settings.appearance.lightTheme" },
              "options": { "get": "vm.appearance.lightThemes" },
              "value": { "bind": "vm.appearance.lightTheme" } } }
        ] } },
      { "type": "Button",
        "props": { "label": { "t": "settings.appearance.openThemeManager" }, "variant": "secondary", "icon": "color" },
        "on": { "press": { "run": "view.open", "args": { "view": "theme" } } } }
    ]
  }
}
```

Nothing here says how anything looks. Spacing is a step name, the row arrangement comes from a fragment, every word is a message key, the values come from the view model, and the button runs a command.

<h2 data-reader-personas="engineering">Documents</h2>

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | Yes | The UI schema version, for example `view.v1.json` (see [Versions](#versions-and-migration)) |
| `id` | Yes | A stable view ID. Commands open views by this ID. |
| `ia` | Views only | The [information architecture](../information-architecture.html) ID this view delivers, which keeps the chain traceable |
| `viewModel` | Views only | The view model the view reads |
| `local` | No | View-local state with its initial values and a schema: the selected tab, a search query, whether a section is expanded |
| `params`, `slots` | Fragments only | The fragment's parameters (typed like props) and named slots |
| `root` | Yes | One node |

Files live next to their owners: `packages/views/` for the app (shared by desktop and web), `packages/publish/views/` for published pages, and `apps/site/views/` for the Get started page. Each IA view is one document. Large views split into sub-views that their parent includes by ID, such as the eight Settings categories.

<h2 data-reader-personas="engineering">Nodes</h2>

| Node | Shape | Use |
| --- | --- | --- |
| **Component** | `{ "type": "Button", "props": {…}, "on": {…}, "children": […] }` or `"slots": { "name": […] }` | Places a catalog component. `children` is only allowed when the contract has a default slot. |
| **Fragment** | `{ "use": "fragment.settingsRow", "params": {…}, "slots": {…} }` | Places a fragment. |
| **Repeat** | `{ "each": { "get": "vm.files.children" }, "as": "item", "key": "item.path", "render": node, "empty": node }` | Renders a node per list item. `key` is required, and `empty` is required when the list can be empty. |
| **Choice** | `{ "switch": { "get": "vm.history.state" }, "cases": { "loading": node, "error": node, "ready": node } }` | Picks a node by an enum value. Every value of the enum must have a case. |
| **Slot outlet** | `{ "slot": "control" }` | Fragments only: where the content passed into a named slot goes. |

Any node may have `"when": <expression>` to render only when the expression is true, and an `"id"` so other nodes can refer to it (a Tooltip's target, a Positioner's anchor, the focus target when the view opens).

<h2 data-reader-personas="engineering">Values</h2>

| Form | Example | Allowed for |
| --- | --- | --- |
| **Literal** | `"secondary"`, `"xl"`, `2`, `true`, `"color"` | Enums, token names, registry IDs (icons, commands, views, fragments), and numbers or booleans inside the contract's range. Each is checked against its registry. Free text is never a literal. |
| **Message** | `{ "t": "files.selected", "args": { "count": { "get": "vm.files.selectedCount" } } }` | Every `message` prop. Keys resolve in the ICU MessageFormat strings file (I18N-01), and arguments are type-checked against the message. |
| **Read** | `{ "get": "vm.files.selectedCount" }` | Any prop whose type matches the read value |
| **Binding** | `{ "bind": "vm.appearance.mode" }` | `bindable` props only. The component reads the value and writes changes back through the view model's setter, which is a command. |
| **Expression** | `{ "expr": { "and": [ { "get": "vm.files.canDelete" }, { "!": { "get": "local.renaming" } } ] } }` | `when`, and boolean or enum props |

**Scopes** a read or binding may start from:

| Scope | Holds | Writable |
| --- | --- | --- |
| `vm` | The view's view model | Only through bindings to fields that declare a setter command |
| `local` | The view's local state | Yes, by `set` actions and bindings |
| `item` (or the `as` name) | The current item in a repeat | No |
| `params` | A fragment's parameters | No |
| `env` | `sizeClass`, `platform`, `pointer`, `colorScheme`, `reducedMotion`, `locale` | No |
| `event` | The payload of the event being handled (in actions only) | No |

<h2 data-reader-personas="engineering">Actions</h2>

Events (`press`, `change`, `select`, `submit`, `dismiss`, `open`, and the others each contract declares) run actions:

```json
"on": {
  "press":  { "run": "note.open", "args": { "path": { "get": "item.path" } } },
  "rename": [ { "run": "file.rename", "args": { "path": { "get": "item.path" }, "name": { "get": "event.value" } } },
              { "set": "local.renaming", "to": false } ]
}
```

- **`run`** executes a command from the command registry with typed arguments. Opening and closing views, navigating, saving, and every other effect is a command, exactly as for shortcuts, Spotlight, agents, and deep links.
- **`set`** changes view-local state.
- An array runs actions in order and stops at the first command that fails. The failure surfaces through the command's own error handling (a toast or banner), never through the view.

There's nothing else: no inline functions, no fetch, no timers, and no navigation outside commands.

<h2 data-reader-personas="engineering">Expressions</h2>

A restricted subset of JSON Logic, with Focus Notes reads instead of `var`:

| Allowed | Not allowed |
| --- | --- |
| `==`, `!=`, `!`, `and`, `or`, `<`, `<=`, `>`, `>=`, `in`, `if` | Arithmetic, string operations, array mapping or filtering, dates, regular expressions, and custom operations |

The limit is deliberate. If a view needs more, the logic goes into a view-model selector, where it has a name, a type, and a unit test. A rule in `ui:check` also rejects any expression deeper than three levels.

<h2 data-reader-personas="engineering">View models</h2>

A view model is TypeScript in `packages/core`. It's the only code a view depends on, and it never touches the DOM.

```ts
export const appearance = defineViewModel("vm.appearance", {
  schema: AppearanceSchema,           // JSON Schema for every field the view may read
  select: (state) => ({
    mode: state.appearance.mode,
    modeOptions: modeOptions(state.locale),
    lightThemes: themesFor("light", state.themes),
    lightTheme: state.appearance.lightTheme,
  }),
  setters: { mode: "theme.setAppearance", lightTheme: "theme.setLightTheme" },
});
```

- The **schema** is what `ui:check` type-checks bindings against. A view can't read a field that isn't declared.
- **Setters** are commands, so a binding change is undoable, recorded, and available to agents like any other action.
- View models are tested with fixtures. The same fixtures drive the view gallery's states (empty, typical, many items, long text, error, loading).
- Each view model **declares the content it shows**: the workspace tree, one note by path, one note's history, the settings, or the theme list. The workspace model uses these declarations to tell only the affected view models about a change (PRF-11).

<h2 id="fragments" data-reader-personas="design engineering">Fragments</h2>

A fragment is a reusable arrangement written in the same format, with typed `params` and named `slots`. Fragments keep views short and make repeated layouts identical.

```json
{
  "$schema": "https://prabinpebam.github.io/focus-notes/schemas/ui/fragment.v1.json",
  "id": "fragment.settingsRow",
  "params": { "label": { "kind": "message", "required": true }, "description": { "kind": "message" } },
  "slots": { "control": { "accepts": ["Switch", "Select", "SegmentedControl", "Slider", "NumberStepper", "Button"], "count": 1 } },
  "root": { "type": "SettingsRow", "props": { "label": { "get": "params.label" }, "description": { "get": "params.description" } },
            "slots": { "control": { "slot": "control" } } }
}
```

| Fragment | Used by |
| --- | --- |
| `fragment.dialogLayout` | Settings, Shortcuts, Move to, confirmations: title, body, and footer actions |
| `fragment.sheetLayout` | Files, Theme manager, Note history: header, toolbar, scrolling body |
| `fragment.settingsRow` | Every settings control |
| `fragment.emptyState` | Empty Files, no search results, no audiences |
| `fragment.formSection` | Grouped fields with a heading |
| `fragment.stepLayout` | Each first-run step |
| `fragment.readerLayout` | Public notes and the share reader |
| `fragment.siteSection` | Sections of the Get started page |

Fragments are expanded at build time, so they cost nothing at run time.

<h2 id="validation" data-reader-personas="engineering">Validation</h2>

`pnpm ui:check` runs on every build and in CI. Any error stops the build (DSY-08).

| Stage | Checks |
| --- | --- |
| **1. Schema** | Every document against the UI schema generated from the component contracts and the token build. Unknown types, props, or enum values fail. |
| **2. References** | Every component, fragment, view, command, icon, message key, token name, and view-model path exists. Every `when` and `switch` refers to a declared field. |
| **3. Types** | Reads and bindings match the prop's type, message arguments match the message, and repeats bind to lists. Bindings only target fields with setters. |
| **4. Accessibility rules** | Accessible names are present, dialogs and sheets have titles, interface heading levels don't skip, every view declares where focus goes when it opens, and every repeat and switch has its empty, error, and loading cases. |
| **5. Design rules** | At most one primary button per surface, toolbars and menus list commands only, no Layer inside a Layer except menus and tooltips, frost only in floating layers, and view depth under a limit. |
| **6. Rendering** | Every view renders with each of its view-model fixtures, in light, dark, high contrast, compact, and reduced transparency, then goes through visual regression and axe (DSY-09). |

<h2 data-reader-personas="engineering">Rendering</h2>

<ol class="slate-steps">
  <li class="slate-step"><p class="slate-step__title">Build</p><p>Views are validated, fragments are expanded, and each view becomes a compact frozen tree in the app bundle, split per view so it loads only when first opened.</p></li>
  <li class="slate-step"><p class="slate-step__title">Map</p><p>The renderer (<code>packages/ui-runtime</code>) walks the tree and maps each <code>type</code> to its component through a closed registry. There is no dynamic import by name and no fallback for unknown types.</p></li>
  <li class="slate-step"><p class="slate-step__title">Bind</p><p>Each read subscribes to just the view-model field it needs, so a change re-renders only the nodes that use it. Messages resolve through the active locale.</p></li>
  <li class="slate-step"><p class="slate-step__title">Act</p><p>Events turn into actions: <code>run</code> goes to the command service, and <code>set</code> updates local state.</p></li>
  <li class="slate-step"><p class="slate-step__title">Contain</p><p>Each view has an error boundary that shows a calm "This panel couldn't load" message with <em>Copy diagnostic report</em>, and logs locally. The note and the canvas keep working.</p></li>
</ol>

**The typing path doesn't go through the renderer.** The canvas view places `EditorSurface` once, and from then on ProseMirror owns the note's DOM. Keystrokes never re-render a view, so the renderer can't affect the typing budget (PRF-01).

**Redraw only what changed** (PRF-11):

- **Per field.** A view-model change re-renders only the nodes that read that field. A new list item adds one row to a repeat, keyed by its `key`. It doesn't redraw the list.
- **Per view.** A change to content that no open view declares does no rendering work at all, whether it came from the app, an agent, or another program ([Desktop and Git → External changes](../../architecture/desktop-and-git.md#external-changes)).
- **Heavy parts load when first opened.** Each view's code loads on its first open. Inside a view, rarely used heavy parts (a tab, a history diff, the theme gallery's previews) load when they first show, and long lists load a page at a time into a `VirtualList`. Content that arrives later is added to what's there, so a query typed meanwhile, focus, and scroll position are kept.
- **Loading is never blank.** A view that's waiting for data renders its `loading` case, which uses the skeleton sign from [Waits](../components/feedback-and-dialogs.md#waits).
- **Measure before trimming.** The gallery reports the nodes rendered and the bytes of view code per view and per region, so a fix targets what's actually heavy rather than what looks heavy.

**Published pages** go through the same views. The publisher renders `fragment.readerLayout` and the reader views to static HTML at build time, with the same components and token CSS. Only the passcode gate and the theme switch are made interactive.

<h2 id="versions-and-migration" data-reader-personas="engineering">Versions and migration</h2>

- The UI schema is versioned with SemVer, and every document names its version in `$schema`.
- Adding a component, prop, variant, or token is a minor version.
- Removing or renaming anything is a major version, and ships with a migration script that rewrites every view and fragment. CI runs the migration and the full validation before the change can merge (DSY-10).
- Views ship inside the app. There are no remote views and no views supplied by users or agents in this version (D-61).

<h2 data-reader-personas="engineering">Security</h2>

- A view can't contain markup, script, styles, or URLs to load. Text is always rendered as text.
- External links open only through the `link.open` command, which allows `https:` and `mailto:` and asks before opening.
- The renderer's registry is closed, so an unexpected node type is a build error, not something to execute.
- These properties are also what would make it safe to accept views from somewhere else later, for example from an extension or an agent. That's a future decision, not part of this version.

<h2 data-reader-personas="engineering">Performance</h2>

| Measure | Budget | Requirement |
| --- | --- | --- |
| Renderer overhead compared with the same tree written by hand | ≤ 10% render time, measured on Settings, Files with 10,000 notes, and Spotlight with 200 results | DSY-11 |
| Opening any view to its first frame | ≤ 100 ms on the reference hardware | DSY-11 |
| View code per view | Loaded on first open, ≤ 30 KB compressed for the largest view | DSY-11 |
| A change to content no open view shows | No rendering work | PRF-11 |
| Content that a view shows changes outside the app | The view updates ≤ 500 ms after the file watcher reports it | PRF-11 |

The M0 runtime spike measures these before any view is built ([Roadmap](../../plan/roadmap.md)).

<h2 data-reader-personas="product engineering">For agents and tools</h2>

The component contracts, the UI schema, the token names, and the fragment list are published as JSON on the product site (DSY-13), next to the other schemas ([Agents → Files and schemas](../../architecture/agents.md#files-and-schemas-for-agents)). A coding agent working on Focus Notes can read the exact vocabulary, write a view, and have `ui:check` tell it precisely what's wrong, the same way a person would.

<h2 data-reader-personas="product design engineering">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-VIEW-01 | Two action kinds only: run a command, set local state. | UC-AGENT-02, UC-KEY-02 | Every effect goes through the command registry, so it's available to keys, Spotlight, agents, and deep links, and permission checks live in one place. | Inline handlers or a general scripting language in views. |
| DD-VIEW-02 | A small expression subset, with real logic in view-model selectors. | UC-AGENT-06 | Logic with a name, a type, and a test is easier to trust than logic hidden in JSON. | Full JSON Logic or JavaScript expressions. |
| DD-VIEW-03 | Bindings are type-checked against view-model schemas at build time. | UC-THEME-01 | Errors show up when building, not when a writer opens a rarely used panel. | Checking at run time only. |
| DD-VIEW-04 | Fragments expand at build time. | UC-CANVAS-01 | Reuse without run-time cost, keeping start-up fast (PRF-02). | Fragments resolved by the renderer. |
| DD-VIEW-05 | Views ship with the app, with no remote or user-supplied views in this version. | UC-AGENT-02 | The catalog is closed, which keeps the security story simple while the format matures (D-61). | Loading views from the workspace or the network. |
