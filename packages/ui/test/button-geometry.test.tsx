import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cloneElement, type ReactElement } from "react";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button } from "../src/primitives/Button/Button.tsx";
import { IconButton } from "../src/primitives/IconButton/IconButton.tsx";
import { MenuButton } from "../src/primitives/MenuButton/MenuButton.tsx";
import { PillButton } from "../src/primitives/PillButton/PillButton.tsx";
import { TriggerButton } from "../src/primitives/TriggerButton/TriggerButton.tsx";
import { PickerButton } from "../src/primitives/PickerButton/PickerButton.tsx";
import { FloatingContext } from "../src/layouts/Layer/floating.ts";
import { compileStyles } from "../../../tools/spacing/compile-css.mjs";

const requireDesktop = createRequire(resolve("apps/desktop/package.json"));
const { _electron } = requireDesktop("@playwright/test") as typeof import("@playwright/test");
const states = ["rest", "hovered", "pressed", "focus-visible", "disabled", "pending", "selected"] as const;
const variants = ["primary", "secondary", "subtle", "danger"] as const;
const sizes = ["s", "m", "l"] as const;

describe("D-354: buttons own their padding and paint in every state", () => {
  let app: Awaited<ReturnType<typeof _electron.launch>>;
  let page: Awaited<ReturnType<typeof app.firstWindow>>;
  let css: string;
  const controls: { name: string; element: ReactElement<{ busy?: boolean; disabled?: boolean; toggle?: boolean; pressed?: boolean; selected?: boolean; commit?: "rest" | "pending" }> }[] = [
    ...variants.flatMap(variant => sizes.flatMap(size => [false, true].flatMap(bleed => ([undefined, "start", "end"] as const).map(iconPosition => ({
      name: `${variant}/${size}/bleed=${bleed}/icon=${iconPosition ?? "none"}`,
      element: <Button label="More options" variant={variant} size={size} bleed={bleed} {...(iconPosition ? { icon: "more" as const, iconPosition } : {})} />,
    }))))),
    ...(["text", "select", "pill", "icon"] as const).flatMap(variant => [false, true].map(bleed => ({
      name: `menu/${variant}/bleed=${bleed}`,
      element: <MenuButton label="More options" text="More options" variant={variant} bleed={bleed} sections={[]} />,
    }))),
    ...[false, true].map(bleed => ({ name: `icon/bleed=${bleed}`, element: <IconButton label="More options" icon="more" bleed={bleed} /> })),
    { name: "pill", element: <PillButton label="More options" /> },
    { name: "trigger", element: <TriggerButton label="More options" /> },
    ...(["compact", "fontTile", "themeTile"] as const).map(variant => ({ name: `picker/${variant}`, element: <PickerButton label="Theme" value="Paper" variant={variant} /> })),
  ];

  function render(floating: boolean, state: (typeof states)[number]) {
    const elements = controls.map(control => <div key={control.name}>{cloneElement(control.element, {
      busy: state === "pending",
      disabled: state === "disabled",
      toggle: true,
      pressed: state === "selected",
      selected: state === "selected",
      commit: state === "pending" ? "pending" : "rest",
    })}</div>);
    return renderToStaticMarkup(<FloatingContext.Provider value={floating}>{elements}</FloatingContext.Provider>);
  }

  beforeAll(async () => {
    css = readFileSync(resolve("packages/tokens/dist/tokens.css"), "utf8") +
      (await compileStyles()).filter(({ file }) => /primitives\/(Button|IconButton|MenuButton|PillButton|TriggerButton|PickerButton|SignalDot|Icon|Spinner|CommitMark)\//.test(file) || file.endsWith("control.css.ts"))
        .map(({ css }) => css).join("\n");
    app = await _electron.launch({
      executablePath: requireDesktop("electron"),
      args: [resolve("tools/spacing/button-window.cjs")],
      env: { ...process.env, FOCUS_NOTES_E2E: "1", ELECTRON_ENABLE_LOGGING: "0" },
    });
    page = await app.firstWindow();
  }, 120_000);
  afterAll(async () => { if (app) await app.close(); });

  async function measure() {
    return page.locator("button").evaluateAll(buttons => buttons.map(button => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      const child = button.querySelector('[class*="controlLabel"], [class*="Button_label"]')?.getBoundingClientRect();
      const padding = [style.paddingInlineStart, style.paddingInlineEnd];
      const tokenPadding = padding.map((_, side) => {
        const property = side === 0 ? "padding-inline-start" : "padding-inline-end";
        const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
        const values: string[] = [];
        const visit = (rules: CSSRule[]) => {
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && button.matches(rule.selectorText)) {
              const value = rule.style.getPropertyValue(property) || rule.style.getPropertyValue("padding-inline") || rule.style.getPropertyValue("padding");
              if (value) values.push(value);
            } else if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches) visit([...rule.cssRules]);
          }
        };
        visit(rules);
        return values.at(-1)?.includes("var(--fn-") ?? false;
      });
      return {
        padding, tokenPadding,
        geometry: [rect.x, rect.y, rect.width, rect.height, ...padding.map(Number.parseFloat),
          style.borderInlineStartWidth, style.borderInlineEndWidth, child?.x, child?.y, child?.width, child?.height],
        outsidePaint: ["::before", "::after"].some(pseudo => {
          const s = getComputedStyle(button, pseudo);
          return s.content !== "none" && s.content !== "normal" &&
            (s.backgroundImage !== "none" || !["rgba(0, 0, 0, 0)", "transparent"].includes(s.backgroundColor));
        }),
      };
    }));
  }

  it("renders every variant x size x state without zero/literal padding, shifted content or offset paint", async () => {
    for (const floating of [false, true]) {
      await page.setContent(`<style>${css}</style><main id="cases">${render(floating, "rest")}</main>`);
      const rest = await measure();
      expect(rest).toHaveLength(controls.length);
      for (const state of states) {
        await page.locator("#cases").evaluate((el, html) => { el.innerHTML = html; }, render(floating, state));
        await page.locator("button").evaluateAll((buttons, state) => {
          for (const button of buttons) {
            if (state === "disabled") button.setAttribute("aria-disabled", "true");
            else if (state === "pending") button.setAttribute("data-busy", "on");
            else if (state !== "rest") button.setAttribute(`data-${state}`, "");
          }
        }, state);
        const measured = await measure();
        measured.forEach((value, i) => {
          const label = `${controls[i]!.name}/${state}/floating=${floating}`;
          expect(value.padding.every(value => Number.parseFloat(value) > 0), label).toBe(true);
          expect(value.tokenPadding, label).toEqual([true, true]);
          expect(value.geometry, label).toEqual(rest[i]!.geometry);
          expect(value.outsidePaint, label).toBe(false);
        });
      }
    }
  }, 120_000);

  it("rejects deliberately broken zero/literal padding, state drift and an offset hover layer", async () => {
    await page.setContent(`<style>${css}
      button { padding-inline: 0px !important; }
      button[data-hovered] { transform: translateX(1px); }
      button[data-hovered]::before { content: ""; position: absolute; inset: -10px; background: red; }
      </style>${renderToStaticMarkup(<Button label="Broken fixture" />)}`);
    const [rest] = await measure();
    expect(rest).toBeDefined();
    expect(rest!.padding.some(value => Number.parseFloat(value) === 0)).toBe(true);
    expect(rest!.tokenPadding).toEqual([false, false]);
    await page.locator("button").evaluate(button => button.setAttribute("data-hovered", ""));
    const [hovered] = await measure();
    expect(hovered!.geometry).not.toEqual(rest!.geometry);
    expect(hovered!.outsidePaint).toBe(true);
  });
});
