# Study Intelligence v1 rollout

Study Intelligence v1 changes the artifact-generation and mastery-write boundaries. Roll it out as one controlled backend checkpoint before publishing the UI.

## Preconditions

- Confirm the target Supabase project ref before every write.
- Confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `LOVABLE_API_KEY` are available where required by the six guarded study,
  capture, and syllabus Edge Functions. Never print their values.
- Confirm `20260720130000_ai_request_rate_limits.sql` is present. Configure a
  provider-side hard spend cap and alert; per-user database quotas are not a
  substitute for the global provider brake.
- Confirm the current production study path is healthy and record the counts of `learning_artifacts`, `study_sessions`, `user_concept_mastery`, and `study_result_concept_updates`.
- Preflight concept/capture/class ownership. The base migration severs only clearly invalid optional cross-owner UUID links, normalizes same-owner identifiers, and deliberately aborts on ambiguous same-owner capture/class disagreements for operator review.
- Pause student study-result submissions for the short migration/function handoff.
  During the later `20260827` agreement handoff, the coordinated maintenance
  guard also pauses authenticated browser capture, material, processed-content,
  capture-source, and syllabus-source writes.

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
   `20260827124000_course_map_stable_guard.sql`,
   `20260827125000_assignment_review_artifact_guard.sql`, and
   `20260827125500_study_write_maintenance_guard.sql`. The last migration
   extends the private pause control to authenticated browser INSERT/UPDATE on
   captures, materials, and processed content plus INSERT into both private
   source buckets. There must not be a
   later duplicate review-artifact migration in the release set. Do not apply
   `20260827126000` yet.
2. Close invites, put the published host behind its previously tested
   operator/canary maintenance access control, and pause all guarded direct
   browser raw-input writes with the service-only control:

   ```sql
   select public.set_study_writes_paused(true, 'assignment-source rollout');
   select public.get_study_write_pause();
   ```

   Record the paused state. Do not rely on the host gate to protect the public
   Supabase APIs.
3. Deploy these six guarded functions from the same reviewed commit while the
   receipt table is intentionally absent:
   `process-capture-images`, `extract-concepts`, `generate-artifact`,
   `confirm-assignment-practice-source`, `record-study-result`, and
   `parse-syllabus`. Confirm each returns private retryable HTTP 503 with
   `reason: "family_beta_agreement_check_unavailable"` before body parsing or
   provider access, then wait for every invocation of the previous revisions to
   drain. This fail-closed revision is the temporary server-side denial; never
   leave an older service-role handler live during the RLS handoff.
4. Apply, as separate reviewed transactions and in this exact order,
   `20260827126000_family_beta_agreement_acceptance.sql`,
   `20260827126500_family_beta_raw_input_guard.sql`, and
   `20260827126750_capture_request_idempotency.sql`. The second migration gates
   authenticated capture/material/processed-content INSERT/UPDATE and direct
   INSERT into both private source buckets. The third permits at most one
   browser-derived mock processed row per immutable capture fingerprint.
5. Publish the temporary agreement-compatible web stage from the same reviewed
   commit behind maintenance access control. Verify agreement evidence is read
   and written only through `get_family_beta_agreement_status()` and
   `accept_family_beta_agreement('2026-08-17')`; the route blocks the application
   until the RPC confirms the signed-in owner and never treats Auth metadata as
   evidence. This stage is mandatory: do not manufacture a receipt with SQL,
   service-role metadata, backfill, or a bootstrap shortcut.
6. Through that stage, have the dedicated accepted canary accept once. Verify a
   current owner-bound timestamped receipt. Sign in separately as the dedicated
   unaccepted canary and verify `accepted: false`, `acceptedAt: null`, and its
   own UUID; never click Agree for that account. While maintenance remains
   paused, prove both browser accounts are denied direct writes to all three
   tables and both Storage buckets by the maintenance guard, and prove the
   agreement helper independently returns true only for the accepted account.
   DELETE/account-erasure and service-role recovery must remain available.
7. While writes remain paused, require exact private agreement HTTP 403 from all
   six functions for the unaccepted canary. The accepted canary must pass the
   agreement check and then receive the documented write-pause HTTP 503. A
   malformed or unavailable receipt lookup remains a private retryable HTTP 503.
8. Apply
   `20260827127500_retire_concept_evidence_mirror.sql`, allow it to commit, then
   apply `20260827130000_capture_mutation_lockdown.sql`.
9. Keep the pause and maintenance access control in place through the Capture
   Storage and launch API handoffs below. Do not resume here.

The separate mirror-retirement commit is required for lock ordering. The
lockdown's table locks do not drain an Edge invocation that can issue another
database request after the transaction commits.

### Capture Storage integrity handoff

After the Assignment Tutor lockdown succeeds, keep writes paused for the
Storage boundary described in `docs/capture-storage.md`:

1. Confirm the published client candidate already uses capture-scoped UUID/hash
   paths, `upsert: false`, and exact material insert/recovery. Run the read-only
   legacy provenance preflight; any mismatch is a stop condition requiring a
   reviewed Storage-API remediation.
2. Apply `20260827132000_capture_storage_integrity.sql` as its own transaction.
   It requires the current durable agreement receipt, enforces serialized
   per-capture/orphan/owner quotas, removes browser object UPDATE and committed
   DELETE, retires direct SQL Storage deletion, and installs fenced cleanup
   claims.
3. Deploy the exact reviewed `process-capture-images` and internal
   `cleanup-abandoned-captures` revisions. Verify the image worker hashes every
   downloaded source before paid AI and that browser roles cannot read claims or
   execute cleanup RPCs.
4. Run exact-retry, changed-retry, owner isolation, quota, byte/hash mismatch,
   and cleanup/late-commit race checks before resuming writes. Schedule the
   24-hour cleanup only after a secret-bound production no-op and alert check.

The release canary calls the internal route without its scheduler secret and
expects private HTTP 401. It proves deployment and browser denial only; it must
never claim or delete an object.

### Launch API and observability handoff

From the same reviewed release commit, deploy `report-client-error`, both
internal workers (`cleanup-abandoned-captures` and
`cleanup-abandoned-syllabi`), and the `mcp` HTTP 410 retirement tombstone. With
the six guarded functions above, that is exactly ten deployed revisions. The
MCP tombstone must replace the historical demo/tool handler; a missing route or
the old HTTP 200 handler is not an acceptable substitute. All ten changed
functions must return private,
non-cacheable, `nosniff` JSON with a request ID and must never expose database or
provider response text in 5xx bodies or logs. Configure a production log drain
or platform alert for sanitized Edge 5xx records and the `[client-error]` marker.
Send one `/release-canary` event and prove the alert reaches the operator before
inviting a student.

The published host must enforce CSP with `frame-ancestors 'none'` and
`object-src 'none'`, an effective script policy of exactly `'self'`, one-year
HSTS with `includeSubDomains`, a strict
Referrer-Policy, Permissions-Policy disabling camera/microphone/geolocation, and
`X-Content-Type-Options: nosniff`. The repository intentionally does not guess a
host-specific header file; the post-deploy canary checks the actual origin.

### Final resume and public canary

1. While writes remain paused, confirm
   `20260827132000_capture_storage_integrity.sql` is applied and finish its
   owner/cross-owner, exact-retry,
   cleanup-race, function-inventory, response-contract, alert-delivery, and
   exact-UI checks. Confirm both cleanup schedules are installed but bounded.
2. Resume exactly once and verify the returned state:

   ```sql
   select public.set_study_writes_paused(false, null);
   select public.get_study_write_pause();
   ```

3. Run one accepted owner write journey and repeat the unaccepted account's
   direct INSERT/UPDATE and source-upload denials now that the maintenance gate
   is open; this proves the current-agreement policies independently. Then
   remove the host maintenance
   access control while invites remain closed. The control must be a recorded,
   reversible provider rule tested before the rollout; the GitHub canary does
   not carry a maintenance bypass and runs only after this removal.
4. Immediately run the protected release-readiness workflow. It must see the
   unaccepted account's six exact HTTP 403 agreement denials and the accepted
   account's six zero-AI HTTP 400 validation responses. If any gate fails,
   re-enable maintenance access and the write pause; do not invite a student.

There is no earlier resume point in this handoff.

## Acceptance checks

### While paused, after agreement guard deployment

- Anonymous requests to all six guarded functions are rejected.
- An authenticated account without the current durable family-beta receipt gets
  HTTP 403 from all six guarded functions; changing
  Auth `user_metadata` cannot satisfy this gate. A receipt lookup failure returns
  a private retryable HTTP 503 before request parsing or any provider call.
- The accepted account passes the agreement check but receives the documented
  write-pause HTTP 503; it does not reach validation, quota, or provider work.
- Without a current receipt, authenticated direct INSERT/UPDATE to captures,
  materials, and processed content plus INSERT to both source buckets is denied.
  Accepted owner checks and service-role recovery remain available.
- User A cannot load or mutate User B's concepts, artifacts, mastery, feedback,
  captures, source objects, or classes.

### After lockdown, before final resume

- A forged, stale, wrong-version, cross-concept, or browser-authored artifact
  cannot update mastery.
- Direct authenticated concept/artifact/mastery/ledger writes, protected
  artifact-history inserts/updates/deletes, and the retired RPC are denied;
  ordinary completed non-artifact history remains compatible.
- An authenticated browser cannot create a forged v9 artifact.
- Anonymous clients cannot read raw topic signals, exam debriefs, or topic
  scores. Authenticated students can read/write only their own raw signal and
  debrief rows; launch clients cannot read cross-student topic scores.
- Capture source path, hash, size, MIME, quota, immutability, cleanup fencing,
  and cross-owner tests pass while writes remain paused.

### After final resume, before invitations

- Hourly and daily quota denial prevents every paid extraction, syllabus, and
  image-processing provider request; a quota-service error fails closed.
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
- The protected dual-account canary passes: six exact unaccepted HTTP 403
  denials, six accepted zero-AI HTTP 400 validations, both worker denials, MCP
  HTTP 410, safe error intake, and unique echoed request IDs.

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
   security headers, direct SPA deep-link fallback, the exact same-origin
   nonsecret release manifest, both verified canary Auth
   sessions, the unaccepted account's exact agreement denial on all six guarded
   functions, the accepted account's invalid-body responses, the MCP HTTP 410
   tombstone, both worker denials, and accepted error-report
ingestion without writing student data or spending AI. It does not replace the
manual migration inventory, two-user RLS checks, exact Edge revision audit,
successful staging journeys, or operator confirmation that the alert arrived.

## Rollback

- Stop the UI rollout first and leave the additive schema and recorded student results intact.
- Once `20260827126500_family_beta_raw_input_guard.sql` commits, the
  agreement-compatible client and six agreement-guarded functions are the
  minimum rollback floor. Never restore a pre-agreement client that cannot
  create a receipt. Use a forward fix or a separately reviewed compensating
  migration while maintenance access and the write pause remain active.
- Keep the new Edge Functions deployed if lockdown has been applied; restoring an older function without restoring its required privileges will break capture or study writes.
- If an emergency requires an older Edge Function, explicitly restore only the minimum audited grants it needs, record that temporary exception, and reapply lockdown after the incident.
- Never delete or rewrite student mastery, feedback, artifacts, or result-ledger rows as a rollback step.
