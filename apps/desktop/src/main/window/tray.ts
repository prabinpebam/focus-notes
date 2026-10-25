import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { Menu, nativeImage, Tray } from "electron";

/**
 * Close to the tray (DSK-11, D-217): on Windows, closing the main window hides it and the app keeps
 * running in the notification area, so opening it again is instant. Quitting is the tray's *Quit*.
 */
export interface TraySettings {
  version: 1;
  /** Closing the main window hides it; off, closing quits as before. */
  closeToTray: boolean;
  /** The one-time notice that the app is still running was shown. */
  told: boolean;
}

const DEFAULTS: TraySettings = { version: 1, closeToTray: true, told: false };

export function readTraySettings(file: string): TraySettings {
  try {
    const s = JSON.parse(readFileSync(file, "utf8")) as Partial<TraySettings>;
    if (s.version !== 1) return { ...DEFAULTS };
    return { version: 1, closeToTray: s.closeToTray !== false, told: s.told === true };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Where close to the tray applies: Windows only for now (D-211). Journeys keep the old close unless
 * one opts in (`FOCUS_NOTES_E2E_TRAY=1`), and then the icon is only logged, never put on the screen (D-141).
 */
export function trayMode(platform: string, env: NodeJS.ProcessEnv): "off" | "icon" | "logged" {
  if (platform !== "win32") return "off";
  if (env.FOCUS_NOTES_E2E === "1") return env.FOCUS_NOTES_E2E_TRAY === "1" ? "logged" : "off";
  return "icon";
}

export interface AppTrayOptions {
  mode: "icon" | "logged";
  file: string;
  icon: string;
  open: () => void;
  quit: () => void;
  log: (line: string) => void;
}

export class AppTray {
  #settings: TraySettings;
  #tray: Tray | undefined;
  readonly #o: AppTrayOptions;

  constructor(o: AppTrayOptions) {
    this.#o = o;
    this.#settings = readTraySettings(o.file);
    if (o.mode === "logged") {
      o.log("tray: ready (logged only)");
      return;
    }
    const image = nativeImage.createFromPath(o.icon);
    this.#tray = new Tray(image.isEmpty() ? image : image.resize({ width: 32, height: 32, quality: "best" }));
    this.#tray.setToolTip("Focus Notes");
    this.#tray.on("click", () => o.open());
    this.#tray.on("balloon-click", () => o.open());
    this.#menu();
  }

  /** Closing the main window hides it. */
  get closeToTray(): boolean {
    return this.#settings.closeToTray;
  }

  /** The window was hidden: the first time ever, say the app is still running and where it is. */
  hidden(): void {
    if (this.#settings.told) return;
    this.#save({ told: true });
    if (!this.#tray) {
      this.#o.log("tray: told once");
      return;
    }
    this.#tray.displayBalloon({
      iconType: "custom",
      icon: nativeImage.createFromPath(this.#o.icon),
      title: "Focus Notes is still running",
      content: "Your notes keep backing up. Open it from here, or right-click to quit.",
    });
  }

  dispose(): void {
    this.#tray?.destroy();
    this.#tray = undefined;
  }

  #menu(): void {
    this.#tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Focus Notes", click: () => this.#o.open() },
        { type: "separator" },
        {
          label: "Keep running when closed",
          type: "checkbox",
          checked: this.#settings.closeToTray,
          click: (item) => this.#save({ closeToTray: item.checked }),
        },
        { type: "separator" },
        { label: "Quit Focus Notes", click: () => this.#o.quit() },
      ]),
    );
  }

  #save(patch: Partial<Omit<TraySettings, "version">>): void {
    this.#settings = { ...this.#settings, ...patch };
    this.#menu();
    try {
      const tmp = `${this.#o.file}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(this.#settings, null, 2)}\n`);
      renameSync(tmp, this.#o.file);
    } catch {
      // Not remembering the choice never stops the app.
    }
  }
}
