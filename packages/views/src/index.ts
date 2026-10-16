import canvas from "../views/canvas.view.json" with { type: "json" };
import settings from "../views/settings.view.json" with { type: "json" };
import theme from "../views/theme.view.json" with { type: "json" };
import history from "../views/history.view.json" with { type: "json" };
import reader from "../views/reader.view.json" with { type: "json" };
import share from "../views/share.view.json" with { type: "json" };
import index from "../views/index.view.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

/** Every view document in the app. Fragments join this when they exist. */
export const views: Record<string, unknown> = { canvas, settings, theme, history };
/**
 * Published pages' view documents (IA-VIEW-PUBLIC): the reader and the index of public notes (D-139),
 * rendered by the publisher at build time, and the share reader, rendered in the browser at s/ (WP-5.4).
 */
export const pages: Record<string, unknown> = { reader, index, share };
export const fragments: Record<string, unknown> = {};
export const messages: Record<string, Record<string, string>> = { en };