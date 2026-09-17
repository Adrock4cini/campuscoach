# PR #63: repair the verified September 16 live failure

## Evidence and diagnosis

Camp Bot verified deployment `0abbd87b-7fd7-4087-8bcf-13581bde9d48`
(`index-D4FWETVC.js` / `App-Bov4Pti6.js`). Sources collapsed, but legacy
PSYC answers still contained OCR paragraphs. HIST assessment Build & start
repeatedly returned a refresh-required set. Saved progress passed.

Read-only inspection of the named QA classes confirmed that three HIST exam
artifacts created during the run contained the same source paragraphs and
`v11-evidence-ladder` as the older build. Their payloads cannot be produced by
the intended concise builder. The earlier deployment report was not sufficient
proof that the intended shared backend code was actually running.

A second code defect was independently reproduced: source selection normalized
newlines/bullets before choosing excerpts. One concept consumed the shared
definition paragraph; sibling concepts received assessment logistics. The
short-answer helper alone could not recover missing evidence.

## Repair boundary

- For flashcards, MC and matching only, prefer complete source clauses before
  flattening slides. Preserve exact source text and the existing capture policy.
- Reject short multi-concept dumps, clipped answers and schedule reminders,
  as well as oversized answers. Existing clean sets remain usable.
- Validate generated content before insertion. No partial word truncation or
  invented facts. Schedule-only input must produce a useful content-needed
  response, never questions about unstated subject matter.
- Successful generation returns `studyContentVersion: concise-study-v1` and
  records it in `study_scope_snapshot`. The client requires this handshake and
  validates the payload before treating generation as successful. Mismatched
  output stops retries for the current scope and presents an explicit error.
- The scoring version remains `v11-evidence-ladder`. No migration, deletion,
  concept-memory reset, planner change or scoring change.

Limits: flashcard answer 40 words, matching term 6 / answer 12. MC retains the
existing 14-word ceiling to preserve the complete confirmed percent recipe;
PSYC fixture choices are all at most 12 words. Do not advertise a universal
12-word MC ceiling.

## Verification before release

Integration coverage uses the real source selector, builders, validator, hook
and session components; only database/HTTP boundaries are simulated. Cover:
assessment-scoped one-action start for all three formats, legacy short dumps,
source collapse, backend mismatch, invalid generated content and insufficient
source material. Existing scope-race, first-attempt and persistence tests stay.
CI is not a live student PASS.

## Release after Adam approves

Deploy `generate-artifact` from the exact approved Git SHA, including its full
transitive shared dependencies, then the same frontend. No database migration
and no redeploy of the result recorder (scoring version is unchanged).

Before declaring backend success, generate from QA material with actual
academic definitions and inspect the network response: it must contain
`studyContentVersion: concise-study-v1`, and the saved artifact's snapshot must
carry that marker. Inspect actual short answers too; a marker alone is not
proof of good content. Record exact frontend deployment ID and bundle names.

## Camp Bot retest

1. Use the existing PSYC lecture with Encoding, Storage and Retrieval definitions,
   or a clean synthetic assessment with explicit definitions. Once generated,
   one Build & start / Refresh & start opens the first question. No second Start
   tap and no refresh loop. Verify all three formats.
2. Short card backs and MC/matching choices, no slide-wall answers, source
   collapsed. On PSYC, expect `getting info into memory`, `keeping it over time`,
   and `getting it back out`, each tied to its correct concept.
3. Complete practice, leave and hard refresh. First-attempt scoring and stored
   progress remain intact. Record this separately from set existence alone.
4. Negative control: HIST planner slides contain dates/topic headings rather
   than Civil War explanations. If no academic content was added, expect a
   clear request for a definition/example, no invented questions and no silent
   refresh loop. Do not change fixtures silently to manufacture a PASS.

No planner retest campaign, new game, cleanup, merge or publish by Camp Bot.
