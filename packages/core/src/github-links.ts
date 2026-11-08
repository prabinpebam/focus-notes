import { isRepoName } from "./setup.ts";

/** Only an account or owner/repository reference, never an arbitrary destination. */
export function isGitHubReference(reference: unknown): reference is string {
  if (typeof reference !== "string") return false;
  const parts = reference.replace(/^@/, "").split("/");
  const [owner, repo] = parts;
  return Boolean(owner && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
    && parts.length <= 2 && (parts.length === 1 || (repo && isRepoName(repo))));
}

export function githubReferenceUrl(reference: unknown): string {
  if (!isGitHubReference(reference)) throw new Error("Invalid GitHub reference");
  const parts = reference.replace(/^@/, "").split("/");
  return `https://github.com/${parts.map(encodeURIComponent).join("/")}`;
}
