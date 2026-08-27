# Study Intelligence v1 rollout

Study Intelligence v1 changes the artifact-generation and mastery-write boundaries. Roll it out as one controlled backend checkpoint before publishing the UI.

## Preconditions

- Confirm the target Supabase project ref before every write.
- Confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `LOVABLE_API_KEY` are available to the five study-write Edge Functions. Never print their values.
- Confirm `20260720130000_ai_request_rate_limits.sql` is present. Configure a
  provider-side hard spend cap and alert; per-user database quotas are not a
  substitute for the global provider brake.
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

### Assignment Tutor source-boundary handoff

The `20260827` assignment-source migrations require a staged deployment; do not
apply every pending migration in one unattended pass:

1. Apply the additive migrations, in order, through the single strengthened
   review-artifact boundary: `20260827100000_concept_capture_evidence.sql`,
   `20260827110000_assignment_practice_source_confirmation.sql`,
   `20260827120000_assignment_tutor_mastery_guard.sql`,
   `20260827122500_study_write_pause_control.sql`,
   `20260827123000_private_learning_signal_guard.sql`,
   `20260827124000_course_map_stable_guard.sql`, and
   `20260827125000_assignment_review_artifact_guard.sql`. There must not be a
   later duplicate review-artifact migration in the release set.
2. Deploy these five functions from the same reviewed commit:
   `process-capture-images`, `extract-concepts`, `generate-artifact`,
   `confirm-assignment-practice-source`, and `record-study-result`.
3. Pause new study writes with the service-only control and verify its returned
   state. Never expose either RPC to the browser:

   ```sql
   select public.set_study_writes_paused(true, 'assignment-source rollout');
   select public.get_study_write_pause();
   ```

   Confirm a newly started call to each of the five functions returns HTTP 503
   with `reason: "study_writes_paused"`, and confirm a new authenticated browser
   capture insert fails with the same database reason. Wait until every
   invocation from the prior release has drained.
4. While writes remain quiesced, apply
   `20260827127500_retire_concept_evidence_mirror.sql`, allow it to commit, then
   apply `20260827130000_capture_mutation_lockdown.sql`.
5. Keep the pause in place until the lockdown transaction commits and the owner,
   cross-owner, stale-source and exact-retry checks pass. Only then explicitly
   resume writes and verify the returned state:

   ```sql
   select public.set_study_writes_paused(false, null);
   select public.get_study_write_pause();
   ```

The separate mirror-retirement commit is required for lock ordering. The
lockdown's table locks do not drain an Edge invocation that can issue another
database request after the transaction commits.

### Launch API and observability handoff

From the same reviewed release commit, also deploy `parse-syllabus` and
`report-client-error`. All seven changed functions must return private,
non-cacheable, `nosniff` JSON with a request ID and must never expose database or
provider response text in 5xx bodies or logs. Configure a production log drain
or platform alert for sanitized Edge 5xx records and the `[client-error]` marker.
Send one `/release-canary` event and prove the alert reaches the operator before
inviting a student.

The published host must enforce CSP with `frame-ancestors 'none'` and
`object-src 'none'`, HSTS, Referrer-Policy, Permissions-Policy, and
`X-Content-Type-Options: nosniff`. The repository intentionally does not guess a
host-specific header file; the post-deploy canary checks the actual origin.

## Acceptance checks

### Before lockdown, with submissions paused

- Anonymous requests to all five study-write functions are rejected.
- Hourly and daily quota denial prevents every paid extraction, syllabus, and
  image-processing provider request; a quota-service error fails closed.
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
- An owned class with a literal `ACCT 2010` identifier materializes exactly 15
  original stable foundations through the service-only RPC, creates no mastery
  rows on activation, and does not expose the RPC to a browser client.
- A Course Map row never enters Recent because it was just materialized, never
  enters an exam through its insert date, and matches named exam topics only
  through its bundled curated aliases.

### After lockdown, before resuming submissions

- Repeat every pre-lockdown owner-functional check.
- A forged, stale, wrong-version, cross-concept, or browser-authored artifact cannot update mastery.
- Direct authenticated concept/artifact/mastery/ledger writes, protected artifact-history inserts/updates/deletes, and the retired RPC are denied after lockdown; ordinary completed non-artifact history remains compatible.
- An authenticated browser cannot create a forged v9 artifact during the deployment handoff or after lockdown.
- Anonymous clients cannot read raw topic signals, exam debriefs, or topic
  scores. Authenticated students can read/write only their own raw signal and
  debrief rows; launch clients cannot read cross-student topic scores.

## Verification commands

```sh
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/eslint .
./node_modules/.bin/vite build
git diff --check
```

Bundle-check the five study-write Edge entry points before deployment. Then perform one signed-in mobile-width journey covering source review, confidence, retry, Match Lab, memory feedback, result save, reload, and changed-account denial.

After the exact web and backend commit is deployed, run `npm run
validate:release-env` and `npm run canary:release` through the protected
production environment. The canary must prove the expected release SHA, live
security headers, canary Auth, all invalid-body validation paths, and the
sanitized error signal without writing student data or spending AI.

## Rollback

- Stop the UI rollout first and leave the additive schema and recorded student results intact.
- Keep the new Edge Functions deployed if lockdown has been applied; restoring an older function without restoring its required privileges will break capture or study writes.
- If an emergency requires an older Edge Function, explicitly restore only the minimum audited grants it needs, record that temporary exception, and reapply lockdown after the incident.
- Never delete or rewrite student mastery, feedback, artifacts, or result-ledger rows as a rollback step.
