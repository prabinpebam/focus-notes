/**
 * The demo's sample notes (WP-10.6, D-177): the same curated workspace the site's screenshots show
 * (apps/desktop/e2e/site-catalog.spec.ts), so the site and the demo match, with a welcome note and a
 * formatting tour. Private notes are under Private/, public ones under Public/, as in a workspace.
 * Real writing, nobody's own notes.
 */
export const DEMO_PRIVATE = "Private";
export const DEMO_PUBLIC = "Public";

/** Paths and texts, the newest first: the first one is the note the demo opens on. */
export const DEMO_NOTES: readonly { path: string; text: string }[] = [
  {
    path: "Private/Welcome to the demo.md",
    text: [
      "# Welcome to the demo",
      "",
      "This is Focus Notes, running in your browser with some sample notes. Everything you write stays in this browser: nothing is sent anywhere, and there's nothing to sign in to.",
      "",
      "## Try these",
      "",
      "- Press **Ctrl+.** (**⌘.** on a Mac) for the toolbar, or click the dot at the top.",
      "- Press **Ctrl+O** for your notes and folders, and **Ctrl+/** to search and act.",
      "- Open [On writing slowly](../Public/On%20writing%20slowly.md) and write a line: focus mode keeps the line you're on clear and lets the rest fade.",
      "- See [the formatting tour](Formatting%20tour.md), or the table in [Spring planting](Garden/Spring%20planting.md).",
      "",
      "Notes under **Private** are yours alone; notes under **Public** are the ones a workspace publishes to its own site. In the desktop app they're saved as Markdown files in your own GitHub repositories.",
      "",
      "**Reset demo** at the bottom puts the sample notes back.",
      "",
    ].join("\n"),
  },
  {
    path: "Public/On writing slowly.md",
    text: [
      "# On writing slowly",
      "",
      "Most of what I write well, I write slowly. Not because the words are hard to find, but because the room around them is loud.",
      "",
      "## The page in front of you",
      "",
      "A good first draft asks for one thing: the next sentence. Everything else can wait. The outline, the title, the doubts about the second paragraph all belong to tomorrow.",
      "",
      "So I keep the screen quiet. One note, one line at a time, and the rest of the page fades back until I'm ready to read it again.",
      "",
      "> Write as if no one will read it, then read it as if someone will.",
      "",
      "## What helps",
      "",
      "- A fixed time, the same each morning",
      "- No tabs, no inbox, no notifications",
      "- Stopping mid-sentence, so tomorrow starts easily",
      "",
      "## Revising",
      "",
      "Revision is where the slowness pays off. When the draft has had a night to settle, the weak sentences stand out on their own, and cutting them feels less like loss and more like tidying a desk.",
      "",
    ].join("\n"),
  },
  {
    path: "Private/Formatting tour.md",
    text: [
      "# Formatting tour",
      "",
      "Notes are plain Markdown, shown as you'd read them. **Bold**, *italic*, `code`, ~~struck through~~, and [a link to another note](Reading%20list.md).",
      "",
      "## Lists",
      "",
      "1. Numbered",
      "2. Lists",
      "",
      "- [x] Tasks you've done",
      "- [ ] And ones you haven't",
      "",
      "## A quote",
      "",
      "> The page is quiet, so you can be loud.",
      "",
      "## Code",
      "",
      "```js",
      "console.log(\"hello\");",
      "```",
      "",
      "Type **/** at the start of a line for everything you can add.",
      "",
    ].join("\n"),
  },
  { path: "Private/Reading list.md", text: "# Reading list\n\n- [x] Bird by Bird\n- [ ] The Elements of Style\n- [ ] Draft No. 4\n" },
  {
    path: "Private/Garden/Spring planting.md",
    text: "# Spring planting\n\nTomatoes go in after the last frost. Basil beside them. See also [Compost notes](Compost%20notes.md).\n\n| Bed | Plant | When |\n| --- | --- | --- |\n| North | Peas | March |\n| South | Tomatoes | May |\n",
  },
  { path: "Private/Garden/Compost notes.md", text: "# Compost notes\n\nGreens and browns, roughly one to two.\n" },
  { path: "Private/Journal/Friday.md", text: "# Friday\n\nFinished the essay draft. Read it aloud once; cut the second paragraph.\n" },
  { path: "Private/Journal/Tuesday.md", text: "# Tuesday\n\nA long walk by the river before work. The first cold morning.\n" },
  { path: "Private/Projects/Kitchen shelves.md", text: "# Kitchen shelves\n\nOak, oiled, three shelves above the counter.\n" },
  { path: "Public/Recipes/Lentil soup.md", text: "# Lentil soup\n\nOnion, carrot, cumin, red lentils, lemon at the end.\n" },
];
