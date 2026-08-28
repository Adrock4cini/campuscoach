# 13+ Family Beta Operations

This runbook is for trusted operators. Never place a service-role key, temporary
password, deletion evidence, or a student's private content in source control,
chat, tickets, or browser code.

## Invite one student

1. Confirm the student is at least 13 and has an approved family-beta invitation.
2. Confirm public new-user creation is disabled in Supabase Auth and the frontend
   signup flag is absent or false. The web client also refuses to open signup on
   any backend except the dedicated family-beta staging project, but that UI gate
   is not a substitute for the server-side Auth setting.
3. In Supabase Auth Admin, create or invite exactly the approved email address.
   Do not use the retired `seed-beta-user` function and do not alter an existing
   account's password to reuse it.
4. Do not create a profile, accept the agreement, or mark onboarding complete for
   the student. Their first login must do those steps.
5. Send login instructions through the family's established private channel.
6. Verify the student accepts the agreement, chooses their learner type, and sees
   only their own newly created classes.

## Auth preflight for the release domain

Complete this before sending an invitation. These are hosted Auth settings and
cannot be proven by the repository or a successful frontend build.

1. Set the Supabase **Site URL** to the exact published HTTPS origin. Add that
   origin and its `/reset-password` destination to the Auth redirect allowlist.
   Remove temporary preview origins before inviting real students.
2. Keep email/password sign-in enabled. Keep public email signup disabled. Keep
   account-creating Google OAuth disabled for this invite-only release.
3. Choose one supported invitation path and test its email end to end:
   - **Invite user:** the Auth invite link returns to the published origin and
     establishes a session. Before the student signs out, have them set a
     password through the tested reset-password flow so they can return; or
   - **Create user:** the operator creates the approved address and privately
     delivers its temporary password through the family's established channel.
4. Configure a real SMTP sender and confirm invitation, confirmation, and password
   reset messages arrive outside spam. Do not rely on a development mail sink.
5. Configure a monitored `VITE_PUBLIC_SUPPORT_EMAIL` in the release build.

## Production release preflight

1. Protect a GitHub `production` environment and configure these names without
   printing their values: `PRODUCTION_SUPABASE_URL`,
   `PRODUCTION_SUPABASE_PUBLISHABLE_KEY`, `PRODUCTION_SUPABASE_PROJECT_ID`,
   `PRODUCTION_ORIGIN`, `PUBLIC_SUPPORT_EMAIL`, `PRODUCTION_CANARY_EMAIL`, and
   `PRODUCTION_CANARY_PASSWORD`, plus
   `PRODUCTION_UNACCEPTED_CANARY_EMAIL` and
   `PRODUCTION_UNACCEPTED_CANARY_PASSWORD`. Restrict that environment to the
   protected `main` branch. The workflow also rejects every other ref, and
   exposes the four account credentials only to its final canary process.
   `PRODUCTION_ORIGIN` is the single canonical HTTPS release origin; the
   workflow accepts no caller-supplied site URL.
2. Give the dedicated canary account no student coursework. Sign in through the
   reviewed web flow and accept the current agreement once. Verify the status
   RPC returns that account's current version, acceptance timestamp, and owner
   UUID; Auth metadata is not evidence. The canary cannot run zero-AI Edge
   validation probes without this durable receipt because those routes return
   HTTP 403 before body validation.
   Create a second dedicated empty canary account and never accept the
   agreement on it. Do not reuse an email or Auth UUID. The release canary must
   verify that all six guarded functions return private HTTP 403 with
   `reason: "family_beta_agreement_required"` for this account before it runs
   the accepted account's zero-AI HTTP 400 probes.
3. Configure a provider-side AI hard spend cap and an operator alert. Confirm
   the database hourly/daily quota migration is present.
4. Configure the published host with enforced CSP (`frame-ancestors 'none'` and
   `object-src 'none'`, with scripts restricted to exactly `'self'`), HSTS with
   at least one year plus `includeSubDomains`,
   Referrer-Policy set to `no-referrer`, `strict-origin`, or
   `strict-origin-when-cross-origin`, Permissions-Policy disabling camera,
   microphone, and geolocation, `X-Content-Type-Options: nosniff`, and
   `X-Robots-Tag: noindex, nofollow, noarchive` on every HTML response. Keep the
   invite-only robots meta in the root HTML, serve `robots.txt` as plain text
   containing only `User-agent: *` followed by `Disallow: /` (no named-crawler
   group, `Allow`, Sitemap, or other directive), and serve the same-origin
   `release-manifest.json` as JSON with `Cache-Control: no-store`.
5. Configure an Edge log drain/alert for sanitized 5xx records and the
   `[client-error]` marker. Never alert on or retain request bodies, OCR text,
   prompts, email addresses, auth tokens, or provider response bodies.
6. Deploy the reviewed migrations and ten Edge Function revisions in the order
   defined by `docs/study-intelligence-rollout.md`, then publish that exact commit.
   In particular, apply the additive maintenance guard
   `20260827125500_study_write_maintenance_guard.sql`, enter maintenance and
   pause once; deploy the six guarded
   functions while the receipt table is absent so they fail closed; then drain
   the replaced revisions. Apply `20260827126000_family_beta_agreement_acceptance.sql`
   and `20260827126500_family_beta_raw_input_guard.sql` before publishing the
   temporary agreement-compatible web stage. The raw-input guard covers direct
   capture/material/processed-content writes plus both private Storage buckets;
   `20260827126750_capture_request_idempotency.sql` follows before the later
   `20260827127500` mirror retirement. Remain paused through the documented
   `20260827132000` capture Storage handoff, then apply, as separate reviewed
   transactions and in order,
   `20260827133000_browser_learning_evidence_write_guard.sql`,
   `20260827134000_class_client_identity_owner_scope.sql`,
   `20260827135000_launch_schema_regression_guard.sql`, and
   `20260827140000_onboarding_agreement_owner_guard.sql`, followed by
   `20260828100000_learning_evidence_ladder.sql` and
   `20260828110000_full_scope_readiness.sql`. These last two are a strict
   handoff: apply `281000` while writes are paused, verify the exact deployed
   evidence-aware Edge revision and the database trigger/RPC contract directly
   (the HTTP result route must still return the pause response), then apply
   `281100` before resuming. The final migration invalidates pre-v11 artifacts,
   repairs readiness, and rejects new tierless attempts. The legacy RPCs remain
   service-only solely for bounded exact repair of already-existing NULL-contract
   retries; they cannot create a fresh legacy attempt. Only after the single controlled resume may the accepted
   owner run the end-to-end HTTP evidence journey; re-pause immediately if it
   fails. Verify the `33000`
   browser signal/evidence policies, owner-scoped class compatibility IDs, the
   single aggregate-trigger pair and strategy-outcome owner references, and the
   final onboarding agreement/same-owner boundaries, server-derived evidence
   tiers, and full-scope readiness denominators before resuming exactly
   once. For the final boundary, an unaccepted account must be denied
   INSERT/UPDATE to profiles, classes, enrollments, assignments, exams, and
   study sessions and INSERT to schools; an accepted owner must retain valid
   writes. Confirm `flashcards`, `quizzes`, and `readiness_scores` retain SELECT
   but deny anon/authenticated INSERT, UPDATE, and DELETE while service-role
   processing remains available. Using two separate accepted staging identities
   (never the dedicated never-accepted release canary), prove that cross-owner
   attempts on every enrollment, assignment, exam, flashcard, quiz, study
   session, readiness score, and class-syllabus request are rejected. Every
   non-null `class_id` must be owner-bound and, when `client_class_id` is present,
   must have the class's exact client identity. A syllabus request's non-null
   `syllabus_id` must also match
   that owner/class/client identity. Repeat these attempts through the service
   role. Both `classes.user_id` and `classes.client_class_id` are immutable.
   Repair any detected identity drift before this migration; after installation,
   use an operator-reviewed delete/recreate flow rather than an in-place identity
   mutation. For the never-accepted canary, use an
   operator-staged, non-student syllabus fixture and a fresh request ID to call
   `commit_class_syllabus` directly; require SQLSTATE `42501` and verify that no
   class syllabus, request, assignment, exam, or class update committed. This is
   the explicit SECURITY DEFINER bypass check—an invalid-body rejection does not
   prove the agreement trigger. While the study-write pause is still active, the
   accepted canary's otherwise-valid fresh syllabus commit must instead fail with
   SQLSTATE `55000` / `study_writes_paused`. Run the same two-account check with
   valid non-student mnemonic fixtures through the authenticated SECURITY DEFINER
   `record_memory_trick_feedback` RPC: unaccepted returns `42501`, and accepted
   returns `55000` while paused. Verify zero feedback mutations. After the single
   resume, the accepted calls must succeed within their existing owner/shape
   bounds. Include a valid `word_roots` artifact (one of the expanded canonical
   16 technique IDs) and verify its feedback persists, while an unknown technique
   is still rejected. Owner DELETE, service-role account erasure, and explicit
   service-role/direct-operator processing remain available; a null Auth subject
   alone is never trusted. Prove the nested DELETE path separately:
   while paused and still unaccepted, delete a disposable owned class that has
   only operator-staged manual assignment, exam, flashcard, quiz, and study-session
   children (no captures or syllabus) and verify the foreign keys become null
   without an agreement/pause error and without changing another child field.
   The ten revisions include both cleanup workers and the `mcp` HTTP 410
   tombstone; leaving the old MCP handler deployed is a release blocker. Do not
   deploy `seed-beta-user` or any of the four Canvas functions for this release;
   the canary requires HTTP 404 from all five historical routes.
   During the compatibility stage, restrict the host to reviewed operators and
   the two canary accounts; do not expose the partially handed-off client to
   students.
   Before resume, run the exact hosted catalog comparison below. It must return
   exactly 12 rows, every row `OK`, with `anon_execute = false` and
   `authenticated_execute = true`. Any missing/unexpected signature or grant is
   a stop condition. `owns_row(uuid)` is SECURITY INVOKER after migration 15 and
   therefore is not in this list; any hosted `prosecdef = true` for it is drift
   and a stop condition.

   ```sql
   WITH expected(signature) AS (
     VALUES
       ('accept_family_beta_agreement(text)'),
       ('can_delete_uncommitted_capture_source(text)'),
       ('can_upload_capture_source(text)'),
       ('can_upload_uncommitted_syllabus_source(text)'),
       ('commit_class_syllabus(uuid,text,uuid,text,text,text,bigint,text,jsonb,jsonb)'),
       ('get_family_beta_agreement_status()'),
       ('get_learning_evidence_contract_status()'),
       ('has_current_family_beta_agreement()'),
       ('owns_active_syllabus_storage_path(text)'),
       ('owns_syllabus_storage_path(text)'),
       ('record_memory_trick_feedback(uuid,uuid,text,boolean)'),
       ('study_writes_are_available()')
   ),
   actual AS (
     SELECT
       p.proname || '(' ||
         pg_catalog.replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',') ||
         ')' AS signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )
   )
   SELECT
     coalesce(expected.signature, actual.signature) AS signature,
     actual.anon_execute,
     actual.authenticated_execute,
     CASE
       WHEN expected.signature IS NOT NULL
        AND actual.signature IS NOT NULL
        AND actual.anon_execute IS FALSE
        AND actual.authenticated_execute IS TRUE
       THEN 'OK'
       ELSE 'STOP'
     END AS release_status
   FROM expected
   FULL OUTER JOIN actual USING (signature)
   ORDER BY signature;

   SELECT p.prosecdef
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'owns_row'
     AND pg_catalog.oidvectortypes(p.proargtypes) = 'uuid';
   -- Exactly one row, prosecdef = false. Otherwise STOP.
   ```
7. Run the protected **Production release readiness** workflow against the exact
   HTTPS origin. It must validate configuration, find the exact release SHA in
   the deployed bundle, verify the same-origin nonsecret `release-manifest.json`
   matches the expected project ID, signup/passkey/Canvas flags, support address,
   and SHA without caching, reject cross-origin scripts, verify direct SPA
   deep-link fallback and all three deployed invite-only indexing controls,
   authenticate and verify both live canary sessions, prove the unaccepted
   agreement-denial contract, exercise every guarded function's accepted zero-AI validation
   response, require the exact authenticated read-only evidence-contract status
   showing fresh legacy writes are closed, distinguish the evidence-aware
   `record-study-result` revision from an
   older generic validator without creating a study result, require HTTP 404 from
   `seed-beta-user` and all four Canvas routes, require a request ID on every
   reviewed Edge response, and submit the safe error-report event. This proves
   only the final evidence-contract status and that one Edge fingerprint; it does
   not prove the complete migration ledger, RLS isolation, every Edge revision,
   successful write paths, or alert delivery.
8. Confirm the test event reached the operator. A green workflow without a
   delivered alert does not satisfy the monitoring gate.

## One-account acceptance journey

Run this with a fresh invited address that has no profile or classes:

1. Open the invite/confirmation link on the release domain, or sign in with the
   operator-provided temporary credentials.
2. Confirm the 13+ agreement blocks the app until it is saved.
   Verify `get_family_beta_agreement_status()` reports `accepted: true`, version
   `2026-08-17`, a non-null timestamp, and the signed-in owner's UUID. Mutating
   Auth `user_metadata` must not change this result or unlock the app.
3. Complete **You → School → Term → Classes → Schedule** and reach the real
   dashboard. Verify the profile has a non-null `onboarded_at` value.
4. Reload on the dashboard, close and reopen the browser, and confirm the same
   signed-in account and classes return without rerunning onboarding.
5. Sign out, sign back in with email/password, and confirm the same dashboard
   returns. Then request one password-reset email and verify its link opens the
   release `/reset-password` page.
6. In a private/incognito window, confirm `/signup` shows the invitation gate,
   Google account creation is absent, and a direct unauthenticated Auth signup is
   rejected by Supabase.

## Delete one student's account

Account deletion is a service-role/Admin operation. It must never be exposed as
client-side SQL or a browser-callable service-role function.

1. Verify the request from the account email (and supervising guardian when
   applicable). Record only requester, request date, completion date, and operator
   in the non-content audit.
2. Disable or ban the Auth user while deletion runs. Record the immutable user UUID.
3. Through the Storage API, recursively list and remove every object under that
   UUID's prefix in both `capture-sources` and `syllabus-sources`. Do not delete
   `storage.objects` rows directly.
4. Delete cleanup-claim rows whose `storage_path` begins with `<userId>/`.
5. In one database transaction, delete all rows owned by the user, child-first.
   The required inventory includes syllabus requests/revisions; study-result
   ledger, mastery, concepts and learning artifacts; assignments and tests;
   family-beta agreement acceptances; capture materials, processed content,
   flashcards, quizzes, study sessions,
   readiness and Campus Brain signals; captures; enrollments and classes; Canvas
   connections/tokens/sync state; topic signals and exam debriefs; rate-limit or
   OAuth state; and the profile. Use the live schema inventory below so a newly
   added owner table cannot be silently missed.
6. Delete the Auth user last.
7. Recompute/verify aggregate topic scores after signal/debrief deletion.

Before and after deletion, inventory every owner table with a read-only catalog
query in the SQL editor:

```sql
select table_schema, table_name
from information_schema.columns
where column_name = 'user_id'
  and table_schema = 'public'
order by table_name;
```

Deletion is complete only when:

- every listed public table returns zero rows for the UUID;
- both Storage prefixes return zero objects and an old download/signed URL fails;
- no matching cleanup claim remains;
- the Auth Admin lookup returns no user; and
- aggregate views contain no contribution attributable solely to that user.

If any verification fails, keep the account disabled, do not report completion,
and escalate for a corrected cleanup pass.

## Release configuration that must remain true

- Invite-only and age 13+ copy is visible.
- Agreement receipts are current-version, owner-bound, timestamped, append-only,
  and removed only through the service account-erasure workflow.
- Public signup and account-creating Google OAuth are unavailable.
- A monitored support/privacy email is configured.
- RLS is tested with User A, User B, and an anonymous client after migrations.
- Raw topic signals and exam debriefs are owner-only, and `topic_scores` is
  service-role-only until a thresholded privacy-reviewed API replaces it.
- Public host headers, the global AI spend cap, production alerts, and the
  post-deploy canary are verified against the exact release commit.
- Under-13 accounts are not invited until a separate verified parental-consent
  and child-privacy program exists.

## Additive launch migrations

Apply and verify these after the previously released syllabus migrations and
before publishing the matching web client:

1. `20260817100000_middle_school_learner_type.sql`
2. `20260817110000_backfill_onboarding_completion.sql`
3. `20260817123000_capture_attempt_idempotency.sql`

The completion backfill is intentionally one-time: it marks accounts that had
active classes before the client began requiring `profiles.onboarded_at`. After
that migration, class count alone must never be used as proof that a new setup
finished. The capture migration must be present before the retry-safe client is
invited so one dropped mobile response converges on the same durable rows.

The later Assignment Tutor/course-map/privacy migrations are intentionally
staged around a short study-write pause. Do not append them to this older list
or apply all pending `20260827` files unattended; use
`docs/study-intelligence-rollout.md` as the authoritative order.
