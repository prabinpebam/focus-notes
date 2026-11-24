/**
 * The account and sync recovery alert (FRE-13, G5.4, D-213, UC-SAFE-10), strict design over fake data.
 * Spec: documentations/experience/notes-folder.md (Out of sync; What the corner and the Files header say).
 * Writing carries on while the notes folder is there; the corner's save state and the Files header carry the
 * same warning, and both open one card naming the cause, what differs, the facts and the action. Nothing is wired.
 */
import data from "./data.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

const get = (path: string) => ({ get: path });
const empty = { type: "Text", props: { value: get("vm.recoveryAlert.copy.empty"), tone: "muted" } };

type Card = (typeof data.cards)[number];
const flagged = (c: Card) => ({
  ...c,
  hasProgress: c.progress > 0, hasPrimary: c.primary !== "", hasSecondary: c.secondary !== "", hasNotNow: c.notNow !== "",
  hasActions: c.primary !== "" || c.secondary !== "" || c.notNow !== "",
});

// One card on the shared IconLayout (D-408): the mark alone in the first column; title and line, progress and
// the facts in the second; the actions at the trailing edge, primary last (D-374).
const cardBody = (c: string) => ({
  type: "IconLayout",
  slots: {
    icon: [{ type: "StepMark", props: { icon: get(`${c}.icon`), size: "compact", tone: get(`${c}.tone`), busy: get(`${c}.busy`) } }],
    heading: [
      { type: "Heading", props: { value: get(`${c}.title`), level: "2" } },
      { type: "Text", props: { value: get(`${c}.line`) } },
    ],
    actions: [
      { type: "Button", when: get(`${c}.hasNotNow`), props: { label: get(`${c}.notNow`), variant: "subtle" } },
      { type: "Button", when: get(`${c}.hasSecondary`), props: { label: get(`${c}.secondary`), variant: "secondary" } },
      { type: "Button", when: get(`${c}.hasPrimary`), props: { label: get(`${c}.primary`), variant: "primary" } },
    ],
  },
  children: [
    { type: "ProgressBar", when: get(`${c}.hasProgress`), props: { value: get(`${c}.progress`), label: get(`${c}.progressLabel`) } },
    { type: "Stack", props: { gap: "stackPair" }, children: [
      { each: get(`${c}.facts`), as: "fact", key: "fact.id", empty, render: { type: "Text", props: { value: get("fact.text"), role: "caption", tone: "muted" } } },
    ] },
  ],
});

const alertPopover = (trigger: unknown, open: boolean, placement: string) => ({
  each: get("vm.recoveryAlert.signIn"), as: "card", key: "card.id", empty,
  render: {
    type: "PopoverPanel",
    props: { label: get("vm.recoveryAlert.copy.cardLabel"), placement, padding: "comfortable", hoverOpen: true, open },
    slots: { trigger: [trigger], content: [cardBody("card")] },
  },
});

const filesHeader = (alert: unknown) => ({
  type: "Inline", props: { justify: "between", gap: "inlineItem", grow: true },
  children: [
    { type: "Inline", props: { gap: "inlineItem", grow: true }, children: [
      { type: "Icon", props: { name: get("vm.recoveryAlert.files.icon") } },
      { type: "Stack", props: { gap: "none" }, children: [
        { type: "Text", props: { value: get("vm.recoveryAlert.files.title"), role: "title" } },
        { type: "Text", props: { value: get("vm.recoveryAlert.files.login"), role: "caption", tone: "muted", lines: "one" } },
      ] },
    ] },
    alert,
  ],
});

const alertIcon = { type: "IconButton", props: { icon: "warning", label: get("vm.recoveryAlert.copy.alertLabel") } };
const cornerAlert = { type: "SaveState", props: { state: "error", label: get("vm.recoveryAlert.copy.alertLabel") } };

// 1. Writing carries on: the Files panel and the note, the corner's card open, and the session's one toast.
const windowView = {
  id: "gallery.mock.recoveryWindow",
  focus: "recoveryWindow",
  root: { type: "Stack", id: "recoveryWindow", props: { gap: "stackSection", padding: "insetLg" }, children: [
    { type: "Text", props: { value: get("vm.recoveryAlert.copy.windowIntro"), tone: "muted" } },
    { type: "Surface", props: { variant: "canvas", shape: "window", elevation: "1", minimum: "view" }, children: [
      { type: "Inline", props: { align: "stretch" }, children: [
        { type: "Surface", props: { variant: "sunken", padding: "insetMd" }, children: [
          { type: "Stack", props: { gap: "stackSection" }, children: [
            filesHeader(alertIcon),
            { type: "Stack", props: { gap: "stackItem" }, children: [
              { each: get("vm.recoveryAlert.files.rows"), as: "row", key: "row.id", empty, render: { type: "Text", props: { value: get("row.name"), lines: "one" } } },
            ] },
          ] },
        ] },
        { type: "Stack", props: { gap: "stackSection", padding: "insetLg", grow: true, justify: "between" }, children: [
          { type: "Stack", props: { gap: "stackItem" }, children: [
            { type: "Heading", props: { value: get("vm.recoveryAlert.note.title"), level: "1" } },
            { each: get("vm.recoveryAlert.note.body"), as: "p", key: "p.id", empty, render: { type: "Text", props: { value: get("p.text"), role: "lead" } } },
          ] },
          { type: "Inline", props: { gap: "inlineItem" }, children: [alertPopover(cornerAlert, true, "top start")] },
        ] },
      ] },
    ] },
    { type: "Toast", props: { message: get("vm.recoveryAlert.copy.toast"), tone: "warning", actionLabel: get("vm.recoveryAlert.copy.signInAgain"), dismissLabel: { t: "toast.dismiss" } } },
  ] },
};

// 2. Every cause's card, as it opens from either alert.
const cardsView = {
  id: "gallery.mock.recoveryCards",
  focus: "recoveryCards",
  root: { type: "Stack", id: "recoveryCards", props: { gap: "stackSection", padding: "insetLg" }, children: [
    { type: "Text", props: { value: get("vm.recoveryAlert.copy.cardsIntro"), tone: "muted" } },
    { type: "Center", props: { maxWidth: "dialogL", gutter: "none" }, children: [
      { type: "Stack", props: { gap: "stackSection" }, children: [
        { each: get("vm.recoveryAlert.cards"), as: "card", key: "card.id", empty, render: {
          type: "Surface", props: { variant: "frost", shape: "popover", elevation: "2", padding: "insetLg" }, children: [cardBody("card")],
        } },
      ] },
    ] },
  ] },
};

// 3. The corner and the Files header in each state.
const statesView = {
  id: "gallery.mock.recoveryStates",
  focus: "recoveryStates",
  root: { type: "Stack", id: "recoveryStates", props: { gap: "stackSection", padding: "insetLg" }, children: [
    { type: "Text", props: { value: get("vm.recoveryAlert.copy.statesIntro"), tone: "muted" } },
    { type: "Stack", props: { gap: "stackItem" }, children: [
      { type: "Heading", props: { value: get("vm.recoveryAlert.copy.cornerHeading"), level: "2" } },
      { each: get("vm.recoveryAlert.corner"), as: "s", key: "s.id", empty, render: {
        type: "Inline", props: { gap: "inlineGroup" }, children: [
          { type: "SaveState", props: { state: get("s.state"), label: get("s.label"), text: get("s.text"), interactive: false } },
          { type: "Stack", props: { gap: "none" }, children: [
            { type: "Text", props: { value: get("s.label") } },
            { type: "Text", props: { value: get("s.note"), role: "caption", tone: "muted" } },
          ] },
        ],
      } },
    ] },
    { type: "Stack", props: { gap: "stackItem" }, children: [
      { type: "Heading", props: { value: get("vm.recoveryAlert.copy.filesHeading"), level: "2" } },
      { each: get("vm.recoveryAlert.header"), as: "h", key: "h.id", empty, render: {
        type: "Inline", props: { gap: "inlineGroup" }, children: [
          { type: "Surface", props: { variant: "sunken", padding: "insetMd" }, children: [
            { type: "Inline", props: { gap: "inlineItem" }, children: [
              { type: "Icon", props: { name: get("h.icon") } },
              { type: "Stack", props: { gap: "none" }, children: [
                { type: "Text", props: { value: get("h.title"), role: "title", lines: "one" } },
                { type: "Text", when: get("h.hasLogin"), props: { value: get("h.login"), role: "caption", tone: "muted", lines: "one" } },
              ] },
              { type: "IconButton", when: get("h.alert"), props: { icon: "warning", label: get("vm.recoveryAlert.copy.alertLabel") } },
            ] },
          ] },
          { type: "Text", props: { value: get("h.note"), role: "caption", tone: "muted" } },
        ],
      } },
    ] },
  ] },
};

export const recoveryAlertMocks = {
  id: "recoveryalert",
  label: "Mocks: Account and sync recovery alert (FRE-13, G5.4)",
  models: { recoveryAlert: {
    ...data,
    files: { ...data.files, icon: "github" },
    signIn: data.signIn.map(flagged),
    cards: data.cards.map(flagged),
    header: data.header.map((h) => ({ ...h, hasLogin: h.login !== "" })),
  } },
  views: { window: windowView, cards: cardsView, states: statesView },
  entries: [
    { id: "recoveryalert.window", label: "1. Writing carries on: the alert in the corner and Files, its card and one toast", view: "window" },
    { id: "recoveryalert.cards", label: "2. The card for each cause: mismatch, sign-in, account, gone, inbound, mass deletion, syncing, failed", view: "cards" },
    { id: "recoveryalert.states", label: "3. Corner and Files header: normal, offline, pending and alert", view: "states" },
  ] as Entry[],
};
