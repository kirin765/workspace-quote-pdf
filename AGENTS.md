# AGENTS.md

Guidance for agents working in this repository. See `plan.md` for product intent and
`README.md` for setup and architecture.

## Commands

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm test              # vitest run
npm run build         # esbuild bundle -> dist/
npm run demo          # synthetic Phase A harness -> demo-preview.html
npm run verify        # typecheck + lint + test + build
```

Always run `npm run verify` after changes. This is a planning-only repo only until code
exists; once code changes, tests and build must pass.

## Architecture rules

- `src/core` must stay pure: no Apps Script, DOM or Node globals, so it runs under Vitest.
- Any Google service goes behind a port in `src/core/ports.ts`; `src/apps-script` provides
  the real adapter. Test orchestration with in-memory fakes (see `src/core/engine.test.ts`).
- The sidebar preview and the PDF both consume `buildRenderModel(...)`. Never add a second
  layout path; preview/PDF totals must stay identical by construction.
- Group by exact Quote ID string. Never group by customer. Preserve leading zeros.
- Money is integer minor units (`number`), bounded by `MAX_AMOUNT_MINOR` / `MAX_QUANTITY` so
  quantity × price and totals stay inside `Number.MAX_SAFE_INTEGER`. Never do float
  arithmetic on amounts. Never coerce a bad value to zero; emit a typed `Issue` instead.
  Do **not** use `bigint`: the Apps Script V8 parser rejects BigInt literals at push time,
  even though Node/Vitest accepts them.
- `contentHash` in `snapshot.ts` defines idempotency. Bump `TEMPLATE_VERSION` when layout
  changes so old documents are not silently reused.
- Usage events must remain content-free (`sanitizeUsageEvent` / `isSafeUsageEvent`).
- Do not use `DriveApp`: the runtime requires the restricted full-Drive scope for
  `DriveApp.createFolder`. Use the Drive API v3 advanced service (`Drive.Files.*`) with `drive.file`.
- This MVP has no paid provider. Do not add a fake payment flag that could be mistaken for
  a real entitlement.

## Code style

- Match existing files; no comments unless they explain a non-obvious decision.
- DTOs crossing `google.script.run` must be JSON-serializable. Prefer plain numbers and
  strings; do not introduce `Date` or other non-JSON values in responses.
- New Apps Script entry points must be added both to a module and to
  `scripts/appsscript-globals.txt`.
- Do not modify `../cafe24-quotation-export` or `../cafe24-variant-cost-import`; they were
  inspected for concepts only.

## Deploy

`scripts/build.mjs` writes only deployables to `dist/`; clasp is rooted there via
`.clasp.json` (`rootDir: "dist"`, git-ignored). Use `.clasp.json.example` as a template.
