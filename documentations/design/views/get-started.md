# Use this app for yourself

The dialog a visitor opens on anyone's Focus Notes site: what Focus Notes is, and how to get your own.

> [!NOTE]
> **TL;DR.** Until a browser unlocks an instance's private notes, it shows the **visitor view** (PKG-09): the public notes, read-only, the notes written in that browser, and a quiet **Use this app for yourself** in the bottom-left corner (IA-VIEW-GETSTARTED, DST-01). It opens a dialog that says how Focus Notes works (your own independent instance in your own GitHub account, no server, nothing shared with the person whose site this is) and gives the steps: create a GitHub account, make your instance from the template (`focus-notes-workspace`), turn on GitHub Pages, and write in your site's browser (kept in that browser). Below the steps, **Download the desktop app** links to the latest GitHub Release, to save your notes to your repository. There's no separate Get started page: this dialog and the README say the same thing (D-87, D-90). Serves UC-SETUP-06 and SC-SETUP-05.

## Where it appears

| Where | What the visitor sees |
| --- | --- |
| **The bottom-left corner, until unlocked** | **Use this app for yourself**, a quiet button beside the account pill ([Main UI → The visitor view](../../experience/main-ui.html#visitors)). Everything else works as usual: anyone can write notes kept in their own browser. |
| **Spotlight, until unlocked** | The same command, so the keyboard reaches it. |

It's gone once the browser is unlocked with the owner's vault passphrase, and the desktop app never shows it.

## Dialog anatomy

| Part | Content |
| --- | --- |
| **Title** | Use this app for yourself |
| **How it works** | "Focus Notes is a writing app you run yourself. Your notes live in your own GitHub repositories, your app runs on your own GitHub Pages site, and nothing goes through a server, including the person whose site you're on." |
| **Get your own** | Four numbered steps, each with a link that opens GitHub's own page in a new tab: 1. **Create a GitHub account** (free works; skip this if you have one). 2. **Make your instance from the template**: *Use this template* on `focus-notes-workspace` (not the source repository). Keep it public. 3. **Turn on GitHub Pages**: in your instance, Settings → Pages → Source: GitHub Actions. Its *Deploy app* workflow deploys the released app, so you never build the app yourself. 4. **Write in your site's browser** at `https://<you>.github.io/<repository>/`. What you write there is kept in that browser ([Web app](../../architecture/web-app.md)). |
| **Save to your repository** | **Download the desktop app** for Windows, macOS, or Linux, linking to the latest GitHub Release. It saves your notes to your repository, sets your vault passphrase, and imports what you wrote in the browser. |
| **Footer** | A quiet link for people who want to change Focus Notes itself: *Fork the project repository*. And [Close]. |

## Behavior

- A centered dialog built from the Dialog component: focus moves into it, <kbd>Esc</kbd> or [Close] closes it, and focus goes back to the trigger.
- Every link is a plain link to `github.com` that opens in a new tab. The dialog makes no request of its own, and nothing about the visitor is sent anywhere (PRV-01).
- The download link uses GitHub's stable `releases/latest` URL, so the dialog never needs updating for a release.
- Its strings live in the message catalog like every other view, and it reflows on narrow windows and phones.

## Design decisions

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-GS-01 | Getting your own instance in the browser comes first; the desktop download comes second, as the way to save to your repository. | UC-SETUP-06 | Web first (D-80): nothing to install, and every step happens on GitHub's own pages. The browser keeps its own notes and the desktop app is the only GitHub editor (D-90). | Leading with the desktop download (D-43, superseded). |
| DD-GS-02 | The download link uses GitHub's latest-release URL. | UC-SETUP-06 | The dialog never goes stale, and it's still GitHub hosting only (D-21). | Version-specific links updated on every release. |
| DD-GS-03 | A dialog on every instance, not a separate Get started page. | UC-SETUP-06 | Visitors are already on a Focus Notes site, and the only hosting is each instance's own Pages (D-87). The README covers people who find the repository first. | A central product site with a Get started page (D-54, superseded). |
| DD-GS-04 | The dialog says plainly that the visitor's instance is independent and that nothing goes through a server or to the site's owner. | UC-SETUP-06 | Trust is the first question for a tool that touches your GitHub, and a visitor may assume the owner runs a service. | Burying it in a privacy policy. |
