-- Claim abandoned syllabus uploads for bounded cleanup by an internal Edge
-- Function. This migration only reads Storage metadata; the Edge Function must
-- delete the underlying object through the Storage API.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Each environment generates its own invocation secret. Plaintext at rest
-- exists only in encrypted Vault storage; the application table retains the
-- Vault identifier and a SHA-256 digest so the Edge Function can fail closed.
CREATE TABLE public.syllabus_cleanup_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  invoke_secret_id uuid NOT NULL UNIQUE,
  invoke_secret_digest bytea NOT NULL
    CHECK (octet_length(invoke_secret_digest) = 32),
  project_url_secret_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.syllabus_cleanup_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.syllabus_cleanup_configuration FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.syllabus_cleanup_configuration FROM service_role;

DO $$
DECLARE
  v_invoke_secret_id uuid;
  v_invoke_secret text;
BEGIN
  -- Serialize bootstrap/replay so retrying the migration never creates a
  -- second active secret for this environment.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('syllabus_cleanup_configuration', 0)
  );

  SELECT configuration.invoke_secret_id, secret.decrypted_secret
    INTO v_invoke_secret_id, v_invoke_secret
    FROM public.syllabus_cleanup_configuration configuration
    LEFT JOIN vault.decrypted_secrets secret
      ON secret.id = configuration.invoke_secret_id
    WHERE configuration.singleton
    FOR UPDATE OF configuration;

  -- Adopt a valid pre-existing Vault value only when no configuration row is
  -- present. This makes a retry safe without relying on a name at runtime.
  IF v_invoke_secret IS NULL THEN
    SELECT secret.id, secret.decrypted_secret
      INTO v_invoke_secret_id, v_invoke_secret
      FROM vault.decrypted_secrets secret
      WHERE secret.name = 'syllabus_cleanup_invoke_secret'
      ORDER BY secret.created_at DESC, secret.id DESC
      LIMIT 1;
  END IF;

  IF v_invoke_secret_id IS NULL OR v_invoke_secret IS NULL THEN
    v_invoke_secret := encode(extensions.gen_random_bytes(32), 'hex');
    v_invoke_secret_id := vault.create_secret(
      v_invoke_secret,
      'syllabus_cleanup_invoke_secret',
      'Internal token for the abandoned syllabus cleanup cron job'
    );
  ELSIF v_invoke_secret !~ '^[0-9a-f]{64}$' THEN
    -- Normalize any legacy/manual value without exposing it. Vault and the
    -- digest row are updated in this same migration transaction.
    v_invoke_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.update_secret(
      v_invoke_secret_id,
      v_invoke_secret,
      'syllabus_cleanup_invoke_secret',
      'Internal token for the abandoned syllabus cleanup cron job'
    );
  END IF;

  INSERT INTO public.syllabus_cleanup_configuration (
    singleton,
    invoke_secret_id,
    invoke_secret_digest
  ) VALUES (
    true,
    v_invoke_secret_id,
    extensions.digest(convert_to(v_invoke_secret, 'UTF8'), 'sha256')
  )
  ON CONFLICT (singleton) DO UPDATE
    SET invoke_secret_id = EXCLUDED.invoke_secret_id,
        invoke_secret_digest = EXCLUDED.invoke_secret_digest,
        updated_at = clock_timestamp();
END;
$$;

-- The Edge Function may read only the fixed-length digest, never the Vault
-- plaintext or configuration row. Execution is restricted to service_role.
CREATE OR REPLACE FUNCTION public.get_syllabus_cleanup_invocation_digest()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT encode(configuration.invoke_secret_digest, 'hex')
  FROM public.syllabus_cleanup_configuration configuration
  WHERE configuration.singleton;
$$;

REVOKE ALL ON FUNCTION public.get_syllabus_cleanup_invocation_digest()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_syllabus_cleanup_invocation_digest()
  TO service_role;

CREATE TABLE public.syllabus_source_cleanup_claims (
  storage_path text PRIMARY KEY,
  object_created_at timestamptz NOT NULL,
  eligible_before timestamptz NOT NULL,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 1000000),
  CHECK (lease_expires_at > claimed_at)
);

ALTER TABLE public.syllabus_source_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.syllabus_source_cleanup_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.syllabus_source_cleanup_claims TO service_role;

CREATE INDEX syllabus_source_cleanup_claims_lease_lookup
  ON public.syllabus_source_cleanup_claims(lease_expires_at, storage_path);

-- storage.objects remains read-only and customer migrations cannot add an
-- index to this Supabase-managed table. The sweep is bounded to 50 claims per
-- run; monitor its query plan and move candidate accounting to an
-- application-owned ledger before broad scale if the bucket becomes large.

COMMENT ON TABLE public.syllabus_source_cleanup_claims IS
  'Short-lived, fenced claims for uncommitted syllabus sources awaiting Storage API deletion.';

-- A claim lease is deliberately longer than Supabase's 400-second paid-plan
-- Edge Function wall-clock ceiling. An expired token therefore cannot still be
-- running when another worker reclaims the path or a student commits it.
CREATE OR REPLACE FUNCTION public.claim_abandoned_syllabus_sources(
  p_claim_token uuid,
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_path text;
  v_created_at timestamptz;
  v_returned integer := 0;
  v_now timestamptz := clock_timestamp();
  v_eligible_before timestamptz := coalesce(p_before, v_now - interval '24 hours');
BEGIN
  IF p_claim_token IS NULL
     OR p_limit NOT BETWEEN 1 AND 50
     OR v_eligible_before > v_now THEN
    RAISE EXCEPTION 'Cleanup claim token and limit are invalid';
  END IF;

  -- Prune a bounded set of expired claims that no longer need a Storage API
  -- call (for example, removal succeeded but the release RPC response failed).
  WITH releasable AS (
    SELECT claim.storage_path
    FROM public.syllabus_source_cleanup_claims claim
    WHERE claim.lease_expires_at <= v_now
      AND (
        NOT EXISTS (
          SELECT 1 FROM storage.objects object
          WHERE object.bucket_id = 'syllabus-sources'
            AND object.name = claim.storage_path
        )
        OR EXISTS (
          SELECT 1 FROM public.class_syllabi syllabus
          WHERE syllabus.storage_path = claim.storage_path
        )
        OR EXISTS (
          SELECT 1 FROM public.class_syllabus_requests request
          WHERE request.storage_path = claim.storage_path
            AND request.result->>'cleanupPath' IS DISTINCT FROM request.storage_path
        )
      )
    ORDER BY claim.lease_expires_at, claim.storage_path
    LIMIT 200
  )
  DELETE FROM public.syllabus_source_cleanup_claims claim
  USING releasable
  WHERE claim.storage_path = releasable.storage_path
    AND claim.lease_expires_at <= v_now;

  -- Return/retry this run's existing claims first. This makes an exact request
  -- retry idempotent without allowing another live worker to share its paths.
  FOR v_path IN
    SELECT claim.storage_path
    FROM public.syllabus_source_cleanup_claims claim
    WHERE claim.claim_token = p_claim_token
      AND claim.lease_expires_at > v_now
    ORDER BY claim.claimed_at, claim.storage_path
    LIMIT p_limit
  LOOP
    storage_path := v_path;
    RETURN NEXT;
    v_returned := v_returned + 1;
  END LOOP;

  IF v_returned >= p_limit THEN
    RETURN;
  END IF;

  -- Consider a small bounded multiple so concurrent workers or vanished
  -- objects cannot turn one invocation into an unbounded scan.
  FOR v_path, v_created_at IN
    SELECT object.name, object.created_at
    FROM storage.objects object
    WHERE object.bucket_id = 'syllabus-sources'
      AND object.created_at < v_eligible_before
      AND object.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|jpg|jpeg|png|webp|heic|heif)$'
      AND NOT EXISTS (
        SELECT 1 FROM public.class_syllabi syllabus
        WHERE syllabus.storage_path = object.name
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.class_syllabus_requests request
        WHERE request.storage_path = object.name
          AND request.result->>'cleanupPath' IS DISTINCT FROM request.storage_path
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.syllabus_source_cleanup_claims claim
        WHERE claim.storage_path = object.name
          AND claim.lease_expires_at > v_now
      )
    ORDER BY object.created_at, object.name
    LIMIT (p_limit - v_returned) * 4
  LOOP
    EXIT WHEN v_returned >= p_limit;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_path, 0));

    -- Recheck after the path lock. A commit that won the lock is preserved; a
    -- live claim owned by another invocation is never stolen.
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'syllabus-sources'
        AND object.name = v_path
        AND object.created_at < v_eligible_before
    ) OR EXISTS (
      SELECT 1 FROM public.class_syllabi syllabus
      WHERE syllabus.storage_path = v_path
    ) OR EXISTS (
      SELECT 1 FROM public.class_syllabus_requests request
      WHERE request.storage_path = v_path
        AND request.result->>'cleanupPath' IS DISTINCT FROM request.storage_path
    ) THEN
      DELETE FROM public.syllabus_source_cleanup_claims claim
      WHERE claim.storage_path = v_path
        AND claim.lease_expires_at <= v_now;
      CONTINUE;
    END IF;

    INSERT INTO public.syllabus_source_cleanup_claims (
      storage_path,
      object_created_at,
      eligible_before,
      claim_token,
      claimed_at,
      lease_expires_at,
      attempts
    ) VALUES (
      v_path,
      v_created_at,
      v_eligible_before,
      p_claim_token,
      v_now,
      v_now + interval '15 minutes',
      1
    )
    ON CONFLICT ON CONSTRAINT syllabus_source_cleanup_claims_pkey DO UPDATE
      SET claim_token = EXCLUDED.claim_token,
          claimed_at = EXCLUDED.claimed_at,
          eligible_before = EXCLUDED.eligible_before,
          lease_expires_at = EXCLUDED.lease_expires_at,
          attempts = public.syllabus_source_cleanup_claims.attempts + 1
      WHERE public.syllabus_source_cleanup_claims.lease_expires_at <= v_now;

    IF FOUND THEN
      storage_path := v_path;
      RETURN NEXT;
      v_returned := v_returned + 1;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_syllabus_sources(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_syllabus_sources(uuid, integer, timestamptz)
  TO service_role;

-- Fence the exact token and extend its lease immediately before the Storage
-- API call. The Edge Function itself is bounded to 30-second downstream calls,
-- far below this renewed 15-minute lease.
CREATE OR REPLACE FUNCTION public.confirm_syllabus_cleanup_claims(
  p_claim_token uuid,
  p_storage_paths text[]
)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_path text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_claim_token IS NULL
     OR p_storage_paths IS NULL
     OR cardinality(p_storage_paths) NOT BETWEEN 1 AND 50
     OR array_position(p_storage_paths, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup confirmation is invalid';
  END IF;

  FOR v_path IN
    SELECT DISTINCT candidate.path
    FROM unnest(p_storage_paths) candidate(path)
    ORDER BY candidate.path
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_path, 0));

    IF EXISTS (
      SELECT 1
      FROM public.syllabus_source_cleanup_claims claim
      JOIN storage.objects object
        ON object.bucket_id = 'syllabus-sources'
       AND object.name = claim.storage_path
      WHERE claim.storage_path = v_path
        AND claim.claim_token = p_claim_token
        AND claim.lease_expires_at > v_now
        AND object.created_at < claim.eligible_before
        AND NOT EXISTS (
          SELECT 1 FROM public.class_syllabi syllabus
          WHERE syllabus.storage_path = claim.storage_path
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.class_syllabus_requests request
          WHERE request.storage_path = claim.storage_path
            AND request.result->>'cleanupPath' IS DISTINCT FROM request.storage_path
        )
    ) THEN
      UPDATE public.syllabus_source_cleanup_claims claim
      SET lease_expires_at = v_now + interval '15 minutes'
      WHERE claim.storage_path = v_path
        AND claim.claim_token = p_claim_token
        AND claim.lease_expires_at > v_now;
      storage_path := v_path;
      RETURN NEXT;
    ELSE
      DELETE FROM public.syllabus_source_cleanup_claims claim
      WHERE claim.storage_path = v_path
        AND claim.claim_token = p_claim_token
        AND claim.lease_expires_at <= v_now;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_syllabus_cleanup_claims(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_syllabus_cleanup_claims(uuid, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_syllabus_cleanup_claims(
  p_claim_token uuid,
  p_storage_paths text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_released integer;
BEGIN
  IF p_claim_token IS NULL
     OR p_storage_paths IS NULL
     OR cardinality(p_storage_paths) NOT BETWEEN 1 AND 50
     OR array_position(p_storage_paths, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup release is invalid';
  END IF;

  DELETE FROM public.syllabus_source_cleanup_claims claim
  WHERE claim.claim_token = p_claim_token
    AND claim.storage_path = ANY(p_storage_paths);
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_syllabus_cleanup_claims(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_syllabus_cleanup_claims(uuid, text[])
  TO service_role;

-- Any path claimed by cleanup is fenced from becoming a committed source.
-- Expired claims may be cleared only while holding the same advisory lock; the
-- 15-minute lease is longer than any old Edge invocation can remain alive.
CREATE OR REPLACE FUNCTION public.guard_syllabus_source_cleanup_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.storage_path, 0));
  DELETE FROM public.syllabus_source_cleanup_claims claim
  WHERE claim.storage_path = NEW.storage_path
    AND claim.lease_expires_at <= v_now;

  IF EXISTS (
    SELECT 1 FROM public.syllabus_source_cleanup_claims claim
    WHERE claim.storage_path = NEW.storage_path
      AND claim.lease_expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Syllabus source upload expired while it was awaiting review; upload it again';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_syllabus_source_cleanup_claim()
  FROM PUBLIC, anon, authenticated;

-- PostgreSQL fires same-timing triggers alphabetically. The 00 prefix is
-- safety-critical: acquire the path advisory lock before the existing
-- class_syllabi_enforce_integrity trigger checks Storage metadata, then retain
-- that lock through transaction commit.
DROP TRIGGER IF EXISTS class_syllabi_guard_cleanup_claim ON public.class_syllabi;
DROP TRIGGER IF EXISTS class_syllabi_00_guard_cleanup_claim ON public.class_syllabi;
CREATE TRIGGER class_syllabi_00_guard_cleanup_claim
  BEFORE INSERT OR UPDATE OF storage_path ON public.class_syllabi
  FOR EACH ROW EXECUTE FUNCTION public.guard_syllabus_source_cleanup_claim();

DROP TRIGGER IF EXISTS class_syllabus_requests_guard_cleanup_claim
  ON public.class_syllabus_requests;
DROP TRIGGER IF EXISTS class_syllabus_requests_00_guard_cleanup_claim
  ON public.class_syllabus_requests;
CREATE TRIGGER class_syllabus_requests_00_guard_cleanup_claim
  BEFORE INSERT OR UPDATE OF storage_path ON public.class_syllabus_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_syllabus_source_cleanup_claim();
