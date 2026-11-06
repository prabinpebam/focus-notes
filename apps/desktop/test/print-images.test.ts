// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { preparePrintImages } from "../src/main/print-images.ts";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it("IMG-12: decodes every print image, never editor images, before finishing", async () => {
  document.body.innerHTML = '<img id="editor"><div data-print-root><figure data-print-image><img id="one"></figure><figure data-print-image><img id="two"></figure></div>';
  let finish!: () => void;
  const editor = vi.fn();
  const one = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const two = vi.fn(async () => {});
  Object.assign(document.getElementById("editor")!, { decode: editor });
  Object.assign(document.getElementById("one")!, { decode: one });
  Object.assign(document.getElementById("two")!, { decode: two });
  let ready = false;
  const work = preparePrintImages().then(() => { ready = true; });
  await Promise.resolve();
  expect(one).toHaveBeenCalledOnce();
  expect(two).toHaveBeenCalledOnce();
  expect(editor).not.toHaveBeenCalled();
  expect(ready).toBe(false);
  finish();
  await work;
  expect(ready).toBe(true);
});

it("IMG-12: a decode failure must render its description, not blank or broken pixels", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.body.innerHTML = '<div data-print-root><figure data-print-image><img></figure></div>';
  const image = document.querySelector("img")!;
  Object.assign(image, { decode: vi.fn(async () => { throw new Error("bad pixels"); }) });
  image.addEventListener("error", () => image.replaceWith(document.createTextNode("A heron")));
  await preparePrintImages();
  expect(document.querySelector("img")).toBeNull();
  expect(document.body.textContent).toBe("A heron");
});

it("IMG-12: refuses to print when a decode failure has not been replaced", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.body.innerHTML = '<div data-print-root><figure data-print-image><img></figure></div>';
  Object.assign(document.querySelector("img")!, { decode: vi.fn(async () => { throw new Error("bad pixels"); }) });
  await expect(preparePrintImages()).rejects.toThrow("Print image description did not replace unavailable pixels");
});
