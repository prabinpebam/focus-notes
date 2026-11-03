# Images in Focus Notes

Inline images that stay with the note, fit the writing canvas and remain private when the note is shared.

> [!NOTE]
> **TL;DR.** The owner asks for drag/drop inline images, three display modes, image actions, optional AI captions, crop/rotate, remembered rounded corners and a height-limit toggle. This page first captures the authoritative source exactly; the detailed specification and plan follow in the next committed slice. Specification/planning only: no image files or application code are changed.

## The owner's image notes (3 November 2026)

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

See the [overall direction](../plan/next-direction.md), existing [editor engine](../architecture/editor-engine.md), [content model](../architecture/content-model.md) and [repository/publishing model](../architecture/repository-and-publishing.html). The next slice reconciles their older image/asset assumptions rather than introducing a second storage model.
