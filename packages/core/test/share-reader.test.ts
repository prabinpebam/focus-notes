/** WP-5.4: the share reader's states, sessions, expiry, and sign-out (SHR-10, SHR-06, D-125). */
import { describe, expect, it, vi } from "vitest";
import { createShareReader, type OpenedShare, type SessionStore, type ShareSource } from "../src/share-reader.ts";

const T0 = Date.parse("2026-10-15T00:00:00Z");
const NOTES: Record<string, string> = {
  "drafts/Plan.md": "# The plan\n\nSee [the detail](sub/Detail.md) and [the diary](../Diary.md).\n",
  "drafts/sub/Detail.md": "# Detail\n\nThe detail.\n",
};
const share = (paths: string[], expiresAt: string | null = null, read = async (p: string) => NOTES[p]!): OpenedShare => ({
  notes: paths.map((path) => ({ path, title: path.split("/").at(-1)!.replace(".md", ""), updated: "2026-10-01T00:00:00Z" })),
  read,
  session: { s: paths.join() },
  expiresAt,
});

function setup(over: Partial<ShareSource> = {}, stored?: { session: unknown; remembered: boolean }) {
  const saved: { session: unknown; remembered: boolean }[] = [];
  let signedOut = 0;
  let otherTab = () => {};
  const store: SessionStore = {
    load: () => stored,
    save: (session, remembered) => void saved.push({ session, remembered }),
    signOut: () => void signedOut++,
    onSignedOut: (l) => { otherTab = l; return () => {}; },
  };
  const source: ShareSource = {
    openLink: vi.fn(async () => share(["drafts/Plan.md", "drafts/sub/Detail.md"])),
    openPasscode: vi.fn(async (name: string, passcode: string) => {
      if (name !== "Sam" || passcode !== "orbit maple quiet river") throw new Error("key");
      return share(["drafts/Plan.md"]);
    }),
    resume: vi.fn(async () => share(["drafts/Plan.md"])),
    ...over,
  };
  let clock = T0;
  const timers: { fn: () => void; at: number }[] = [];
  const r = createShareReader({
    source, store, format: (k) => (k === "share.reader.list.title" ? "Shared with you" : k), now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return () => void timers.splice(timers.indexOf(t), 1); },
  });
  const advance = (ms: number) => { clock += ms; for (const t of timers.filter((x) => x.at <= clock)) { timers.splice(timers.indexOf(t), 1); t.fn(); } };
  return { r, source, saved, signedOuts: () => signedOut, otherTab: () => otherTab(), advance };
}
const text = (blocks: unknown) => JSON.stringify(blocks);

describe("share reader (SHR-10)", () => {
  it("with no link and no session, shows the name and passcode form", async () => {
    const { r } = setup();
    expect(r.state.phase).toBe("opening");
    await r.start(undefined, "");
    expect(r.state).toMatchObject({ phase: "gate", error: false, signedOut: false });
  });

  it("a magic link opens its list, keeps the session in this tab only, and each note by its fragment", async () => {
    const { r, saved } = setup();
    await r.start({ id: "gshare001", secret: "s" }, "");
    expect(saved).toEqual([{ session: { s: "drafts/Plan.md,drafts/sub/Detail.md" }, remembered: false }]);
    expect(r.state).toMatchObject({ phase: "list", multiple: true });
    expect(text(r.state.list)).toContain("Shared with you");
    await r.navigate("#note=drafts%2FPlan.md");
    expect(r.state.phase).toBe("note");
    // Links go only to notes in the share; the diary is plain text.
    expect(text(r.state.note.body)).toContain('"href":"#note=drafts%2Fsub%2FDetail.md"');
    expect(text(r.state.note.body)).not.toContain("Diary.md\"}");
    r.showList();
    expect(r.state.phase).toBe("list");
  });

  it("a share of one note opens straight to it", async () => {
    const { r } = setup();
    await r.start(undefined, "");
    await r.submit("Sam", "orbit maple quiet river");
    expect(r.state).toMatchObject({ phase: "note", multiple: false });
    expect(text(r.state.note.title)).toContain("The plan");
  });

  it("nothing outside the share is reachable through the fragment", async () => {
    const read = vi.fn(async (p: string) => NOTES[p]!);
    const { r } = setup({ openLink: async () => share(["drafts/Plan.md", "drafts/sub/Detail.md"], null, read) });
    await r.start({ id: "gshare001", secret: "s" }, "#note=Diary.md");
    expect(r.state.phase).toBe("list");
    for (const h of ["#note=Diary.md", "#note=..%2FDiary.md", "#note=%zz", "#x"]) {
      await r.navigate(h);
      expect(r.state.phase).toBe("list");
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("SHR-06: a wrong name or passcode, an empty field, and a failed link each say so without detail", async () => {
    const { r, saved } = setup({ openLink: async () => { throw new Error("key"); } });
    await r.start({ id: "gshare001", secret: "s" }, "");
    expect(r.state).toMatchObject({ phase: "gate", error: true });
    await r.submit("Sam", "");
    expect(r.state).toMatchObject({ empty: true, error: false });
    await r.submit("Kim", "orbit maple quiet river");
    expect(r.state).toMatchObject({ phase: "gate", error: true, empty: false, busy: false });
    await r.submit("Sam", "wrong passcode words");
    expect(r.state).toMatchObject({ phase: "gate", error: true });
    expect(saved).toEqual([]);
  });

  it("remembering on this device moves the session, and a remembered session reopens without asking", async () => {
    const first = setup();
    await first.r.start(undefined, "");
    await first.r.submit("Sam", "orbit maple quiet river", true);
    expect(first.saved.at(-1)).toMatchObject({ remembered: true });
    first.r.setRemember(false);
    expect(first.saved.at(-1)).toMatchObject({ remembered: false });
    const later = setup({}, { session: { s: "x" }, remembered: true });
    await later.r.start(undefined, "");
    expect(later.source.resume).toHaveBeenCalledWith({ s: "x" });
    expect(later.r.state).toMatchObject({ phase: "note", remember: true });
  });

  it("SHR-06: a stored session that no longer opens (withdrawn) is forgotten, with the generic error", async () => {
    const { r, signedOuts } = setup({ resume: async () => { throw new Error("key"); } }, { session: {}, remembered: true });
    await r.start(undefined, "");
    expect(r.state).toMatchObject({ phase: "gate", error: true });
    expect(signedOuts()).toBe(1);
  });

  it("SHR-06: the grant's expiry ends the session while the page is open", async () => {
    const { r, advance, signedOuts } = setup({ openLink: async () => share(["drafts/Plan.md"], new Date(T0 + 60_000).toISOString()) });
    await r.start({ id: "gshare001", secret: "s" }, "");
    expect(r.state.phase).toBe("note");
    advance(59_000);
    expect(r.state.phase).toBe("note");
    advance(1_000);
    expect(r.state).toMatchObject({ phase: "gate", error: true });
    expect(signedOuts()).toBe(1);
  });

  it("signing out here or in another tab forgets the share and shows the form again", async () => {
    const a = setup();
    await a.r.start({ id: "gshare001", secret: "s" }, "");
    a.r.signOut();
    expect(a.r.state).toMatchObject({ phase: "gate", signedOut: true, error: false });
    expect(a.signedOuts()).toBe(1);
    const b = setup();
    await b.r.start({ id: "gshare001", secret: "s" }, "");
    b.otherTab();
    expect(b.r.state).toMatchObject({ phase: "gate", signedOut: true });
    await b.r.navigate("#note=drafts%2FPlan.md");
    expect(b.r.state.phase).toBe("gate");
  });

  it("a note that fails to read is read afresh once (a new deploy), then fails with the generic error", async () => {
    let reads = 0;
    const flaky = async (p: string) => { if (reads++ === 0) throw new Error("gone"); return NOTES[p]!; };
    const ok = setup({ openLink: async () => share(["drafts/Plan.md"], null, flaky), resume: async () => share(["drafts/Plan.md"]) });
    await ok.r.start({ id: "gshare001", secret: "s" }, "");
    expect(ok.r.state.phase).toBe("note");
    const broken = async () => { throw new Error("gone"); };
    const bad = setup({ openLink: async () => share(["drafts/Plan.md"], null, broken), resume: async () => share(["drafts/Plan.md"], null, broken) });
    await bad.r.start({ id: "gshare001", secret: "s" }, "");
    expect(bad.r.state).toMatchObject({ phase: "gate", error: true });
  });
});
