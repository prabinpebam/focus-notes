/**
 * D-432: why a website update (Publish, Unpublish, a share or withdrawal, Site appearance, a delete's takedown) stopped,
 * as one sentence with the recovery that actually helps. Undefined when the cause is unknown or the surface's own
 * words already name it (GitHub's build failing, for one).
 */
const CAUSES = {
  offline: "site.problem.offline",
  signedout: "site.problem.signedout",
  ratelimited: "site.problem.ratelimited",
  refused: "site.problem.refused",
  moved: "site.problem.moved",
  unconfigured: "site.problem.unconfigured",
} as const;

export function siteProblemKey(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : String(error);
  // The last match: Electron prefixes the channel ("Error invoking remote method 'sharing:appearanceSet': …").
  const code = [...text.matchAll(/sharing:([a-z]+)/g)].map(m => m[1]!).filter(c => c in CAUSES).at(-1)
    ?? (/access:offline/.test(text) ? "offline" : /access:signedOut/.test(text) ? "signedout" : undefined);
  return code ? CAUSES[code as keyof typeof CAUSES] : undefined;
}
