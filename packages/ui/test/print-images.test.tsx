// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NoteContent } from "../src/blocks/NoteContent/NoteContent.tsx";

it("IMG-12: prints prepared pixels, display mode and caption, or a muted description with no broken icon", () => {
  const html = renderToStaticMarkup(<NoteContent blocks={[
    { type: "image", attrs: { print: true, printSrc: "data:image/png;base64,AAAA", alt: "Heron", title: "At the lake", mode: "actual" } },
    { type: "image", attrs: { print: true, printSrc: "", alt: "Missing photograph", title: "Missing caption" } },
  ]} />);
  expect(html).toContain('data-print-image');
  expect(html).toContain('data-image-mode="actual"');
  expect(html).toContain('src="data:image/png;base64,AAAA"');
  expect(html).toContain('alt="Heron"');
  expect(html).toContain("<figcaption");
  expect(html).toContain("At the lake");
  expect(html).toContain("<em>Missing photograph</em>");
  expect(html).toContain("Missing caption");
  expect(html).not.toContain("<svg");
});

it("IMG-12: never follows an unprepared or external image source", () => {
  const html = renderToStaticMarkup(<NoteContent blocks={[
    { type: "image", attrs: { src: "https://example.invalid/private.png" } },
    { type: "image", attrs: { print: true, printSrc: "https://example.invalid/private.png", alt: "Unavailable" } },
  ]} />);
  expect(html).not.toContain("<img");
  expect(html).not.toContain("https:");
  expect(html).toContain("<em>Unavailable</em>");
});

it("IMG-12: replaces failed pixels with their description before a subsequent print frame", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NoteContent blocks={[
      { type: "image", attrs: { print: true, printSrc: "data:image/png;base64,AAAA", alt: "", printDescription: "Image unavailable", title: "Retained caption" } },
    ]} />));
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    await act(async () => image!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("em")?.textContent).toBe("Image unavailable");
    expect(container.querySelector("figcaption")?.textContent).toBe("Retained caption");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
