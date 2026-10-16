import canvas from "../views/canvas.view.json" with { type: "json" };
import settings from "../views/settings.view.json" with { type: "json" };
import theme from "../views/theme.view.json" with { type: "json" };
import history from "../views/history.view.json" with { type: "json" };
import reader from "../views/reader.view.json" with { type: "json" };
import share from "../views/share.view.json" with { type: "json" };
import index from "../views/index.view.json" with { type: "json" };
import siteLanding from "../views/siteLanding.view.json" with { type: "json" };
import sitePage from "../views/sitePage.view.json" with { type: "json" };
import helpHome from "../views/helpHome.view.json" with { type: "json" };
import helpCategory from "../views/helpCategory.view.json" with { type: "json" };
import helpArticle from "../views/helpArticle.view.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

/** Every view document in the app. Fragments join this when they exist. */
export const views: Record<string, unknown> = { canvas, settings, theme, history };
/**
 * Published pages' view documents (IA-VIEW-PUBLIC): the reader and the index of public notes (D-139),
 * rendered by the publisher at build time, and the share reader, rendered in the browser at s/ (WP-5.4).
 */
export const pages: Record<string, unknown> = { reader, index, share };
/** The product site's pages (IA-VIEW-SITE, IA-VIEW-HELP, WP-10.1), rendered at build time by the site's renderer. */
export const sitePages: Record<string, unknown> = { siteLanding, sitePage, helpHome, helpCategory, helpArticle };
export const fragments: Record<string, unknown> = {};
export const messages: Record<string, Record<string, string>> = { en };