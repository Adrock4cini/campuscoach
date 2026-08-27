# Abandoned syllabus source cleanup

The `cleanup-abandoned-syllabi` Edge Function removes private syllabus uploads
that are more than 24 hours old and were never committed. A maximum of 50 files
is processed per run. Saved sources are excluded if their path appears in
`class_syllabi` or is still required by `class_syllabus_requests`. The narrow
exception is a no-op receipt whose `result.cleanupPath` exactly names its own
duplicate upload: that receipt is authoritative, remains retryable without the
file, and explicitly says the duplicate should be removed.

The database only reads `storage.objects` metadata and manages cleanup claims.
The file itself must always be deleted with the Supabase Storage API.

## Deploy in each environment

1. Apply `20260816110000_syllabus_upload_quota.sql`, then
   `20260816120000_abandoned_syllabus_cleanup.sql`. Keep this order so new
   abandoned uploads are bounded before the scheduled sweeper is enabled. The
   cleanup migration generates 32 random bytes in Postgres, stores the 64-character
   hex plaintext at rest only in Vault, and stores its Vault UUID plus SHA-256
   digest in the locked configuration row. Reapplying the bootstrap reuses the
   configured Vault UUID instead of creating a second active secret. Vault is
   the only persistent source of that plaintext. During a call it exists
   transiently in `pg_net`'s unlogged request queue/header and Edge memory, so
   request headers and bodies must never be logged.
2. Store this environment's public project URL in Vault and bind its exact
   Vault UUID to `syllabus_cleanup_configuration`. This value is
   environment-specific and must not be baked into the common migration.
   Replace the placeholder and run the whole block once per environment; it is
   safe to rerun because it updates the UUID already bound to the singleton:

```sql
do $$
declare
  v_project_ref text := 'YOUR_PROJECT_REF';
  v_project_url text;
  v_project_url_secret_id uuid;
begin
  if v_project_ref !~ '^[a-z]{20}$' then
    raise exception 'Set the 20-letter hosted Supabase project ref first';
  end if;
  v_project_url := format('https://%s.supabase.co', v_project_ref);

  perform pg_advisory_xact_lock(
    hashtextextended('syllabus_cleanup_configuration', 0)
  );
  select configuration.project_url_secret_id
    into v_project_url_secret_id
    from public.syllabus_cleanup_configuration configuration
    where configuration.singleton
    for update;

  if not found then
    raise exception 'Apply the syllabus cleanup migration first';
  end if;

  if v_project_url_secret_id is null then
    v_project_url_secret_id := vault.create_secret(
      v_project_url,
      'syllabus_cleanup_project_url',
      'Environment URL for the abandoned syllabus cleanup cron job'
    );
  else
    perform vault.update_secret(
      v_project_url_secret_id,
      v_project_url,
      'syllabus_cleanup_project_url',
      'Environment URL for the abandoned syllabus cleanup cron job'
    );
  end if;

  update public.syllabus_cleanup_configuration
  set project_url_secret_id = v_project_url_secret_id,
      updated_at = clock_timestamp()
  where singleton;
end;
$$;
```

   Enable `pg_net` for the validation calls and `pg_cron` for the eventual
   schedule.
3. Deploy `cleanup-abandoned-syllabi` with gateway JWT verification disabled as
   configured in `supabase/config.toml`. The gateway cannot validate Supabase's
   newer opaque keys as JWTs. The handler instead accepts only an exact
   64-character lowercase-hex `x-cleanup-secret`, hashes it, fetches the expected
   digest through a service-role-only RPC, and compares the fixed-length digests
   before any cleanup RPC. In validation only, set
   `ALLOW_SYLLABUS_CLEANUP_TEST_MODE=true`; never set it in production. The
   admin client uses hosted `SUPABASE_SECRET_KEYS['default']` internally, with
   legacy `SUPABASE_SERVICE_ROLE_KEY` only as a compatibility fallback. Neither
   admin key is sent through `pg_net`.
4. Run the authentication, quota, and no-op checks below. Do not install a
   schedule yet. A correct no-op call can be issued without revealing the
   secret by having `pg_net` read it directly from Vault by the UUID stored in
   `syllabus_cleanup_configuration`:

```sql
do $$
declare
  v_project_url text;
  v_invoke_secret text;
  v_request_id bigint;
begin
  select project_url.decrypted_secret, invoke_secret.decrypted_secret
    into v_project_url, v_invoke_secret
    from public.syllabus_cleanup_configuration configuration
    left join vault.decrypted_secrets project_url
      on project_url.id = configuration.project_url_secret_id
    left join vault.decrypted_secrets invoke_secret
      on invoke_secret.id = configuration.invoke_secret_id
    where configuration.singleton;

  if v_project_url is null
     or v_project_url !~ '^https://[a-z]{20}\.supabase\.co$'
     or v_invoke_secret is null
     or v_invoke_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'Syllabus cleanup Vault configuration is missing or invalid';
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/cleanup-abandoned-syllabi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', v_invoke_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;
  raise notice 'Queued cleanup validation request %', v_request_id;
end;
$$;
```

5. Only after validation passes, install this hourly job in the same environment:

```sql
select cron.schedule(
  'cleanup-abandoned-syllabus-sources',
  '17 * * * *',
  $job$
  do $cleanup$
  declare
    v_project_url text;
    v_invoke_secret text;
  begin
    select project_url.decrypted_secret, invoke_secret.decrypted_secret
      into v_project_url, v_invoke_secret
      from public.syllabus_cleanup_configuration configuration
      left join vault.decrypted_secrets project_url
        on project_url.id = configuration.project_url_secret_id
      left join vault.decrypted_secrets invoke_secret
        on invoke_secret.id = configuration.invoke_secret_id
      where configuration.singleton;

    if v_project_url is null
       or v_project_url !~ '^https://[a-z]{20}\.supabase\.co$'
       or v_invoke_secret is null
       or v_invoke_secret !~ '^[0-9a-f]{64}$' then
      raise exception 'Syllabus cleanup Vault configuration is missing or invalid';
    end if;

    perform net.http_post(
      url := v_project_url || '/functions/v1/cleanup-abandoned-syllabi',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', v_invoke_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  end;
  $cleanup$;
  $job$
);
```

Install it in validation first. Do not install the production job until the
validation checks below pass.

## Rotate the invocation secret

Run the following as one statement in the environment's SQL editor. The `DO`
statement is one database transaction: Vault and the stored digest both change,
or neither does. It does not return or log the new plaintext. The Edge isolate
may retain the previous digest for at most 10 seconds, after which only the new
Vault value works. Cron reads the Vault value by UUID on every invocation.

```sql
do $$
declare
  v_invoke_secret_id uuid;
  v_new_secret text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('syllabus_cleanup_configuration', 0)
  );

  select configuration.invoke_secret_id
    into v_invoke_secret_id
    from public.syllabus_cleanup_configuration configuration
    where configuration.singleton
    for update;

  if v_invoke_secret_id is null then
    raise exception 'Syllabus cleanup configuration is missing';
  end if;

  v_new_secret := encode(extensions.gen_random_bytes(32), 'hex');
  perform vault.update_secret(
    v_invoke_secret_id,
    v_new_secret,
    'syllabus_cleanup_invoke_secret',
    'Internal token for the abandoned syllabus cleanup cron job'
  );

  update public.syllabus_cleanup_configuration
  set invoke_secret_digest = extensions.digest(
        convert_to(v_new_secret, 'UTF8'),
        'sha256'
      ),
      updated_at = clock_timestamp()
  where singleton;
end;
$$;
```

## Validation checkpoint

- Call the function without `x-cleanup-secret`: expect HTTP 401. Call it with a
  malformed value and with a wrong 64-character lowercase-hex value: expect
  HTTP 403. Temporarily make the digest getter unavailable: expect HTTP 503.
  None of these requests may create a cleanup claim. Every response is private,
  non-cacheable JSON with `X-Content-Type-Options: nosniff` and an
  `X-Request-ID`. Server failures return only the shared safe error contract;
  logs contain a sanitized error class, status, and request ID, never database
  or Storage messages, paths, source metadata, or credentials.
- Confirm upload quota acceptance before testing cleanup: the fourth unfinished
  upload for one class is denied, the thirteenth unfinished upload for one user
  is denied, a saved source is excluded from unfinished counts, and another
  user's allowance is unchanged.
- Invoke the function with no abandoned uploads: expect HTTP 200 and zero
  deleted files.
- Upload a disposable fixture through the normal private bucket path. Invoke
  the validation function with `{ "testBefore": "now" }` after the upload.
  This dedicated-secret-only test cutoff avoids modifying the
  read-only Storage schema. Expect the fixture to disappear through the Storage
  API. A normal `{}` invocation always enforces the 24-hour grace period.
- Confirm a path referenced by `class_syllabi` remains.
- Confirm a path still required by `class_syllabus_requests` remains.
- Confirm a no-op receipt with `result.cleanupPath = storage_path` remains
  retryable after its duplicate source is removed.
- Force one Storage API failure. Confirm its claim remains and a later run
  safely retries it after the 15-minute lease.
- While a live claim exists, attempt a commit for that path. Expect the commit
  to fail closed and ask for a fresh upload.
- Check `cron.job_run_details` and Edge Function logs without printing paths,
  user IDs, or credentials.

The production checkpoint is complete only when the function is deployed, the
hourly job exists, and one production no-op run returns HTTP 200.
