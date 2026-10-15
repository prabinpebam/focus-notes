/**
 * Copy public link (SHR-03, WP-5.1, D-139): a note in the public root has a stable, read-only page on
 * the instance's GitHub Pages site at `/n/<path>/` (D-114). The command copies it, from the ⋯ menu's
 * Note group, the command list, and Spotlight's quick actions, and says so in a toast. A private note,
 * or a workspace whose site isn't known yet, has it disabled with a plain reason.
 */
import type { AppState, ToastState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import { publicNoteUrl } from "./public-page.ts";
import { rootOf, stemOf } from "./workspace.ts";

export const COPY_PUBLIC_LINK = "note.copyPublicLink";
/** Why there's no public link: the note isn't public, or the site's address isn't known yet. */
export const PUBLIC_LINK_REASONS = { private: "command.note.copyPublicLink.private", noSite: "command.note.copyPublicLink.noSite" } as const;

/** A note's public page address, when it's in the public root and the site is known. */
export function publicLinkOf(tree: { roots: readonly { id: string; path: string }[] }, site: string | undefined, path: string | undefined): string | undefined {
  if (!site || !path) return undefined;
  const root = rootOf(tree, path);
  if (root?.id !== "public") return undefined;
  const rel = path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
  return rel ? publicNoteUrl(site, rel) : undefined;
}

/** Why a note has no public link, or undefined when it has one. */
export function publicLinkReason(s: AppState, path: string | undefined): string | undefined {
  if (!path || rootOf(s.workspace.tree, path)?.id !== "public") return PUBLIC_LINK_REASONS.private;
  if (!s.workspace.site) return PUBLIC_LINK_REASONS.noSite;
  return undefined;
}

interface Ctx {
  store: { readonly state: AppState };
  commands: CommandRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  toast: (message: string, opts?: { tone?: ToastState["tone"] }) => number;
}

/** Copies a note's public link and says so; false when it has none. */
export async function copyPublicLink(ctx: Ctx, path: string | undefined): Promise<boolean> {
  const s = ctx.store.state;
  const link = publicLinkOf(s.workspace.tree, s.workspace.site, path);
  if (!link || !ctx.bridge.copyText) return false;
  const note = stemOf(path!.split(/[\\/:]/).at(-1) ?? "");
  try {
    await ctx.bridge.copyText(link);
    ctx.toast(ctx.catalog.format("toast.publicLinkCopied", { note }));
  } catch {
    ctx.toast(ctx.catalog.format("spotlight.copyFailed"), { tone: "error" });
  }
  return true;
}

export function registerPublicLink(ctx: Ctx): void {
  ctx.commands.register({
    id: COPY_PUBLIC_LINK, title: "command.note.copyPublicLink", icon: "link",
    enabled: (s) => Boolean(ctx.bridge.copyText) && !publicLinkReason(s, s.note.path),
    disabledReason: (s) => publicLinkReason(s, s.note.path) ?? "spotlight.reason.noClipboard",
    run: async () => { await copyPublicLink(ctx, ctx.store.state.note.path); },
  });
}
