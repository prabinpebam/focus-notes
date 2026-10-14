/**
 * The packaged app's smoke check (DSK, the Windows installer): with FOCUS_NOTES_E2E_EXE set to the
 * unpacked build (`release\win-unpacked\focus-notes.exe`), it starts, shows the note, and carries
 * the app icon: in the executable's resources (the taskbar's and Explorer's) and for the window.
 * Skipped without it, so the suite runs on the build as usual.
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
// The wire's bytes: '1' a fuse turned on, '0' turned off (@electron/fuses doesn't export its FuseState).
const FuseState = { ENABLE: 0x31, DISABLE: 0x30 } as const;
import { launch, quit, tempDirs } from "./helpers.ts";

test.skip(!process.env.FOCUS_NOTES_E2E_EXE, "runs on the packaged app only (FOCUS_NOTES_E2E_EXE)");

test("packaged: it starts, shows the note, and has the app icon on the executable and the window", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA note.\n");
  const l = await launch(dirs);
  const { page, app } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText("A note.");
  // The executable's icon resources (the taskbar's and Explorer's) are build/icon.ico's images,
  // byte for byte: each of its PNG images is in the executable. (The shell's own icon lookup caches
  // by file and can answer with an earlier build's.)
  const ico = readFileSync(join(import.meta.dirname, "..", "build", "icon.ico"));
  const exeBytes = readFileSync(process.env.FOCUS_NOTES_E2E_EXE!);
  const images = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico.subarray(ico.readUInt32LE(6 + 16 * i + 12), ico.readUInt32LE(6 + 16 * i + 12) + ico.readUInt32LE(6 + 16 * i + 8)));
  expect(images.length).toBe(6);
  for (const [i, img] of images.entries()) expect(exeBytes.includes(img), `icon image ${i} in the executable`).toBe(true);
  // The window's icon, packaged beside the main process.
  const icon = await app.evaluate(({ app: a, nativeImage }) => {
    const win = nativeImage.createFromPath(`${a.getAppPath()}/out/main/icon.png`);
    return { packaged: a.isPackaged, window: win.isEmpty() ? null : win.getSize() };
  });
  expect(icon.packaged).toBe(true);
  expect(icon.window).toEqual({ width: 512, height: 512 });
  await quit(l);
});

test("SEC-01: the packaged executable's Electron fuses: no Node mode, no NODE_OPTIONS or inspector, only the integrity-checked ASAR, encrypted cookies", async () => {
  const wire = await getCurrentFuseWire(process.env.FOCUS_NOTES_E2E_EXE!);
  expect(wire[FuseV1Options.RunAsNode]).toBe(FuseState.DISABLE);
  expect(wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(FuseState.DISABLE);
  expect(wire[FuseV1Options.EnableNodeCliInspectArguments]).toBe(FuseState.DISABLE);
  expect(wire[FuseV1Options.EnableCookieEncryption]).toBe(FuseState.ENABLE);
  expect(wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(FuseState.ENABLE);
  expect(wire[FuseV1Options.OnlyLoadAppFromAsar]).toBe(FuseState.ENABLE);
});
