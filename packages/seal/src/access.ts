/**
 * Editing share audiences in `private/access.json` (WP-5.3, SHR-05, SHR-07, SHR-08, D-134): the
 * desktop app's main process applies each change the owner makes in Settings → Sharing, and the
 * window uses the same checks to explain a problem before it asks. Every secret (a grant's salt and
 * link secret, and the workspace's `nameSalt`) is made here, with the platform's random number
 * generator. Web Crypto only, no Node: the window imports the checks.
 */
import { normalizePassphrase, passphraseStrength, randomBytes, randomId, SALT_BYTES, toB64url } from "./format.ts";
import { GRANT_ID, isActive, LINK_SECRET_BYTES, normalizeName, type AccessFile, type Grant } from "./grants.ts";

/** The longest audience name (schemas/access.schema.json). */
export const NAME_MAX = 80;
/** How long an audience lasts: 1, 7, 30 (the default, DD-SHARE-07), or 90 days, or never. */
export const EXPIRY_CHOICES = ["1d", "7d", "30d", "90d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];
export const DEFAULT_EXPIRY: ExpiryChoice = "30d";
const DAY = 86_400_000;
/** "Expires soon": 3 days or less left. */
export const SOON_MS = 3 * DAY;

/** When an audience made now with this choice stops working, or null for never. */
export function expiryFrom(choice: ExpiryChoice, now = new Date()): string | null {
  return choice === "never" ? null : new Date(now.getTime() + Number.parseInt(choice, 10) * DAY).toISOString();
}

export type AccessProblem =
  | "name.empty" | "name.long" | "name.taken" | "name.reserved"
  | "waysIn.none" | "passcode.short" | "passcode.weak" | "scope.empty" | "expiry.past"
  | "notFound" | "owner" | "withdrawn";
/** A change that can't be made. Its message is the problem's code, never a name or a secret. */
export class AccessEditError extends Error {
  readonly problem: AccessProblem;
  constructor(problem: AccessProblem) {
    super(`access:${problem}`);
    this.problem = problem;
  }
}

export interface ScopeInput { notes: string[]; folders: string[] }
export interface PasscodeInput { value: string; generated: boolean }
export interface AudienceInput { name: string; link: boolean; passcode?: PasscodeInput; scope: ScopeInput; expiresAt: string | null }
export type AccessChange =
  | { op: "create"; audience: AudienceInput }
  /** `passcode: null` removes it; a missing field stays as it is. */
  | { op: "update"; id: string; link?: boolean; passcode?: PasscodeInput | null; scope?: ScopeInput; expiresAt?: string | null }
  | { op: "withdraw"; id: string }
  | { op: "delete"; id: string };

export type AudienceState = "active" | "soon" | "expired" | "withdrawn";
export function audienceState(g: Grant, now = new Date()): AudienceState {
  if (g.revokedAt) return "withdrawn";
  if (!isActive(g, now.getTime())) return "expired";
  return g.expiresAt && Date.parse(g.expiresAt) - now.getTime() <= SOON_MS ? "soon" : "active";
}

/** The share audiences, in the file's order: everything but the owner's vault grant. */
export const shareGrants = (access: AccessFile): Grant[] => access.grants.filter((g) => !g.owner);

/** A name as it's stored: Unicode NFKC, every run of white space as one space, trimmed; its letter case kept. */
export const tidyName = (name: string) => name.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Why a name can't be used, if it can't: empty, too long, the vault's own, or another working audience's. */
export function nameProblem(access: AccessFile, name: string, exceptId?: string, now = new Date()): AccessProblem | undefined {
  const key = normalizeName(name);
  if (!key) return "name.empty";
  if (tidyName(name).length > NAME_MAX) return "name.long";
  if (key === normalizeName("You")) return "name.reserved";
  const taken = access.grants.some((g) => !g.owner && g.id !== exceptId && isActive(g, now.getTime()) && normalizeName(g.name) === key);
  return taken ? "name.taken" : undefined;
}

/** Why a passcode is too easy to guess offline, if it is (SHR-07): fewer than 12 characters, or not rated strong. */
export function passcodeProblem(value: string): AccessProblem | undefined {
  if (normalizePassphrase(value).length < 12) return "passcode.short";
  return passphraseStrength(value).ok ? undefined : "passcode.weak";
}

const tidyPath = (p: string) => p.trim().replace(/^\/+/, "").replace(/\/+$/, "");
function tidyScope(s: ScopeInput): { notes: string[]; folders: string[] } {
  const uniq = (xs: string[]) => [...new Set(xs.map(tidyPath).filter(Boolean))];
  const out = { notes: uniq(s.notes), folders: uniq(s.folders) };
  if (!out.notes.length && !out.folders.length) throw new AccessEditError("scope.empty");
  return out;
}
function checkExpiry(at: string | null, now: Date): string | null {
  if (at === null) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t) || t <= now.getTime()) throw new AccessEditError("expiry.past");
  return new Date(t).toISOString();
}
function checkPasscode(p: PasscodeInput): { value: string; generated: boolean } {
  const bad = passcodeProblem(p.value);
  if (bad) throw new AccessEditError(bad);
  return { value: normalizePassphrase(p.value), generated: p.generated };
}
const newLink = () => ({ secret: toB64url(randomBytes(LINK_SECRET_BYTES)) });

/**
 * The access file with one change made, and the audience it was made to. Throws AccessEditError for
 * anything the publisher would refuse or the owner wouldn't mean: no way in, nothing to open, a name
 * in use, a weak passcode, an expiry in the past, or the vault's grant.
 */
export function applyAccessChange(access: AccessFile, change: AccessChange, now = new Date()): { access: AccessFile; id: string } {
  if (change.op === "create") {
    const a = change.audience;
    const bad = nameProblem(access, a.name, undefined, now);
    if (bad) throw new AccessEditError(bad);
    if (!a.link && !a.passcode) throw new AccessEditError("waysIn.none");
    const scope = tidyScope(a.scope);
    const passcode = a.passcode ? checkPasscode(a.passcode) : undefined;
    const expiresAt = checkExpiry(a.expiresAt, now);
    let id = randomId("s", 16);
    while (access.grants.some((g) => g.id === id)) id = randomId("s", 16);
    const grant: Grant = {
      id, name: tidyName(a.name), salt: toB64url(randomBytes(SALT_BYTES)),
      ...(a.link ? { link: newLink() } : {}), ...(passcode ? { passcode } : {}),
      scope, createdAt: now.toISOString(), expiresAt,
    };
    return { id, access: { ...access, nameSalt: access.nameSalt ?? toB64url(randomBytes(SALT_BYTES)), grants: [...access.grants, grant] } };
  }
  const at = access.grants.findIndex((g) => g.id === change.id);
  const g = access.grants[at];
  if (!g) throw new AccessEditError("notFound");
  if (g.owner) throw new AccessEditError("owner");
  const replace = (next: Grant | undefined) => ({
    id: g.id,
    access: { ...access, grants: next ? access.grants.map((x, i) => (i === at ? next : x)) : access.grants.filter((_, i) => i !== at) },
  });
  if (change.op === "delete") return replace(undefined);
  if (g.revokedAt) throw new AccessEditError("withdrawn");
  if (change.op === "withdraw") return replace({ ...g, revokedAt: now.toISOString() });

  const next: Grant = { ...g };
  if (change.scope) next.scope = tidyScope(change.scope);
  if (change.expiresAt !== undefined) next.expiresAt = checkExpiry(change.expiresAt, now);
  if (change.link === true && !g.link) next.link = newLink();
  if (change.link === false) delete next.link;
  if (change.passcode === null) delete next.passcode;
  else if (change.passcode) next.passcode = checkPasscode(change.passcode);
  if (!next.link && !next.passcode) throw new AccessEditError("waysIn.none");
  // Brought back from expiry: its name mustn't clash with an audience made since.
  if (isActive(next, now.getTime()) && !isActive(g, now.getTime())) {
    const bad = nameProblem(access, g.name, g.id, now);
    if (bad) throw new AccessEditError(bad);
  }
  return replace(next);
}

// ---- what the main process accepts from the window ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const only = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const strings = (v: unknown, max = 500): string[] => {
  if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === "string" && x.length <= 1000)) throw new Error("Not a share change");
  return v as string[];
};
function parseScope(v: unknown): ScopeInput {
  if (!isObj(v) || !only(v, ["notes", "folders"])) throw new Error("Not a share change");
  return { notes: strings(v.notes), folders: strings(v.folders) };
}
function parsePasscode(v: unknown): PasscodeInput {
  if (!isObj(v) || !only(v, ["value", "generated"]) || typeof v.value !== "string" || v.value.length > 500 || typeof v.generated !== "boolean") throw new Error("Not a share change");
  return { value: v.value, generated: v.generated };
}
const parseExpiry = (v: unknown): string | null => {
  if (v === null || (typeof v === "string" && v.length <= 40)) return v;
  throw new Error("Not a share change");
};

/** A change as the window sent it, checked field by field: anything unexpected is refused. */
export function parseAccessChange(v: unknown): AccessChange {
  if (!isObj(v)) throw new Error("Not a share change");
  if (v.op === "create") {
    const a = v.audience;
    if (!only(v, ["op", "audience"]) || !isObj(a) || !only(a, ["name", "link", "passcode", "scope", "expiresAt"]) || typeof a.name !== "string" || a.name.length > 500 || typeof a.link !== "boolean") {
      throw new Error("Not a share change");
    }
    return { op: "create", audience: { name: a.name, link: a.link, ...(a.passcode !== undefined ? { passcode: parsePasscode(a.passcode) } : {}), scope: parseScope(a.scope), expiresAt: parseExpiry(a.expiresAt) } };
  }
  if (typeof v.id !== "string" || !GRANT_ID.test(v.id)) throw new Error("Not a share change");
  if (v.op === "withdraw" || v.op === "delete") {
    if (!only(v, ["op", "id"])) throw new Error("Not a share change");
    return { op: v.op, id: v.id };
  }
  if (v.op !== "update" || !only(v, ["op", "id", "link", "passcode", "scope", "expiresAt"])) throw new Error("Not a share change");
  if (v.link !== undefined && typeof v.link !== "boolean") throw new Error("Not a share change");
  return {
    op: "update", id: v.id,
    ...(v.link !== undefined ? { link: v.link as boolean } : {}),
    ...(v.passcode !== undefined ? { passcode: v.passcode === null ? null : parsePasscode(v.passcode) } : {}),
    ...(v.scope !== undefined ? { scope: parseScope(v.scope) } : {}),
    ...(v.expiresAt !== undefined ? { expiresAt: parseExpiry(v.expiresAt) } : {}),
  };
}
