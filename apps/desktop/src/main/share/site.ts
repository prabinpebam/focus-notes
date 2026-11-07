import type { GitHubApi } from "@focus-notes/github";
import type { SharingSetupStep, SitePairing } from "./setup.ts";

export interface SealedArtifact {
  /** Output of desktop sealing and the leak gate, never the source project folder. */
  directory: string;
  build: string;
}
export type ArtifactPublication =
  | { status: "unavailable" }
  | { status: "published"; commit: string; pages: {
    status: "built" | "building" | "errored"; repository: string; build: string;
  } };
/** Project identifies the private source. G3 must resolve and verify its paired public target. */
export type SealedArtifactPublisher = (project: string, artifact: SealedArtifact) => Promise<ArtifactPublication>;

/** G3 supplies the live artifact publisher. An absent implementation must never look like a successful push. */
export const publishSealedArtifact: SealedArtifactPublisher = async () => ({ status: "unavailable" });

export function requirePublishedArtifact(result: ArtifactPublication, pairing: SitePairing, artifact: SealedArtifact): void {
  if (result.status === "unavailable") throw new Error("sharing:unavailable");
  if (!/^[a-f0-9]{40}$/i.test(result.commit) || result.pages.status !== "built" ||
    result.pages.repository.toLowerCase() !== `${pairing.owner}/${pairing.name}`.toLowerCase() ||
    result.pages.build !== artifact.build) throw new Error("sharing:unacknowledged");
}

export function publicSiteWorkflow(branch = "main"): string {
  if (!branch) throw new Error("sharing:workflow");
  return `name: Publish site
on:
  push:
    branches: [${JSON.stringify(branch)}]
    paths: ["site/**"]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
          submodules: false
      - uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346
`;
}
export const PUBLIC_SITE_WORKFLOW = publicSiteWorkflow();

export async function configurePublicSite(api: GitHubApi, pairing: Pick<SitePairing, "owner" | "name">, step: (step: SharingSetupStep) => void): Promise<void> {
  const repo = await api.repo(pairing.owner, pairing.name);
  if (repo.private || repo.template || !repo.canAdmin || !repo.canPush) throw new Error("sharing:refused");
  const workflow = publicSiteWorkflow(repo.defaultBranch);
  const path = ".github/workflows/pages.yml";
  const existing = await api.file(pairing.owner, pairing.name, path);
  if (existing && existing.text !== workflow) throw new Error("sharing:workflow");
  if (!existing) {
    step("push");
    await api.createFile(pairing.owner, pairing.name, path, workflow, "Set up public site publishing", repo.defaultBranch);
  }
}
