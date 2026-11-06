# Images in Focus Notes

Inline images that stay with the note, fit the writing canvas and remain private when the note is shared.

> [!NOTE]
> **TL;DR.** Drop an image into the note, choose Column / Wide / Actual size, and act on it where it sits. Images are managed local assets, not remote embeds or floating objects. Rounded corners and Limit height are checked menu options; bulk selection changes images, not text. Crop/rotate uses a focused dialog and an explicit destructive save. Optional captions use a chosen existing AI integration, never a model inside Focus Notes. Private shared media encryption remains planned. **Status, 6 November:** showing, the image menu and crop are built; slice 1 now adds paste, drop, `/` Image and Insert image through the native picker in the OFB candidate. Main/Preview evidence remains in the [OFB table](../plan/gate-evidence.md#owner-feedback-batch-6-november-ofb); the other slices are planned in the [readiness assessment](#readiness-assessment-5-november).

> [!NOTE]
> **Design approved (owner, 3 November 2026, 19:39).** Exact words are in the branch's `packages/views/messages/en.json` (`image.` keys; `image.mock.*` is gallery chrome). Mock 9 in the gallery at <http://127.0.0.1:5211>, branch `vq-project-mocks`, is the approved design for inserting, the three display modes, the right-click image menu with Rounded corners and Limit height (one image and a selection), Edit description…, Edit image… (one row of controls), Auto caption with AI… and a writer that can't read images. Not covered and still specification only: [Assets, Markdown and encrypted sharing](#assets-markdown-and-encrypted-sharing), View image history…, and the preparing, missing, saving and read-only states in [States, accessibility and Help](#states-accessibility-and-help).

## The owner's image notes (3 November 2026)

> [!NOTE]
> **Candidate implementation, 3 November.** A standalone Markdown image block now renders through ImageFrame from a local PNG, JPEG, WebP or GIF below the note's folder, without fetching remote embeds. Right-click, the ContextMenu key and Shift+F10 open its menu. Column/Wide/Actual size, Rounded corners and Limit height update image metadata. In the combined `vq-review` candidate, Ctrl+A with an image focused selects the note's text and images through the editor rather than the non-editable image wrapper. The quick look showed mixed settings, hid single-image editing and applied Rounded corners to both images while preserving text and the other display settings. This build combines Files, the local-drive pill and images with the parked sharing dialog; its launcher serves only the disposable sample sharing site. Single-image Edit image uses one row of Left/Top/Width/Height fields and the existing rotate/reset control. Save changes re-encodes PNG/JPEG/WebP after checking that the original bytes have not changed. Cancel leaves the file unchanged. Display settings use a hidden `<!-- image: rounded unlimited wide -->` comment before the Markdown image; unchanged blocks keep their original source. Drag/drop/import, last-used insertion defaults, image history, captions, remote images and encrypted media publishing are not part of this candidate slice.

Word-for-word capture from the second authoritative product-notes file, `images-in-focus-notes.md`, relayed at 13:36. Exact nesting and encoded spaces are preserved. All lines concern Focus Notes product work; none were omitted. The source is never edited, moved or committed.

```text
# Images in Focus Notes&#x20;

We want to support basic image insertion and embedding in Focus Notes.

## How will it work?

- Option to drag and drop and image, the image will always be inline
- Image can have a few display modes
  - Justified to column width, should have a max height defined
  - Extended beyond column width, by a few amount, should have max height defined.
  - actual size with max size limited to the max height and width allowed.
    - This one is meant primarily to allow smaller images to be their actual size
- What are the functionalities we should have for image, to be shown in the right click menu?
  - The usual, Cut, Copy, replace, save image
  - Auto caption using AI
    - Add the caption of the image below the image.
  - Edit image
    - Basic edit capabilities
    - Opens a dialog/modal
    - Option to crop, rotate
    - Destructive image editing, can't be undone to keep it simple, unless we can get the old image back with git version.
  - Toggle/check rounded corner. The last used setting is always remembered for the next image addition.
    - This option should be available while selecting all with text as that would be a way to toggle this for all images in the selection. &#x20;
  - Remove max height limit, it should be a toggle/check option to enable/disable. This should be on by default. The logic of max-height is that images should fit within the most common viewport height so that image are glanceable completely without scroll.
    - Meant to be used when user have an image with a lot of height and they really want to show the full height.
    - This option should be available while selecting all with text as that would be a way to toggle this for all images in the selection.

## What this means?

- figure out folder structure for storing image
- Encryption of images at the time of sharing
- Design and proper UI and UX for basic image image editing dialog.
```

## Promise and boundaries

The images serve fluent editing (CP-FLOW-01), safety (CP-SAFE-01), deliberate sharing (CP-SHARE-01) and chosen AI assistance (CP-RWR-01). [Scenarios SC-IMG-01 to SC-IMG-05](../product/spec/scenarios.md#inline-images-planned) and [UC-IMG-01 to UC-IMG-06](../product/spec/user-can.md#inline-images-planned) trace to the views, design choices and IMG requirements below.

“Inline” means a media block in the note's normal reading flow, anchored between paragraphs, not a floating object, wrap-around picture, background or free-positioned canvas. It is still an ImageBlock registration (EXT-03), not a new editor. Existing Markdown images inside unsupported structures remain byte-preserved; this does not widen table-cell/paste/import support silently. A gallery, drawing, image generation, filters, annotation and remote image hosting are out of scope.

## Inserting an image

1. Drag one or more local PNG, JPEG or WebP images to a visible insertion marker (in the approved mock, a sunken **Drop to insert here** line between paragraphs, inside the column); file drag never moves the source. `/image`, **Insert image…**, and the same command in Spotlight provide the keyboard/file-picker path. **Paste** (Ctrl+V / ⌘V) of an image on the clipboard, such as a screenshot, follows the same validation and inserts at the caret. Dragging an existing image block reorders it, not another import.
2. Resolve a stable document position and write permission. Read-only notes explain why insertion is unavailable. An unsaved standalone note offers **Save note first**; Cancel creates no asset. A `.txt` needs explicit Save as Markdown before inserting formatted media.
3. Validate bytes, decoded dimensions and type in the shell/isolated worker: proposed limits **20 MiB**, **40 megapixels**, at most **20 images per drop**. These are bounded first-release choices, not benchmark results. Extensions/MIME alone are insufficient. Reject animated formats, raw SVG, corrupt/unsupported or oversized input with **“This image can't be added. Use a PNG, JPEG or WebP under 20 MB.”** Keep the note/source unchanged. Project SVG logos follow their separate passive-SVG policy.
4. Copy into the current note's managed asset area using an opaque random name; never link to the original absolute path. Stage all files before inserting the batch in input order as one undoable note edit. An invalid/read-failed member aborts the batch: **“3 of 5 images couldn't be read. Nothing was added.”** with **Choose images…**; do not silently insert a subset. Typing can continue while preparation runs; rebase the captured insertion position, and cancel explicitly if its target was deleted or the note closed.
5. Commit asset files before note references become durable. Failed asset/note writes roll back the insertion and retain the original sources/draft; recovery reconciles an interrupted transaction. No dangling reference or silent empty asset. Undo removes inserted nodes/captions, not the original external files; retained managed files are not automatically purged.

Reopening a note never imports, moves or rewrites assets. Remote image URLs in existing Markdown do not trigger fetching or upload; show **Remote image not loaded** and a documented explicit local-image replacement path. No URL drop turns into a network request. Existing local relative images may be displayed only within the trusted note/asset boundary; traversal, symlinks outside it and arbitrary file URLs are refused.

## Three display modes

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 340" role="img" aria-labelledby="fnimg-modes__title fnimg-modes__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnimg-modes__title">Column, Wide and Actual size keep images in the reading flow</title>
<desc id="fnimg-modes__desc">Three cards compare image width against a centered text column. Column uses the reading-column width; Wide extends into available side space; Actual size keeps a small source small. All preserve aspect ratio and fit the height by default. A caption follows the image.</desc>
<g id="fnimg-modes__cards" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnimg-modes__column" x="24" y="24" width="300" height="284" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<rect id="fnimg-modes__wide" x="350" y="24" width="300" height="284" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<rect id="fnimg-modes__actual" x="676" y="24" width="300" height="284" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="62" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-modes__column" data-slate-fit-padding="16">Column</text>
<text x="370" y="62" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-modes__wide" data-slate-fit-padding="16">Wide</text>
<text x="696" y="62" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-modes__actual" data-slate-fit-padding="16">Actual size</text>
<g fill="var(--color-neutral-fg-3)">
<rect x="74" y="88" width="200" height="4" /><rect x="400" y="88" width="200" height="4" /><rect x="726" y="88" width="200" height="4" />
<rect x="74" y="232" width="200" height="4" /><rect x="400" y="232" width="200" height="4" /><rect x="726" y="232" width="200" height="4" />
</g>
<g fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-2)">
<rect x="74" y="116" width="200" height="96" /><rect x="370" y="116" width="260" height="96" /><rect x="784" y="134" width="84" height="60" />
</g>
<text x="44" y="278" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnimg-modes__column" data-slate-fit-padding="16">Reading-column width</text>
<text x="370" y="278" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnimg-modes__wide" data-slate-fit-padding="16">Beyond text; inside canvas</text>
<text x="696" y="278" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnimg-modes__actual" data-slate-fit-padding="16">Small sources stay small</text>
</g>
</svg>
<figcaption>Illustrated layout rules, not screenshots. Shapes stand for images; no crop is implied by a display mode.</figcaption>
</figure>

| Mode | Width cap | Result |
| --- | --- | --- |
| Column (default) | Reading column (`layout.measure`) | Fit proportionally inside the column and height cap; a tall image may be narrower, never cropped/stretched to fill both. |
| Wide | Smaller of column + **8 rem** and `layout.wideContent`, always inside canvas minus gutters | Centered on the reading column, not under Files/overlays; collapses to Column when no extra space exists. |
| Actual size | Intrinsic decoded width, capped by the available reading-column width | One intrinsic image pixel per CSS pixel at 100% zoom, no upscaling; a small image remains small. Height fitting may shrink it further. |

The proposed tokenized **Limit height** cap is the smaller of **36 rem** and **70% of the usable viewport height** (excluding application chrome). Width/height are solved together with contain/aspect ratio; no scrolling inside the image. Unchecking Limit height removes only the vertical cap: width remains bounded and the page scrolls normally. A 320 px viewport never gets horizontal image overflow. Zoom/text changes recalculate geometry; stored media attributes do not record window pixels.

**Source ambiguity resolved (D-300):** “Remove max height limit … on by default” conflicts with the stated goal that a whole image is glanceable. Use the positive checked label **Limit height**, **on by default**; uncheck to show a very tall image at full proportional height. This reversible copy/default is recorded rather than blocking on a wording question.

## Image menu and selection

**Menu candidate, 6 November (D-370):** Cut/Copy now transfer pixels plus safe description/caption without an asset path; Cut removes only after clipboard success. Replace imports one new managed asset at the mapped image position, retaining words and display choices. Save image exports a separate PNG through the native Save dialog with overwrite confirmation, using an atomic sibling write. Rounded corners and Limit height are remembered in serialized device-local state; a failed defaults write keeps the previous insertion defaults and reports it. Local Menu verification is recorded in [gate evidence](../plan/gate-evidence.md#inline-images-menu-6-november); exact-head CI and landing remain required.

**This is a text editor, not app UI** (owner, 3 November 2026; D-326): "Don't show 3 dots menu above the image. This is a text editor not app UI. You right click on the image to get that menu." The image menu opens only as a context menu at the pointer: **right-click** the image, or press the keyboard's context-menu key or **Shift+F10** while the image is selected. No ⋯ button, hover toolbar or overlay button. At rest and on hover, no border or frame; selection is the exception below.

**Owner correction, 5 November 2026 (supersedes D-326's selection-only tint for a single image):** "For adding image there was a version where I asked for 2 toggles to be added to the image menu. - Rounded corners: on/off - Limit height: on/off. We need to add these. These are there in the several images selected menu but even this one gets it wrong. The right click menu when text and images are selected together should show the normal text options and the additional image options, provided images are part of the selection. So the menu shows the options available for the selection. I should be able to select an image by clicking on it to select it showing the slection border and should be able to delete it by pressing the delete key."

The approved reference is **9 · Images**, 3 November, `vq-project-mocks` at `4afe907f` (review at <http://127.0.0.1:5211>). A single image's menu has **Edit image**, a **Display** group with **Column / Wide / Actual size**, then a separate group with **Rounded corners / Limit height**. Several images expose only those two toggles under **Images · 2 selected** (with the actual count). A mixed selection retains its normal text actions and appends that image section, whether right-clicked over text or image pixels.

Selecting an image or right-clicking a selection does not scroll it into the following text's reading band. The menu stays at the requested pointer location; scrolling intentionally dismisses it as it does the normal text menu.

- **No placeholder** (owner): "Why is there 'No description' text under the image? If it's not there don't show it." With no description or caption, nothing shows under the image; a caption line shows only when the Markdown has one.
- **No resting border** (owner): "Do not add border around the image." None at rest or on hover.
- **Click selects the image** (owner, 5 November): a single image gets a full inset accent outline (`cmp.imageFrame.selectedOutline` / `selectedOutlineWidth`), never clipped by the frame. Focus stays in the editor: **Delete** or **Backspace** removes the reference, not the asset; **Ctrl+Z** restores it. **Escape** returns to the adjacent text. The selection is politely announced with the description, if present.
- **Text selection is the editor's** (D-326): an image inside a text selection takes the normal selection tint over its pixels (`cmp.imageFrame.selectedTint` → `color.selection`), the way selected text does. It does not get the single-image outline.
- **Transparent images as they are** (owner): "Leave transparent images as is without border and bg color." No backdrop, fill or checkerboard behind transparent pixels, in light or dark.

| Group | Action | Contract |
| --- | --- | --- |
| Clipboard | **Cut**, **Copy** | Copy selected image pixels plus safe rich image representation/alt/caption, not private absolute paths or secrets. Cut removes the node only after clipboard success, one normal note Undo; never deletes the asset/source file. Failure says **“Couldn't copy this image. Try again.”** and keeps it. |
| File | **Replace image…** | Picker imports a new managed file at the same position; retain caption, alt and display choices until explicitly edited. Undo restores the previous reference; never overwrite the selected external file. |
| File | **Save image…** | OS Save dialog writes an explicit copy of the current decoded asset at the chosen destination; Cancel changes nothing, taken destination asks before overwrite. No silent name/path disclosure through clipboard metadata. |
| Words | **Edit description…** | Opens a small dialog with **Image description** (alt text) and **Caption**, both plain text; one undoable edit. A dropped image starts with an empty description, shows nothing in its place (no hint or placeholder) and is read as decorative until described. Sharing or publishing a note with undescribed images lists them once (**2 images have no description**) with **Describe** / **Continue**; it never blocks. |
| Words | **Add caption** / **Edit caption** | Puts the caret in the caption line directly below the image; typing there is ordinary editing. Removing all its text removes the caption. |
| Assistance | **Auto caption with AI…** | With the AI (sparkle) icon used by Rewrite. Opens the caption flow below for this image only. No sending from menu open or hover. |
| Pixels | **Edit image…** | Crop/rotate dialog; separate destructive save, not a display mode. |
| Display | **Column**, **Wide**, **Actual size** | Single-choice checked/radio menu; one normal undoable note transaction. |
| Look (separate group) | **Rounded corners**, **Limit height** | Check items in the image's right-click menu (owner, 3 November 19:28; D-334: "We need this in the right click menu, else how will the user control these parameters."), drawn by the menu's own check column, not colour alone. Rounded corners starts from the last used setting; Limit height is on by default and caps the image at the common viewport height, off shows a tall image at full height. Toggling one changes the image at once. Both are remembered device-locally for the next image added; each existing image keeps its saved values. |

A text selection containing images (for example Ctrl+A) exposes an **Images** group in its right-click menu with the same two check items. Rounded corners / Limit height act on every fully selected image, leaving text, captions and unselected images untouched. When the images disagree the item shows the mixed state (a dash in the check column, announced **Mixed**); first activation sets all on, next sets all off. One undo step restores all prior values. Bulk changes also update the remembered insertion default after a successful save; failed persistence keeps the saved default and says so. With no selected images these controls are absent. Crop, Replace, Save image and AI caption require exactly one image; no arbitrary first-image fallback.

Selection-only, insertion Undo, replacement Undo and display Undo remain ordinary editor behaviour. The crop/rotate pixel save below deliberately has no pixel Undo.

**Commit feedback:** the toggles edit the note in one undoable editor transaction, like text formatting. The image changes in the same frame and a polite announcement says **Rounded corners on/off** or **Limit height on/off**; note saving keeps its existing status and recoverable error handling. These document edits never lock continuous writing and do not invent a separate settings-save spinner.

## Crop and rotate dialog

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 390" role="img" aria-labelledby="fnimg-edit__title fnimg-edit__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnimg-edit__title">A focused edit dialog keeps a disposable preview until Save changes</title>
<desc id="fnimg-edit__desc">The large preview contains a crop rectangle. Below it, one row holds the Left, Top, Width and Height number fields and one segmented group of Rotate left, Rotate right and Reset. The footer explains that saved pixel changes cannot be undone, and offers Cancel and Save changes. No disk write happens while adjusting the preview.</desc>
<g id="fnimg-edit__frame" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnimg-edit__preview" x="24" y="24" width="570" height="250" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="62" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__preview" data-slate-fit-padding="16">Edit image · preview only</text>
<rect x="84" y="88" width="440" height="158" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-2)" />
<rect x="144" y="106" width="310" height="122" fill="none" stroke="var(--color-neutral-fg-1)" stroke-width="2" stroke-dasharray="6 4" />
<rect id="fnimg-edit__controls" x="618" y="24" width="358" height="250" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="638" y="62" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__controls" data-slate-fit-padding="16">Crop and rotate</text>
<text x="638" y="106" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__controls" data-slate-fit-padding="16">Crop · Rotate left · Rotate right</text>
<text x="638" y="148" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__controls" data-slate-fit-padding="16">Left · Top · Width · Height</text>
<text x="638" y="194" font-size="17" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnimg-edit__controls" data-slate-fit-padding="16">Reset returns to opened pixels</text>
<rect id="fnimg-edit__footer" x="24" y="298" width="952" height="64" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="337" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__footer" data-slate-fit-padding="16">Saved changes cannot be undone. Git history may keep an older version.</text>
<text x="712" y="337" font-size="16" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnimg-edit__footer" data-slate-fit-padding="16">Cancel · Save changes</text>
</g>
</svg>
<figcaption>Dialog regions and commit boundary. In the dialog itself the crop fields and the rotate-and-reset group sit on one row under the preview (D-327).</figcaption>
</figure>

1. Decode a bounded working preview; keep the note and old image intact while it loads. The dialog title is **Edit image**; cropping is always on (there's no Crop button) and focus begins on the **Left** field. No external editor/app starts.
2. **One row of controls** (owner, 3 November 2026; D-327): "Fit all image parameters and btn controls in a single row. The btn controls should be a segmented control group." Under the preview, **Left**, **Top**, **Width** and **Height** are compact number fields (`TextField` `width: number`, labels above in the field-label style) followed by one segmented group (`SegmentedControl` `actions`): **Rotate left** and **Rotate right** as icon segments, each with its accessible name and tooltip, then **Reset**. The fields and the group are the same height and share one baseline; at the default dialog width all of it fits on one row, and only below about 600 px does the group wrap under the fields. The crop rectangle has draggable handles with 44 px targets; the numeric pixel fields take Arrow and Shift+Arrow adjust by 1 and 10 px; dimensions must be positive and inside the rotated image. **Rotate left** / **Rotate right** turn 90°; four turns restore the preview. Orientation metadata is applied once before editing; no duplicate rotation. **Reset** restores the opened pixels, not a saved historical original.
3. The footer says **“Saved changes cannot be undone. Git history may keep an older version.”** In non-Git Local notes/standalone contexts say **“Saved changes cannot be undone. This file has no Git history.”** Save changes stays enabled; when nothing changed it says **Nothing to save yet**, and an invalid crop names the field in error. Cancel/Escape discards only this unsaved preview and returns focus/selection to the image; no dirty-image prompt is needed because nothing was saved.
4. **Save changes** explicitly commits the destructive pixel edit. Use a staged, atomic encode/write and external-version guard; never truncate the live file first. For a uniquely owned managed asset, replace its bytes; if referenced elsewhere, first detach this selected instance into its own managed copy so other notes do not change. Read-only/external unowned assets require an explicit managed copy, never overwrite an external source. Preserve alt/caption and layout.
5. A changed-on-disk image refuses overwrite with **“This image changed outside Focus Notes. Reopen it before saving your edit.”** Encode/write failure keeps the old pixels and editable preview with **“Couldn't save this image. Try again.”** On success swap the complete image without a blank frame and close. Undo never pretends to restore old pixels; ordinary text history remains usable and does not restore stale image references over the destructive save.

For versioned assets **View image history…** offers existing Git history. Recovery is possible only if a prior version was committed, not promised for an uncommitted import or non-Git file. A later explicit restore is a new write, not pixel-edit Undo. No in-place deletion/migration of the owner's real assets is part of this specification.

## Auto caption using AI

**Auto caption with AI…** is labelled as AI everywhere (owner, 3 November: "Auto caption should indicate it's going to be done by AI."): the menu item and the dialog title **Auto caption with AI** carry the AI icon, and the dialog names the connected AI that writes it, with integration/model identity and This computer / Cloud disclosure. Show only explicitly image-capable existing integrations; do not infer vision from a model name. If the chosen Writer cannot accept images, retain it for rewriting and offer **Choose integration** for this one caption action, or **Write caption**. No silent fallback, connection, upload, download or hosted model.

**Landed implementation (D-371, 6 November):** Auto caption landed at `8ad6f003` after every job passed in [Windows CI 42227925414](https://github.com/prabinpebam/focus-notes/actions/runs/42227925414). The connected Ollama endpoint must report `vision`; an OpenAI-compatible model list must explicitly report `image` input for the saved model. Unknown/missing metadata is not image support, and failed checks are named in the dialog with reopen/manual recovery. Caption selection is temporary and never changes the Writer. The renderer makes a metadata-free PNG at most 2,048 pixels per edge and 5 MiB; the shell rechecks the bounds. Generation has its own cancelable stream. Use caption checks both the original source bytes and the exact mapped immutable image node; stale results remain editable/copyable but cannot be applied. The local fake-integration journey measures the actual transmitted PNG bounds and verifies preview, editable words, saved caption, exact Undo, reopening and Stop. Scheduled Preview has not been independently inspected for this row.

Show the selected image thumbnail, editable instruction **“Write a short caption for this image.”**, integration/model/destination and **Generate caption** / Cancel. Generate sends only this image and that instruction using the supported image request, not the surrounding note, path, title, other assets, EXIF/GPS or secrets. Use a metadata-stripped bounded raster payload; no public upload URL or new network destination. Follow the existing no-extra-first-send-consent rule, not a new privacy wall; the explicit Generate action and visible destination are the control.

Progress says **Writing caption…**, with Stop; retain the image/note and any existing caption. Review the generated plain text in an editable caption field directly below the preview, with **Use caption**; no automatic replacement of existing words. Bind the request/result to the image identity/version; if it changed or was deleted, keep the result for manual copying and offer regeneration, never apply to a different/stale target. Generated markup is text, never an executable directive, URL fetch or command. Use caption inserts/replaces the image's caption directly below it as one undoable edit; failed/stopped generation changes nothing. Undo restores an existing caption exactly. Captions are not automatically alt text; **Image description** remains a separate editable accessibility field so readers do not hear the same words twice.

With nothing selected, the same Ctrl+Enter prompt writes at the caret (**Write with AI**), and says **“Only your prompt is sent, not the note. The answer goes in at the caret.”** (approved mock 8, D-282).

## Assets, Markdown and encrypted sharing

**Slice 1 candidate (D-360):** still PNG, JPEG and WebP files are copied only after every file passes byte, pixel, format and decoder checks. Limits are 20 MiB each, 40 megapixels and 20 images per batch. Source files are unchanged; failed batches create no managed asset files. New references carry validated `size=640x360` metadata in the existing hidden image comment, reserving their intrinsic box during reads and Retry. Imports track the insertion point through typing; switching notes or deleting that target cancels insertion and removes the unused copied files. Existing images without size metadata retain their exact original Markdown. Toolbar placement is part of Customize toolbar integration, not a second insertion engine.

Header/byte/pixel caps run in the shell before decoding. The requesting renderer then uses Chromium's asynchronous image decoder on the sanitized temporary bytes and verifies the decoded dimensions match the validated header, before any managed write. Decode cancels after 10 s with a named refusal, preserving the note and creating no managed asset. It creates no window and does not use OS thumbnail handlers: Windows CI proved those handlers can reject a valid WebP that Chromium decodes. The built WebP journey disables the OS thumbnail API, verifies rendered pixels and metadata-free normal Git blobs, and restarts the app to check the saved image. Insert image and Insert table are available in toolbar overflow and Customize toolbar without changing the six defaults, and in the native macOS Edit menu through the same command registry and availability rules.

The public-repository boundary applies already during insertion, not only in the later publishing slice (D-365): managed copies for public-root GitHub project notes discard ancillary source metadata before any asset write or Git commit. Raster pixels, colour profiles and a minimal orientation-only EXIF record are retained; location, camera/author fields, XMP, text/comments, thumbnails and trailing data are not. Private, explicitly offline/synced and standalone copies remain byte-identical. A project with unknown provenance takes the conservative public-copy policy. Linking or publishing existing offline media still belongs to the later publication slice and must sanitize it before public staging.

| Context | Managed storage | What stays unchanged |
| --- | --- | --- |
| Project private note | Private repository `assets/images/<random-id>.<ext>` | Source file and current private/public repository layout |
| Explicitly public note | Paired site repository `assets/images/<random-id>.<ext>` | Only deliberately published note/media; no private sibling copy |
| Local notes | Local notes root `assets/images/<random-id>.<ext>` | Local only; no GitHub claim or implicit import |
| Standalone Markdown | Adjacent `<full-note-filename>.assets/images/<random-id>.<ext>` | Explicit local sidecar creation on insertion, not on open; note saves in place |

> **Flagged (5 November, D-pending):** the owner wrote "Inserting image create a folder beside the file with the image file in it." That reads as one folder with the image directly inside it. The proposal is to flatten the standalone row to `<full-note-filename>.assets/<random-id>.<ext>`, which waits for the owner because it changes a planned path. The Local notes row depends on the Local notes decision in [One concept: Project](project-model.md#reconciling-the-existing-specs).

The folder is a media area at its owning repository/local root, not an `assets` folder created beside every nested note. Use at least 128 random bits for managed asset IDs, collision-check and regenerate; extensions follow validated raster type, not source names. References are relative from the note; moves rebase them transactionally. Existing asset paths continue to resolve, with no mass relocation. Renaming a standalone note may retain its existing sidecar name/references; Save as/copy carries referenced media into the destination sidecar, never deletes the original. Copying/importing a note between roots copies referenced authorized media first, updates only destination references and keeps the original; Private → Public still needs the ordinary visibility confirmation. A reference shared by notes is not permission to publish those other notes.

**Same-root note moves and renames (WP-9.3 / IMG-05, implementation under validation):**

| Step | Safety rule |
| --- | --- |
| Check | Resolve each referenced local image, including image-reference definitions, inside the canonical visibility boundary. A missing image refuses the move before the note changes; junctions cannot reach another root. |
| Stage | Publish the complete, flushed destination Markdown without replacing a file. Only relative destination characters change; titles, descriptions, display comments, attributes and line endings stay intact. Managed public/private media use their owning `assets/images/` boundary. |
| Finish | Keep the old note until all batch rewrites succeed, then remove its old directory entry. An interrupted staged move leaves both usable notes rather than a moved note with broken image links. No image bytes or sidecars are moved, renamed, flattened or deleted. |
| Undo or recover | Move Undo rebases references back; Rename Undo restores the exact old filename. Refused rollback never overwrites an external edit: retain copies and tell the person to review both folders in Files before retrying. |

This slice covers individual note moves within one root, explicit file rename and title-following rename. Existing folder-batch behavior is unchanged. Cross-root asset copies and standalone Save as/copy remain separate pending slices; publishing and encrypted sharing are not part of this implementation. Files move/rename and Undo use the shared task tracker, with [named wait measures](../architecture/perceived-performance.md#image-preserving-note-moves).

Images are written as **standard Markdown images** (D-310), so GitHub and every other viewer still show the picture. The description is the alt text, the caption is the image title, and only non-default display options go in a hidden comment line just before it (D-347, the same convention as `<!-- table: -->`):

```markdown
<!-- image: wide rounded unlimited -->
![A desk beside a window](../../assets/images/q7m4k2.png "Morning light")
```

A default image (Column, square corners, Limit height on) is plain `![description](path "caption")` with no comment. GitHub and other viewers hide the comment and show the picture. Existing images are preserved byte-for-byte until edited; an explicit change rewrites only that image. The earlier `::image{…}` leaf directive is not written, because a plain viewer shows it as text, not a picture (CP-OWN-01); an existing one is still read. Unknown attributes, directives or unsupported structures remain verbatim/read-only rather than being dropped. Plain viewers show the image and its caption on hover; they don't apply the display options or show the comment. Structured editor data is a projection, never a second source of truth. No arbitrary HTML/CSS or remote URL attribute.

**Sharing images is part of sharing the note.** Compute the exact authorized note → media reference closure, deduplicate within that grant, authenticate/encrypt every selected private image and its media lookup/alt/caption before public staging. Public asset names, grant code, encrypted manifest paths and image URLs are opaque random identifiers (SHR-23), never original names/hashes/paths. No private plaintext thumbnail, source metadata or EXIF sidecar in public Git, artifacts, indexes or logs. Seal before copying into public checkout; reader decrypts authorized images into memory/blob URLs, releases them on close/sign-out and makes no plaintext service-worker cache. Missing/forbidden media blocks that publication with an explicit repair action; never “share ready” with dropped images.

Published plaintext images are deliberately public. Strip ancillary location/source metadata from the managed public copy **before public source-asset commit as well as deployment**, preserving visual orientation/colour and leaving the external/private original unchanged. Do not copy all of `assets/`: publish only referenced permitted media, keep app fonts/styles in their separate allowlisted runtime asset set. Withdrawal/Turn off removes current shared/published media on next successful publication, not past Git history or downloaded copies (owner-accepted D-274/D-299). No automatic orphan deletion or image optimizer rewriting unrelated assets.

### Print and Save as PDF

Printing a note prints its images (D-348, IMG-12), which amends D-230's earlier exclusion. Each image keeps its display mode but is capped to the text width and the page height, is never split across pages, and has its caption below it. A missing image prints its description in muted italic. Before the system's print dialog opens, the bottom pill shows *Preparing images for print…* until every image is decoded, so no page prints with a blank space.

**Built (WP-9.8).** Print snapshots read only the note's local image references through the existing bounded image reader; repeated references are read once, and the note and source files are not rewritten. The hidden print layout renders pixels, caption and description through NoteContent, with proportional page-sized bounds and no page break inside the image group. When a missing or undecodable image has no description, paper says *Image unavailable*. Preparation uses the task tracker and `fn:image.print`; its pill offers **Cancel**, which keeps the note and never opens the print dialog. The system's Print and Save as PDF use the same prepared layout.

The invisible `image-print.spec.ts` journey inspects actual portrait and landscape PDFs: a transparent inline image, an unlimited tall image, a wide captioned image and a missing image. It checks each image's page, raster dimensions, proportional bounds inside the 0.75 in margins, captions and missing description, confirms decoding before PDF submission and verifies unchanged Markdown. Related core, print-rendering and decode-barrier units cover read failure and cancellation; [IMG.12 evidence](../plan/gate-evidence.md#inline-images-print-and-save-as-pdf) records the gate.

### Size and Git

Images are kept in normal Git, each at most 20 MiB (IMG-01), well under GitHub's 50 MiB warning and 100 MiB block for one file. Git LFS isn't used: it adds a separate storage and bandwidth quota on the owner's account and extra steps for GitHub Pages. Whether to keep it that way is owner question I1 in the [readiness assessment](#readiness-assessment-5-november).

## States, accessibility and Help

The ImageBlock, image menu, edit dialog and caption surface use sealed primitives/compounds and JSON view contracts, not feature-local markup/styles. Proposed tokens own width extension, height cap, image radius and preview sizes; defaults are reversible. No new packages, schemas or tokens are implemented in this slice.

| State | Visible/accessible behaviour |
| --- | --- |
| Preparing/importing | Reserve the aspect-ratio box; **Adding image…** or **Adding ⟨count⟩ images…**; no false Saved before assets and note are durable. |
| Missing/corrupt reference | Reserved box with alt/description and **Image unavailable**; Replace image… / Locate image… when allowed, never delete the directive. |
| Editing/saving | Keep old pixels until the complete new image is ready; **Saving image…** only past the responsive delay; prevent duplicate commits, keep Cancel safe until committing. |
| Caption unavailable/error | Clear reason, chosen integration retained, retry/manual caption available; original caption/note untouched. |
| Read-only share/site | Display only; no edit, crop, AI, filesystem path or owner context menu. |
| Keyboard/screen reader | Focus image as one block; its context menu is named **Image options**; the context-menu key, Shift+F10 and ordinary text navigation work; crop fields provide a non-drag path. Alt describes the image; captions use figure/caption semantics, not duplicated accessible text. |
| Mixed selection | Announce number of selected images and Mixed checked state; changing image options leaves selected text byte-equivalent. |
| Light/dark/contrast/narrow | Token focus/checked states in menus and dialogs, 44 px controls, reduced motion; intrinsic pixel colours never theme-inverted. Transparent images are drawn as they are, with no backdrop, border or checkerboard, in light and dark (D-326). Fit within 320 px with no horizontal scrolling. |

**Help copy:** “Drop an image into your note or choose Insert image. Column fits the text, Wide uses extra space, and Actual size keeps small images small. Turn off Limit height for a tall image. Crop and rotate change the saved image and cannot be undone; Git history may have an older version. Sharing a private note encrypts its images too.”

New waits are in the [wait inventory](../architecture/perceived-performance.md#image-waits-planned); thresholds are feedback targets, not measured speed claims. [Risks](../plan/risks.md#image-risks-and-assumptions) and [image done rows](../plan/definition-of-done.md#inline-images-planned) name future evidence, not tests run now.

## Readiness assessment (5 November)

The owner asked (5 November) what is done and pending for adding images, and whether the spec is enough to build it. This is the answer; the owner gives the go-ahead before any slice starts.

**Built on `main`** (candidate slices from 3 November, WP-9.1 and WP-9.4 now *building*):

| What | Where | Requirements | Tests |
| --- | --- | --- | --- |
| Show a local PNG, JPEG, WebP or GIF in the note, confined to the note's folder, 20 MiB read limit | `packages/editor/src/image-view.tsx`, the ImageFrame primitive, `apps/desktop/src/main/main.ts` (image read and atomic write) | IMG-02, IMG-11 | `packages/core/test/images-app.test.ts` (partial) |
| Column, Wide and Actual size, Rounded corners, Limit height, mixed selection, Edit image… in the right-click menu | `packages/core/src/images-app.ts` | IMG-02, IMG-03, IMG-04 | `images-app.test.ts` |
| Hidden `<!-- image: … -->` options read and written | `packages/markdown/src/index.ts`, editor node attributes in `packages/editor/src/index.ts` | IMG-10 (D-347) | none for images yet |
| Crop and rotate preview, save with an original-bytes guard | the Edit image dialog | IMG-07, IMG-08 | none |
| Missing or broken image placeholder with Retry | `image-view.tsx` | IMG-11 | none |
| Relative image links resolve | `packages/core` links | IMG-05 | `links.test.ts` |

**Pending:** paste, drop, Insert image…, /image and Spotlight (`packages/editor/src/paste.ts` deliberately leaves images out); managed `assets/images/` storage with random names and link rebasing on move or copy; remembered defaults; Cut, Copy, Replace image…, Save image…; Edit description… and Add caption; AI caption; print with images; images in published notes with metadata stripped; encrypted images in shares; the image round-trip corpus and a journey.

**Gaps found and filled here:** the written format contradicted the code (fixed in favour of the code, D-347); print excluded images with no plan (D-348, IMG-12); published images had no requirement of their own (IMG-13); adding images sat inside WP-9.1 with no smallest slice (WP-9.7, D-349); the size and Git policy was unstated ([Size and Git](#size-and-git)); WP-9.1 and WP-9.4 were marked planned though partly built. Risks R-40 to R-55 in [risks](../plan/risks.md#image-risks-and-assumptions) still stand, the highest being encrypted media closure and destructive saves; slice 1 touches neither.

**Verdict: specified enough to build slices 1 to 4** (each has observable [Definition of Done rows](../plan/definition-of-done.md#inline-images-planned) with evidence and a Try it: IMG.11, IMG.9, IMG.3, IMG.12). Slice 5 waits for the publishing answers; slices 6 to 8 are specified but carry the open risks.

**Slices, smallest visible first (D-349):**

1. **Add an image** (WP-9.7 with WP-9.3's storage core): paste, drop, Insert image…, /image, Spotlight into `assets/images/`. The insertion design is already approved (mock 9's **Insert** tab: the drop marker, a dropped image, a refused 30 MB TIFF and a batch with damaged files), so no new mock is needed. About a day.
2. **Describe it:** Edit description… and Add caption (WP-9.1). Small.
3. **The rest of the menu:** Cut, Copy, Replace image…, Save image…, remembered defaults (WP-9.1). About a day.
4. **Print** (WP-9.8, D-348). Small.
5. **Published images** (WP-9.9, IMG-13), after publishing slice 2. About a day.
6. **AI caption** (WP-9.5). About a day.
7. **Moves, copies and standalone sidecars** (the rest of WP-9.3). About a day.
8. **Encrypted images in shares** (WP-9.6). Several days.

**Owner approval (5 November):** "I'd already approve the UI and UX for the image insertion. Launch that demo again." The owner re-confirmed the 3 November approval of mock 9 (D-pending). The demo is the approved gallery build of `vq-project-mocks` at `4afe907f`, served at <http://127.0.0.1:5211> → **9 · Images**. **6 November, D-360:** the owner gave the implementation go-ahead; slice 1 is the OFB candidate described above.

**Owner questions:**

- **I1, resolved (D-360).** Normal Git, 20 MiB per image, no Git LFS.
- **P3** (shared with publishing). When a note with images is published, publish its images as public files with location and camera metadata removed? Or can such notes not be published yet? See [Published website → Readiness](published-site.md#readiness-assessment-5-november).

## Design decisions and source map

| Decision | Choice and rationale | User can | Requirement |
| --- | --- | --- | --- |
| DD-IMG-07 / D-310, D-347 | Standard Markdown image with title caption; non-default options in a hidden `<!-- image: -->` comment line before it, never a leaf directive | UC-IMG-06 | IMG-10 |
| DD-IMG-01 / D-300 | Inline media block, three bounded proportional modes; no floats or image crop as layout. Positive Limit height resolves contradictory wording; defaults are reversible. | UC-IMG-01, UC-IMG-02 | EXT-03, IMG-01, IMG-02, IMG-03 |
| DD-IMG-02 / D-301 | Root-owned managed assets, relative references, exact encrypted closure with opaque public names; reuse the repository model instead of a media server. | UC-IMG-04, UC-IMG-06 | IMG-05, IMG-06, IMG-10, SHR-23 |
| DD-IMG-03 / D-302 | Contextual actions and mixed-selection checkable options (`menuitemcheckbox`, with a Mixed state); text and original source files stay untouched. | UC-IMG-01, UC-IMG-02 | IMG-03, IMG-04 |
| DD-IMG-04 / D-303 | Explicit image-capable integration and reviewed caption, no surrounding-note context or automatic model fallback. | UC-IMG-05 | IMG-09 |
| DD-IMG-05 / D-304 | Crop/rotate in a preview dialog; explicit destructive atomic save, no pixel Undo; existing Git history is conditional recovery, never a promise. | UC-IMG-03 | IMG-07, IMG-08 |
| DD-IMG-06 | Shared/published/editor use one image rendering contract, with safe placeholders and keyboard alternatives. | UC-IMG-06 | IMG-10 |

The source's storage/encryption/editing questions are answered above; every menu item, display mode, remembered/bulk toggle and caption line is covered by these rows. Existing [content model](../architecture/content-model.md#components), [editor registry](../architecture/editor-engine.md#planned-inline-image-registration), [editing/paste](editing.md#planned-inline-images) and [publishing/assets](../architecture/repository-and-publishing.html#image-assets-planned) point here. The original source capture remains unmodified.
