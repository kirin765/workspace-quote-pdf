# Submission package (Phase D draft)

This is a working draft, not a submitted listing. Complete the open items before submission.
Public Marketplace review and OAuth verification are separate tasks from a private prototype.

## Product summary

**Workspace Quote PDF** is a Google Sheets editor add-on. It reads a selected range of
line-item rows, groups them by **Quote ID**, validates each group, and creates one branded
quotation PDF per quote in a Drive folder, with links and statuses written back to a results
tab. It is manual-generation only and produces quotations — not invoices, receipts or proof
of payment.

## OAuth scopes and justification

| Scope | Justification |
| ----- | ------------- |
| `https://www.googleapis.com/auth/spreadsheets.currentonly` | Read the user-selected range and write the results tab in the current spreadsheet. The add-on cannot access any other spreadsheet. |
| `https://www.googleapis.com/auth/documents` | Create and lay out the temporary Google Doc that is exported to PDF. `DocumentApp` requires this scope. Sensitive but not restricted. |
| `https://www.googleapis.com/auth/drive.file` | Create the output folder and PDFs and read a logo the add-on itself created, via the Drive API v3 advanced service. Access is limited to files this app creates. |
| `https://www.googleapis.com/auth/script.external_request` | Call the Drive `/export` REST endpoint on `www.googleapis.com` with the user's token. The Apps Script advanced service's `files.export` is unusable (requires an undocumented `alt=media` and then throws the binary response), so the documented REST endpoint is used instead. No third-party hosts are contacted. |
| `https://www.googleapis.com/auth/script.container.ui` | Display the sidebar and custom menu inside the container spreadsheet. |

No Gmail or broad Drive scopes are used. `script.external_request` is used solely to call Google's
own Drive `/export` endpoint. Drive operations deliberately use the Drive API v3 advanced service
instead of `DriveApp`, because the runtime requires the restricted
`https://www.googleapis.com/auth/drive` scope for `DriveApp.createFolder`. If a live test proves an
additional scope is required for a feature, document why before adding it.

**Open scope decision:** `documents` is required by `DocumentApp`. The alternative is to import
HTML into a Google Doc through the Drive API (`files.create` + `files.export`) using only
`drive.file`, which avoids a sensitive scope but gives weaker fixed-layout control. Decide and
record the outcome before submission.

## Reviewer test instructions (draft)

Use a browser profile with a single Google account. Apps Script sidebars can fail with a
`PERMISSION_DENIED` storage error when multiple Google accounts are signed in; this is a browser
session issue, not the add-on.

1. Install the add-on on a test spreadsheet.
2. Add a header row and at least three line-item rows sharing two Quote IDs
   (see the example in `README.md`). Use different customers and one currency per quote.
3. Open **Quote PDFs → Open sidebar** and authorise the requested scopes.
4. Select the header row and line-item rows.
5. Map the six required columns (Quote ID, Customer, Item, Quantity, Unit price, Currency),
   enter a business display name, then **Save settings** and **Preview quotes**.
6. Confirm the two quotes show their expected totals, then **Generate PDFs**.
7. Confirm one PDF per quote appears in the `Quote PDFs` Drive folder, and a
   `Quote PDF results` tab lists the quote IDs with statuses and links.
8. Confirm the original source tab is unchanged.

Edge cases worth reviewing: leading-zero Quote IDs, rows with a missing key, conflicting
customer/currency within a quote, an empty or negative price, and a retry of the same quote.

## Data handling / privacy statement (draft)

- Spreadsheet contents and customer data stay within the user's Google account workflow.
- The add-on writes only to the spreadsheet's results tab and the selected Drive folder.
- Temporary Google Docs are trashed after PDF export.
- Usage counters are content-free: they contain event counts, the plan label and bounded
  reason codes only — never customer names, item names, quote IDs, amounts or file IDs.
- No paid provider is integrated. No payment data is collected or stored.
- Stored data: per-user mapping/branding settings and a content-free usage counter are kept in
  Apps Script user/document properties; generated PDFs and the results tab live in the user's
  Google account. Temporary Docs are trashed after export.
- Retention/deletion: output PDFs and the results tab are user-owned and are never deleted by the
  add-on; the user deletes them directly. Stored settings and counters are removed on uninstall.
  Server-side license deletion (when a paid tier exists) must also clear the stored entitlement.

## Marketplace listing copy (draft)

- **Name:** Workspace Quote PDF (working name; not cleared for launch)
- **Category:** Productivity
- **Short description:** Turn grouped spreadsheet rows into one branded quotation PDF per quote.
- **Detailed description:**
  Workspace Quote PDF is a Google Sheets add-on for small wholesalers and custom-product
  businesses that keep quotation line items in a spreadsheet. Select your rows, map the columns
  once, and the add-on groups them by Quote ID and creates a clean, branded quotation PDF for
  each quote — every line item and the validated total included. Generated files are saved to a
  Drive folder you choose and linked back in a dedicated results tab. Your source rows are never
  modified.
  - One PDF per quote, grouped by the exact Quote ID
  - Saved column mapping and business branding
  - Multiple line items, A4 or Letter, multi-page documents
  - Explicit validation: conflicting customers/currencies, missing keys, bad amounts
  - Free allowance to try the workflow; failed or reused generations do not count
  - Quotations only — not invoices, receipts or proof of payment; no taxes or discounts are inferred
- **Pricing:** Free allowance (5 successful quotation PDFs). No paid tier is enabled yet.
- **Assets plan:** listing icon (replace the placeholder), 1–3 screenshots showing rows → preview
  → generated PDF, and a short demo clip of the grouped-PDF flow.

## Support (draft)

- **Channel:** `<support email or help page URL — to finalise>`
- **Response expectation:** best-effort within a few business days.
- **Common questions:**
  - *Where are my PDFs?* In the output folder shown in the sidebar (default `Quote PDFs`), linked
    from the `Quote PDF results` tab.
  - *Why is a quote blocked?* Its rows disagree on customer or currency, or a required value is
    missing/invalid. The sidebar lists the affected row numbers.
  - *Why did generation use my allowance?* Only successful, newly created PDFs count. Failures and
    reused results do not.
  - *Can I pick an existing folder?* Only folders the add-on can access are listed; use **New
    folder** or keep the default. Arbitrary folder selection needs the Google Picker (deferred).

## Deployment status

- Script project: `1vLEAdyau8ALdI9s_slxsT4wvtDJjCsjIvzll0YG9xitlD5HEsY7NxcSW`
- Latest versioned deployment: `@3` — `AKfycbzC3p94GHENc6kvK7ABeD_Yk7M4GeAcp6DMr2w6JBv4kqsBSh21m3u_cZoPpu4Co2NS0g`
  (2026-09-26, "Workspace Quote PDF MVP v3 - hosted pages + icon")
- Hosted pages (Vercel):
  - Support/terms entry: `https://site-eight-vert-80.vercel.app/`
  - Privacy policy: `https://site-eight-vert-80.vercel.app/privacy.html`
  - Terms: `https://site-eight-vert-80.vercel.app/terms.html`
  - Icon: `https://site-eight-vert-80.vercel.app/icon-128.png` (set as `addOns.common.logoUrl`)
  - Authorized domain for the OAuth consent screen: `site-eight-vert-80.vercel.app`
- `appsscript.json` declares `urlFetchWhitelist: ["https://www.googleapis.com/drive/v3/files/"]`,
  required for add-ons that use `UrlFetchApp`.

## Publishing steps (account-level, not doable from code)

These must be done in the Google Cloud Console and the Apps Script editor as the owner account.
They cannot be completed by the repository tooling (the clasp OAuth client cannot create projects).

**1. Create a GCP project** — https://console.cloud.google.com/projectcreate
   (e.g. `workspace-quote-pdf`). Note its **project number**.

**2. Enable these APIs** (https://console.cloud.google.com/apis/dashboard):
   - Apps Script API (`script.googleapis.com`)
   - Google Drive API (`drive.googleapis.com`)
   - Google Docs API (`docs.googleapis.com`)
   - Google Sheets API (`sheets.googleapis.com`)
   - Google Workspace Marketplace SDK (via the "Google Workspace Marketplace SDK" page)

**3. Associate it with the script** — Apps Script editor → **Project Settings** →
   **Google Cloud Platform (GCP) Project** → **Change project** → enter the project number.
   (No API exists for this step.)

**4. Configure the OAuth consent screen** (Google Auth Platform) with these scopes:
   - `https://www.googleapis.com/auth/spreadsheets.currentonly`
   - `https://www.googleapis.com/auth/documents`  ← sensitive, needs verification
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/script.container.ui`
   - `https://www.googleapis.com/auth/script.external_request`
   Set app name, user support email, logo, authorized domains, privacy policy URL and terms URL.

**5. Configure the Marketplace SDK** — app type "Editor add-on (Sheets)", select this script project
   and version `@2`, set pricing (free), paste the store listing (see above) and the same scopes.

**6. Submit for review.** Marketplace review and OAuth verification are separate, each with their
   own timelines. Unverified apps with sensitive scopes are capped at test users.

**7. Host** the privacy policy and support pages and paste their URLs.

## Open items before submission

- [x] Deploy to a test Apps Script project and prove the live Google Docs → PDF path (2026-09-25):
      three rows produced `Q-001`/`Q-002` PDFs in a Drive folder using the manifest's scopes.
- [ ] Visually inspect representative PDFs: repeating item headers, page breaks, A4/Letter sizes,
      long terms, non-Latin text, missing logo, and confirm preview/PDF totals match on paper.
- [x] Removed the test-only menu hooks (`runPhaseACheck`, `insertExampleRows`, `headlessVerify`,
      `App.maindemo`) from the deployed bundle (2026-09-25).
- [x] Removed the temporary diagnostics hooks (`showDiagnostics`, `resetAllowance`,
      `runDiagnostics`, `App.diagnostics`) before release (2026-09-25).
- [ ] Clean up test artifacts in the dev account: leftover `Q-00X quotation (temp)` docs from
      failed runs and duplicate `Quote PDFs` folders.
- [x] Output folder selection between app-accessible folders plus "New folder" (2026-09-25).
- [ ] Optional: add the Google Picker to choose an arbitrary pre-existing folder. Requires an API
      key and a standard GCP project; document the extra setup and scope impact first.
- [x] Draft Marketplace listing copy, privacy statement and support content (in this file and `site/`).
- [x] Hosted `site/` on Vercel (2026-09-26). URLs are in "Deployment status".
- [ ] Replace the placeholders in `site/` (`[YOUR SUPPORT EMAIL]`, `[YOUR NAME OR COMPANY]`,
      `[DATE]`) with real values, then `vercel --prod` again; paste the URLs into the consent
      screen branding and the Marketplace store listing.
- [x] Hosted `site/icon-128.png` and set `addOns.common.logoUrl` to it (2026-09-26). Placeholder
      art — replace with final brand art if desired.
- [ ] Confirm the public product name and that any Google branding usage meets the
      current Marketplace branding requirements. The working name is not cleared for launch.
- [ ] Decide the paid entitlement path (server-side license verification, signed payment
      events, test mode) before marketing any paid tier. Do not ship a client-side paid flag.
- [ ] Keep or drop the `documents` / `script.external_request` scopes (see the scope decision
      above) and prepare the OAuth verification justification.
- [ ] Re-run `npm run verify` and record the dated result.

## Name and branding caution

"Workspace Quote PDF" is a working name. Check public naming availability and Google
branding requirements before submission. Do not imply endorsement by Google, and do not use
Google trademarks in a way the current branding guidelines prohibit.
