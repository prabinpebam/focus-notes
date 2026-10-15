import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ItemCard",
  tier: "primitive",
  description: "One thing, shown rather than described (D-126, D-127): an account (its picture or initials, name and @login), a workspace (an icon, its name, when it was updated and a Public or Private badge), or an option. Its actions go in its slot.",
  props: {
    title: { kind: "message", required: true },
    detail: { kind: "message" },
    badge: { kind: "message" },
    icon: { kind: "icon", description: "Shown in a tile, the card's visual anchor. Without an icon, a picture or initials show instead." },
    avatar: { kind: "text", description: "An account's picture: only a data URL the shell made (data:image/…), never an address. Missing, the initials show." },
    initials: { kind: "text" },
    mark: { kind: "boolean", default: false, description: "GitHub's mark beside the detail: an account on GitHub." },
    size: { kind: "enum", values: ["m", "l"], default: "m", description: "l: an account's profile card, its name large." },
    personal: { kind: "enum", values: ["none", "title", "all"], default: "none", description: "Which of its words are the person's own data (their name and @login, a workspace's name), not the interface's: the visual score doesn't count them (D-127)." },
    label: { kind: "message", description: "The card's accessible name, when its title alone doesn't say it (This computer is connected to GitHub as …)." },
    busy: { kind: "boolean", default: false, description: "A pressable card's action is running." },
    disabled: { kind: "boolean", default: false, description: "A pressable card that can't run now (offline): it stays focusable, and its detail says why (D-135)." },
    skeleton: { kind: "boolean", default: false, description: "Its content is on its way (PRF-13): the card's shape with placeholders where its picture and words will be, named by its title (what it waits for). A profile card (size l) shows a round picture; a row, a tile." },
    autoFocus: { kind: "boolean", default: false, description: "A pressable card takes focus when it appears: a first-run step's main action, so Enter continues." },
  },
  // press: with an action, the whole card is one button: one tab stop, its title the name, no slot actions (D-131).
  events: { press: {} },
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.itemCard.*",
  a11y: { pattern: "group", name: "label" },
  fixtures: [
    { name: "workspace", props: { title: { t: "gallery.sample" }, detail: { t: "gallery.sample" }, badge: { t: "gallery.sample" }, icon: "folder", personal: "title" }, children: [{ type: "Button", props: { label: { t: "gallery.action" }, variant: "primary" } }] },
    { name: "profile", props: { title: { t: "gallery.sample" }, detail: { t: "gallery.sample" }, mark: true, size: "l", personal: "all" } },
    { name: "github", props: { title: { t: "gallery.sample" }, detail: { t: "gallery.long" }, icon: "github" } },
    { name: "option", props: { title: { t: "gallery.action" }, detail: { t: "gallery.sample" }, icon: "newNote" } },
    { name: "option busy", props: { title: { t: "gallery.action" }, detail: { t: "gallery.sample" }, icon: "newNote", busy: true } },
    { name: "skeleton", props: { title: { t: "gallery.sample" }, skeleton: true } },
    { name: "skeleton profile", props: { title: { t: "gallery.sample" }, size: "l", skeleton: true } },
    { name: "option disabled", props: { title: { t: "gallery.action" }, detail: { t: "gallery.reason" }, icon: "newNote", disabled: true } },
  ],
});
