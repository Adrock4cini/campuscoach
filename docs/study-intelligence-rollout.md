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
3. Apply
   `20260827133000_browser_learning_evidence_write_guard.sql` as a separate
   transaction. It composes the durable current-agreement receipt and
   lock-coordinated pause with authenticated INSERT into
   `study_strategy_outcomes`, `topic_signals`, `exam_debriefs`, and
   `campus_brain_signals`, plus authenticated UPDATE of `topic_signals`,
   `exam_debriefs`, and `campus_brain_signals`. Existing owner/write-shape and
   DELETE policies and service-role result projection remain unchanged.
4. Apply `20260827134000_class_client_identity_owner_scope.sql` as a separate
   transaction. Verify `(user_id, client_class_id)` is the active compatibility
   identity and the accidental global `client_class_id` uniqueness constraint is
   gone, so two owners may use the same local class key without merging rosters.
5. Apply `20260827135000_launch_schema_regression_guard.sql` as a separate
   transaction. Its fail-closed preflight must find no cross-owner strategy
   outcome references; verify exactly one aggregate refresh trigger remains on
   each source table and class/artifact references are owner-bound for browser
   and service-role strategy-outcome writes.
6. Apply `20260827140000_onboarding_agreement_owner_guard.sql` as a separate
   transaction. Its fail-closed preflight must find no missing, cross-owner, or
   mismatched client identity on enrollment, assignment, exam, flashcard, quiz,
   study-session, readiness-score, or class-syllabus-request class references.
   A non-null request `syllabus_id` must match that same owner/class/client
   identity. Verify restrictive current-agreement INSERT/UPDATE policies on
   profiles, classes, enrollments, assignments, exams, and study sessions plus
   the authenticated school INSERT policy. Verify anon/authenticated mutation
   ACLs and obsolete write policies are absent from unused `flashcards`,
   `quizzes`, and `readiness_scores`, while SELECT and service-role processing
   remain. Verify every owner/client class-reference trigger and immutable class
   owner/client identity using both authenticated and service-role attempts.
   Repair any preflight drift before applying the migration. Afterward, an
   identity correction requires operator-reviewed delete/recreate, never an
   in-place `user_id` or `client_class_id` mutation. Using an
   operator-staged non-student syllabus fixture and a fresh request ID, invoke
   the authenticated SECURITY DEFINER `commit_class_syllabus` RPC as the
   never-accepted canary; require SQLSTATE `42501` and zero committed syllabus,
   request, deadline, exam, or class mutations. An invalid-body response is not
   evidence for this boundary. With the accepted canary and the pause still
   active, the same valid new commit must fail with SQLSTATE `55000` and
   `study_writes_paused`. Repeat both agreement/pause checks with valid
   non-student mnemonic fixtures through `record_memory_trick_feedback`, proving
   zero feedback mutations. After resume, accepted calls must succeed, including
   feedback for a valid `word_roots` artifact from the canonical 16-technique
   catalog; an unknown technique must still fail. DELETE and explicit service-
   role/direct-operator account-erasure paths remain unchanged; a null Auth
   subject alone is never trusted. As a nested-DELETE canary, have the paused,
   never-accepted owner delete a disposable class with only operator-staged
   manual assignment, exam, flashcard, quiz, and study-session children and
   verify the FK `ON DELETE SET NULL` updates succeed, change no other child
   field, and do not reopen arbitrary updates.
7. Deploy the exact reviewed `process-capture-images` and internal
   `cleanup-abandoned-captures` revisions. Verify the image worker hashes every
   downloaded source before paid AI and that browser roles cannot read claims or
   execute cleanup RPCs.
8. Run exact-retry, changed-retry, owner isolation, quota, byte/hash mismatch,
   and cleanup/late-commit race checks before resuming writes. Schedule the
   24-hour cleanup only after a secret-bound production no-op and alert check.
   While still paused, prove both accepted and unaccepted browser accounts are
   denied the four guarded signal/evidence INSERTs and authenticated UPDATE of
   `topic_signals`, `exam_debriefs`, and `campus_brain_signals`; inspect the
   installed restrictive policies to confirm both independent predicates are
   present. Owner DELETE must remain available. After final resume, prove the
   current-agreement predicate independently by denying the unaccepted account
   while valid accepted owner writes retain their existing bounds. Also use two
   separate accepted staging identities (not the dedicated never-accepted
   release canary) to prove all eight guarded class-child tables reject the
   other identity's class and any mismatched client identity. Prove a syllabus
   request also rejects a mismatched non-null syllabus result. Repeat every
   attempt through the service role so the triggers, rather than RLS alone, are
   proven authoritative.

The release canary calls the internal route without its scheduler secret and
expects private HTTP 401. It proves deployment and browser denial only; it must
never claim or delete an object.

### Learning Evidence v2 handoff

Keep the host maintenance control and the database study-write pause active for
this entire handoff. The two final migrations are intentionally separated by
an Edge deployment boundary:

1. Apply `20260828100000_learning_evidence_ladder.sql` by itself. This additive
   phase keeps historical/rolling rows nullable while installing the v2
   attempt contract, database-derived tiers, tier-aware mastery RPC, and
   transfer reservation.
2. Deploy the exact green candidate revisions of `generate-artifact`,
   `record-study-result`, `extract-concepts`, and `process-capture-images`, then
   prove the deployed revision/manifest matches that candidate and wait for old
   revisions to drain. Because `record-study-result` fails closed at the pause
   check, do not call a paused HTTP 503 a learning-path test. Instead, use
   rollback-only operator fixtures to prove the database derives each artifact
   tier, rejects a forged tier/task, applies v3 mastery once, preserves exact
   replay, and keeps missing concepts in the class/exam denominator.
3. Attest only `writes-paused-evidence-contract-edge-deployed-verified`, then
   apply `20260828110000_full_scope_readiness.sql` by itself. Confirm it marks
   pre-v11 artifacts stale, neutralizes zero-attempt capture seeds, rebuilds
   full-class readiness, resets unreconstructable historical exam readiness,
   rejects every new tierless attempt, and keeps the legacy mastery/reservation
   RPCs service-only solely for bounded exact repair of already-existing
   NULL-contract retries. They cannot create a fresh legacy attempt.
4. Keep writes paused through the remaining owner/security checks below. At the
   single controlled resume, run a disposable accepted-owner v11 journey for
   flashcard recall, multiple-choice discrimination, Match Lab, and Assignment
   Tutor transfer. Verify the attempt, concept-update, strategy-outcome,
   class-readiness, and exam-readiness rows plus exact replay idempotency. If
   any check fails, restore the write pause and maintenance control immediately.

An older Edge revision is not a supported rollback after step 3. Roll back the
whole release only to a reviewed database/application boundary that preserves
the v11 evidence contract; never restore a revision that depends on tierless
attempt inserts or the retired v2 mastery RPC.

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
`X-Content-Type-Options: nosniff`. Every HTML response must also send
`X-Robots-Tag: noindex, nofollow, noarchive`; the root HTML must retain the
invite-only robots meta; `robots.txt` must contain only `User-agent: *` followed
by `Disallow: /`—a named-crawler group or any additional directive fails the
gate; and the JSON `release-manifest.json` response must use
`Cache-Control: no-store`. The repository intentionally does not guess a
host-specific configuration; the post-deploy canary checks the actual origin.

### Final resume and public canary

1. While writes remain paused, confirm
   `20260827132000_capture_storage_integrity.sql` and
   `20260827133000_browser_learning_evidence_write_guard.sql`,
   `20260827134000_class_client_identity_owner_scope.sql`,
   `20260827135000_launch_schema_regression_guard.sql`, and
   `20260827140000_onboarding_agreement_owner_guard.sql`,
   `20260828100000_learning_evidence_ladder.sql`, and
   `20260828110000_full_scope_readiness.sql` are applied in that
   order and finish their
   owner/cross-owner, exact-retry, evidence-tier, full-scope-readiness,
   cleanup-race, function-inventory, response-contract, alert-delivery, and
   exact-UI checks. Confirm both cleanup schedules are installed but bounded.
2. Resume exactly once and verify the returned state:

   ```sql
   select public.set_study_writes_paused(false, null);
   select public.get_study_write_pause();
   ```

3. Run one accepted owner write journey and repeat the unaccepted account's
   direct INSERT/UPDATE and source-upload denials now that the maintenance gate
   is open; this proves the current-agreement policies independently. Include
   all four guarded signal/evidence INSERTs and authenticated UPDATE of
   `topic_signals`, `exam_debriefs`, and `campus_brain_signals`; the accepted
   owner must retain valid bounded writes and DELETE while the unaccepted
   account is denied from INSERT/UPDATE. Include profiles, classes, enrollments,
   assignments, exams, and study sessions in that INSERT/UPDATE check and
   schools in its INSERT check. Reconfirm the three browser-read-only legacy
   tables' ACL matrix. Record the separate two-accepted-user and service-role
   owner/client denials across all eight class-child tables, the syllabus-result
   identity denial, and immutable class owner/client identity. Then
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
- Direct authenticated INSERT into `study_strategy_outcomes`, `topic_signals`,
  `exam_debriefs`, and `campus_brain_signals`, plus authenticated UPDATE of
  `topic_signals`, `exam_debriefs`, and `campus_brain_signals`, is denied for
  both accounts while paused. With the pause open, the current-agreement policy
  still denies the unaccepted account; owner DELETE and service-role result
  projection/account erasure remain available.
- Without a current receipt, authenticated INSERT/UPDATE to profiles, classes,
  enrollments, assignments, exams, and study sessions plus INSERT to schools is
  denied. Study-session writes also fail while paused. The accepted account
  retains valid own-row writes after resume; owner DELETE and explicit service-
  role/direct-operator account erasure remain available. `flashcards`, `quizzes`,
  and `readiness_scores` remain SELECT-only for browser roles and writable only
  by the service role.
- A fresh `commit_class_syllabus` request from the never-accepted canary, using
  only an operator-staged non-student fixture, fails with SQLSTATE `42501` and
  commits no syllabus, request, deadline, exam, or class mutation. This proves
  the trigger guard still applies inside the authenticated SECURITY DEFINER RPC.
  Before resume, the accepted canary's equivalent valid request fails with
  SQLSTATE `55000` and `study_writes_paused`.
- Against valid operator-staged non-student mnemonic fixtures,
  `record_memory_trick_feedback` fails with `42501` for the never-accepted canary
  and with `55000` for the accepted canary while paused, with no feedback row
  inserted or updated. The accepted feedback succeeds only after resume. Include
  a valid `word_roots` feedback row to prove all 16 canonical technique IDs reach
  persistence, and reject one unknown ID to prove the allowlist remains closed.
- With two accepted staging identities, all eight guarded class-child tables
  reject the other identity's class and any mismatched non-null client class
  identity. A syllabus request's non-null syllabus result also rejects any owner,
  class, or client mismatch. The same attempts through the service role fail,
  and changing either class owner or client identity is rejected.
- User A cannot load or mutate User B's concepts, artifacts, mastery, feedback,
  captures, source objects, or classes.
- The exact hosted `pg_proc` / `has_function_privilege` catalog comparison in
  `family-beta-operations.md` returns 11 rows, all `OK`, with zero anon-executable
  SECURITY DEFINER functions. The expected authenticated signatures are
  `accept_family_beta_agreement(text)`,
  `can_delete_uncommitted_capture_source(text)`,
  `can_upload_capture_source(text)`,
  `can_upload_uncommitted_syllabus_source(text)`,
  `commit_class_syllabus(uuid,text,uuid,text,text,text,bigint,text,jsonb,jsonb)`,
  `get_family_beta_agreement_status()`, `has_current_family_beta_agreement()`,
  `owns_active_syllabus_storage_path(text)`, `owns_syllabus_storage_path(text)`,
  `record_memory_trick_feedback(uuid,uuid,text,boolean)`, and
  `study_writes_are_available()`. `owns_row(uuid)` must have `prosecdef = false`;
  any anon definer, unexpected signature/grant, or definer-form `owns_row` is a
  stop condition.

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
  HTTP 410, safe error intake, unique echoed request IDs, and exact HTTP 404
  absence for `seed-beta-user` plus all four Canvas functions.

## Verification commands

```sh
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/eslint .
./node_modules/.bin/vite build
git diff --check
```

Bundle-check the six guarded study-write Edge entry points before deployment.
Then perform one signed-in mobile-width journey covering source review,
confidence, retry, Match Lab, memory feedback, result save, reload, and
changed-account denial.

After the exact web and backend commit is deployed, run `npm run
validate:release-env` and `npm run canary:release` through the protected
   production environment. The canary must prove the expected release SHA, live
   security headers, deployed invite-only indexing controls, direct SPA
   deep-link fallback, the exact same-origin non-cacheable nonsecret release
   manifest, both verified canary Auth
   sessions, the unaccepted account's exact agreement denial on all six guarded
   functions, the accepted account's invalid-body responses, the exact
   authenticated read-only evidence-contract status proving fresh legacy writes
   are closed, the evidence-aware
   `record-study-result` rejection fingerprint, the MCP HTTP 410 tombstone, both
   worker denials, exact HTTP 404 absence for the retired provisioning route and
   four disabled Canvas routes, and accepted error-report ingestion without
   writing student data or spending AI. The two evidence probes prove the final
   contract marker and this one deployed behavior; they do not replace the manual
   migration inventory, two-user RLS checks, exact audit of every Edge revision,
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
