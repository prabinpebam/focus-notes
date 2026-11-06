import { app } from "electron";

// Both channels see the same synthetic legacy default, never the owner's real profile.
app.setPath("userData", process.env.FOCUS_NOTES_TEST_LEGACY_PROFILE);
await import("../out/main/main.mjs");
