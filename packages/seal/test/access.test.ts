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
import { generatePasscode, EFF_WORD_COUNT, effWord, effWords } from "../src/words.ts";
import { createHash } from "node:crypto";
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
/** The main process's way: main-issued words come from the EFF list. */
const apply = (a: AccessFile, c: AccessChange, now = NOW) => applyAccessChange(a, c, now, { generate: generatePasscode });
const problem = (f: () => unknown) => {
  try { f(); } catch (e) { return e instanceof AccessEditError ? e.problem : `other: ${String(e)}`; }
  return undefined;
};

describe("creating an audience (SHR-05)", () => {
  it("adds a link grant with fresh secrets, a nameSalt, and nothing else changed", () => {
    const before = base();
    const { access, id } = apply(before, create("Asha"), NOW);
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
    const again = apply(access, create("Book club"), NOW).access.grants[2]!;
    expect(again.link!.secret).not.toBe(g.link!.secret);
    expect(again.salt).not.toBe(g.salt);
  });
  it("keeps an existing nameSalt", () => {
    const a = { ...base(), nameSalt: "c2FsdHNhbHRzYWx0c2FsdA" };
    expect(apply(a, create("Asha"), NOW).access.nameSalt).toBe("c2FsdHNhbHRzYWx0c2FsdA");
  });
  it("adds a passcode grant, alone or beside a link", () => {
    const p = apply(base(), create("Asha", { link: false, passcode: { value: STRONG } }), NOW).access.grants[1]!;
    expect(p.link).toBeUndefined();
    // Typed by the owner: never marked generated, whatever it looks like.
    expect(p.passcode).toEqual({ value: STRONG, generated: false });
    const both = apply(base(), create("Asha", { passcode: { value: STRONG } }), NOW).access.grants[1]!;
    expect(both.link && both.passcode).toBeTruthy();
    expect(() => validateAccess(apply(base(), create("Asha", { passcode: { value: STRONG } }), NOW).access)).not.toThrow();
  });
  it("needs a way in and something to open", () => {
    expect(problem(() => apply(base(), create("Asha", { link: false }), NOW))).toBe("waysIn.none");
    expect(problem(() => apply(base(), create("Asha", { scope: { notes: [], folders: [] } }), NOW))).toBe("scope.empty");
  });
  it("keeps folders and notes apart, without duplicates or leading slashes", () => {
    const g = apply(base(), create("Asha", { scope: { notes: ["/a.md", "a.md"], folders: ["trips/", "trips"] } }), NOW).access.grants[1]!;
    expect(g.scope).toEqual({ notes: ["a.md"], folders: ["trips"] });
  });
});

describe("names (SHR-05, D-125 (5))", () => {
  it("are trimmed with inner white space as one space, and the letter case kept", () => {
    expect(apply(base(), create("  Sam   Lee "), NOW).access.grants[1]!.name).toBe("Sam Lee");
  });
  it("must be unique among audiences that still work, whatever the case or spacing", () => {
    const { access } = apply(base(), create("Sam Lee"), NOW);
    expect(problem(() => apply(access, create("sam  LEE"), NOW))).toBe("name.taken");
    expect(nameProblem(access, "SAM LEE", undefined, NOW)).toBe("name.taken");
    // Full-width letters normalize the same (NFKC).
    expect(nameProblem(access, "Ｓａｍ Lee", undefined, NOW)).toBe("name.taken");
  });
  it("can be reused once the earlier audience is withdrawn or expired", () => {
    const a = apply(base(), create("Asha"), NOW);
    const withdrawn = apply(a.access, { op: "withdraw", id: a.id }, NOW).access;
    expect(nameProblem(withdrawn, "Asha", undefined, NOW)).toBeUndefined();
    const later = new Date(NOW.getTime() + 31 * DAY);
    expect(nameProblem(a.access, "asha", undefined, later)).toBeUndefined();
  });
  it("can't be empty, too long, or the vault's own name", () => {
    expect(problem(() => apply(base(), create("   "), NOW))).toBe("name.empty");
    expect(problem(() => apply(base(), create("x".repeat(81)), NOW))).toBe("name.long");
    expect(problem(() => apply(base(), create("you"), NOW))).toBe("name.reserved");
  });
  it("can't hold control or format characters (review L4)", () => {
    for (const name of ["Asha\u200b", "As\u0007ha", "Asha\u202e", "\u2066Asha", "Asha\u0000"]) {
      expect(problem(() => apply(base(), create(name), NOW))).toBe("name.invalid");
      expect(nameProblem(base(), name, undefined, NOW)).toBe("name.invalid");
    }
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
  it("the list is pinned: 7,776 different words, exactly as published (review L7)", () => {
    const list = effWords();
    expect(new Set(list).size).toBe(7776);
    expect(createHash("sha256").update(list.join("\n")).digest("hex")).toBe("abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba");
  });
  it("made by the main process: { generate: true } gets four fresh words, marked generated (review L5)", () => {
    const g = apply(base(), create("Asha", { passcode: { generate: true } }), NOW).access.grants[1]!;
    expect(g.passcode!.generated).toBe(true);
    expect(g.passcode!.value).toMatch(/^[a-z]+(-[a-z]+){3}$/);
    // Without a generator (the window's copy of these rules) it can't be made.
    expect(() => applyAccessChange(base(), create("Asha", { passcode: { generate: true } }), NOW)).toThrow();
    const { access, id } = apply(base(), create("Asha"), NOW);
    const renewed = apply(access, { op: "update", id, passcode: { generate: true } }, NOW).access.grants.find((x) => x.id === id)!;
    expect(renewed.passcode).toMatchObject({ generated: true });
  });
  it("the publisher applies the same rule to a hand-edited access.json, without quoting the passcode", () => {
    const withCode = (value: string, generated?: boolean) => ({
      ...base(),
      grants: [...base().grants, { id: "shandedit01", name: "Asha", salt: "AAAAAAAAAAAAAAAAAAAAAA", passcode: { value, ...(generated === undefined ? {} : { generated }) }, scope: { notes: ["a.md"] }, createdAt: NOW.toISOString() }],
    });
    for (const p of ["password1234", "qwertyuiop12", "iloveyou2026", "Password1234", "Summer2026!!"]) {
      for (const generated of [undefined, true]) {
        let message = "";
        try { validateAccess(withCode(p, generated)); } catch (e) { message = String((e as Error).message); }
        expect(message, p).toMatch(/too easy to guess/);
        expect(message).not.toContain(p);
      }
    }
    for (let i = 0; i < 20; i++) expect(() => validateAccess(withCode(generatePasscode(), true))).not.toThrow();
    expect(() => validateAccess(withCode("blue tractor singing 42"))).not.toThrow();
    // A withdrawn audience's old passcode doesn't stop a deploy.
    const old = withCode("Password1234");
    old.grants[1] = { ...old.grants[1]!, revokedAt: NOW.toISOString() };
    expect(() => validateAccess(old)).not.toThrow();
  });
  it("custom: 16 or more characters, or 3 or more words, and rated strong (review M1)", () => {
    // Common passwords that pass a bits estimate alone.
    for (const p of ["password1234", "qwertyuiop12", "iloveyou2026", "Password1234", "Summer2026!!"]) {
      expect(passcodeProblem(p), p).toBe("passcode.short");
      expect(problem(() => apply(base(), create("Asha", { passcode: { value: p } }), NOW)), p).toBe("passcode.short");
    }
    expect(passcodeProblem("short")).toBe("passcode.short");
    expect(passcodeProblem("aaaaaaaaaaaaaaaaaaaa")).toBe("passcode.weak");
    expect(passcodeProblem("blue tractor singing 42")).toBeUndefined();
    expect(passcodeProblem("the the the the")).toBe("passcode.short");
    expect(passcodeProblem("Correct7Horse!Staple")).toBeUndefined();
    expect(problem(() => apply(base(), create("Asha", { passcode: { value: "aaaaaaaaaaaaaaaaaaaa" } }), NOW))).toBe("passcode.weak");
    expect(problem(() => apply(base(), create("Asha", { passcode: { value: "password" } }), NOW))).toBe("passcode.short");
  });
  it("are stored trimmed, as the reader derives them", () => {
    const g = apply(base(), create("Asha", { passcode: { value: `  ${STRONG} ` } }), NOW).access.grants[1]!;
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
    expect(problem(() => apply(base(), create("Asha", { expiresAt: new Date(NOW.getTime() - 1).toISOString() }), NOW))).toBe("expiry.past");
  });
  it("states: active, expires soon (3 days or less), expired, withdrawn", () => {
    const { access, id } = apply(base(), create("Asha"), NOW);
    const g = access.grants.find((x) => x.id === id)!;
    expect(audienceState(g, NOW)).toBe("active");
    expect(audienceState(g, new Date(NOW.getTime() + 28 * DAY))).toBe("soon");
    expect(audienceState(g, new Date(NOW.getTime() + 30 * DAY + 1))).toBe("expired");
    expect(audienceState({ ...g, expiresAt: null }, new Date(NOW.getTime() + 999 * DAY))).toBe("active");
    expect(audienceState({ ...g, revokedAt: NOW.toISOString() }, NOW)).toBe("withdrawn");
  });
  it("extends, which brings an expired audience back", () => {
    const { access, id } = apply(base(), create("Asha", { expiresAt: expiryFrom("1d", NOW) }), NOW);
    const later = new Date(NOW.getTime() + 2 * DAY);
    const g = apply(access, { op: "update", id, expiresAt: expiryFrom("90d", later) }, later).access.grants.find((x) => x.id === id)!;
    expect(audienceState(g, later)).toBe("active");
  });
});

describe("changing what it opens and how (SHR-08)", () => {
  it("changes the scope and keeps the secrets", () => {
    const { access, id } = apply(base(), create("Asha"), NOW);
    const before = access.grants.find((g) => g.id === id)!;
    const after = apply(access, { op: "update", id, scope: { notes: [], folders: ["trips"] } }, NOW).access.grants.find((g) => g.id === id)!;
    expect(after.scope).toEqual({ notes: [], folders: ["trips"] });
    expect(after.link).toEqual(before.link);
    expect(after.salt).toBe(before.salt);
  });
  it("adds a passcode, or removes the link, but never both ways", () => {
    const { access, id } = apply(base(), create("Asha"), NOW);
    const withCode = apply(access, { op: "update", id, passcode: { value: STRONG } }, NOW).access;
    const noLink = apply(withCode, { op: "update", id, link: false }, NOW).access.grants.find((g) => g.id === id)!;
    expect(noLink.link).toBeUndefined();
    expect(noLink.passcode?.value).toBe(STRONG);
    expect(problem(() => apply(withCode, { op: "update", id, link: false, passcode: null }, NOW))).toBe("waysIn.none");
  });
  it("never edits, withdraws, or deletes the vault, or an unknown grant", () => {
    for (const op of ["withdraw", "delete"] as const) expect(problem(() => apply(base(), { op, id: "gownergrant1" }, NOW))).toBe("owner");
    expect(problem(() => apply(base(), { op: "update", id: "gownergrant1", scope: { notes: ["a.md"], folders: [] } }, NOW))).toBe("owner");
    expect(problem(() => apply(base(), { op: "withdraw", id: "nosuchgrant" }, NOW))).toBe("notFound");
  });
});

describe("withdrawing and deleting (SHR-08)", () => {
  it("withdraw keeps the record, with when", () => {
    const { access, id } = apply(base(), create("Asha"), NOW);
    const w = apply(access, { op: "withdraw", id }, NOW).access;
    const g = w.grants.find((x) => x.id === id)!;
    expect(g.revokedAt).toBe(NOW.toISOString());
    expect(g.link).toBeDefined();
    expect(shareGrants(w)).toHaveLength(1);
    expect(() => validateAccess(w)).not.toThrow();
    // A withdrawn audience can't be changed back by an edit.
    expect(problem(() => apply(w, { op: "update", id, expiresAt: null }, NOW))).toBe("withdrawn");
  });
  it("delete removes the record", () => {
    const { access, id } = apply(base(), create("Asha"), NOW);
    const d = apply(access, { op: "delete", id }, NOW).access;
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
  it("lets the window ask for words or give its own passcode, never claim its own is generated (review L5)", () => {
    expect(parseAccessChange({ op: "update", id: "sabcdefgh", passcode: { generate: true } })).toEqual({ op: "update", id: "sabcdefgh", passcode: { generate: true } });
    expect(parseAccessChange({ op: "update", id: "sabcdefgh", passcode: { value: STRONG } })).toEqual({ op: "update", id: "sabcdefgh", passcode: { value: STRONG } });
    for (const passcode of [{ value: STRONG, generated: true }, { generate: false }, { generate: true, value: STRONG }]) {
      expect(() => parseAccessChange({ op: "update", id: "sabcdefgh", passcode })).toThrow();
    }
  });
});
