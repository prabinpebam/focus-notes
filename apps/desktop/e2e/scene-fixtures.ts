/**
 * The data the site's and the Store's screenshot fixtures are built from (D-437), kept free of Playwright so
 * apps/desktop/test/scene-fixtures.test.ts can guard it: the demo workspace, and the shared project's notes by
 * root. Every published note sits in a project with a public root (its public `notes/`), never under Private
 * (main, 27 November 19:13): only a private-only project shows a published globe under Private, so no fixture
 * makes one.
 */
/** The demo workspace: real writing, nobody's own notes, nothing private. */
export const DEMO_NOTES: Record<string, string> = {
  "On writing slowly.md": [
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
  "Reading list.md": "# Reading list\n\n- [x] Bird by Bird\n- [ ] The Elements of Style\n- [ ] Draft No. 4\n",
  "Garden/Spring planting.md": "# Spring planting\n\nTomatoes go in after the last frost. Basil beside them.\n\n| Bed | Plant | When |\n| --- | --- | --- |\n| North | Peas | March |\n| South | Tomatoes | May |\n",
  "Garden/Compost notes.md": "# Compost notes\n\nGreens and browns, roughly one to two.\n",
  "Journal/Tuesday.md": "# Tuesday\n\nA long walk by the river before work. The first cold morning.\n",
  "Journal/Friday.md": "# Friday\n\nFinished the essay draft. Read it aloud once; cut the second paragraph.\n",
  "Projects/Kitchen shelves.md": "# Kitchen shelves\n\nOak, oiled, three shelves above the counter.\n",
  "Recipes/Lentil soup.md": "# Lentil soup\n\nOnion, carrot, cumin, red lentils, lemon at the end.\n",
};

/** The shared project's name (its pill) and colour (its outline and every accent, D-435). */
export const SCENE_PROJECT = { name: "Notebook", accent: "green" } as const;
/** The fake GitHub account the project is kept under: nobody's real account. */
export const SCENE_ACCOUNT = "maya-chen";
/** The note shared with a link (a private note), and the one published on the project's site (a public note). */
export const SHARED = "Lisbon trip";
export const PUBLISHED = "On writing slowly";
const LISBON = "# Lisbon trip\n\nThree days in October. Tram 28 early, before the crowds; the miradouros at dusk.\n\n- Belém on the first morning\n- Fado in Alfama, Friday\n";

/**
 * The shared project as a Private + Public project: `public` are the files under its public `notes/` (each one on
 * its site, so each carries the globe), `private` the files under `private/notes/` (the shared note among them).
 */
export const SCENE_NOTES: { public: Record<string, string>; private: Record<string, string> } = {
  public: { [`${PUBLISHED}.md`]: DEMO_NOTES[`${PUBLISHED}.md`]! },
  private: {
    ...Object.fromEntries(Object.entries(DEMO_NOTES).filter(([path]) => path !== `${PUBLISHED}.md`)),
    [`${SHARED}.md`]: LISBON,
  },
};

/** The shared project's site, where its public notes are and its shares open. */
export const SCENE_SITE = `https://${SCENE_ACCOUNT}.github.io/notebook/`;