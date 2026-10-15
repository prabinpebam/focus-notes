/**
 * Editing share audiences in `private/access.json` (WP-5.3, SHR-05, SHR-07, SHR-08, D-134): the
 * desktop app's main process applies each change the owner makes in Settings → Sharing, and the
 * window uses the same checks to explain a problem before it asks. Every secret (a grant's salt and
 * link secret, and the workspace's `nameSalt`) is made here, with the platform's random number
 * generator. Web Crypto only, no Node: the window imports the checks.
 */
import { normalizePassphrase, passphraseStrength, randomBytes, randomId, SALT_BYTES, toB64url } from "./format.ts";
import { GRANT_ID, isActive, LINK_SECRET_BYTES, normalizeName, type AccessFile, type Grant, type GrantScope } from "./grants.ts";

/** The longest audience name (schemas/access.schema.json). */
export const NAME_MAX = 80;
/** How long an audience lasts: 1, 7, 30 (the default, DD-SHARE-07), or 90 days, or never. */
export const EXPIRY_CHOICES = ["1d", "7d", "30d", "90d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];
export const DEFAULT_EXPIRY: ExpiryChoice = "30d";
const DAY = 86_400_000;
/** The furthest an expiry may be: a year from today, to the end of that day (D-143; a leap day and time zones allowed for). */
export const EXPIRY_MAX_MS = 367 * DAY;
/** "Expires soon": 3 days or less left. */
export const SOON_MS = 3 * DAY;

/** When an audience made now with this choice stops working, or null for never. */
export function expiryFrom(choice: ExpiryChoice, now = new Date()): string | null {
  return choice === "never" ? null : new Date(now.getTime() + Number.parseInt(choice, 10) * DAY).toISOString();
}

/** A calendar date, `YYYY-MM-DD`, as the date picker gives it (D-143). */
export const DAY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * An audience that works until a date picked on the calendar stops at the end of that day, in the
 * owner's time zone (D-143). Undefined for anything that isn't a real date.
 */
export function expiryUntil(day: string): string | undefined {
  const m = DAY_FORMAT.exec(day);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return end.getFullYear() === y && end.getMonth() === mo - 1 && end.getDate() === d ? end.toISOString() : undefined;
}

export type AccessProblem =
  | "name.empty" | "name.long" | "name.taken" | "name.reserved" | "name.invalid"
  | "waysIn.none" | "passcode.short" | "passcode.weak" | "scope.empty" | "expiry.past" | "expiry.far"
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
/** A passcode the owner typed, or a request for main-issued words (only those are stored as `generated`). */
export type PasscodeInput = { value: string } | { generate: true };
/** How the main process makes words (seal/words.ts); the window has none, so it can't claim them. */
export interface ApplyOptions { generate?: () => string }
export interface AudienceInput { name: string; link: boolean; passcode?: PasscodeInput; scope: ScopeInput; expiresAt: string | null }
export type AccessChange =
  | { op: "create"; audience: AudienceInput }
  /** `passcode: null` removes it; a missing field stays as it is. */
  | { op: "update"; id: string; link?: boolean; passcode?: PasscodeInput | null; scope?: ScopeInput; expiresAt?: string | null }
  | { op: "withdraw"; id: string }
  | { op: "delete"; id: string };

/** An audience as the window sees it: what it opens and how, never a secret (review L2). */
export interface Audience {
  id: string; name: string; scope: GrantScope; createdAt: string; expiresAt?: string | null; revokedAt?: string | null;
  link: boolean; passcode: boolean; generated: boolean;
}
export const audienceOf = (g: Grant): Audience => ({
  id: g.id, name: g.name, scope: g.scope, createdAt: g.createdAt, expiresAt: g.expiresAt ?? null, revokedAt: g.revokedAt ?? null,
  link: Boolean(g.link), passcode: Boolean(g.passcode), generated: Boolean(g.passcode?.generated),
});
type Timed = Pick<Grant, "expiresAt" | "revokedAt">;
const inForce = (g: Timed, now: number) => !g.revokedAt && (!g.expiresAt || Date.parse(g.expiresAt) > now);

export type AudienceState = "active" | "soon" | "expired" | "withdrawn";
export function audienceState(g: Timed, now = new Date()): AudienceState {
  if (g.revokedAt) return "withdrawn";
  if (!inForce(g, now.getTime())) return "expired";
  return g.expiresAt && Date.parse(g.expiresAt) - now.getTime() <= SOON_MS ? "soon" : "active";
}

/** The share audiences, in the file's order: everything but the owner's vault grant. */
export const shareGrants = (access: AccessFile): Grant[] => access.grants.filter((g) => !g.owner);

/** A name as it's stored: Unicode NFKC, every run of white space as one space, trimmed; its letter case kept. */
export const tidyName = (name: string) => name.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Control and format characters (zero-width, bidirectional overrides): a name that reads one way and is another. */
const HIDDEN = /[\p{Cc}\p{Cf}]/u;

/** Why a name can't be used, if it can't: hidden characters, empty, too long, the vault's own, or another working audience's. */
export function nameProblem(access: { grants: readonly (Timed & Pick<Grant, "id" | "name" | "owner">)[] }, name: string, exceptId?: string, now = new Date()): AccessProblem | undefined {
  if (HIDDEN.test(name)) return "name.invalid";
  const key = normalizeName(name);
  if (!key) return "name.empty";
  if (tidyName(name).length > NAME_MAX) return "name.long";
  if (key === normalizeName("You")) return "name.reserved";
  const taken = access.grants.some((g) => !g.owner && g.id !== exceptId && inForce(g, now.getTime()) && normalizeName(g.name) === key);
  return taken ? "name.taken" : undefined;
}

/** A custom passcode's least length when it isn't several words. */
export const PASSCODE_MIN_CHARS = 16;
/** Or this many different words of 3 letters or more. */
export const PASSCODE_MIN_WORDS = 3;
const wordsIn = (s: string) => new Set(s.toLocaleLowerCase().split(/[^\p{L}]+/u).filter((w) => [...w].length >= 3)).size;

/**
 * Why a passcode is too easy to guess offline, if it is (SHR-07, review M1): it needs 16 characters or
 * more, or 3 or more different words, and then the strength estimate. Common passwords
 * ("Password1234", "Summer2026!!") are short single words, which a bits estimate alone lets through;
 * this rule keeps them out without a bundled dictionary. Four EFF words always pass.
 */
export function passcodeProblem(value: string): AccessProblem | undefined {
  const p = normalizePassphrase(value);
  if ([...p].length < PASSCODE_MIN_CHARS && wordsIn(p) < PASSCODE_MIN_WORDS) return "passcode.short";
  return passphraseStrength(p).ok ? undefined : "passcode.weak";
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
  if (t - now.getTime() > EXPIRY_MAX_MS) throw new AccessEditError("expiry.far");
  return new Date(t).toISOString();
}
function checkPasscode(p: PasscodeInput, o: ApplyOptions): { value: string; generated: boolean } {
  if ("generate" in p) {
    if (!o.generate) throw new Error("Passcodes are made by the main process");
    return { value: o.generate(), generated: true };
  }
  const bad = passcodeProblem(p.value);
  if (bad) throw new AccessEditError(bad);
  return { value: normalizePassphrase(p.value), generated: false };
}
const newLink = () => ({ secret: toB64url(randomBytes(LINK_SECRET_BYTES)) });

/**
 * The access file with one change made, and the audience it was made to. Throws AccessEditError for
 * anything the publisher would refuse or the owner wouldn't mean: no way in, nothing to open, a name
 * in use, a weak passcode, an expiry in the past, or the vault's grant.
 */
export function applyAccessChange(access: AccessFile, change: AccessChange, now = new Date(), o: ApplyOptions = {}): { access: AccessFile; id: string } {
  if (change.op === "create") {
    const a = change.audience;
    const bad = nameProblem(access, a.name, undefined, now);
    if (bad) throw new AccessEditError(bad);
    if (!a.link && !a.passcode) throw new AccessEditError("waysIn.none");
    const scope = tidyScope(a.scope);
    const passcode = a.passcode ? checkPasscode(a.passcode, o) : undefined;
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
  else if (change.passcode) next.passcode = checkPasscode(change.passcode, o);
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
  if (isObj(v) && only(v, ["generate"]) && v.generate === true) return { generate: true };
  if (!isObj(v) || !only(v, ["value"]) || typeof v.value !== "string" || v.value.length > 500) throw new Error("Not a share change");
  return { value: v.value };
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

// ---- the invite (SHR-09) ----

export type InviteValues = Partial<Record<"name" | "title" | "link" | "passcode" | "expires" | "site", string>>;
export const INVITE_PLACEHOLDERS = ["name", "title", "link", "passcode", "expires", "site"] as const;

/**
 * The invite: the template with its placeholders filled in. A line that uses a placeholder with no
 * value (a link for a passcode-only audience, an expiry for one that never expires) is left out.
 * Values are put in once, so nothing in a value is read as a placeholder.
 */
export function inviteText(template: string, values: InviteValues): string {
  return template.split(/\r?\n/)
    .filter((line) => INVITE_PLACEHOLDERS.every((p) => !line.includes(`{${p}}`) || values[p]))
    .map((line) => line.replace(/\{(name|title|link|passcode|expires|site)\}/g, (_, p: keyof InviteValues) => values[p]!))
    .join("\n").trim();
}

// ---- the owner's own invite template, private/access-message.json (SHR-09, D-143) ----

/** The longest template, in characters and in lines. */
export const TEMPLATE_MAX = 2000;
export const TEMPLATE_LINES = 20;
export type TemplateProblem = "template.empty" | "template.long" | "template.invalid" | "template.unknown" | "template.noWayIn";
/** Anything in braces that looks like a placeholder: a word of letters. */
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;
/**
 * Hidden characters, apart from a line feed and a tab: format characters, every other control
 * character (a lone carriage return included), and Unicode's line and paragraph separators, which
 * some apps show as a new line (review of 8a6627c). Templates turn CRLF into LF before this check.
 */
export const HIDDEN_TEXT = /[\p{Cf}\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/u;
/** Whether text has a hidden character (above). */
export const hasHiddenText = (s: string) => HIDDEN_TEXT.test(s);

/**
 * Why a template can't be used, if it can't: empty, too long, hidden characters, a placeholder the
 * app doesn't know (`unknown` names it, so the owner can fix a typo such as `{pascode}`), or no way
 * in at all (neither `{link}` nor `{passcode}`).
 */
export function templateProblem(raw: string): { problem: TemplateProblem; placeholder?: string } | undefined {
  // CRLF is one line break; a lone CR, U+2028, and U+2029 are refused as hidden.
  const template = raw.replace(/\r\n/g, "\n");
  if (!template.trim()) return { problem: "template.empty" };
  if (template.length > TEMPLATE_MAX || template.split("\n").length > TEMPLATE_LINES) return { problem: "template.long" };
  if (HIDDEN_TEXT.test(template)) return { problem: "template.invalid" };
  for (const [, p] of template.matchAll(PLACEHOLDER)) {
    if (!(INVITE_PLACEHOLDERS as readonly string[]).includes(p!)) return { problem: "template.unknown", placeholder: p! };
  }
  if (!template.includes("{link}") && !template.includes("{passcode}")) return { problem: "template.noWayIn" };
  return undefined;
}

/** `access-message.json`'s template, or undefined when the file isn't one (a damaged file falls back to the default). */
export function parseAccessMessage(raw: unknown): string | undefined {
  const o = raw as { template?: unknown } | null;
  if (typeof o !== "object" || o === null || Array.isArray(o) || Object.keys(o).some((k) => k !== "template")) return undefined;
  return typeof o.template === "string" && !templateProblem(o.template) ? o.template.replace(/\r\n/g, "\n") : undefined;
}
