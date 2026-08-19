# Study Intelligence v1 rollout

Study Intelligence v1 changes the artifact-generation and mastery-write boundaries. Roll it out as one controlled backend checkpoint before publishing the UI.

## Preconditions

- Confirm the target Supabase project ref before every write.
- Confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `LOVABLE_API_KEY` are available to the four Edge Functions. Never print their values.
- Confirm the current production study path is healthy and record the counts of `learning_artifacts`, `study_sessions`, `user_concept_mastery`, and `study_result_concept_updates`.
- Preflight concept/capture/class ownership. The base migration severs only clearly invalid optional cross-owner UUID links, normalizes same-owner identifiers, and deliberately aborts on ambiguous same-owner capture/class disagreements for operator review.
- Pause student study-result submissions for the short migration/function handoff. Capture and syllabus entry may remain available.

## Deployment order

1. Apply `20260817190000_study_intelligence_v1.sql` in one transaction.
2. Verify the new columns, constraints, feedback table, feedback RPC, service-only `study_result_attempts` lease ledger, concept/capture ownership triggers, and service-role-only `apply_study_concept_result_v2` grants.
3. Deploy these exact functions from the same reviewed commit:
   - `generate-artifact`
   - `record-study-result`
   - `extract-concepts`
   - `process-capture-images`
4. While study-result submissions remain paused, run only the pre-lockdown owner-functional checks: generate each artifact kind, save one result, prove exact retry caching/repair, reject a changed retry, and confirm capture extraction still seeds mastery. Do not treat browser-write denial as testable yet; the older grants intentionally remain during this brief compatibility window.
5. Immediately apply `20260817191000_study_intelligence_lockdown.sql`. Keep the study-result pause in place and minimize the interval between steps 3 and 5.
6. Run the full adversarial checks below. Verify authenticated clients can still read their own concepts, artifacts, mastery, and legacy non-artifact history, but cannot mutate concepts, artifacts, mastery, the result ledgers, or artifact-backed `study_sessions`, cannot forge a v9 artifact, and cannot execute the retired mastery RPC. Verify service-role writes still complete an artifact-backed history row.
7. Repeat the owner study/capture smoke after lockdown, then end the maintenance pause only after both the owner and adversarial checks pass.
8. Publish the reviewed UI only after all backend checks pass.

Do not apply the lockdown migration before all four functions are deployed. The new functions require the first migration, while the old functions require the browser-write privileges removed by lockdown.

## Acceptance checks

### Before lockdown, with submissions paused

- Anonymous requests to all four functions are rejected.
- User A cannot load or mutate User B's concepts, artifacts, mastery, feedback, captures, or classes.
- An owner can generate grounded flashcards, multiple choice, Match Lab, and a memory trick.
- Flashcard, multiple-choice, and matching answers are copied from the selected source excerpt or durable manual definition; AI-created content appears only as a labeled memory trick around an unchanged exact target.
- A Coach-picked scope keeps the same `coach-*` scope ID after generation and reload.
- A capture-scoped memory trick keeps its `capture-*` scope ID after generation and reload.
- Helpful/not-helpful memory feedback accepts only the current owned mnemonic item and stores only technique/helpfulness metadata.
- A correct result updates mastery once. The exact retry is idempotent and repairs presentation history from the service-only ledger. A changed retry payload is rejected.
- Two concurrent stale-lease reclaimers produce exactly one winner; a fresh lease returns a retryable wait, and a mid-concept retry resumes through the per-concept ledger.
- A recovered second attempt does not turn the first miss into mastery credit.
- A new capture still extracts concepts and seeds mastery.

### After lockdown, before resuming submissions

- Repeat every pre-lockdown owner-functional check.
- A forged, stale, wrong-version, cross-concept, or browser-authored artifact cannot update mastery.
- Direct authenticated concept/artifact/mastery/ledger writes, protected artifact-history inserts/updates/deletes, and the retired RPC are denied after lockdown; ordinary completed non-artifact history remains compatible.
- An authenticated browser cannot create a forged v9 artifact during the deployment handoff or after lockdown.

## Verification commands

```sh
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/eslint .
./node_modules/.bin/vite build
git diff --check
```

Bundle-check the four Edge entry points before deployment. Then perform one signed-in mobile-width journey covering source review, confidence, retry, Match Lab, memory feedback, result save, reload, and changed-account denial.

## Rollback

- Stop the UI rollout first and leave the additive schema and recorded student results intact.
- Keep the new Edge Functions deployed if lockdown has been applied; restoring an older function without restoring its required privileges will break capture or study writes.
- If an emergency requires an older Edge Function, explicitly restore only the minimum audited grants it needs, record that temporary exception, and reapply lockdown after the incident.
- Never delete or rewrite student mastery, feedback, artifacts, or result-ledger rows as a rollback step.
