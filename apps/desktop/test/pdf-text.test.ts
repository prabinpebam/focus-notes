import { expect, it } from "vitest";
import { pdfImages, pdfText } from "../e2e/pdf-text.ts";

it("IMG-12: reads italic Type3 byte glyphs and Type0 UTF-16 glyphs from the same PDF page", () => {
  const pdf = Buffer.from([
    "1 0 obj << /Type /Pages /Kids [2 0 R] >> endobj",
    "2 0 obj << /Type /Page /Font << /F1 3 0 R /F2 4 0 R >> /Contents 5 0 R >> endobj",
    "3 0 obj << /Subtype /Type3 /ToUnicode 6 0 R >> endobj",
    "4 0 obj << /Subtype /Type0 /ToUnicode 7 0 R >> endobj",
    "5 0 obj << >> stream\nBT /F1 16 Tf <6F> Tj /F2 16 Tf <0011> Tj ET\nendstream endobj",
    "6 0 obj << >> stream\n1 beginbfchar <6F> <004D> endbfchar\nendstream endobj",
    "7 0 obj << >> stream\n1 beginbfchar <0011> <0041> endbfchar\nendstream endobj",
  ].join("\n"));
  expect(pdfText(pdf).pages).toEqual(["MA"]);
});

it("IMG-12: measures image placements in top-origin page points and restores the PDF graphics state", () => {
  const pdf = Buffer.from([
    "1 0 obj << /Type /Page /MediaBox [0 0 612 792] /XObject << /X1 2 0 R >> /Contents 3 0 R >> endobj",
    "2 0 obj << /Subtype /Image /Width 80 /Height 50 >> endobj",
    "3 0 obj << >> stream\n1 0 0 -1 0 792 cm q 60 0 0 37.5 54 54 cm /X1 Do Q q 120 0 0 75 100 200 cm /X1 Do Q\nendstream endobj",
  ].join("\n"));
  expect(pdfImages(pdf)).toEqual([
    { page: 1, width: 80, height: 50, x: 54, y: 54, drawnWidth: 60, drawnHeight: 37.5, pageWidth: 612, pageHeight: 792 },
    { page: 1, width: 80, height: 50, x: 100, y: 200, drawnWidth: 120, drawnHeight: 75, pageWidth: 612, pageHeight: 792 },
  ]);
});
