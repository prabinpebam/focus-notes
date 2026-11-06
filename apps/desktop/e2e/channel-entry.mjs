import { app } from "electron";

// Both channels see the same synthetic legacy default, never the owner's real profile.
app.setPath("userData", process.env.FOCUS_NOTES_TEST_LEGACY_PROFILE);
delete process.env.FOCUS_NOTES_USER_DATA;
delete process.env.FOCUS_NOTES_PROJECTS_PROFILE;
delete process.env.FOCUS_NOTES_PROJECT_NOTE;
await import("../out/main/main.mjs");
