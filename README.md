# Workspace Quote PDF

A Google Sheets editor add-on that groups line-item rows by **Quote ID** and creates one
branded **quotation PDF per quote**, with all its items and totals. Built from
[`plan.md`](./plan.md).

Given this source (the plan's example):

| Quote ID | Customer | Item    | Quantity | Unit price | Currency |
| -------- | -------- | ------- | -------: | ---------: | -------- |
| Q-001    | Alpha    | Desk    |       10 |     100.00 | USD      |
| Q-001    | Alpha    | Chair   |       20 |      40.00 | USD      |
| Q-002    | Beta     | Cabinet |        5 |     150.00 | USD      |

it produces `Q-001 quotation.pdf` (two line items, `USD 1,800.00`) and
`Q-002 quotation.pdf` (one line item, `USD 750.00`). Documents are quotations — not
proof of payment or tax invoices.

## Status

| Phase | State |
| ----- | ----- |
| A — feasibility | **Proven live (2026-09-25).** Three rows in a deployed bound spreadsheet produced `Q-001 quotation.pdf` and `Q-002 quotation.pdf` in a Drive folder using the manifest's scopes. Visual PDF inspection is still recommended. |
| B — core workflow | Implemented: mapping, validation, branding, preview, Drive output, results tab. |
| C — release MVP | Free allowance, idempotent retries, resumable batches and content-free usage counters implemented. Paid tier intentionally **not** implemented (no provider selected in the plan). |
| D — submission package | Drafted in [`SUBMIT.md`](./SUBMIT.md). Not submitted. |

## Architecture

Pure, platform-independent logic lives in `src/core` and is fully unit-tested on Node.
Apps Script adapters in `src/apps-script` inject platform services through ports, so the
generation orchestration is tested with in-memory fakes.

```
sidebar (HtmlService) ──google.script.run──> controller (api)
                                               │  reads sheet, builds snapshots
                                               ▼
                                        core/engine (runGenerationBatch)
                       ┌───────────────┬──────────────┬──────────────┐
                       ▼               ▼              ▼              ▼
                 sheet-reader   quote-renderer   drive-output   result-sink
                 (Spreadsheet)  (Docs → PDF)     (Drive folder) (results tab)
```

Key invariants:

- Grouping is by exact Quote ID string, never by customer name; leading zeros are preserved.
- Rows in a quote must agree on customer and currency, or the quote is blocked (with row numbers).
- Amounts are exact integer minor units (`number`, safe-integer bounded); no float arithmetic
  for quantity × price or totals. `bigint` is avoided because the Apps Script V8 parser rejects
  BigInt literals at push time.
- The sidebar preview and the PDF are rendered from one shared `QuoteRenderModel`, so their
  totals cannot disagree.
- Idempotency key = spreadsheet + quote + content hash + template version. A retry returns the
  existing file; a changed quote becomes a new version. Failed and reused generations do not
  consume allowance.
- Usage counters hold counts, plan labels and bounded reasons only — never spreadsheet contents.
- The source sheet is never modified. Output goes to a dedicated, collision-safe results tab.

## Project layout

```
src/core/          pure logic + tests (money, grouping, validation, snapshot, render model,
                   settings, entitlements, jobs, usage, engine, ports)
src/apps-script/   Apps Script adapters (entry, main, controller, sheet-reader, renderer,
                   drive-output, result-sink, stores, serialize)
src/sidebar/       HtmlService sidebar (Index / Styles / JavaScript)
scripts/           build.mjs (bundle to dist/), demo.ts (Phase A harness),
                   appsscript-globals.txt (global function shim)
tests/             synthetic fixtures + Phase A acceptance test
appsscript.json    add-on manifest and OAuth scopes
```

## Development

Requires mise (Node is pinned in `mise.toml`).

```bash
npm install
npm run verify     # typecheck + lint + tests + build
npm run test       # vitest
npm run demo       # writes demo-preview.html; fails on wrong totals
```

## Deploying to Apps Script

The build emits only deployable files into `dist/`, and clasp is rooted there.

```bash
npm install -g @google/clasp   # or use npx
clasp login
clasp create --type sheets --title "Workspace Quote PDF"   # writes .clasp.json
# ensure .clasp.json has: "rootDir": "dist"
npm run clasp:push
```

Then open the bound spreadsheet, run **Quote PDFs → Open sidebar**, and authorise the app.
`.clasp.json` contains a project id and is git-ignored; start from `.clasp.json.example`.

## Permissions and data handling

The manifest requests the minimum scopes the workflow needs:

| Scope | Why |
| ----- | --- |
| `spreadsheets.currentonly` | Read the selected range and write the results tab in the current spreadsheet only. No other spreadsheets. |
| `documents` | Create and lay out the temporary Google Doc that is exported to PDF (`DocumentApp` requires this scope). Sensitive, not restricted. |
| `drive.file` | Create the output folder and PDFs and read a logo the add-on created, via the Drive API v3 advanced service. Access is limited to files this app creates. |
| `script.external_request` | Call the Drive export REST endpoint (`googleapis.com`) with the user's token, because the advanced service's `files.export` is broken. |
| `script.container.ui` | Show the sidebar and menu in the container. |

Drive operations use the **Drive API v3 advanced service**, not `DriveApp`: the runtime requires the
restricted `https://www.googleapis.com/auth/drive` scope for `DriveApp.createFolder`, whereas the
Drive API accepts `drive.file`. The temporary Google Doc is therefore created through the Drive API
(so the app owns it under `drive.file`), laid out with `DocumentApp.openById`, and exported to PDF by
calling the Drive `/export` REST endpoint via `UrlFetchApp`. `UrlFetchApp` requires the manifest's
`urlFetchWhitelist` (set to `https://www.googleapis.com/drive/v3/files/`) when deployed as an add-on.
`DocumentApp` still requires the Docs scope; the alternative (HTML → PDF via
`Utilities.newBlob(...).getAs(MimeType.PDF)`) avoids the Docs scope but gives different layout
control and font handling.

- Logos are uploaded through the sidebar and stored as app-created Drive files (`drive.file`),
  so no extra scope is needed. Pasting an arbitrary Drive URL is not supported under these scopes.
- The output folder is created by the add-on (or a previously selected one); sharing is never changed.
- Temporary Google Docs are trashed after export. User-visible PDFs persist until the user deletes them.
- Generated PDFs are only ever written to the chosen Drive folder.

## Known limitations (verify live before submission)

- The HtmlService sidebar can fail with Google's "server error while reading from storage /
  `PERMISSION_DENIED`" when the browser has **multiple Google accounts** signed in. Use a browser
  profile (or Incognito window) with only the intended account; the add-on code is not involved.
  Verified 2026-09-25.
- Google Docs tables do not repeat header rows automatically; the renderer repeats the header
  manually per fixed-size page chunk. Confirm pagination and long/non-Latin text on a real document.
- The `pageBreakBeforeTerms` threshold is a layout heuristic, not a measured value.
- Output folder selection lists folders this add-on can access (folders it created) and can create
  a new one. Choosing an arbitrary pre-existing folder needs the Google Picker plus an API key
  and a standard GCP project, so it is deferred; the default is an app-created `Quote PDFs` folder.
- Licensed/paid entitlement is modelled and tested but has no payment provider. A production paid
  tier needs server-side license verification and signed payment events; a client flag is not enough.
- English interface only.

## Scope

Included: one fixed quotation layout, saved mapping/branding, multi-item and multi-page PDFs,
A4/Letter, Drive output with links/statuses, free allowance and explicit access errors, and
content-free usage events.

Deferred (per the plan): automatic emails, scheduling, triggers, e-signatures, payment collection,
tax/invoice support, arbitrary templates, CRM integrations, fuzzy matching, mobile UI, team licensing.
