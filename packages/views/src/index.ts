import canvas from "../views/canvas.view.json" with { type: "json" };
import settings from "../views/settings.view.json" with { type: "json" };
import theme from "../views/theme.view.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

/** Every view document in the app. Fragments join this when they exist. */
export const views: Record<string, unknown> = { canvas, settings, theme };
export const fragments: Record<string, unknown> = {};
export const messages: Record<string, Record<string, string>> = { en };