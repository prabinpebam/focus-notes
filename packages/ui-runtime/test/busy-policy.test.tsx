// @vitest-environment happy-dom
/**
 * The one busy policy (Waits, PRF-08, D-199; design-system audit DS-A06): Button and IconButton,
 * driven by the real task tracker on a fake clock, behave the same through short, waiting,
 * completed, failed, and repeated operations, and under reduced motion.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { waits } from "@focus-notes/tokens";
import { TaskTracker, busyProps, type Clock, type TaskView } from "@focus-notes/core";
import { Button } from "../../ui/src/primitives/Button/Button.tsx";
import { IconButton } from "../../ui/src/primitives/IconButton/IconButton.tsx";
import { busySpinner as buttonSign } from "../../ui/src/primitives/Button/Button.css.ts";
import { busySpinner as iconButtonSign } from "../../ui/src/primitives/IconButton/IconButton.css.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const REPO = resolve(process.cwd());

const WORDS: Record<string, string> = { "task.publishing": "Publishing…", "task.published": "Published", "task.done": "Done" };
const format = (key: string, args?: Record<string, string | number>) => (key === "task.elapsed" ? `${args!.words} ${args!.seconds} s` : WORDS[key] ?? key);

function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => (timers.push({ at: now + ms, fn, id: ++id }), id),
    clearTimeout: (h) => (timers = timers.filter((t) => t.id !== h)),
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
      await Promise.resolve();
    }
    now = end;
    await Promise.resolve();
  };
  return { clock, advance };
}

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete document.documentElement.dataset.motion;
});

/** One Button and one IconButton bound to the same target, re-rendered whenever the tracker changes. */
function setup() {
  const { clock, advance } = fakeClock();
  let tasks: TaskView[] = [];
  let presses = 0;
  let pending: { resolve: () => void; reject: (e: unknown) => void } | undefined;
  let run: Promise<void> | undefined;
  const press = () => {
    presses++;
    run = tracker.run("publish", "task.publishing", () => new Promise<void>((resolve, reject) => (pending = { resolve, reject })), "task.published").catch(() => {});
  };
  const render = () => {
    const b = busyProps(tasks, "publish", format);
    act(() => root.render(createElement(Fragment, null,
      createElement(Button, { id: "b", label: "Publish", icon: "save", ...b, onPress: press }),
      createElement(IconButton, { id: "i", label: "Publish", icon: "save", ...b, onPress: press }),
    )));
  };
  const tracker = new TaskTracker(waits, { change: (t) => { tasks = t; render(); }, announce: () => {} }, clock);
  render();
  const step = async (ms: number) => { await act(async () => { await advance(ms); }); };
  const end = async (ok: boolean) => { await act(async () => { if (ok) pending!.resolve(); else pending!.reject(new Error("failed")); await run; }); };
  const click = (id: string) => act(() => document.getElementById(id)!.click());
  return { step, end, click, presses: () => presses };
}

/** What a person and a screen reader get from each control. */
function seen(id: "b" | "i") {
  const el = document.getElementById(id)!;
  return {
    ariaBusy: el.getAttribute("aria-busy"),
    inert: el.getAttribute("aria-disabled"),
    phase: el.getAttribute("data-busy"),
    name: id === "b" ? el.textContent : el.getAttribute("aria-label"),
    // The sign: a Spinner in the icon's cell (revealed by the style after cmp.*.busy.signDelay).
    sign: el.getElementsByClassName(id === "b" ? buttonSign : iconButtonSign).length > 0,
  };
}
const both = () => ({ button: seen("b"), iconButton: seen("i") });
const all = (s: ReturnType<typeof seen>) => ({ button: s, iconButton: s });

const REST = { ariaBusy: null, inert: null, phase: null, name: "Publish", sign: false };
const ACK = { ariaBusy: "true", inert: "true", phase: "on", name: "Publish", sign: true };
const ON = { ...ACK, name: "Publishing…" };
const DONE = { ariaBusy: null, inert: null, phase: "done", name: "Published", sign: false };

describe("the busy policy, the same for Button and IconButton (D-199)", () => {
  it("short: inert at once, nothing new to read, and back at rest when the work ends before wait.signDelay", async () => {
    const t = setup();
    t.click("b");
    expect(both()).toEqual(all(ACK));
    await t.step(waits.signDelay - 100);
    await t.end(true);
    expect(both()).toEqual(all(REST));
  });

  it("waiting: the words after wait.signDelay, the elapsed seconds after wait.elapsedDelay", async () => {
    const t = setup();
    t.click("i");
    await t.step(waits.signDelay);
    expect(both()).toEqual(all(ON));
    await t.step(waits.elapsedDelay - waits.signDelay);
    expect(both()).toEqual(all({ ...ON, name: "Publishing… 3 s" }));
  });

  it("completed: the sign holds for wait.signMinimum, then the done words for wait.doneDuration, then rest", async () => {
    const t = setup();
    t.click("b");
    await t.step(waits.signDelay + 100);
    await t.end(true);
    expect(both()).toEqual(all(ON));
    await t.step(waits.signMinimum - 100);
    expect(both()).toEqual(all(DONE));
    await t.step(waits.doneDuration);
    expect(both()).toEqual(all(REST));
  });

  it("failed: the sign ends at once and the control is back at rest", async () => {
    const t = setup();
    t.click("i");
    await t.step(waits.signDelay + 100);
    await t.end(false);
    expect(both()).toEqual(all(REST));
  });

  it("repeated: presses while busy do nothing; pressing while it says done starts over", async () => {
    const t = setup();
    t.click("b");
    t.click("b");
    t.click("i");
    await t.step(waits.signDelay);
    t.click("i");
    expect(t.presses()).toBe(1);
    await t.end(true);
    await t.step(waits.signMinimum);
    expect(both()).toEqual(all(DONE));
    t.click("i");
    expect(t.presses()).toBe(2);
    expect(both()).toEqual(all(ACK));
    await t.step(waits.signDelay);
    expect(both()).toEqual(all(ON));
  });

  it("reduced motion: the same phases and words; only the Spinner stands still", async () => {
    document.documentElement.dataset.motion = "reduced";
    const t = setup();
    t.click("b");
    expect(both()).toEqual(all(ACK));
    await t.step(waits.signDelay);
    expect(both()).toEqual(all(ON));
    await t.end(true);
    await t.step(waits.signMinimum);
    expect(both()).toEqual(all(DONE));
    // The timing is the tracker's and the wait tokens'; reduced motion changes only motion.spin.
    const css = readFileSync(resolve(REPO, "packages/tokens/dist/tokens.css"), "utf8");
    const reduced = css.slice(css.indexOf(':root[data-motion="reduced"]'));
    const block = reduced.slice(0, reduced.indexOf("}"));
    expect(block).toMatch(/--fn-motion-spin: var\(--fn-ref-duration-0\)/);
    expect(block).not.toMatch(/--fn-wait-|busy-sign-delay/);
  });

  it("times the sign from the wait tokens, never a component timer", () => {
    const css = readFileSync(resolve(REPO, "packages/tokens/dist/tokens.css"), "utf8");
    for (const cmp of ["button", "icon-button"]) expect(css).toMatch(new RegExp(`--fn-cmp-${cmp}-busy-sign-delay: var\\(--fn-wait-sign-delay\\)`));
    for (const f of ["Button/Button.tsx", "IconButton/IconButton.tsx", "ItemCard/ItemCard.tsx"]) {
      const src = readFileSync(resolve(REPO, `packages/ui/src/primitives/${f}`), "utf8");
      expect(src).toMatch(/useBusy\(/);
      expect(src).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    }
  });
});
