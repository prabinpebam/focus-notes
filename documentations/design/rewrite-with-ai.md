# Rewrite with AI design

> [!NOTE]
> **TL;DR.** Draft desktop UI contract. Tokens, components, view data, messages, fixtures and tests below are **planned**, not implemented or measured. Focus Notes connects only to a separately managed external app/API, never installs, downloads, embeds, launches or hosts models. No feature code, token/schema changes, Python setup, model/provider/runtime installation or inference belongs to this specification task.

## What people expect

The [experience benchmark](../experience/rewrite-with-ai.md#what-people-expect) names official sources and limits, verified 2026-10-30. [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) and [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) govern fallbacks. The last is AAA guidance, not mislabeled AA. No competitor establishes our numeric fade duration.

## Surfaces

| Registered surface | Anatomy / future implementation touchpoints | Source of behavior |
| --- | --- | --- |
| IA-CMP-REWRITEPROMPT / DD-RWR-01 | Heading/Close, target/privacy, optional target chooser, preset menu, multiline field, destination, estimate/status, Send; new view fragment in `packages/views/fragments`, registration in `packages/views/src/index.ts` | UC-RWR-01; RWR-01 to RWR-04 |
| IA-CMP-REWRITEREVIEW / DD-RWR-02 | Review label, variation navigation, Show original, Accept/Discard/Try again/Edit prompt; preserve editor companion anchor | UC-RWR-02; RWR-05, RWR-06 |
| IA-CMP-REWRITEVARIATIONS / DD-RWR-03 | Local history list, dates/status, read-only comparison, restore action | UC-RWR-04; RWR-61 to RWR-66 |
| IA-CMP-REWRITETARGET / DD-RWR-04 | Source, New file/Same file radio group, destination name/folder, privacy, section plan | UC-RWR-03; RWR-07 |
| IA-CMP-REWRITESTATUS | Single task-backed step/status/count/elapsed/Stop row | PRF-15; RWR-05 |
| IA-VIEW-REWRITESETUP / DD-RWR-05 | External profile form, no runtime installer, Not checked status | UC-RWR-05; RWR-09 |
| IA-VIEW-REWRITECONSENT / DD-RWR-06 | Destination/model/target/estimate card, private warning, explicit Send/Cancel | RWR-43 |
| IA-VIEW-REWRITESETTINGS / DD-RWR-07 | Profiles, caps/private policy, presets/history/effect | RWR-41, RWR-44; `packages/core/src/settings-app.ts` section enum/VM, `packages/views/views/settings.view.json` switch |

Use the project's six layers, not a parallel toolkit. All new task surfaces are closed JSON views/fragments; **Positioner alone owns companion placement**, with Surface/Stack/Inline/Field composing its content. Do not nest a trigger-positioned PopoverPanel or invent a synthetic trigger. Existing DialogPanel owns modal setup/consent/confirmations, Sheet owns populated history. Button/IconButton, TextField, MenuButton, ResultList, VersionCompare and LiveRegion supply existing controls where their contracts fit. The explicit planned gaps below are not claims of existing capability.

### Closed composition contracts

WP-AI.2 plans a Positioner extension: `anchor` adds `editorTop`; `placement` adds `auto` (below → above → editor-top fallback); `landmark` adds `dialog`; `dismissal:"explicit"` disables outside-click closure; `scrollMode:"body"|"whole"` selects fit behavior; `focusTarget:"none"|"instruction"|"stop"|"reviewStatus"` and monotonic `focusEpoch:number` request scoped focus only after user action/control removal. `label` is a required message for dialog, resolved to the header Heading through a generated instance ID/aria-labelledby, not a free HTML ID. Slots `header`, `body`, `actions` each accept exactly one Stack or Inline root containing the declared sealed controls; Surface descendants may form content cards only, not an outer frame. No free callback/markup slot exists. In this variant Positioner renders one Surface frame around those slots; callers cannot supply another positioning frame/default child. Positioner emits `dismiss {reason:"escape"}` to the lifecycle command, never clears state itself. Existing callers retain existing defaults.

Planned closed VM root `rewrite`: opaque session/operation IDs; six-state enum; target `{kind:"selection"|"block"|"file",labelKey,privacy,expanded,excludedCount}`; instruction/language/preset values; `allowLinkChanges:boolean`; output mode/name; estimate `{inputBytes,inputTokensUpper,outputTokensMax,costUpper?,expiresAt,blockedReasonKey?}`; progress `{stepKey,completed,total,elapsed}`; review `{index,total,showOriginal,canAccept}`; profile list/form; history rows/selection; field-error message keys; focus target/epoch. Types and limits follow engine/provider contracts; no arbitrary VM path or free UI string. Only composing setters can mutate request fields; each invalidates operation/required consent. Arrays have bounded item schemas; `undefined` never becomes an empty success.

| Surface → planned ID / layer | Closed parameters and allowed composition | Typed bindings / events → commands | States / ownership |
| --- | --- | --- | --- |
| Prompt → `rewrite-prompt` fragment | `{sessionId}`; Positioner with Surface/Stack/Inline/Field, Heading, Close, target/status fragments, MenuButton, multiline TextField, language Combobox, link Checkbox, Send; no external slots | `rewrite.instruction/language/presetId/allowLinkChanges`, estimate/errors; change → `rewrite.setInstruction/setLanguage/setPreset/setLinkPolicy`; Send → `rewrite.send`; Close → `rewrite.close` | composing/sending/error; WP-AI.2; Positioner geometry, primitives own controls |
| Review → `rewrite-review` fragment | `{sessionId}`; same Positioner, heading/status, IconButtons, Show original toggle Button, Accept/Discard/Try again/Edit prompt; no external slots | review index/total/pressed/canAccept; `rewrite.previous/next/showOriginal/accept/discard/retry/editPrompt` | review/error; WP-AI.2/4; never an editable preview |
| Variations → `rewrite-variations` fragment | `{noteKey}`; Sheet, Heading, bounded ResultList rows, VersionCompare read-only, empty/status and restore/clear buttons; no external slots | bounded history rows/selection/canRestore; `rewrite.historySelect/historyPreview/historyRestore/historyClear` | empty/list/comparison/stale/error; WP-AI.4 |
| File target → `rewrite-target` fragment | `{sessionId}`; Field/Stack/Inline, target chip, RadioGroup, filename TextField, bounded run-plan rows, sections Checkbox; no external slots | output mode/name/eligible plan/privacy/errors; `rewrite.setOutputMode/setDestination/setSections` | composing/invalid/consented; WP-AI.5 |
| Status → `rewrite-status` fragment | `{sessionId}`; StatusRow, text counts/elapsed, Stop, one LiveRegion; no external slots | progress step/counts/state; Stop → `rewrite.stop` | sending/streaming/review/error/cancelled; WP-AI.6; tracker extension remains planned |
| Setup → `rewrite-setup` view | `{returnSessionId?}`; DialogPanel header/body/footer, profile option card/form, fields, Save/Cancel/Help; no external slots | profile form/validation/credential-present, never stored key; `rewrite.profileSet/profileSave/profileCancel` and credential set/remove | empty/form/error/not-checked; WP-AI.6 |
| Consent → `rewrite-consent` view | `{operationId}`; DialogPanel, destination/scope/estimate cards, disclosures, Send/Cancel; no external slots | immutable operation summary, approval reason keys; `rewrite.consentApprove/consentCancel` | public/private/blocked/expired; WP-AI.6; approval cannot mutate operation |
| Settings → `rewrite-settings` fragment | no parameters/slots; bounded profile rows, active RadioGroup, cap/pricing fields, policy/effect Checkboxes, preset/history sections and confirmations | selected profile, numeric cap/pricing fields, policy/effect/preset VM; `rewrite.profileSelect/profileRemove/setCap/setPricing/setPrivatePolicy/setEffect/presetAdd/presetRename/presetEdit/presetDelete/presetExport` | empty/populated/invalid/confirmation; WP-AI.6; device-only |

These are planned registry command IDs, not implemented commands. Unknown properties/parameters, arbitrary child types, raw labels/styles, wrong VM/setter types and invalid command payloads must be rejected by future contract/schema fixtures. Fragments have **no open slots**; bounded row templates have only their declared typed item binding. Register future view/fragment/message IDs in `packages/views/src/index.ts`, guidance/inventory and generated schema version together when implemented; no JSON/schema/runtime code is added here.

Actual catalog gaps: sealed `Checkbox {label:message,checked:boolean,disabled:boolean,error?:message}` with `change {checked:boolean}`; `RadioGroup {label:message,value:string,options:bounded key/label/disabled records,disabled:boolean}` with `change {value:string}`; editable `Combobox {label:message,value:string,options:bounded key/label records,required:boolean,error?:message}` with `change/commit {value:string}`. They have no content slots and register as primitives, using native/APG semantics. TextField needs the bounded multiline/counter variant; Positioner needs the extension above. UC-RWR-01/03/05/06 and DD-RWR-01/04/05/07 justify these gaps. No extra rewrite-specific React compound is required. All additions follow the primitive contract/component inventory/guidance/schema process and Fluent icon registration, never Unicode icon substitutes.

Setter payloads are closed: instruction/language/destination are bounded strings; preset/profile selection is an existing opaque ID; link/section/private/effect setters accept only `{value:boolean}`; output mode accepts only `new|same`. `setCap` takes `{field:"operationCost"|"dailyCost"|"dailyTokens"|"contextTokens"|"maxOutputTokens",value:number}` with provider bounds; `setPricing` takes a reviewed pricing record with explicit unit/currency/source/date. `profileSet` accepts only declared label/endpoint/model fields, never arbitrary settings paths; credential input uses the dedicated transient set/remove channel. Lifecycle/history actions accept only the bound session/operation/item IDs in their owning scope. Slots/children cannot inject commands or new VM fields.

### Actionable target contract

WP-AI.2 plans `targetSize:"standard"|"comfortable"` on Button/IconButton, MenuButton, TextField, Checkbox, RadioGroup option and Combobox/input/option primitives as applicable. Rewrite fragments select `comfortable`; its **actual hit-tested element**, not a wrapper, is at least 44 × 44 px in fine **and** coarse pointer modes, expanding for text. Reuse the existing 44 px reference via semantic `size.actionComfortable` and owning `cmp.<primitive>.comfortableMinWidth/Height` aliases; fragments never restyle fundamentals. Preserve other callers' defaults. Gallery/contract/token fixtures and journey bounding boxes measure actionable nodes, including radios/checkbox label targets, not 44 px layout boxes around 32 px controls. Include occupied dimensions in every small-window/reflow fixture.

### Placement and dimensions

All numbers below are **proposed token values**, evaluated against the actual drawn window boundary, not the outer Electron shadow box. The Windows custom-resize token minimum is 480 × 360; the BrowserWindow native constructor floor is separately 360 × 320, not a promise that every platform enforces the custom minimum. At a default 960 × 640 review fixture, use width min(26.25 rem / 420 px, available editor width minus 1.5 rem / 24 px). Height fits content up to 20 rem / 320 px or available safe height, whichever is less; internal body scrolls, heading/action row stay fixed.

| Rule | Deterministic behavior |
| --- | --- |
| Selection anchor | Below last visible selected line, 0.5 rem / 8 px gap, start aligned to first visible selected edge; clamp horizontal edges to 0.75 rem / 12 px safe inset |
| Flip | If measured surface cannot fit below, try above first visible selected line. If neither fits, dock below editor top safe edge; do not cover title-bar trigger/drag band |
| Small window | At 480 × 360, always top-dock below reserved chrome; width is available width minus safe insets; body scrolls with reachable Send/Stop/Close; presets collapse behind menu |
| Undersized native boundary | Also test 360 × 320 constructor floor; use actual available room, wrap controls, no minimum width larger than container |
| File/no visible target | Open source first, dock at editor top safe edge until the highlighted target is visible |
| Scroll/resize | Recompute synchronously with existing anchor/Positioner helpers; do not chase streamed caret. At most one deliberate scroll keeps target context, no repeated jumps |
| Prompt | 2–6 text lines, minimum 3 rem at default text size; grows to cap, then internal field scrolling; 4,000-code-point counter |
| Presets | At most 6 visible rows before vertical scrolling; no horizontal chip carousel. Language combobox appears in body |
| Controls | 44 px minimum targets, 8 px control gap, 16 px group gap and uniform panel padding; radii/surface/shadow from existing popover aliases |
| Review bar | Wrap at group boundaries; navigator and primary actions never overlap. At 480 × 360, two action rows inside the same bounded companion |
| Text scaling / translation | At 200% text and 40% longer labels, grow/wrap and scroll body; never truncate target privacy, error, primary action or destination identity |

Independently of either OS minimum, plan a **320 CSS px content-width** fixture (for example 1280 CSS px at 400% zoom), plus 200% text/expanded labels. No horizontal scrolling of controls/disclosures; focused nodes remain visible below sticky rows (WCAG 1.4.10/2.4.11). If fixed header/actions leave insufficient body room, Positioner switches to `scrollMode:"whole"`: one vertically scrolling companion with a reachable action group, never clipped fields or a trap.

Future touchpoints: `packages/ui/src/behaviors/anchors.ts`, `place.ts`, `layouts/Positioner`, `primitives/PopoverPanel`, `host/EditorSurface`, new view fragments and VM contracts. Native/drawn menu paths both consume the shared model; keyboard block/table menus need explicit additions, not an assumption that native text-menu handling covers them.

## States

| State | Prompt/review anatomy | Control states |
| --- | --- | --- |
| composing / empty | Target, preset button, labelled field, destination | Send disabled with associated reason; Close always works |
| composing / valid | Instruction/counter/estimate | Send enabled after all guards; preset choice only populates field |
| sending | Frozen target/instruction summary, Starting rewrite…, Stop | No duplicate Send; outside editor remains usable |
| streaming | Protected in-place text, Rewriting…, step/count/elapsed | Stop enabled; no Accept/partial variation |
| review | Complete preview/status, full review bar | Accept enabled only for validated displayed variation, boundaries disabled, Show original disables Accept |
| error | Original and inline repair message | Prompt retained; Retry only when repair/countdown allows; Discard reachable |
| cancelled | Original, stopped announcement | Surface closes with focus return; no error alert |
| setup / empty | External-service card, Add profile | No enabled profile, no install/launch/test-inference action |
| consent / private | Named destination and Private badge, target/estimate card | Explicit Send private text, Cancel; approval never prechecked |
| history / empty | No rewrite variations on this device yet | Close and Help, no fake history rows |

Every control has rest, hover (hover-capable devices only), pointer-down active, visible keyboard focus, disabled/aria-disabled, busy and error stories where meaningful. Disabled menu items remain focusable with a reason; commands still reject activation. Fields use persistent labels, errors via descriptions, input retained. Light/dark/high-contrast use resolved surface/text/border/focus tokens. Reduced transparency gives solid surfaces. No shimmer on text, no blinking progress or hidden status duplication.

## Message keys

This is the **single canonical planned copy register** for future `packages/views/messages/en.json`. The preset table in the experience is the canonical instruction data: `rewrite.preset.<suffix>.label` and `.instruction` are projections of its exact two columns, not a second hand-maintained wording source. Transport framing is versioned engine data, not translated UI copy. Curly punctuation is intentional for product words; interpolation is escaped and plural-aware.

| Keys | Exact English values |
| --- | --- |
| `command.rewrite.selection`, `command.rewrite.file` | Rewrite with AI… |
| `command.rewrite.history` | Rewrite history |
| `settings.section.rewrite`, `rewrite.title` | Rewrite; Rewrite with AI |
| `rewrite.instruction.label`, `.placeholder`, `.count`, `.limit` | Rewrite instruction; For example, make this clearer; {count} of 4,000; Use 4,000 characters or fewer. |
| `rewrite.target.selected`, `.block`, `.whole`, `.expanded` | Selected text; Whole block; Whole note; Includes the whole block. |
| `rewrite.target.unsupported`, `.fileType`, `.singleFile`, `.otherWindow` | This block can’t be rewritten yet.; Choose a Markdown file to rewrite.; Choose 1 file to rewrite.; Finish editing this note in the other window before rewriting. |
| `rewrite.target.saveTo`, `.new`, `.same`, `.filename`, `.folder` | Save result to; New file; Same file; File name; Folder |
| `rewrite.target.sections`, `.sectionWarning` | Rewrite in {count} sections; Rewrite in {count} sections? Each section is rewritten separately and may not read as one piece. |
| `rewrite.send`, `.stop`, `.close`, `.accept`, `.discard`, `.retry`, `.editPrompt` | Send; Stop; Close rewrite; Accept; Discard; Try again; Edit prompt |
| `rewrite.create`, `.replace`, `.presets`, `.language`, `.help` | Create file; Replace file; Presets; Language; Rewrite help |
| `rewrite.previous`, `.next`, `.counter`, `.showOriginal`, `.original` | Previous variation; Next variation; Variation {index} of {total}; Show original; Original text |
| `rewrite.status.starting`, `.streaming`, `.review`, `.sections`, `.elapsed` | Starting rewrite…; Rewriting…; Review rewrite; Completed {done} of {total} sections; {seconds} s elapsed |
| `rewrite.wait.prepare`, `.estimate`, `.checkpoint`, `.validate`, `.variation`, `.history`, `.accept`, `.create`, `.connection` | Preparing rewrite…; Checking estimate…; Saving original…; Checking rewrite…; Saving variation…; Opening rewrite history…; Saving rewrite…; Creating file…; Checking connection… |
| `rewrite.status.held`, `rewrite.busy`, `rewrite.historyFailure` | Review or discard the rewrite before saving this note.; A rewrite is already running. Review or stop it first.; Couldn’t save rewrite history on this device. Free space and try again. |
| `rewrite.hint.linkMoved`, `.linkUnbound`, `.editLink`, `.dismiss` | Link editing moved to {shortcut}.; Link editing is available from the formatting toolbar.; Edit link; Dismiss |
| `rewrite.setup.title`, `.empty`, `.external`, `.addProfile`, `.notChecked` | Rewrite provider; Connect an external app or API to rewrite text.; Focus Notes does not run models. Start and manage your local service separately, then enter its address here.; Add profile; Not checked |
| `rewrite.profile.label`, `.endpoint`, `.model`, `.key`, `.replaceKey`, `.removeKey` | Profile name; Service address; Model; API key; Replace key; Remove key |
| `rewrite.profile.keyEntry`, `.localAddress` | The key input clears after saving. Stored keys can’t be shown.; Use an exact numeric loopback address. LAN services aren’t supported yet. |
| `rewrite.profile.local`, `.remote`, `.fixture`, `.attestation` | Local; Remote; Demo provider · No text leaves this device; Local · You confirmed this service keeps text on this device. |
| `rewrite.consent.public`, `.privateTitle`, `.privateSend`, `.privateLocal`, `.cancel`, `.chargeWarning` | This text and instruction will be sent to {destination}. Its own data policy applies.; Send private text to {destination}?; Send private text; Private note · Local service; Cancel; Stopping may not stop provider charges. |
| `rewrite.consent.confirmEstimate`, `.pricingBlocked` | Review the input, sections and maximum estimated charge before sending.; Add pricing and a bounded maximum output before sending text to this cloud service. |
| `rewrite.settings.privatePolicy`, `.effect`, `.presets`, `.history`, `.revoke` | Ask before sending private notes; Fresh-text effect; Presets; Rewrite history; Revoke consent |
| `rewrite.preset.save`, `.rename`, `.delete`, `.export`, `.name`, `.duplicate`, `.full` | Save preset; Rename; Delete preset; Export presets; Preset name; A preset with this name already exists. Choose another name.; You have 20 presets. Delete one before adding another. |
| `rewrite.preset.deleteTitle`, `.deleteWarning`, `.exportWarning` | Delete “{name}”?; This preset can’t be restored.; Exported presets include your instructions. They may contain private information. |
| `rewrite.history.empty`, `.clear`, `.clearTitle`, `.clearWarning`, `.reselect`, `.accepted`, `.discarded` | No rewrite variations on this device yet.; Clear rewrite history; Clear rewrite history on this device?; Notes are kept. Deleted history may remain in device backups.; Reselect text; Accepted; Discarded |
| `rewrite.history.limit` | Keep or discard this rewrite before starting another. |
| `rewrite.history.capacity`, `.gitUnavailable`, `.repair` | Rewrite history is full. Review or clear older history before trying again.; Rewriting needs app-supported Git. Writing and recovery are still available.; Review setup |
| `rewrite.instruction.required`, `.allowLinkChanges`, `rewrite.language.required` | Enter an instruction before sending.; Allow link destination changes; Choose a language before sending. |
| `rewrite.preset.add`, `.editInstruction`, `.invalidName` | Add preset; Edit instruction; Use a preset name of 1 to 60 characters. |
| `rewrite.profile.active`, `.save`, `.cancel`, `.remove`, `.limit` | Active profile; Save profile; Cancel; Remove profile; You have 10 profiles. Remove one before adding another. |
| `rewrite.profile.labelRequired`, `.endpointInvalid`, `.modelRequired`, `.keyTooLong` | Enter a profile name of 1 to 80 characters.; Enter an approved service address without a password, query or fragment.; Enter a model or deployment name of 1 to 128 characters.; Use an API key of 16 KiB or less. |
| `rewrite.profile.removeTitle`, `.removeWarning` | Remove this profile?; New rewrites using this profile will be unavailable. Notes and history are kept. |
| `rewrite.limit.operationCost`, `.dailyCost`, `.dailyTokens`, `.outputTokens`, `.contextTokens` | Maximum charge per rewrite; Maximum daily charge; Daily token limit; Maximum output tokens; Verified context tokens |
| `rewrite.limit.amountInvalid`, `.tokensInvalid`, `.raiseConfirmation` | Enter a nonnegative amount within the approved limit.; Enter a whole token count within the approved limit.; Review the higher limit before saving. |
| `rewrite.pricing.input`, `.output`, `.currency`, `.source`, `.checkedOn`, `.update` | Input price per million tokens; Output price per million tokens; Currency; Pricing source; Pricing checked on; Update pricing |
| `rewrite.pricing.invalid`, `.stale`, `.unbounded`, `.sourceInvalid` | Enter current prices for every billable unit.; Pricing needs review before sending.; This service has no verified maximum billable output.; Enter a current pricing source address. |
| `rewrite.destination.invalid`, `.collision`, `.exhausted`, `rewrite.settings.save` | Choose a valid file name in this note’s privacy section.; This name is taken. Review the next available name.; Choose another name for the rewritten file.; Save settings |
| `rewrite.focusCompanion`, `rewrite.review.heading`, `rewrite.history.compare`, `.restore`, `.create` | Move between rewrite and editor; Review rewrite; Compare variation; Review this variation; Create note |
| `rewrite.announce.open`, `.complete`, `.accepted`, `.discarded` | Rewrite instruction opened for {target}.; Rewrite ready. Variation {index} of {total}. Review before accepting.; Rewrite accepted.; Rewrite discarded. Original text restored. |

Error keys match the engine's exact code suffixes. Values below are canonical; straight apostrophes in architecture quotations normalize to product typography without changing meaning.

| `rewrite.error.<code>` | Exact English copy | Repair action |
| --- | --- | --- |
| `no-provider` | Set up a provider to rewrite text. | Set up |
| `consent-required` | Review where this text will be sent. | Review |
| `private-blocked` | This provider can’t rewrite private notes with your current settings. | Settings |
| `offline` | Can’t reach this provider. Check the connection and try again. | Retry |
| `auth-failed` | Couldn’t sign in to this provider. Check its key in Settings. | Settings |
| `rate-limited` | Too many requests. Try again after {time}. | Retry (disabled until time) |
| `cost-limit` | This rewrite exceeds your limit. Review the estimate or choose less text. | Review estimate |
| `timeout` | The provider took too long. Your original text is unchanged. | Retry |
| `provider-error` | Couldn’t complete the rewrite. Your original text is unchanged. | Retry / history-specific repair |
| `refused` | The provider couldn’t rewrite this text. Try a different instruction. | Edit prompt |
| `too-large` | This rewrite is too large. Select less text and try again. | Choose text |
| `stale-target` | This text changed while rewriting. Select it again to keep both versions safe. | Choose text |
| `read-only` | This note is read only. | Close |
| `conflict-pending` | Resolve this note’s changes before rewriting. | Resolve changes |
| `invalid-output` | The reply couldn’t be used as Markdown. Your original text is unchanged. | Edit prompt / Retry |
| `cancelled` | Rewrite stopped. Your original text is unchanged. | Status only, not alert |

Repair buttons use `rewrite.action.setup/review/settings/retry/estimate/choose/resolve` with exact values Set up / Review / Settings / Retry / Review estimate / Choose text / Resolve changes. Shared Close/Cancel reuse registered shared messages where wording matches. Add plural forms for sections, seconds and input/output estimates rather than concatenating fragments. Unknown price is **Unknown**, never **Free**; estimate rows use `rewrite.estimate.input/output/upperCharge/unknown` = Input / Maximum output / Maximum estimated charge / Unknown, with locale-formatted amounts/units. No source path, provider response body or API key interpolates into errors.

Settings and consent render the provider contract's proposed caps, confirmation thresholds and six deadlines from one data source; the [experience](../experience/rewrite-with-ai.md#setup-and-consent) records the current proposal, not independent UI constants. Unknown pricing/unbounded billable output keeps cloud Send disabled with `rewrite.consent.pricingBlocked`; no acknowledgement bypass. Key replacement uses transient input cleared on acknowledgement, never a reveal action or assumed native dialog. Timeout uses the canonical `timeout` error after the applicable deadline, never a fabricated percentage or automatic retry.

The closed inventory above binds every control in the composition table to a key. Settings exposes operation/day cost, daily tokens, verified context and output-token fields; transport deadlines/rate ceilings are read-only policy data, not hidden editable fields. Pricing displays USD and every billable unit with dated source; no guessed “free” value. Field validation precedence is target/history/provider availability → instruction required/length → Translate language required → output policy/destination → estimate/consent. Both empty fields retain individual descriptions, but Send's associated reason is the first failing guard. Profile name/address/model/key errors stay on their fields; profile-count, preset-count and history-capacity reasons are distinct. Invalid dates/over-30-day prices use `pricing.stale`; unknown units/output use `pricing.invalid/unbounded` and block cloud. These are future message bindings, not runtime strings.

## Fresh text

RWR-08, FOC-07, A11Y-03, DSY-14; D-243, D-252. Add mapped ProseMirror decorations, never document marks. Start one effect clock when a **complete validated** variation enters review, not per streamed token; hold **1,500 ms**, fade **2,500 ms** to ordinary text with `cubic-bezier(0,0,0,1)`. A different complete variation starts its own clock; Show original has no effect; Accept does not restart it. All decorations expire by 4,000 ms and never return on undo, redo, restart or history restore unless a new reviewed variation is deliberately shown.

Diagonal gradient angle 135 degrees, stops at 0/50/100%; no translating gradient/shimmer. Fade changes glyph color toward resolved normal foreground, never opacity of the whole text node. The exact interpolation must be declared and tested; sRGB is the v1 proposal.

| Interaction / context | Precedence and fallback |
| --- | --- |
| Selection, caret, find/current match | Existing selected foreground/background and caret override gradient; never transparent selected glyphs. Find outline/background remain intact |
| Links, inline/fenced code, spelling underline | Keep semantic link/code foreground and underlines; skip gradient on these spans rather than erase semantics. Native spelling underline stays untouched |
| Focus band D-232 | No competing mask or selection movement. Outside active band disable fresh decoration; if the existing dimming would drop fresh-text contrast below 4.5:1, use ordinary text and keep status. Focus-mode contrast is not “proved” by unmasked swatches |
| Edge fades / translucent surfaces / custom themes | No gradient where the actual composed background/foreground pair has not passed validation; ordinary text fallback and review badge remain |
| Reduced motion | Ordinary text immediately, no hold/fade (D-243), status still announces completion |
| Forced colors / high contrast | Ordinary CanvasText/semantic system foreground, no gradient; review label/counter is the non-color signal, no new underline competing with links/spelling |
| Effect off | Remove decorations next frame; no content transaction |
| Copy/paste, Markdown save, print/export | Only semantic text/Markdown; no color, timer, authorship metadata or injected CSS in clipboard/export |

Future touchpoints: `packages/editor/src/format.ts` plugin/decorations and `index.ts` injection; `packages/ui/src/host/EditorSurface/EditorSurface.css.ts` owns CSS; token references/semantics/component aliases and modes; device setting outside synced allowlist. Do not put HTML/CSS or literal color values into core/views/editor logic.

## Tokens

**Proposed only; no token files changed here.** Repository convention is `ref.*` → semantic roles → `cmp.editorSurface.*`, not kit-generic `p.*`. Each raw reference gets DTCG `$type`, `$value`, `$description`; color is `{colorSpace:"srgb",components:[r,g,b],alpha:1}`, duration `{value,unit:"ms"}`, dimension `{value,unit:"rem"}`, easing a cubic-bezier tuple. Reference entries carry raw values, semantic/theme entries alias reference tokens, component entries alias semantics.

| Proposed semantic / component aliases | Light | Dark | Contrast light / dark |
| --- | --- | --- | --- |
| `color.rewriteFresh.start` → `cmp.editorSurface.freshStart` | #304080 | #C4D0FF | existing ordinary text |
| `color.rewriteFresh.middle` → `cmp.editorSurface.freshMiddle` | #603060 | #E8C4EC | existing ordinary text |
| `color.rewriteFresh.end` → `cmp.editorSurface.freshEnd` | #205850 | #B6E0D0 | existing ordinary text |
| `motion.rewriteFreshHold` → `.freshHold` | 1,500 ms | same | 0 ms |
| `motion.rewriteFreshFade` → `.freshFade` | 2,500 ms | same | 0 ms |
| `easing.rewriteFresh` → `.freshEasing` | [0,0,0,1] | same | same, no motion |
| `angle.rewriteFresh` → `.freshAngle` | 135 degrees | same | unused |
| `number.rewriteFreshStopStart/Middle/End` → component equivalents | 0 / 0.5 / 1 | same | unused |
| `layout.rewriteWidth/MaxHeight/SafeInset/AnchorGap` → `cmp.positioner.companionWidth/MaxHeight/SafeInset/AnchorGap` | 26.25 / 20 / 0.75 / 0.5 rem | same | same |
| `layout.rewritePromptLinesMin/Max`, `layout.rewritePresetRows` | 2 / 6 lines, 6 rows | same | same |

Reuse existing control padding/gap/radius/type/layer/focus/wait semantics; no duplicate private scale. New 2,500 ms/raw color references are planned additions; reuse an exact existing reference where available. Tokens must have consumers and regenerate their docs/types/schemas when implemented.

### Contrast proof and measurement plan

These are palette **hypotheses**, not compliance results. For every actual built-in/custom theme, measure resolved canvas/code/link/selection/current-match colors and composition after masks. Use WCAG relative luminance `(Llighter + .05)/(Ldarker + .05)`. The gradient and its time interpolation need a continuous bound, not only three stop swatches or screenshots.

Planned unit proof: bound each interpolated sRGB channel over every spatial segment and temporal fade segment; monotonic sRGB linearization yields conservative luminance extrema. Divide intervals adaptively until the lower contrast bound is ≥4.5:1, or reject/fallback; include both endpoints and final normal text. Property fixtures cover custom backgrounds and foregrounds, nested marks, selection/find/code, and focus/edge-mask states. Assert non-text focus/controls ≥3:1. Dense sampling (257 spatial positions × 241 time points at 60 Hz) is a diagnostic complement, **not** the continuous proof.

Planned browser/gallery measurement: default, 480 × 360, 360 × 320, 1600 × 1000, 100/200% text; every theme/contrast mode, reduced motion/transparency and forced colors. Use resolved computed colors plus pixel probes for glyph/background composition, not screenshot appearance alone. The fixture clock captures t=0, 1,499, 1,500, 2,750, 3,999 and 4,000 ms; ≤1 frame timing tolerance for expiry, no timer reset on Accept. Fail closed to ordinary text if a bound, theme pair or mask cannot be proven. No accessibility/performance measurement has run in this docs-only task.

## Accessibility

| Key / context | Effect |
| --- | --- |
| Desktop editor Mod+K | Open prompt for selection/current whole block; no action during IME; web retains link.edit Mod+K |
| Desktop Mod+Shift+J | Existing link editor, registry-derived; web never handles browser Ctrl+Shift+J |
| Spotlight Mod+K | Quick actions only; never rewrite while field owns focus |
| Instruction Enter / Mod+Enter | Send valid instruction outside IME; Shift+Enter newline; other textarea editing/undo keys stay native |
| Review-surface Mod+Enter | Accept displayed variation only; no global interception of task/table Mod+Enter |
| F6 / Shift+F6 while rewrite is active | Move between editor and last focused companion control (instruction initially); modal/nested-widget scope first, then rewrite, then existing toast F6. Without rewrite, toast behavior is unchanged; explicit `toast.focus` remains available from commands |
| Escape | Close innermost open preset/language/menu first; then composing Close, active Stop, review Discard |
| Tab / Shift+Tab | Heading Close → target chooser controls → Presets/language → instruction → Allow link destination changes → provider/estimate actions → Send; review uses visual DOM order; unavailable navigator controls remain focusable with aria-disabled/rejected activation |
| Menu arrows/Home/End, Enter/Space | Standard list navigation/choice; arrows in instruction/editor remain caret keys |
| Navigator Left/Right | Previous/next only while navigator owns focus; normal Tab/Enter works too |
| File tree Shift+F10 / Menu | Same contextual row action; multi-selection eligibility unchanged |

The companion is an **APG non-modal Dialog**: Positioner `landmark:"dialog"` supplies `role=dialog` and heading-based name, with no `aria-modal=true`, focus trap or outside-click dismissal. Opening records invocation source, selection and focused file row; focus starts in instruction. Clicking/editing outside does not dismiss an active rewrite or release its protected target. F6/Shift+F6 invokes planned `rewrite.focusCompanion`, scoped to the active rewrite ahead of toast navigation; a modal setup/consent/confirmation retains its own focus until closed. Nested widgets handle their keys before the companion. Escape is handled only in the owning scope after nested widgets; note/window navigation uses explicit cancel/discard, not a generic popover close.

Companion pointer-down preserves the editor selection. Closing after same-file Accept returns to accepted range; Discard to original range; file invocation returns to original file row (or nearest surviving row if removed), except successful New-file creation opens its acknowledged destination. Modal setup/consent returns to its invoking rewrite control, or instruction if that control no longer exists.

| Transition | Deterministic focus |
| --- | --- |
| Send | Keep a surviving focused control; if submitting instruction/Send is removed, focus Stop. Never move an outside editor's focus |
| Stream → review | Preserve outside/editor focus; if focused Stop disappears, move to stable named Review rewrite status with `tabindex=-1`, never auto-activate Accept |
| Previous/Next boundary | Keep the navigator button focused; aria-disabled is announced and activation rejected without wrapping |
| Show original | Keep toggle focused; stable name, `aria-pressed` follows original display; Accept aria-disabled while original shown |
| Retry / Edit prompt | Retry follows Send rule; Edit prompt explicitly focuses retained instruction without sending |
| Error / async status | Keep focus unless the user submitted an invalid field; status/announcement never steals outside focus |
| Cancel/back from setup/consent | Restore invoking rewrite control if surviving, otherwise instruction; cancellation cannot send |

No transition may leave focus on body or a removed node. These are planned assertions, not a screen-reader/runtime pass.

Presets follows the **APG Menu Button**: trigger `aria-expanded`, open moves focus into menu; arrows/Home/End navigate, Enter/Space chooses without sending, Escape closes and returns to trigger. Language follows **editable Combobox with Listbox Popup**: input retains DOM focus, `aria-activedescendant` names the active option, Up/Down navigate, Enter commits the highlighted option, Escape closes without sending, Tab commits valid typed text and moves normally. Popup keys precede instruction-level Enter/Mod+Enter. Show original is a toggle Button with stable name and `aria-pressed`; an associated Original text/variation status describes what is displayed. The link-policy Checkbox exposes checked state and label; only custom instructions enable it.

Use `LiveRegion` once: opening target; after 1 s starting/streaming; progress no more often than every 5 s and only at section boundaries; completion counter; Stop/Discard; accepted; sanitized error once. No per-token or per-second announcements; countdown is readable on demand. A critical failure uses the existing alert path, not simultaneous polite and assertive duplicates. Gradient is purely decorative, no duplicated hidden generated text. Screen readers read the actual preview once; target/review status clarifies it is not saved.

Accessible names exactly match visible actions; icon-only Close/previous/next use the message labels in the register. Target chip descriptions name scope/privacy/expansion without dumping selected text. Language list follows combobox semantics, radios expose selected output mode, fields expose errors/counters with descriptions. Hover is never the only way to discover action/reason. Full keyboard and NVDA/Windows Narrator review is planned, not run.

## Visual score

D-127 rubric: [visual versus verbose score](visual-score.html). Provisional design scores, **not observed implementation evidence**.

| Surface | Visual anchor /20 | Glanceable /20 | Right element /20 | Text economy /20 | Hierarchy /20 | Total / target |
| --- | --- | --- | --- | --- | --- | --- |
| Prompt | 17 | 17 | 16 | 18 | 17 | 85 / ≥70 |
| Review | 18 | 17 | 18 | 18 | 17 | 88 / ≥70 |
| File target | 17 | 18 | 16 | 18 | 17 | 86 / ≥70 |
| Setup empty | 17 | 17 | 16 | 18 | 17 | 85 / ≥80 |
| Consent | 17 | 18 | 15 | 18 | 18 | 86 / ≥70 |
| History empty | 17 | 16 | 17 | 17 | 17 | 84 / ≥80 |

No criterion below 10. Prompt/review/file surfaces use the highlighted target/result excerpt as the ≥48 px purposeful visual anchor; setup uses a ≥48 px external-service connection graphic, consent a destination/scope card, history empty a purposeful variation-stack graphic, never a decorative sparkle. Destination/scope cards, chips, radio options and variation controls replace instructional paragraphs; disclosure remains explicit where privacy requires it. Reviewer recomputes against actual gallery screenshots using the canonical rubric and its text budgets rather than treating these estimates as a pass.

### Gallery and visual-baseline plan

The complete future score/capture matrix below supplements the provisional scores above. Each row records five evidence values/reasons: **1** journey-measured purposeful anchor (at least 48 px), **2** reviewer-judged title/glance path, **3** reviewer-judged appropriate element, **4** journey-measured primary-path word budget, **5** reviewer-judged single focal action. The row's anchor/path/element/budget/action cells are the five criterion-specific reasons, not observed scores. Record light and dark results and use the lower-theme total; every criterion ≥10, totals ≥70, **every first-run step and empty state ≥80**. No ×1.25 exemption is claimed; any later permitted scaling must cite the canonical rubric and record raw/scaled values. All scores/captures/pass-fail remain pending implementation.

| Surface/type | 1 anchor | 2 primary path / disclosure | 3 right element | 4 word budget | 5 primary action | Unique light/dark capture prefix / owner |
| --- | --- | --- | --- | --- | --- | --- |
| Prompt/popover | Highlighted target preview | Instruction and scope; advanced policy disclosed | Preset menu/Checkbox | 60 | Send | `rewrite-prompt-main-{light,dark}` / AI.2 |
| Review/popover | Complete result preview | Variation counter; history details disclosed | Navigator/original toggle | 60 | Accept | `rewrite-review-main-{light,dark}` / AI.2 |
| File target/popover | Source/destination preview | Mode then plan; excluded spans disclosed | Radio options/run rows | 60 | Send | `rewrite-target-main-{light,dark}` / AI.5 |
| Setup empty/empty state | Connection graphic | Connect external service; repair disclosed | Service card | 30 | Add profile | `rewrite-setup-empty-{light,dark}` / AI.6 |
| Profile setup/first-run step | Named service card | Address/model/key; pricing disclosed but blocking state visible | Labelled fields/status | 40 | Save profile | `rewrite-setup-form-{light,dark}` / AI.6 |
| Consent/dialog | Destination/scope card | Exact egress/charge; policy details disclosed | Badges/estimate card | 60 | Send / Send private text | `rewrite-consent-main-{light,dark}` / AI.6 |
| Settings/section | Active-profile card | Profile/caps; advanced pricing disclosed | Option rows/toggles/fields | 80 | Save settings | `rewrite-settings-main-{light,dark}` / AI.6 |
| History empty/empty state | Variation-stack graphic | Device-local purpose; Help disclosed | Empty-state graphic | 30 | Close | `rewrite-history-empty-{light,dark}` / AI.4 |
| History populated/panel | Selected variation preview | Select/date/status; storage details disclosed | Result rows | 80 | Compare variation | `rewrite-history-list-{light,dark}` / AI.4 |
| History comparison/panel | Original/result comparison | Target freshness; recovery options disclosed | VersionCompare | 80 | Review this variation | `rewrite-history-compare-{light,dark}` / AI.4 |
| Error/cancel/capacity state/popover | State-specific target/status graphic | One repair reason; diagnostics disclosed | Status plus repair button | 60 | Relevant repair / Close | `rewrite-state-{code}-{light,dark}` / AI.6 |
| Preset/profile/history confirmation/dialog | Named item/scope card | Destructive scope; details disclosed | Dialog confirmation | 60 | Explicit action | `rewrite-confirm-{kind}-{light,dark}` / AI.6 |

Any empty variant of settings/list inherits the 30-word/≥80 empty-state gate, not its populated row's threshold. Wording and controls use the canonical inventory. Capture IDs expand per exact named error/confirmation state, never reuse another surface's evidence.

Plan axe with **zero violations** on each surface and meaningful state in light/dark/contrast, including nested widgets, errors, setup/consent and history. Named keyboard journeys: `rewrite-a11y-presets` (add/rename/edit/delete/cancel/export), `rewrite-a11y-settings` (profile/key replace/remove, policy/effect/caps), `rewrite-a11y-history` (compare/stale reselect/create/clear/cancel), `rewrite-a11y-file-modes` and `rewrite-a11y-companion-cycle`. Each proves initial focus, all activations, nested Escape, error descriptions, transition/return focus and no async focus theft. Axe supplements, never replaces, manual keyboard/NVDA/Narrator. Add actual 44 px hit-box checks for fine/coarse pointers and 320-CSS-pixel reflow/sticky-row reachability to gallery journeys. All checks remain **planned**.

WP-AI.2/3/5/6 add fixtures through existing gallery contracts and `packages/ui-runtime/src/gallery.ts`, not bespoke app markup. Catalogue: selected text, whole block/expanded list/table, empty/custom/translated/saved instruction; every disabled reason; sending/delayed-first-token/streaming/each error/cancelled; first/middle/last variation/original; New/Same/collision/private/section plan; setup/consent/unknown price/history empty/stale/clear confirmation. Every control state and each theme/mode has an explicit fixture.

Future capture names `rewrite-prompt-*`, `rewrite-review-*`, `rewrite-target-*`, `rewrite-setup-*`, `rewrite-fresh-*`; register work-package ownership in `apps/desktop/e2e/baselines.ts` and a catalogue in `tools/review/catalogs.mjs`. Review captures at default/480 × 360/1600 × 1000 light/dark plus contrast/motion/200%-text fixtures; 360 × 320 is a fit regression. Freeze fake provider and clock, no live model. Candidate screenshots are not approved baselines; design-system, visual and accessibility reviewers must record evidence before promotion. No app, gallery or capture is run for this spec.

## Decisions

**D-251** owns geometry/focus above; **D-252** owns palette/proof/gallery hypotheses under D-243. **D-250** owns preset/local-history UX in the [experience decisions](../experience/rewrite-with-ai.md#decisions). Provider/privacy approvals remain Proposed (owner), never inferred from an attractive screen. All implementation and tests stay planned behind the work graph.
