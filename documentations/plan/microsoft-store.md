# Microsoft Store

How to publish Focus Notes to the Microsoft Store by hand now, and optionally automate later (PKG-12, [D-202](decisions.md)). Updated 24 October 2026 after the Entra tenant-creation failure.

> [!NOTE]
> **TL;DR.** Use your personal Microsoft account to submit the app in Partner Center. **Entra is not required for manual submission.** The release workflow builds the unsigned MSIX; you upload it, and Microsoft certifies and signs it. The first Store release is **v1.0.0**, after you approve the [indie release bar](gate-evidence.md#version-1-0-for-the-microsoft-store). If you have already completed steps 1–3, **resume at step 4 below**: defer Entra, then build and submit the release. Steps 5–6 retain their old numbers. Automatic submissions are a separate, optional setup at the end.

## Which path to follow

| Path | Account and configuration | What you do |
| --- | --- | --- |
| **Now: manual submission** | Personal Microsoft account in Partner Center; three GitHub repository variables for the package identity | Follow steps 1–7 below. Upload each release's MSIX in Partner Center. No Entra tenant or Store API secrets needed. |
| **Later: automatic submissions** | Your own Entra tenant associated with Partner Center; four environment secrets and one more repository variable | Complete [Optional: automatic submissions](#optional-automatic-submissions) only after the first manual submission is published. |

**Current blocker, 24 October.** Creating an Entra tenant failed twice with error `715-123280`. That blocks setting up automated submissions, not the manual path. The error does not establish its cause; there is no verified diagnosis here. Do not keep repeating signup attempts, use your employer's tenant, or buy a subscription just to follow this guide. See [If Entra creation fails](#if-entra-creation-fails) when you want to pursue automation.

## What's automated and what's yours

| Step | Who | Where |
| --- | --- | --- |
| Tile and logo images, from the app icon | Automated | `tools/release/store-assets.mjs` → `apps/desktop/build/appx/`, kept current by `pnpm check` |
| The package, with its identity, alias, link scheme and full trust | Automated | `pnpm --filter @focus-notes/desktop run dist:store`; `release.yml` → `store` job |
| The manifest read back and checked | Automated | `tools/release/store-manifest.mjs`, in CI on Windows and in every release |
| The listing's words, from the product site | Automated | `tools/release/store-listing.mjs` → `store/listing.en-US.md` |
| Each later submission | **Owner for now**; optionally automated later | Partner Center, or `store.yml` after the optional setup |
| The developer account and identity check | **Owner** | Partner Center |
| Reserving the name | **Owner** | Partner Center |
| The three package identity variables | **Owner** | GitHub → Settings → Secrets and variables → Actions → Variables → **Repository variables** |
| The first submission, the age rating, pricing and certification notes | **Owner** | Partner Center |
| The Store API credentials | Optional, later | GitHub → Settings → Environments → `release` → **Environment secrets** |

<h2 id="the-owners-steps">The owner's steps</h2>

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Create the developer account</p>
<p>If your developer account is already active, do not register again. Otherwise, go to <a href="https://storedeveloper.microsoft.com">storedeveloper.microsoft.com</a> and sign up as an <strong>individual</strong> developer with your personal Microsoft account. Complete Microsoft's identity verification before submitting. Use the publisher display name recorded in Partner Center when you set <code>MSSTORE_PUBLISHER_DISPLAY_NAME</code> in step 3.</p>
<p><strong>Done when:</strong> you can open Partner Center's <strong>Apps and games</strong> dashboard with your developer account.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Reserve the name</p>
<p>In <a href="https://partner.microsoft.com/dashboard/apps-and-games/overview">Partner Center → Apps and games</a>, open the existing <strong>Focus Notes</strong> product if you already reserved it. Otherwise choose <strong>New product → MSIX or PWA app</strong> and reserve <strong>Focus Notes</strong>. Do not create a second product. The package's display name is already <em>Focus Notes</em>.</p>
<p><strong>Done when:</strong> the product opens and <strong>Product management → Product identity</strong> shows its package identity.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Copy the identity into repository variables</p>
<p>Open the app's <strong>Product management → Product identity</strong>. In the <a href="https://github.com/prabinpebam/focus-notes/settings/variables/actions">GitHub repository's Actions variables</a>, go to <strong>Repository variables → New repository variable</strong>. Add each row below separately, or edit its existing value. These are <strong>repository variables, not environment variables and not secrets</strong>. Copy the real values exactly; the examples are not values to paste.</p>
<table>
<thead><tr><th>Repository variable</th><th>Partner Center value</th><th>Example</th></tr></thead>
<tbody>
<tr><td><code>MSSTORE_IDENTITY_NAME</code></td><td>Package/Identity/Name</td><td><code>12345PrabinPebam.FocusNotes</code></td></tr>
<tr><td><code>MSSTORE_PUBLISHER</code></td><td>Package/Identity/Publisher</td><td><code>CN=1A2B3C4D-…</code></td></tr>
<tr><td><code>MSSTORE_PUBLISHER_DISPLAY_NAME</code></td><td>Package/Properties/PublisherDisplayName</td><td><code>Prabin Pebam</code></td></tr>
</tbody>
</table>
<p>Also note the <strong>Store ID</strong> (12 characters, starting with <code>9</code>) for opening the listing and, optionally, enabling automation later. It is not the package identity name or the Seller ID. <strong>Do not add <code>MSSTORE_PRODUCT_ID</code> yet.</strong></p>
<p><strong>Done when:</strong> all three names appear under <strong>Repository variables</strong> with the matching Partner Center values. Until the identity name and publisher are set, releases only build a placeholder package and do not attach it to the release. A release that was already built does not change when you add variables; set them before the release run in step 5. No edit to <code>apps/desktop/package.json</code> is needed.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Defer Entra and use manual publishing</p>
<p><strong>This replaces the old step 4.</strong> Do not create an Entra tenant or app registration for the manual path. Leave <code>MSSTORE_PRODUCT_ID</code> and the four <code>MSSTORE_*</code> publishing secrets unconfigured. Do not put dummy values in them. Keep the three identity variables from step 3.</p>
<p>The <strong>Sign in with Microsoft Entra ID</strong> message under <strong>Account settings → User management</strong> concerns managing users and publishing applications, not uploading your own app by hand. Leave that page and return to <strong>Apps and games → Focus Notes</strong>.</p>
<p><strong>Done when:</strong> you are back on the product overview. The next step is preparing the release, not fixing Entra.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Build, check and publish v1.0.0</p>
<p><strong>Only do this when you decide to release.</strong> Review the <a href="gate-evidence.md#version-1-0-for-the-microsoft-store">indie release bar</a> and approve v1.0.0. Preparing your Store account does not itself approve a release.</p>
<ol>
<li>In a PowerShell terminal at the repository root, run <code>git fetch origin</code>, then <code>git log -1 --format=oneline origin/main</code>. In GitHub <strong>Actions → CI</strong>, confirm that exact commit's required checks passed. Stop if the fetch failed, CI is not green, or that is not the commit you intend to release.</li>
<li>For the first release, run <code>git tag -a v1.0.0 origin/main -m "Focus Notes 1.0.0"</code>. Only if that succeeds, run <code>git push origin refs/tags/v1.0.0</code>. If the tag already exists, stop and inspect its existing release; never move or force-push it. These commands tag the checked <code>origin/main</code> commit, not your current work branch.</li>
<li>Open <strong>Actions → release</strong> and the run for <code>v1.0.0</code>. Approve its <code>release</code>-environment deployments when GitHub requests your review, after checking the tag and commit. The attestation and draft-release jobs use that environment. Wait for the run to finish successfully. <strong>Run workflow</strong> on a branch is a dry run, not a way to create this release.</li>
<li>Open the repository's <strong>Releases</strong> and the <strong>Focus Notes 1.0.0</strong> draft. Its assets must include <code>Focus-Notes-1.0.0-store-x64.msix</code> and <code>SHA256SUMS</code>. If the MSIX is missing, stop: check the <strong>store</strong> job's identity notice and the repository variables. Do not use a <code>store-package-placeholder</code> artifact or rename another installer to MSIX.</li>
<li>Download those two assets into the same local folder. In PowerShell in that folder, run <code>Get-FileHash -Algorithm SHA256 .\Focus-Notes-1.0.0-store-x64.msix</code>. Compare the hash, ignoring letter case, with the line for that exact filename in <code>SHA256SUMS</code>. Stop if they differ. Do not install or self-sign this unsigned package; it is for upload to the Store.</li>
<li>Check the draft's release notes, then choose <strong>Publish release</strong>. This publishes the GitHub release; <strong>it does not publish the app in the Store</strong>.</li>
</ol>
<p>A separate <strong>store</strong> workflow can now start. Because its job also uses the protected <code>release</code> environment, it may first show <strong>Waiting for review</strong>. For manual publishing, you can cancel <em>that store workflow run</em>; do not cancel the <code>release</code> workflow or remove environment protection. If you approve the store job instead, its readiness step reports <strong>Not submitted</strong> because the credentials and product ID are missing, and its publishing steps are skipped. A successful skipped run is not a Store submission.</p>
<p><strong>Done when:</strong> the GitHub release is published and you have its checksum-verified MSIX ready to upload. The NSIS <code>.exe</code> remains the separate direct-download installer.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Make the first submission by hand</p>
<p>Sign in to <a href="https://partner.microsoft.com/dashboard/apps-and-games/overview">Partner Center → Apps and games</a> with your personal Microsoft account and open <strong>Focus Notes</strong>. In the product's <strong>Product release</strong> area, choose <strong>Start submission</strong> (or reopen the existing draft). Stay in the product dashboard, not <strong>Account settings → User management</strong>. Microsoft's <a href="https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission">submission checklist</a> describes these sections.</p>
<p>Open <a href="https://github.com/prabinpebam/focus-notes/blob/v1.0.0/store/listing.en-US.md"><code>store/listing.en-US.md</code> at v1.0.0</a> alongside the form. Use that release's listing and <a href="https://github.com/prabinpebam/focus-notes/tree/v1.0.0/store/screenshots">screenshots</a>, not a later draft from a work branch. Complete and save each section:</p>
<ol>
<li><strong>Pricing and availability:</strong> choose <strong>Free</strong> and all markets. For a normal launch choose <strong>Public audience</strong> and make the app available in Store search. If you want an owner-only Store test first, follow the private-audience note below <em>before</em> submitting.</li>
<li><strong>Properties:</strong> choose <strong>Productivity</strong>. Use the listing's <strong>Properties</strong> table for the privacy policy, website, support contact, copyright and system requirements wherever Partner Center requests them. The package is for x64 Windows 10 version 1809 or later, or Windows 11.</li>
<li><strong>Age ratings:</strong> complete the questionnaire using the listing's <strong>Age rating (draft answers)</strong> section as a starting point. Check every answer against the app you are releasing; do not simply enter a target rating. The rating is assigned by the questionnaire.</li>
<li><strong>Packages:</strong> upload <code>Focus-Notes-1.0.0-store-x64.msix</code>. Wait for validation and resolve any errors. Complete any other required fields on that page: a package marked <strong>Validated</strong> does not by itself mean the entire section is complete. If the identity differs from the reserved product, stop and correct the build inputs rather than changing the reservation to fit a placeholder.</li>
<li><strong>Store listings → English (United States):</strong> paste the description, short description, product features and search terms from the listing. Fill its release-notes template with <code>1.0.0</code> and the actual highlights; do not paste the braces or placeholders. Upload the numbered PNGs from the release's <code>store/screenshots/</code> in their numbered order (2560 × 1440), each with the caption the listing gives it.</li>
<li><strong>Submission options → Notes for certification:</strong> paste the listing's <strong>Notes for certification</strong> text. It explains local-only testing without a GitHub account, <code>runFullTrust</code>, the link scheme and the command-line alias. If Partner Center also asks for a restricted-capability justification, use that explanation for <code>runFullTrust</code>. For the straightforward launch, leave publishing set to release as soon as certification passes; check that no unintended schedule or publishing hold is enabled.</li>
<li>Return to the submission overview. Resolve every required incomplete section, review the listing and audience, then choose <strong>Submit to the Store</strong>.</li>
</ol>
<p><strong>Optional owner-only test:</strong> under <strong>Pricing and availability → Visibility</strong>, choose <strong>Private audience</strong>, create a known user group containing your <em>personal Microsoft account</em>, and select that group. After certification, use the private-audience listing link supplied by Partner Center and sign into the Microsoft Store with that same personal account. Complete step 7's test. To launch publicly, create another submission, change to <strong>Public audience</strong>, and submit it for certification. This is not just a local toggle. Once you submit as public, you cannot switch back to private audience. See Microsoft's <a href="https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options">visibility rules</a>.</p>
<p><strong>Done when:</strong> Partner Center shows that the submission has entered processing or certification. A saved draft, a published GitHub release and a green <code>store</code> workflow are not substitutes.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Wait for certification, then install from the Store</p>
<p>Monitor the submission in Partner Center and read any certification report. When its status is <strong>In the Store</strong>, open the product's Store listing link and install the Store copy. For a private audience, use the authenticated listing link and the personal Microsoft account in the known user group.</p>
<p>Spend 10 minutes on first run, writing a note, syncing to a disposable test repository if you want to test sync, Spotlight and a theme. Use a fresh test folder, not your real notes, and do not uninstall or replace your everyday Preview just to perform this test. Confirm that a note remains in the chosen folder after closing and reopening the app.</p>
<p><strong>Done when:</strong> the Store copy installs and the smoke test passes. If you used a private audience, complete the public submission described in step 6 when ready. <strong>Leave automatic publishing off unless you later complete the optional section below.</strong></p>
</li>
</ol>

## Later updates by hand

Repeat the release and submission steps with a higher version, for example `v1.0.1` and `Focus-Notes-1.0.1-store-x64.msix`. Use the listing and screenshots from that release's tag.

1. Build and publish the new GitHub release from its approved, green commit. Download the MSIX and verify its checksum as in step 5.
2. In **Partner Center → Apps and games → Focus Notes**, start a new submission from the published app.
3. In **Packages**, upload the new MSIX. Review the resulting package set and validation messages; do not remove support for an architecture or device family unintentionally.
4. Update the release notes and any changed listing information. Review the audience and publishing options, save the sections and choose **Submit to the Store**.
5. Monitor certification and test the Store update after publication.

GitHub does not upload these manual updates for you. Keep the Store API credentials unconfigured while using this path; if a separate `store` run waits for approval, cancel that run as described in step 5.

<h2 id="optional-automatic-submissions">Optional: automatic submissions</h2>

**Do this later, not as a prerequisite for launch.** Wait until the first manual submission has passed certification and is published. The [submission API](https://learn.microsoft.com/en-us/windows/uwp/monetize/manage-app-submissions) copies the last published submission; merely reserving a name is not enough.

### Associate your own Entra tenant

A personal Microsoft account and an Entra work account are different account types. A Store developer registration does **not** guarantee that a usable Entra tenant has already been created and associated.

1. In Partner Center, open **Account settings → Tenants**.
2. If you already own a tenant for your personal projects, choose **Associate Microsoft Entra ID with your Partner Center account**, sign in with that tenant's account, review its domain and confirm. Do not associate your employer's tenant.
3. Otherwise, choose **Create Microsoft Entra ID** and complete the wizard. Record the tenant domain and administrator sign-in securely. If creation fails again, stop here and use [If Entra creation fails](#if-entra-creation-fails); manual submission remains available.
4. After the tenant is associated, sign into Partner Center with an account from that tenant that has the Partner Center **Manager** role. Confirm that **User management** opens instead of showing only **Sign in with Microsoft Entra ID**.

Microsoft's instructions: [create a tenant](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/create-new-azure-ad-tenant) or [associate an existing tenant](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/associate-existing-azure-ad-tenant-with-partner-center-account).

### Register and authorize the publishing app

1. Sign into [Microsoft Entra](https://entra.microsoft.com) and select the tenant associated above.
2. Open **App registrations → New registration**. Name it **Focus Notes Store publishing**, choose accounts in this directory only (single tenant), leave the redirect URI empty and register.
3. Record the **Directory (tenant) ID** and **Application (client) ID** from the registration overview.
4. Open **Certificates & secrets → Client secrets → New client secret**. Record the secret's **Value**, not its Secret ID, in a password manager; the value is shown only once. Record its expiry and replace it before it expires. Never paste it into the repository, an issue, a screenshot or a chat.
5. In Partner Center, open **Account settings → User management → Microsoft Entra applications**, add that registration and give it the **Manager** role. Record your **Seller ID** from **Account settings → Legal info → Developer**.

This registration is your own publishing credential. Only `store.yml` uses it; the app and users' instances never do, so PKG-06 still holds.

### Add the credentials in the right GitHub locations

In **GitHub → Settings → Environments → release → Environment secrets → Add environment secret**, add these four entries. Use **secrets**, not variables, and the **release environment**, not the repository-level secrets page. Keep its required-reviewer and tag protections (D-128).

| Environment secret in `release` | Value |
| --- | --- |
| `MSSTORE_TENANT_ID` | Directory (tenant) ID |
| `MSSTORE_CLIENT_ID` | Application (client) ID |
| `MSSTORE_CLIENT_SECRET` | Client secret **Value**, not Secret ID |
| `MSSTORE_SELLER_ID` | Partner Center Seller ID, not Store ID |

**Last**, go to **Settings → Secrets and variables → Actions → Variables → Repository variables → New repository variable** and add `MSSTORE_PRODUCT_ID` with the product's **Store ID** from step 3. It is not secret. There are now **four Store-related repository variables** in total: the three identity values and this product ID, plus **four environment secrets**. There are no required environment variables for this setup.

### Submit an update automatically

From now on, publishing a new stable GitHub release starts `store.yml`. Review and approve its `release`-environment deployment. It downloads that release's MSIX, checks it against `SHA256SUMS` and submits it with Microsoft's `msstore` tool, keeping the existing listing. Do not submit the same update manually as well.

Pre-releases and 0.x versions are skipped with a notice. To retry a published update when appropriate, open **Actions → store → Run workflow**, select a ref allowed by the `release` environment's tag policy and enter the published release tag, for example `v1.0.1`. Review the run's actual submission result in Partner Center; workflow success alone is not certification.

Update listing words on the product site, run `node tools/release/store-listing.mjs`, and include the generated listing in the next release. Listing edits still need to be entered in Partner Center. Do not edit an active API-created submission in Partner Center while automation is managing it: Microsoft's API documentation warns that mixing the two can leave the submission unable to proceed. Finish or cancel that submission before switching methods.

To return to manual updates, remove the repository variable `MSSTORE_PRODUCT_ID` before publishing another release, and resolve any active automatic submission first.

<h2 id="if-entra-creation-fails">If Entra creation fails</h2>

Error `715-123280` occurred twice during tenant creation on 24 October. The cause is unverified; do not treat it as proof of an account ban or a particular security block.

1. Keep manual publishing as the working path. Do not add fake credentials, connect your employer's tenant or buy a subscription as a workaround.
2. Save the error code, both EventIds, the SID, both `cV` values, the time and time zone, and the page where creation failed. Keep these in your private support correspondence, not in this public repository.
3. Use the [support link supplied by the error](https://aka.ms/MSPhoneSupport), or Partner Center's **Help / Contact Support** if accessible. Explain that an existing work-account sign-in cannot be a prerequisite for support because creating that tenant/account is what fails.
4. Send this summary with the diagnostic details attached:

> I have an individual Microsoft Store developer account signed in with a personal Microsoft account. Creating a Microsoft Entra tenant from Partner Center → Account settings → Tenants fails twice with error 715-123280. I need the tenant for a Store submission API application. Please investigate the failed tenant provisioning using the attached EventIds, SID, correlation vectors and timestamps. I cannot sign in with an Entra work account because creating the tenant/account is the failing step.

When support resolves the issue, resume at [Associate your own Entra tenant](#associate-your-own-entra-tenant). Do not repeat the developer registration or reserve a second product.

## Certification

Every submission, manual or automatic, goes through Microsoft's certification before publication. Microsoft says [certification can take up to three business days](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process); use Partner Center's status and report rather than treating that as a guaranteed deadline. Microsoft signs MSIX packages during Store publishing; no personal signing certificate is required for this route.

| Check | What it looks at | Already handled |
| --- | --- | --- |
| Security | Malware scans of the package | Built from source in a GitHub-hosted runner, with attestations |
| Technical compliance | The manifest, its capabilities and the package's contents (like the Windows App Certification Kit) | The manifest is checked on every build. `runFullTrust` is explained in the certification notes. |
| Content and policies | The listing, screenshots, privacy policy and age rating against the [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies) | The listing comes from the product site; the privacy policy is the site's `/privacy/` |
| Versions | The fourth section of the version is 0 and the first isn't 0, and each submission's version is higher than the one before | Built as `<x>.<y>.<z>.0`; 0.x versions are never submitted |

If certification fails, read the report and fix the stated cause. For a package change, release a higher version and upload that package. For a listing-only change, correct and resubmit in Partner Center on the manual path. Use `store.yml` only if you have completed the optional automation setup, and do not mix manual and API edits to the same active submission.

<h2 id="when-a-release-is-bad">When a release is bad</h2>

The Store only takes a version higher than the last, so there's no going back to an older package. Instead:

1. **Stop new installs while you fix it** (optional): in Partner Center, **Pricing and availability → Discoverability → Stop acquisition**. People who have it keep it; nobody new gets it. That change is certified too, usually faster.
2. **Ship the fix, or the last good code, as the next patch version**: revert or fix on `main`, then release a higher version, for example `v1.0.1` if `v1.0.0` was the bad release. **Upload and submit its MSIX in Partner Center** on the manual path. Only the optional configured path submits it through `store.yml`. After certification and publication, the Store distributes the update.
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
