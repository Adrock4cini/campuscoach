# Capture dates → planner (ticket-only candidate)

Base: merged PR #61 / main `61f66fa13562b7c3650d979d9aef06f546c0b168`.
Feature marker: `capture-planner-v1`.

## Scope

Use already-saved, successfully processed source text to propose assignment and
quiz/test dates. Show review after Scan Notes or Book, after ready PDF/PPTX batches,
and above Assignments / Tests on the class page. Nothing enters the planner until
the student checks the source, corrects the title/date, selects each row and confirms.
This is not a new OCR model, a different app, or a learning-score change.

No schema, RLS, Edge Function, auth configuration or runtime dependency change.
No publish or merge authorization is implied by this candidate.

## Safety / limitations

- Only owner-and-class-scoped, ready captures are eligible. Wrong-class failed
  captures and assignment-problem review are excluded. Existing #60 gate unchanged.
- Parse source OCR / note text, never summary prose. Show the actual excerpt and
  existing capture label (including source page/slide range when available).
- Bounded English date proposals: ISO or named-month dates paired with work cues.
  Relative/numeric dates and multiple dates in a sentence remain unresolved until
  the student chooses a date. Missing year uses the capture year as a visibly
  flagged suggestion. Weekday conflicts are flagged on the current edited date.
- Current parsing is conservative and is not a promise that every deadline in
  every document will be detected. Only the 100 most recent ready captures per
  class are scanned on the class surface, with up to 40 proposals per capture.
  A completed file import also checks its specific ready batches.
- Adds calendar DATE only, not a precise deadline time or reminders. Times are
  retained in notes, with an explicit warning when recognized.
- Stable per-source proposal UUIDs and INSERT-only writes protect retries from
  duplicates and do not overwrite completed, edited or archived work. An active
  matching title/date already in the same class is recognized as existing.
  A differently titled reupload is not guaranteed to be semantically deduplicated.
- Each save rechecks source availability, ready status, owner, class and proposal
  identity. Partial failures retain successful rows and leave others retryable.
- Confirmed rows use the existing assignments/exams tables and their change
  events; Calendar and class views continue to use the existing readers.
- No concepts or mastery are written by this feature. New exams start at 0.

## Automated checks

- `npm test -- src/lib/capture/plannerDates.test.ts src/lib/capture/plannerPersistence.test.ts src/components/capture/CapturePlannerReview.test.tsx`
- `TZ=America/Denver npm test -- --maxWorkers=2`
- `npm run typecheck`, `npm run lint`, `npm run build`
- `node scripts/verify-capture-planner.mjs`: actual component, parser and
  persistence module in Chromium/WebKit, synthetic database replacement only.
  Checks 390px overflow, explicit confirmation, corrected dates, class scope,
  zero new exam readiness and no duplicates after reload. No live account/data.
- Existing PDF/PPTX, Scan Notes, wrong-class and complete/reopen tests remain gates.

Local validation on September 10, 2026: 255 test files / 1,878 tests passed;
the final targeted rerun passed all 23 new tests. Typecheck, production build,
and lint passed (existing repository lint warnings remain; no new-file warnings).
Local browser execution was blocked by missing Playwright binaries and a CDN
download timeout. The same isolated phone-browser check is required in CI and
uploads screenshots; do not treat it or live QA as passed until observed.

## Camp Bot: three live checks (only after an approved test deployment)

1. **Find → review → persist.** In the same QA student workflow, upload a small
   deck or photo with concepts plus “Assignment due Friday September 18, 2026”
   and “Quiz 1 Friday September 25, 2026.” Verify proposals and source excerpts;
   check both rows and add. Class Assignments has the assignment, Tests has Quiz 1,
   and Calendar has September 18/25 after leave → return → hard refresh. Reopen
   the source/review: no second copy. Concepts and study still work.
2. **No confirmation → no planner write.** Use a distinct source (“Essay due
   9/21/26”, “Quiz 2 next Friday”). Numeric/relative dates must need explicit date
   selection. Dismiss without checking/adding; refresh. No new assignment/test.
   Returning to the class still offers review. “Friday September 12” in 2026 must
   flag the weekday conflict and the missing year, not silently claim certainty.
3. **Safety regressions.** Wrong-subject accounting → BIOL: do NOT Keep; no new
   concepts or planner items. Legitimate Math → Math still processes and studies.
   Completing/reopening an overdue item still follows the already-PASSed #61 rules.

Record exact deployed SHA and bundles, before/after item counts, source excerpts,
saved dates, screenshots and refresh results. CI is not live student PASS.
