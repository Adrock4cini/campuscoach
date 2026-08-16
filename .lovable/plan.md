# PR #39 Preflight Report (read-only)

No SQL was applied, nothing deployed, no secrets or policies touched. Only read queries and repo inspection were run.

## 1. Production backend and current source commit

- Production backend ref: `norsaaoyppctrvxxgjtg` (the single connected Lovable Cloud backend for Campus Coach Pro).
- Current source commit in the working checkout: `6a30ed5b3c130ff20d68483c0fbf485d8864d9d0` ("Work in progress").
- PR #39's migration files are **not present** in this checkout — `supabase/migrations/` ends at `20260809180000_class_foundation.sql`. The PR branch/merge commit must be checked out before any apply.

## 2. Available apply mechanism

- Yes: a tracked migration surface is available to this agent (`supabase--migration`). It records into `supabase_migrations.schema_migrations` and executes as the privileged `postgres` role, not as the read-only query role used for inspection (`supabase--read_query` runs as `supabase_read_only_user`, so it cannot apply anything).
- There is **no** separate Storage-policy admin API exposed to this agent. Storage RLS policy changes go through the same migration surface. `storage.objects` is owned by `supabase_storage_admin`, but `CREATE POLICY` / `DROP POLICY` on it succeeds through the migration role — precedent in this project: the four existing `capture_sources_owner_*` policies on `storage.objects` were created this way and are live today.
- Bucket create/visibility changes are the exception: those must go through `supabase--storage_create_bucket` / `supabase--storage_update_bucket`, never SQL against `storage.buckets`.

## 3. Safe atomic route for `20260810120000_class_owned_syllabi.sql`

1. Check out the PR #39 merge commit so the migration file exists locally, and read it byte-for-byte.
2. If the file contains any bucket creation or `public` flag change on `storage.buckets`, split **only that one concern** out to the storage bucket tool first (this is the one sanctioned split; it is not a policy split).
3. Submit the remaining file contents verbatim — table DDL, GRANTs, RLS enable, policies, and the `storage.objects` DROP/CREATE POLICY statements — as a **single** `supabase--migration` call. One call = one transaction = atomic, and it is recorded once in the migration ledger.
4. Requirements this satisfies: no `SET ROLE`, no `ALTER TABLE ... OWNER TO`, no grants to `supabase_storage_admin`, no reordering or splitting of policy statements. Use `DROP POLICY IF EXISTS` before each `CREATE POLICY` so the run is re-entrant.
5. Every new `public` table in the migration must carry its `GRANT` block in the same statement set (authenticated + service_role; `anon` only if a policy allows anonymous reads).
6. On failure, retry with `query_patch` against the failed attempt rather than resubmitting a second full migration.

## 4. Migration presence check

Queried `supabase_migrations.schema_migrations` — the highest recorded version is `20260809180000`. All three are **absent**, both from the ledger and from the local checkout:

- `20260810120000` — absent
- `20260816110000` — absent
- `20260816120000` — absent

Also confirmed no `class_syllabi` / `syllabi` table exists in `public` yet, consistent with the migration never having run.

## 5. Blockers

- No hard blocker to the route itself.
- One prerequisite: the PR #39 migration files are not in the current checkout, so the merge commit must be checked out (or the exact file contents supplied) before applying. Applying re-authored SQL would register as a different migration and must not be done.
- Ordering note: `20260816110000` and `20260816120000` presumably depend on `20260810120000`; apply strictly in version order, one migration call each.
