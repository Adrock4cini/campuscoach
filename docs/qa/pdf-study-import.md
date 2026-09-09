# Reusable PDF study import — QA handoff

Status: implemented on `feat/pdf-study-capture`; NOT published or live-QA certified.
Base: `56331f82a73a07d78406617719909f4abce8a666` on the existing connected
`fix/photo-wrong-class-gate` branch. This is a stacked draft; do not merge it into
that branch, retarget, switch Lovable branches, or publish without Adam's approval.
PR #60 and its production PASS evidence are unchanged.

## What this change does

Capture → Upload File opens **Upload PDF study material** for a real signed-in user.
It accepts a PDF up to 25 MiB / 300 pages, chooses an existing class and optionally
an existing test, and renders a selected physical page range into JPEGs on-device.
It sequentially sends groups of at most four pages through the existing
`scan-material` capture pipeline and its server-enforced wrong-class gate.

- No new database schema, buckets, Edge Functions, backend secrets or AI prompts.
- Original PDF remains on-device; rendered page images are private source material.
- The filename + physical PDF page range appears in each capture's topic. Source
  images retain their filename/page number. This does not add per-question PDF links.
- Page count is material processing, not preparedness. No mastery is awarded by import.
- Class practice links use **All**, not just the last four-page batch. Test-linked
  imports use that test's existing study scope. Existing practice persistence and
  weak-spot behavior are reused, not replaced or newly certified here.
- Large imports can hit existing account-level processing limits (24 image
  processing requests/hour, 96/day). Limits are NOT raised. Use chapters first.
- Import pauses at the first mismatch, failed/unfinished request, or requested pause.
  Keep applies only to the exact saved batch, never to subsequent batches.
- Owner-scoped browser checkpoints store IDs, document SHA-256, frozen context and
  progress, not PDF bytes/extracted text. After refresh, reselect the same PDF.
  Retry reuses the same capture attempt or its already-saved source IDs.
- Skipped pages are reported separately, never counted as processed. Starting a
  new PDF requires confirmation before discarding the device checkpoint. Saved
  captures are never deleted. Clearing browser storage loses resume metadata.

## Checks performed locally

- TypeScript: PASS.
- Production build: PASS. PDF parser/worker are lazy loaded; fonts, CMaps and image
  decoders are emitted as versioned same-origin assets, not loaded from a vendor CDN.
- Full regression: `TZ=UTC npm test -- --maxWorkers=4` — 251 files / 1,839 tests PASS.
- Final focused regression (including the added single-All-target check): 6 files /
  99 tests PASS. Includes source validation, password/size limits, renderer cleanup,
  owner changes, immutable retry IDs, pause/resume, class/exam retention and no-Keep.
- Changed-file ESLint: zero errors. Whole-repository lint is blocked by an existing
  `prefer-const` error in `src/integrations/supabase/previewAuthStorage.ts:38` already
  present at the base SHA. Not changed in this product PR.
- Production dependency audit: zero vulnerabilities.
- Default container timezone also revealed three existing date fixture failures in
  `dueStatus.test.ts`; those pass under UTC. No date behavior was changed here.
- Cloud Browser refused access to the local test preview (`ERR_BLOCKED_BY_CLIENT`).
  Mobile/browser E2E and deployed worker MIME/asset delivery are NOT certified.

## Official handbook fixture

Utah Driver License Division: https://dld.utah.gov/resources/

PDF: https://dld.utah.gov/wp-content/uploads/Driver-Handbook-2026.pdf

Fetched September 9, 2026; 115 pages, 9,153,599 bytes.
SHA-256: `3764482adaa0aa2fbc549ca9607fa87aef2abb77ad5c1297ac1e2642f94dcb21`.
The PDF is not committed to this repository.

Reproduce the non-browser renderer check:

```sh
node scripts/verify-pdf-import.mjs /absolute/path/Driver-Handbook-2026.pdf /absolute/path/rendered-samples
```

PDF.js 6.3.289 rendered all 115 pages (29 batches), maximum JPEG 838,692 bytes.
Source/render comparison of physical PDF page 57 showed the railroad/regulatory
sign illustrations and readable text. Offline engine rendering does NOT prove
browser rendering, server ingestion, generated-question accuracy or test readiness.

## Live acceptance — only after approved test deployment

First record PR SHA and actual deployment URL. Confirm the deployed new chunk
contains `pdf-study-import-v1` / `Upload PDF study material`, and record its actual
`index-*.js`, `App-*.js` and `PdfStudyImportDialog-*.js` names. Do not claim local
chunk hashes identify a production deployment. Verify `/pdfjs/6.3.289/` assets and
the bundled PDF worker load without MIME, CORS or network errors on iPhone Safari.

1. **Core study loop:** in a dedicated driver-education class, upload physical PDF
   pages 55–62 (two batches; includes road signs). Before pressing Add, no new source
   or concepts should exist. After processing, both batches should be findable in
   Class Memory with legible source images. Leave/return/hard-refresh must preserve them.
2. **Questions grounded in the manual:** open Practice questions / Flashcards.
   All class material must be selected once, not Recent or a duplicate All button.
   Verify questions/explanations against the manual, including effective dates.
   Neither generic study prompts nor echoed answers qualify as a useful study set.
   A generated set is a sample, not proof of exhaustive handbook coverage.
3. **Learning evidence:** answer some correctly and some incorrectly, save, leave,
   hard-refresh. Check first-attempt evidence persists, weak concepts remain distinct
   from material coverage, and the next practice targets the student's actual misses.
   Report actual behavior; do not infer readiness from upload count or time spent.
4. **Wrong class:** use distinctive accounting PDF pages in BIOL. Required warning
   appears BEFORE concepts; do not press Keep. Dismiss, leave, refresh. The batch may
   have private material rows but must add zero concepts and must not start later
   batches. Reopening import must preserve the warning. Existing Math photos still work.
5. **Interrupted import:** pause after one completed batch; close/refresh and reselect
   the same PDF. Completed batches must not be duplicated. Resume must start at the
   unresolved batch using its original identity. A different PDF is rejected.
6. **Limits/failure:** corrupt/protected/oversize input never uploads. If a request is
   throttled/offline/unfinished, stop; no later pages should be marked ready. Resume
   later in place. Explicitly skipped pages stay visibly skipped.
7. **Ownership/context:** context locks once the first checkpoint is created. A
   session/account change halts subsequent writes; another account must never resume
   this import. A deleted class or unverifiable test must block import rather than
   silently selecting a different class/test.

Do not test or modify My Classes, walkthrough, syllabus import, old poison cleanup,
auth, passkeys, assignments, or migrations as part of this product ticket. Log any
independent CI/auth blocker separately. No merge, publish, or daughter-facing claim
of reliable exam preparation until the relevant live acceptance checks are complete.
