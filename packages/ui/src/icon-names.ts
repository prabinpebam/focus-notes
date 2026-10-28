/**
 * The icon registry: one family, Fluent UI System Icons (MIT, D-32), and GitHub's mark (Octicons, MIT, D-126). Names here are the only
 * values the `icon` prop accepts.
 */
export const ICON_NAMES = [
  "open", "save", "darkTheme", "lightTheme", "more", "search", "add", "dismiss", "check", "newNote",
  "bold", "italic", "link", "minimize", "restore", "maximize", "fullScreen", "exitFullScreen", "focus",
  "font", "keyboard", "settings", "info", "warning", "error", "sync", "delete", "rename", "copy", "folder",
  "document", "chevronRight", "chevronDown", "undo", "redo", "table", "quote", "code", "bulletList",
  "numberedList", "heading1", "heading2", "heading3", "color", "share", "history", "matchCase", "wholeWord", "regex", "sort", "inSelection", "grip",
  "arrowUp", "arrowDown", "lock", "export", "import", "strikethrough", "text", "taskList", "divider", "moreVertical", "newFolder", "github",
  "cloud", "cloudUp", "cloudCheck", "cloudOff", "download", "circle", "globe", "calendar", "chevronLeft", "mail", "pin", "pinOff", "feedback", "sent", "print",
] as const;
export type IconName = (typeof ICON_NAMES)[number];
