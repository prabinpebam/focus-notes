/**
 * Editing share audiences in access.json (WP-5.3, SHR-05, SHR-07, SHR-08, D-134): creating an audience
 * by link, passcode, or both, the name rules, custom passcode strength, expiry, changing what it
 * opens, withdrawing, and deleting; the owner's vault grant is never touched. The result is checked
 * by the publisher's own validateAccess and the schema's rules.
 */
import { describe, expect, it } from "vitest";
import {
  AccessEditError, applyAccessChange, audienceState, DEFAULT_EXPIRY, expiryFrom, nameProblem, parseAccessChange, passcodeProblem, shareGrants, type AccessChange,
} from "../src/access.ts";
import { generatePasscode, EFF_WORD_COUNT, effWord } from "../src/words.ts";
import { fromB64url } from "../src/format.ts";
import { GRANT_ID, type AccessFile } from "../src/grants.ts";
import { validateAccess } from "../src/publish.ts";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const DAY = 86_400_000;
const STRONG = "harbor-maple-river-cloud";
const base = (): AccessFile => ({
  version: 1,
  grants: [{ id: "gownergrant1", name: "You", owner: true, salt: "AAAAAAAAAAAAAAAAAAAAAA", passcodeKey: "A".repeat(43), scope: { all: true }, createdAt: NOW.toISOString() }],
});
const create = (name: string, more: Partial<Extract<AccessChange, { op: "create" }>["audience"]> = {}): AccessChange => ({
  op: "create",
  audience: { name, link: true, scope: { notes: ["trip.md"], folders: [] }, expiresAt: expiryFrom("30d", NOW), ...more },
});
const problem = (f: () => unknown) => {
  try { f(); } catch (e) { return e instanceof AccessEditError ? e.problem : `other: ${String(e)}`; }
  return undefined;
};

describe("creating an audience (SHR-05)", () => {
  it("adds a link grant with fresh secrets, a nameSalt, and nothing else changed", () => {
    const before = base();
    const { access, id } = applyAccessChange(before, create("Asha"), NOW);
    expect(access.grants).toHaveLength(2);
    expect(access.grants[0]).toEqual(before.grants[0]);
    const g = access.grants[1]!;
    expect(g.id).toBe(id);
    expect(GRANT_ID.test(g.id)).toBe(true);
    expect(g).toMatchObject({ name: "Asha", scope: { notes: ["trip.md"] }, createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 30 * DAY).toISOString() });
    expect(fromB64url(g.link!.secret)).toHaveLength(32);
    expect(fromB64url(g.salt)).toHaveLength(16);
    expect(g.passcode).toBeUndefined();
    expect(fromB64url(access.nameSalt!)).toHaveLength(16);
    expect(() => validateAccess(access)).not.toThrow();
    // Each audience gets its own secrets.
    const again = applyAccessChange(access, create("Book club"), NOW).access.grants[2]!;
    expect(again.link!.secret).not.toBe(g.link!.secret);
    expect(again.salt).not.toBe(g.salt);
  });
  it("keeps an existing nameSalt", () => {
    const a = { ...base(), nameSalt: "c2FsdHNhbHRzYWx0c2FsdA" };
    expect(applyAccessChange(a, create("Asha"), NOW).access.nameSalt).toBe("c2FsdHNhbHRzYWx0c2FsdA");
  });
  it("adds a passcode grant, alone or beside a link", () => {
    const p = applyAccessChange(base(), create("Asha", { link: false, passcode: { value: STRONG, generated: true } }), NOW).access.grants[1]!;
    expect(p.link).toBeUndefined();
    expect(p.passcode).toEqual({ value: STRONG, generated: true });
    const both = applyAccessChange(base(), create("Asha", { passcode: { value: STRONG, generated: true } }), NOW).access.grants[1]!;
    expect(both.link && both.passcode).toBeTruthy();
    expect(() => validateAccess(applyAccessChange(base(), create("Asha", { passcode: { value: STRONG, generated: true } }), NOW).access)).not.toThrow();
  });
  it("needs a way in and something to open", () => {
    expect(problem(() => applyAccessChange(base(), create("Asha", { link: false }), NOW))).toBe("waysIn.none");
    expect(problem(() => applyAccessChange(base(), create("Asha", { scope: { notes: [], folders: [] } }), NOW))).toBe("scope.empty");
  });
  it("keeps folders and notes apart, without duplicates or leading slashes", () => {
    const g = applyAccessChange(base(), create("Asha", { scope: { notes: ["/a.md", "a.md"], folders: ["trips/", "trips"] } }), NOW).access.grants[1]!;
    expect(g.scope).toEqual({ notes: ["a.md"], folders: ["trips"] });
  });
});

describe("names (SHR-05, D-125 (5))", () => {
  it("are trimmed with inner white space as one space, and the letter case kept", () => {
    expect(applyAccessChange(base(), create("  Sam   Lee "), NOW).access.grants[1]!.name).toBe("Sam Lee");
  });
  it("must be unique among audiences that still work, whatever the case or spacing", () => {
    const { access } = applyAccessChange(base(), create("Sam Lee"), NOW);
    expect(problem(() => applyAccessChange(access, create("sam  LEE"), NOW))).toBe("name.taken");
    expect(nameProblem(access, "SAM LEE", undefined, NOW)).toBe("name.taken");
    // Full-width letters normalize the same (NFKC).
    expect(nameProblem(access, "Ｓａｍ Lee", undefined, NOW)).toBe("name.taken");
  });
  it("can be reused once the earlier audience is withdrawn or expired", () => {
    const a = applyAccessChange(base(), create("Asha"), NOW);
    const withdrawn = applyAccessChange(a.access, { op: "withdraw", id: a.id }, NOW).access;
    expect(nameProblem(withdrawn, "Asha", undefined, NOW)).toBeUndefined();
    const later = new Date(NOW.getTime() + 31 * DAY);
    expect(nameProblem(a.access, "asha", undefined, later)).toBeUndefined();
  });
  it("can't be empty, too long, or the vault's own name", () => {
    expect(problem(() => applyAccessChange(base(), create("   "), NOW))).toBe("name.empty");
    expect(problem(() => applyAccessChange(base(), create("x".repeat(81)), NOW))).toBe("name.long");
    expect(problem(() => applyAccessChange(base(), create("you"), NOW))).toBe("name.reserved");
  });
});

describe("passcodes (SHR-07)", () => {
  it("generated: four words from the EFF large list, joined by hyphens, different each time", () => {
    expect(EFF_WORD_COUNT).toBe(7776);
    expect(effWord(0)).toBe("abacus");
    expect(effWord(7775)).toBe("zoom");
    const a = generatePasscode(), b = generatePasscode();
    expect(a.split("-")).toHaveLength(4);
    expect(a).not.toBe(b);
    for (const w of a.split("-")) expect(w).toMatch(/^[a-z]+$/);
    expect(passcodeProblem(a)).toBeUndefined();
  });
  it("custom: at least 12 characters and rated strong; the generated flag vouches for nothing", () => {
    expect(passcodeProblem("short")).toBe("passcode.short");
    expect(passcodeProblem("aaaaaaaaaaaaaaaa")).toBe("passcode.weak");
    expect(passcodeProblem("blue tractor singing 42")).toBeUndefined();
    expect(problem(() => applyAccessChange(base(), create("Asha", { passcode: { value: "aaaaaaaaaaaaaaaa", generated: true } }), NOW))).toBe("passcode.weak");
    expect(problem(() => applyAccessChange(base(), create("Asha", { passcode: { value: "password", generated: false } }), NOW))).toBe("passcode.short");
  });
  it("are stored trimmed, as the reader derives them", () => {
    const g = applyAccessChange(base(), create("Asha", { passcode: { value: `  ${STRONG} `, generated: false } }), NOW).access.grants[1]!;
    expect(g.passcode!.value).toBe(STRONG);
  });
});

describe("expiry (SHR-08)", () => {
  it("defaults to 30 days, with 1, 7, 90 days, and never", () => {
    expect(DEFAULT_EXPIRY).toBe("30d");
    expect(expiryFrom("1d", NOW)).toBe(new Date(NOW.getTime() + DAY).toISOString());
    expect(expiryFrom("7d", NOW)).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    expect(expiryFrom("90d", NOW)).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString());
    expect(expiryFrom("never", NOW)).toBeNull();
  });
  it("can't be in the past", () => {
    expect(problem(() => applyAccessChange(base(), create("Asha", { expiresAt: new Date(NOW.getTime() - 1).toISOString() }), NOW))).toBe("expiry.past");
  });
  it("states: active, expires soon (3 days or less), expired, withdrawn", () => {
    const { access, id } = applyAccessChange(base(), create("Asha"), NOW);
    const g = access.grants.find((x) => x.id === id)!;
    expect(audienceState(g, NOW)).toBe("active");
    expect(audienceState(g, new Date(NOW.getTime() + 28 * DAY))).toBe("soon");
    expect(audienceState(g, new Date(NOW.getTime() + 30 * DAY + 1))).toBe("expired");
    expect(audienceState({ ...g, expiresAt: null }, new Date(NOW.getTime() + 999 * DAY))).toBe("active");
    expect(audienceState({ ...g, revokedAt: NOW.toISOString() }, NOW)).toBe("withdrawn");
  });
  it("extends, which brings an expired audience back", () => {
    const { access, id } = applyAccessChange(base(), create("Asha", { expiresAt: expiryFrom("1d", NOW) }), NOW);
    const later = new Date(NOW.getTime() + 2 * DAY);
    const g = applyAccessChange(access, { op: "update", id, expiresAt: expiryFrom("90d", later) }, later).access.grants.find((x) => x.id === id)!;
    expect(audienceState(g, later)).toBe("active");
  });
});

describe("changing what it opens and how (SHR-08)", () => {
  it("changes the scope and keeps the secrets", () => {
    const { access, id } = applyAccessChange(base(), create("Asha"), NOW);
    const before = access.grants.find((g) => g.id === id)!;
    const after = applyAccessChange(access, { op: "update", id, scope: { notes: [], folders: ["trips"] } }, NOW).access.grants.find((g) => g.id === id)!;
    expect(after.scope).toEqual({ notes: [], folders: ["trips"] });
    expect(after.link).toEqual(before.link);
    expect(after.salt).toBe(before.salt);
  });
  it("adds a passcode, or removes the link, but never both ways", () => {
    const { access, id } = applyAccessChange(base(), create("Asha"), NOW);
    const withCode = applyAccessChange(access, { op: "update", id, passcode: { value: STRONG, generated: true } }, NOW).access;
    const noLink = applyAccessChange(withCode, { op: "update", id, link: false }, NOW).access.grants.find((g) => g.id === id)!;
    expect(noLink.link).toBeUndefined();
    expect(noLink.passcode?.value).toBe(STRONG);
    expect(problem(() => applyAccessChange(withCode, { op: "update", id, link: false, passcode: null }, NOW))).toBe("waysIn.none");
  });
  it("never edits, withdraws, or deletes the vault, or an unknown grant", () => {
    for (const op of ["withdraw", "delete"] as const) expect(problem(() => applyAccessChange(base(), { op, id: "gownergrant1" }, NOW))).toBe("owner");
    expect(problem(() => applyAccessChange(base(), { op: "update", id: "gownergrant1", scope: { notes: ["a.md"], folders: [] } }, NOW))).toBe("owner");
    expect(problem(() => applyAccessChange(base(), { op: "withdraw", id: "nosuchgrant" }, NOW))).toBe("notFound");
  });
});

describe("withdrawing and deleting (SHR-08)", () => {
  it("withdraw keeps the record, with when", () => {
    const { access, id } = applyAccessChange(base(), create("Asha"), NOW);
    const w = applyAccessChange(access, { op: "withdraw", id }, NOW).access;
    const g = w.grants.find((x) => x.id === id)!;
    expect(g.revokedAt).toBe(NOW.toISOString());
    expect(g.link).toBeDefined();
    expect(shareGrants(w)).toHaveLength(1);
    expect(() => validateAccess(w)).not.toThrow();
    // A withdrawn audience can't be changed back by an edit.
    expect(problem(() => applyAccessChange(w, { op: "update", id, expiresAt: null }, NOW))).toBe("withdrawn");
  });
  it("delete removes the record", () => {
    const { access, id } = applyAccessChange(base(), create("Asha"), NOW);
    const d = applyAccessChange(access, { op: "delete", id }, NOW).access;
    expect(d.grants.map((g) => g.id)).toEqual(["gownergrant1"]);
  });
});

describe("parseAccessChange: what the main process accepts from the window", () => {
  it("accepts well-formed changes and refuses anything else", () => {
    const c = create("Asha");
    expect(parseAccessChange(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseAccessChange({ op: "withdraw", id: "sabcdefgh" })).toEqual({ op: "withdraw", id: "sabcdefgh" });
    for (const bad of [null, {}, { op: "drop" }, { op: "withdraw", id: "../x" }, { op: "create", audience: { name: 3 } },
      { op: "create", audience: { ...c.op === "create" ? c.audience : {}, scope: { notes: [1] } } }, { op: "update", id: "sabcdefgh", owner: true }]) {
      expect(() => parseAccessChange(bad)).toThrow();
    }
  });
});
