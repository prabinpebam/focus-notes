# Microsoft Store

How Focus Notes reaches the Microsoft Store: what every release already builds, the steps only the owner can take in Partner Center, and what happens after them (PKG-12, [D-202](decisions.md)).

> [!NOTE]
> **TL;DR.** Every release builds an MSIX package, `Focus-Notes-<version>-store-x64.msix`, beside the NSIS installer (which stays the direct download). The package is unsigned, because the Store signs it. Its command-line tool is the app execution alias `focus-notes`, and `focus-notes:` links are in its manifest. The Store refuses versions that start with 0, so **the first Store release is v1.0.0**, held to the [indie release bar](gate-evidence.md#version-1-0-for-the-microsoft-store) the owner approves. The owner does five things once: (1) create a developer account; (2) reserve *Focus Notes*; (3) copy its identity into three repository variables; (4) register an Entra app for publishing and put its four secrets in the `release` environment; (5) make the first submission by hand with the listing in `store/`, then add the Store ID as a fifth variable. After that, publishing a release submits it to the Store automatically, and Microsoft certifies it, usually within three business days.

## What's automated and what's yours

| Step | Who | Where |
| --- | --- | --- |
| Tile and logo images, from the app icon | Automated | `tools/release/store-assets.mjs` → `apps/desktop/build/appx/`, kept current by `pnpm check` |
| The package, with its identity, alias, link scheme and full trust | Automated | `pnpm --filter @focus-notes/desktop run dist:store`; `release.yml` → `store` job |
| The manifest read back and checked | Automated | `tools/release/store-manifest.mjs`, in CI on Windows and in every release |
| The listing's words, from the product site | Automated | `tools/release/store-listing.mjs` → `store/listing.en-US.md` |
| Each later submission | Automated | `store.yml`, when a release is published |
| The developer account and identity check | **Owner** | Partner Center |
| Reserving the name | **Owner** | Partner Center |
| The repository variables and the `release` environment's secrets | **Owner** | GitHub → Settings |
| The first submission, the age rating, pricing | **Owner** | Partner Center |

<h2 id="the-owners-steps">The owner's steps</h2>

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Create the developer account</p>
<p>Go to <a href="https://storedeveloper.microsoft.com">storedeveloper.microsoft.com</a> and sign up as an <strong>individual</strong> developer, which is free. Microsoft checks your identity, which can take a few days. The publisher display name you choose here is the one the Store shows; use <em>Prabin Pebam</em>, or update the <code>MSSTORE_PUBLISHER_DISPLAY_NAME</code> variable in step 3 to match.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Reserve the name</p>
<p>In <a href="https://partner.microsoft.com/dashboard/apps-and-games/overview">Partner Center → Apps and games</a>, choose <strong>New product → MSIX or PWA app</strong> and reserve <strong>Focus Notes</strong>. The name must match the package's display name, which is already <em>Focus Notes</em>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Copy the identity into repository variables</p>
<p>Open the app's <strong>Product management → Product identity</strong>. In GitHub, go to <strong>Settings → Secrets and variables → Actions → Variables</strong> and add these three repository variables. They aren't secret. Note the <strong>Store ID</strong> too (12 characters, starting with <code>9</code>): it's for step 7.</p>
<table>
<thead><tr><th>Repository variable</th><th>Partner Center value</th><th>Example</th></tr></thead>
<tbody>
<tr><td><code>MSSTORE_IDENTITY_NAME</code></td><td>Package/Identity/Name</td><td><code>12345PrabinPebam.FocusNotes</code></td></tr>
<tr><td><code>MSSTORE_PUBLISHER</code></td><td>Package/Identity/Publisher</td><td><code>CN=1A2B3C4D-…</code></td></tr>
<tr><td><code>MSSTORE_PUBLISHER_DISPLAY_NAME</code></td><td>Package/Properties/PublisherDisplayName</td><td><code>Prabin Pebam</code></td></tr>
</tbody>
</table>
<p>Until the first two variables are set, releases build the package with placeholders only to check it, and don't attach it. Nothing else in the repository needs to change: <code>build.appx</code> in <code>apps/desktop/package.json</code> holds only those placeholders.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Register an app for publishing, and add its secrets</p>
<p>In <a href="https://entra.microsoft.com">Microsoft Entra</a> (the directory that came with the developer account), go to <strong>App registrations → New registration</strong> and name it, for example, <em>Focus Notes Store publishing</em>, single tenant, with no redirect URI. Under <strong>Certificates &amp; secrets</strong>, create a client secret and copy its value. In Partner Center, open <strong>Account settings → User management → Microsoft Entra applications</strong>, add the app, and give it the <strong>Manager</strong> role. Your <strong>Seller ID</strong> is in <strong>Account settings → Legal info → Developer</strong>.</p>
<p>In GitHub, open <strong>Settings → Environments → release</strong>, the environment with the required reviewer (D-128), and add these environment secrets:</p>
<table>
<thead><tr><th>Secret in <code>release</code></th><th>Value</th></tr></thead>
<tbody>
<tr><td><code>MSSTORE_TENANT_ID</code></td><td>The Entra directory (tenant) ID</td></tr>
<tr><td><code>MSSTORE_CLIENT_ID</code></td><td>The app registration's application (client) ID</td></tr>
<tr><td><code>MSSTORE_CLIENT_SECRET</code></td><td>The client secret's value. It expires, so note the date and replace it before then.</td></tr>
<tr><td><code>MSSTORE_SELLER_ID</code></td><td>The Seller ID</td></tr>
</tbody>
</table>
<p>This app is your own publishing credential. Only <code>store.yml</code> uses it; the app and users' instances never do, so PKG-06 still holds.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Release v1.0.0</p>
<p>Tag the release as usual (<a href="distribution.md#release-process">Release process</a>). The draft's files then include <code>Focus-Notes-1.0.0-store-x64.msix</code>. Publish the draft, then download the <code>.msix</code> from the release. <code>store.yml</code> runs too, and stops at its first step with a notice, because <code>MSSTORE_PRODUCT_ID</code> isn't set yet: the Store's API can only update an app that already has a submission.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Make the first submission by hand</p>
<p>The Store's API can't create the first submission, so in Partner Center choose <strong>Start your submission</strong>:</p>
<ul>
<li><strong>Pricing and availability</strong>: Free, in all markets.</li>
<li><strong>Properties</strong>: category <em>Productivity</em>, the privacy policy URL, the website and support contact, and system requirements, all from <a href="https://github.com/prabinpebam/focus-notes/blob/main/store/listing.en-US.md"><code>store/listing.en-US.md</code></a>.</li>
<li><strong>Age ratings</strong>: answer the questionnaire. The draft answers are in the same file; expect 3+ (Everyone).</li>
<li><strong>Packages</strong>: upload the <code>.msix</code>. Partner Center checks that its identity matches the reservation.</li>
<li><strong>Store listings → English (United States)</strong>: paste the description, short description, features, search terms and release notes from the file, and upload the screenshots in <a href="https://github.com/prabinpebam/focus-notes/tree/main/store/screenshots"><code>store/screenshots/</code></a> in their numbered order (PNG, 2560 × 1440, made by <code>tools/release/store-screenshots.py</code> from the <code>store</code> review catalogue).</li>
<li><strong>Visibility</strong> (optional): to try the Store's copy before anyone else sees it, choose <strong>Private audience</strong> with your own Microsoft account, install it from the Store once it's certified, and spend 10 minutes on it (first run, a note, a sync, Spotlight, a theme). Then switch it to <strong>Public audience</strong>, which is another certification.</li>
<li><strong>Submission options</strong>: Partner Center asks why the app uses <code>runFullTrust</code>, which is a restricted capability. Paste the <em>Notes for certification</em> from the file: it's a desktop (Electron) app.</li>
</ul>
<p>Then choose <strong>Submit to the Store</strong>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Turn on automatic submissions</p>
<p>Once the first submission is in, add the repository variable <code>MSSTORE_PRODUCT_ID</code> with the Store ID from step 3. From then on, publishing a release starts <code>store.yml</code>. It downloads that release's <code>.msix</code>, checks it against <code>SHA256SUMS</code>, and submits it to the existing Store app with Microsoft's <code>msstore</code> tool, keeping the listing as it is. Pre-releases and 0.x versions are skipped with a notice. To submit again, for example after the Store rejects a package, open <strong>Actions → store → Run workflow</strong> and give the tag. Change the listing's words on the product site, run <code>node tools/release/store-listing.mjs</code>, and paste the changes in Partner Center.</p>
</li>
</ol>

## Certification

Every submission, the first and each automatic one, goes through Microsoft's certification before it's published. Microsoft says this usually takes up to three business days, and the first one can take longer.

| Check | What it looks at | Already handled |
| --- | --- | --- |
| Security | Malware scans of the package | Built from source in a GitHub-hosted runner, with attestations |
| Technical compliance | The manifest, its capabilities and the package's contents (like the Windows App Certification Kit) | The manifest is checked on every build. `runFullTrust` is explained in the certification notes. |
| Content and policies | The listing, screenshots, privacy policy and age rating against the [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies) | The listing comes from the product site; the privacy policy is the site's `/privacy/` |
| Versions | The fourth section of the version is 0 and the first isn't 0, and each submission's version is higher than the one before | Built as `<x>.<y>.<z>.0`; 0.x versions are never submitted |

If certification fails, Partner Center sends a report. Fix the cause, release a new version, or re-run `store.yml` for the same tag if only the listing was wrong.

<h2 id="when-a-release-is-bad">When a release is bad</h2>

The Store only takes a version higher than the last, so there's no going back to an older package. Instead:

1. **Stop new installs while you fix it** (optional): in Partner Center, **Pricing and availability → Discoverability → Stop acquisition**. People who have it keep it; nobody new gets it. That change is certified too, usually faster.
2. **Ship the fix, or the last good code, as the next patch version**: revert or fix on `main`, then tag `v1.0.1`. Publishing it submits it automatically (`store.yml`), and the Store updates everyone who installed it.
3. **Turn acquisition back on** once the fix is published.

Notes are never inside the package, so neither a bad release nor uninstalling touches them.

## How the Store build differs

| Area | Direct download (NSIS) | Microsoft Store (MSIX) |
| --- | --- | --- |
| Command-line tool | Settings → Agents → *Install command-line tool* adds the launcher's folder to the user's `Path` (D-165) | Installed with the app as the alias `focus-notes`. Settings → Agents says so and shows no Install button. Agent snippets name the alias, `%LOCALAPPDATA%\Microsoft\WindowsApps\focus-notes.exe`. |
| `focus-notes:` links | Registered by the app on its first start | Declared in the package's manifest; the app doesn't register itself |
| App data (settings, caches) | The user's AppData folder | The same path to the app, which Windows redirects to the package's private copy; the alias and `git` started by the app see the same copy, and uninstalling removes it |
| Notes | The folder the user picks | The same: outside the package, so uninstalling keeps them |
| Updates | None yet (DSK-07) | The Store's |
| Signing | Unsigned until DSK-07 | Signed by the Store |

`isStoreBuild()` in `apps/desktop/src/main/store-build.ts` is the one test for the Store build (`process.windowsStore`). Started through the alias, the app runs a command when its first argument isn't a switch (`focus-notes help`, `focus-notes mcp`), and opens the window when there's no argument.

## Trying the package locally

Without administrator rights, on a PC with **Developer Mode** on:

1. Build it: `pnpm --filter @focus-notes/desktop run dist:store`. The package is in `apps/desktop/release/`.
2. Unzip it to a folder, delete `AppxBlockMap.xml`, `AppxSignature.p7x` (if there is one) and `[Content_Types].xml`, then run `Add-AppxPackage -Register <folder>\AppxManifest.xml`.
3. In a new terminal, run `focus-notes help`, then start *Focus Notes* from the Start menu.
4. Remove it: `Get-AppxPackage *FocusNotes* | Remove-AppxPackage`.

Installing the `.msix` itself needs it signed by a certificate the PC trusts, and trusting one needs administrator rights. The Windows App Certification Kit (`appcert.exe`, in the Windows SDK) also needs them. Check the manifest without either: `node tools/release/store-manifest.mjs apps/desktop/release`.
