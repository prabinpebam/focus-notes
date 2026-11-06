import canvas from "../views/canvas.view.json" with { type: "json" };
import settings from "../views/settings.view.json" with { type: "json" };
import theme from "../views/theme.view.json" with { type: "json" };
import history from "../views/history.view.json" with { type: "json" };
import feedback from "../views/feedback.view.json" with { type: "json" };
import panelFailure from "../views/panelFailure.view.json" with { type: "json" };
import rewrite from "../views/rewrite.view.json" with { type: "json" };
import newNote from "../views/newNote.view.json" with { type: "json" };
import projects from "../views/projects.view.json" with { type: "json" };
import projectNew from "../views/projectNew.view.json" with { type: "json" };
import projectIntro from "../views/projectIntro.view.json" with { type: "json" };
import localImport from "../views/localImport.view.json" with { type: "json" };
import shareItem from "../views/shareItem.view.json" with { type: "json" };
import sitePreview from "../views/sitePreview.view.json" with { type: "json" };
import siteLanding from "../views/siteLanding.view.json" with { type: "json" };
import sitePage from "../views/sitePage.view.json" with { type: "json" };
import { pages, messages } from "./pages.ts";
import { mocks, mockData } from "../mocks/index.ts";
import { shareMocks } from "../mocks/share/index.ts";
import { uiStatesMocks } from "../mocks/ui-states/index.ts";
import { openMocks } from "../mocks/open/index.ts";
import { projectMocks } from "../mocks/project/index.ts";
import { imageEditMocks } from "../mocks/image-edit/index.ts";
import { compose } from "./compose.ts";

/** Every view document in the app. Fragments join this when they exist. */
export const views: Record<string, unknown> = { canvas: compose(canvas), settings: compose(settings), theme, history, feedback, panelFailure, rewrite, newNote, shareItem, sitePreview: compose(sitePreview), projects: compose(projects), projectNew, projectIntro, localImport };
export { pages, messages };
/** The product site's pages (IA-VIEW-SITE, WP-10.1; help is in the Slate docs, D-181), rendered at build time by the site's renderer. */
export const sitePages: Record<string, unknown> = { siteLanding, sitePage };
export const fragments: Record<string, unknown> = {};
/**
 * UX mocks awaiting the owner's review (strict design): clickable flows on fake data, shown only in the
 * gallery under "Mocks: Projects, files and images". Nothing here is wired into the app.
 */
export { mocks, mockData };

/** Design mocks shown in the gallery before anything is wired (strict design mode): one group per area, each with its views, fake data and entries. */
export const mockGroups = [projectMocks, openMocks, shareMocks, uiStatesMocks, imageEditMocks];
