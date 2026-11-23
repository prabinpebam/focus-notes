/**
 * The images a shared note references, for the publisher to seal with it (WP-9.6): image destinations
 * as the note writes them, found by the Markdown parser so code and links are never mistaken for images.
 * A crop's kept original is left out: readers never see it, so it isn't published at all.
 */
import { imageDestinations } from "@focus-notes/core";

export function sharedImageDestinations(markdown: string): string[] {
  return imageDestinations(markdown).filter((d) => d.encoding !== "component").map((d) => markdown.slice(d.start, d.end));
}
