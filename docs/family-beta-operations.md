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
   `PUBLIC_SUPPORT_EMAIL`, `PRODUCTION_CANARY_EMAIL`, and
   `PRODUCTION_CANARY_PASSWORD`.
2. Give the dedicated canary account no student coursework. Verify it can sign
   in but cannot access another account's rows.
3. Configure a provider-side AI hard spend cap and an operator alert. Confirm
   the database hourly/daily quota migration is present.
4. Configure the published host with enforced CSP (`frame-ancestors 'none'` and
   `object-src 'none'`), HSTS, Referrer-Policy, Permissions-Policy, and
   `X-Content-Type-Options: nosniff`.
5. Configure an Edge log drain/alert for sanitized 5xx records and the
   `[client-error]` marker. Never alert on or retain request bodies, OCR text,
   prompts, email addresses, auth tokens, or provider response bodies.
6. Deploy the reviewed migrations and seven Edge Functions in the order defined
   by `docs/study-intelligence-rollout.md`, then publish that exact commit.
7. Run the protected **Production release readiness** workflow against the exact
   HTTPS origin. It must validate configuration, find the exact release SHA in
   the deployed bundle, authenticate the canary account, prove every function's
   zero-AI validation path, and emit the safe alert test event.
8. Confirm the test event reached the operator. A green workflow without a
   delivered alert does not satisfy the monitoring gate.

## One-account acceptance journey

Run this with a fresh invited address that has no profile or classes:

1. Open the invite/confirmation link on the release domain, or sign in with the
   operator-provided temporary credentials.
2. Confirm the 13+ agreement blocks the app until it is saved.
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
   capture materials, processed content, flashcards, quizzes, study sessions,
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
