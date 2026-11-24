import reader from "../views/reader.view.json" with { type: "json" };
import share from "../views/share.view.json" with { type: "json" };
import index from "../views/index.view.json" with { type: "json" };
import webExport from "../views/webExport.view.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

/**
 * Published pages' view documents (IA-VIEW-PUBLIC): the reader and the index of public notes (D-139),
 * rendered by the publisher at build time, the share reader at s/ (WP-5.4), and the one-time browser
 * draft export page (WEB-01, D-292, D-412). A separate entry so the share reader's bundle (PRF-05)
 * never carries the app's views or the gallery's mocks.
 */
export const pages: Record<string, unknown> = { reader, index, share, webExport };
export const messages: Record<string, Record<string, string>> = { en };
