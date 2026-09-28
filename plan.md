# Workspace Quote PDF — implementation plan

Created: 2026-09-25  
Project directory: `/home/giwan/Projects/workspace-quote-pdf`  
Owner: Giwan  
Status: core implementation complete and locally verified; live Apps Script PDF rendering and submission pending  
Working name: Workspace Quote PDF. Check public naming availability and Google branding requirements before submission.

## 1. Product and buyer

A Google Sheets add-on for small wholesalers and custom-product businesses that keep quotation line items in a spreadsheet and repeatedly turn them into customer-facing documents.

**Promise:** Group rows by quotation number and create one branded PDF per quotation, with all its items and totals.

Example:

| Quote ID | Customer | Item | Quantity | Unit price | Currency |
|---|---|---|---:|---:|---|
| Q-001 | Alpha | Desk | 10 | 100.00 | USD |
| Q-001 | Alpha | Chair | 20 | 40.00 | USD |
| Q-002 | Beta | Cabinet | 5 | 150.00 | USD |

Expected output: Q-001.pdf containing two item lines and a USD 1,800.00 total; Q-002.pdf containing one item line and a USD 750.00 total. PDFs are quotations, not proof of payment or tax invoices.

## 2. Evidence and offer hypothesis

The [candidate assessment](../llm-wiki/reports/workspace-first-app-candidates-2026-09-25.md) contains competitor and customer evidence. Document automation has customer payment reports, and Portant publishes a named customer account using grouped rows for recurring reports. Those observations do not establish that our target buyers will pay for this app.

Portant already supports grouping, and Google supplies a free invoice-PDF script. The hypothesis is that a focused quotation workflow with guided column mapping and useful validation is worth paying for. Do not market grouping as an unavailable feature or claim a proven setup advantage before testing it.

Initial pricing hypothesis: **$59/year per user**, with **five successful quotation PDFs free** to try the workflow. Failed generation and identical retries should not consume allowance. Confirm the checkout provider, licensing identity and enforcement approach before implementing the paid tier. No payment provider or paid service is selected by this plan.

## 3. MVP user flow

1. Install the Sheets add-on and open its sidebar in a desktop browser.
2. Select a source tab and range containing a header row and line items.
3. Map quote ID, customer, item, quantity, unit price and currency columns. Save mapping for this spreadsheet and user.
4. Enter business display name, optional logo, default validity period and terms.
5. Review quote groups and resolve validation errors. Select the quotes to generate.
6. Preview the exact document data and choose an output Drive folder.
7. Generate one PDF per quotation, with visible progress and per-quote results.
8. Open generated files through a dedicated results tab containing quote ID, generation time, status and Drive link.

The source sheet remains unchanged. The results tab has a collision-safe name and never replaces an existing user tab. Folder selection must make it clear where customer information will be stored; preserve the folder's existing access rules without making files public.

## 4. Scope and document rules

### Included

- One Sheets sidebar and a single professional quotation layout.
- Manual generation from a selected range; saved column mapping and branding.
- Multiple line items per quote, multi-page PDFs, A4 and Letter page sizes.
- Quote reference, customer/business details, item table, totals, currency, issue date, expiry and terms.
- Drive output and result links/statuses in the spreadsheet.
- Limited free allowance, paid entitlement and explicit errors when access expires.
- Basic usage and failure events that exclude spreadsheet contents and customer information.

### Grouping and validation

- Group by quote ID within the selected source, never by customer name alone. Preserve leading-zero identifiers.
- Rows within a quote must agree on customer and currency. Conflicting quote-level fields block that quote and identify the affected rows.
- Treat empty rows, missing keys, formula errors, invalid quantities, negative prices and ambiguous number formats explicitly. Do not silently coerce bad values to zero.
- Prefer typed cell values; support documented spreadsheet locales and currency precision. Use decimal-safe arithmetic for quantity × unit price and totals.
- MVP total is the sum of validated line amounts. No automatic taxes, exchange rates or inferred discounts. State this clearly in setup and document preview.
- Use the spreadsheet's timezone for issue/expiry dates and export the same validated snapshot shown in preview. If source data changes before generation, require a refresh.
- Keep source order within each quote. Warn on identical item rows but do not silently delete potentially intentional lines.

### Deferred

Automatic emails, Gmail access, scheduling, form triggers, e-signatures, payment collection from quote recipients, legal/tax invoice support, arbitrary template builders, CRM integrations, fuzzy SKU matching, mobile UI, shared team licensing and custom design services.

Start with an English interface. Verify rendering of common non-Latin customer and product names; do not imply all scripts/fonts are supported without testing.

## 5. Technical direction

**Initial architecture:** a Google Sheets Editor add-on implemented in Apps Script, with an HTML sidebar and TypeScript source compiled for the Apps Script runtime. Editor add-ons support menus/dialogs/sidebars and are desktop-only. Use local version control and a deployment tool such as clasp after checking its current setup requirements. [Google add-on types](https://developers.google.com/workspace/add-ons/concepts/types).

Use the existing mise-managed development environment; pin a compatible Node/toolchain version when scaffolding and retain the chosen lockfile. Node is the local build/test runtime, not the Apps Script production runtime.

Proposed module boundaries:

- `sheet-reader`: reads a selected range and cell metadata in batches.
- `quote-model`: pure grouping, validation, decimal calculations and immutable document snapshots.
- `quote-renderer`: builds one quotation and exports it to PDF.
- `drive-output`: creates files only in the selected location and records output identifiers.
- `generation-jobs`: validates source freshness, checkpoints progress and coordinates retries.
- `settings`: user/spreadsheet-scoped mapping and branding.
- `entitlements`: free usage and paid-license verification.
- `sidebar`: mapping, errors, preview, progress and results.

### PDF and permissions feasibility

First test an app-created Google Docs document with a fixed layout, exported to PDF through supported Google APIs. Verify repeating item tables, page breaks, header/footer behavior, fonts and temporary-document cleanup. Do not copy Google's invoice sample unchanged and assume it handles arbitrary row counts.

Prove the smallest practical permissions for the current spreadsheet and files selected/created by the app. Evaluate per-file Drive access and file selection before adopting broad Drive/Docs permissions. Exact scopes depend on the chosen APIs and must be demonstrated, not guessed. Declare scopes explicitly and document why each is needed. [Scope guidance](https://developers.google.com/workspace/add-ons/concepts/workspace-scopes).

Public Marketplace review and applicable OAuth verification are separate release tasks. A functioning private prototype is not a publishable app. [Review requirements](https://developers.google.com/workspace/marketplace/about-app-review).

### Reliability and data handling

- Batch sheet reads/writes. Generate in bounded chunks with checkpoints, cancellation and resume behavior; set supported batch limits after measuring Apps Script execution/export quotas. [Google quotas](https://developers.google.com/apps-script/guides/services/quotas).
- Identify a generation by spreadsheet/source, quote ID, content snapshot and template version. Normal retry should return the existing result; a changed quote creates a clearly identified new version.
- Record reserved file IDs/job state before retriable steps where possible. Test the interruption between file creation and result recording; do not promise perfect duplicate prevention without validating this boundary.
- Serialize conflicting generation actions and detect concurrent changes. Exclude completed quotes from retries after partial failure.
- Keep customer rows and document contents within the intended Google account workflow. External licensing/telemetry must use minimal identifiers and counts, not quote contents.
- Store no payment secrets in sidebar code, spreadsheet cells or the repository. A paid provider needs authenticated server-side license verification and signed payment-event handling; Apps Script local properties alone are not a trustworthy paid entitlement store.
- Define temporary-file cleanup, retention and account/license deletion behavior. Preserve user-created output PDFs unless the user explicitly deletes them.

## 6. Existing assets

Inspect `/home/giwan/Projects/cafe24-quotation-export` for document structure, field validation and print-layout concepts, and `/home/giwan/Projects/cafe24-variant-cost-import` for validation/preview patterns. Read each project's instructions before modifying it; this project should not require changing either.

The Cafe24 app's browser-print/XLSX export is not a direct PDF engine. The Shopify quotation project currently has a plan, not an implemented shared library. Reuse small proven platform-independent pieces after inspection; do not create a shared multi-platform framework before both workflows need it. Never copy credentials or production customer data.

## 7. Implementation checkpoints

| Phase | Deliverable | Completion check |
|---|---|---|
| A — first 2 working hours | Development add-on, synthetic sheet, grouping and PDF feasibility | Three input rows produce the two correct quote documents; selected-file access and rendering approach are demonstrated |
| B — core workflow | Column mapping, validation, branding, preview, Drive output and results tab | A user completes generation without editing code; original sheet data is preserved |
| C — release MVP | Retry handling, quotas, licensing, cleanup and product events | Partial failures resume safely; paid/free states behave correctly; no content leaks into telemetry |
| D — submission package | Production deployment, consent screen, listing, support/privacy pages and reviewer instructions | Fresh-user install and complete workflow pass; permissions and claims match behavior |

**Proposed cap: 12 total working hours including Phase A, with no new paid services.** At the cap, stop and record completed work, blockers and the remaining estimate. It is a feasibility/MVP timebox, not a promise of review approval. Explicitly re-scope further investment rather than silently extending work.

Before coding, record the actual start date, stop date, owner and cap in the decision ledger's `wiki/inbox.md`. Creating this plan does not start an unattended build, paid subscription or publishing action.

## 8. Verification

- Pure logic tests: repeated/non-contiguous quote IDs, leading zeros, inconsistent customers/currencies, missing fields, formula errors, locale-sensitive decimals and rounding.
- PDF checks: one item, many pages, long names/terms, non-Latin text, missing logo, both paper sizes and agreement between preview/PDF totals. Render and visually inspect representative PDFs.
- Workflow checks: fresh install, no spreadsheet selected, denied permissions, read-only sheet, inaccessible output folder, missing/deleted output and multiple signed-in Google accounts.
- Reliability checks: quota/time-limit interruption, resume, repeat click, failure after file creation, concurrent tabs and source changes after preview.
- Licensing checks: successful/failed generation allowance, valid/expired subscription, refund/cancellation state and duplicate payment-event processing. Use provider test mode.
- Run typecheck, lint, focused tests and build once implementation exists. Planning-only changes need no application tests.

## 9. Launch and learning

Initial reach action: publish one Sheets add-on listing showing several line-item rows becoming two complete quotation PDFs. Candidate phrases include “Google Sheets quote generator” and “quotation PDF”; search volume and achievable ranking are unmeasured.

Before launch, record concrete observation dates, support/time budget and a stopping condition. Proposed initial window: 14 days after approval, up to two hours of support/measurement, no ad spend. Track attributable listing visits where available, installs, successful first quotation, repeat generation, pricing exposure, completed paid transactions and support minutes. Development/test activity does not count as demand.

One independent payment is a learning signal, not proof of repeatable economics. If reach is missing or unmeasured, do not label zero purchases an offer rejection. At the cap, record whether the issue was exposure, activation, pricing response or execution, and name what changes before further work.

Before sustained expansion, estimate paying users × annual revenue / 12 minus payment/hosting costs, refunds and support. Annual cash receipts are not monthly recurring cash; document exchange-rate and tax assumptions when checking the owner's ₩2m/month income objective.

## 10. Current checklist

- [x] Create project directory and `plan.md`.
- [x] Record dated implementation timebox in `../llm-wiki/wiki/inbox.md`.
- [x] Create the TypeScript/Apps Script toolchain and synthetic data (Cloud project not yet created).
- [x] Complete Phase A and confirm permissions/rendering feasibility (deployed 2026-09-25; 3 rows → Q-001/Q-002 PDFs via drive.file + documents + external_request; visual PDF inspection still recommended).
- [x] Build and validate the core workflow (mapping, validation, branding, preview, Drive output, results tab; `npm run verify` green).
- [ ] Add licensing and submission materials (submission draft in `SUBMIT.md`; no paid provider selected).
- [ ] Record the launch experiment and submit for review.
- [ ] Measure results and decide the next bounded commitment.

**Next action:** deploy the add-on to a test Apps Script project and prove selected rows → grouped quote model → two PDFs on a synthetic sheet with the manifest's scopes. Then complete the `SUBMIT.md` checklist.
