# 13+ Family Beta Operations

This runbook is for trusted operators. Never place a service-role key, temporary
password, deletion evidence, or a student's private content in source control,
chat, tickets, or browser code.

## Invite one student

1. Confirm the student is at least 13 and has an approved family-beta invitation.
2. Confirm public new-user creation is disabled in Supabase Auth and the frontend
   signup flag is false.
3. In Supabase Auth Admin, create or invite exactly the approved email address.
   Do not use the retired `seed-beta-user` function and do not alter an existing
   account's password to reuse it.
4. Do not create a profile, accept the agreement, or mark onboarding complete for
   the student. Their first login must do those steps.
5. Send login instructions through the family's established private channel.
6. Verify the student accepts the agreement, chooses their learner type, and sees
   only their own newly created classes.

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
