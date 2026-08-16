-- Bound unfinished syllabus uploads at the Storage boundary. The AI parser's
-- request quota does not protect Storage because an authenticated client can
-- call the Storage API directly. Committed revisions do not consume these
-- slots, and an exact commit retry reuses its existing object without another
-- upload.

-- Do not add indexes to the managed storage.objects table here. Hosted
-- Supabase reserves that table to supabase_storage_admin and rejects customer
-- CREATE INDEX statements. The quota is deliberately small and bucket/owner
-- scoped; review its query plan and move accounting to an application-owned
-- ledger before broad scale if the managed indexes are no longer sufficient.

-- This additive migration deliberately does not replace a policy on the
-- Supabase-managed storage.objects table. Fail closed unless the foundation
-- policy is already wired to the function whose OID we replace below.
DO $$
DECLARE
  v_insert_check text;
BEGIN
  SELECT policy.with_check
    INTO v_insert_check
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'syllabus_sources_owner_insert'
      AND policy.cmd = 'INSERT'
      AND policy.permissive = 'PERMISSIVE'
      AND 'authenticated' = ANY(policy.roles);

  IF v_insert_check IS NULL
     OR position('owns_active_syllabus_storage_path' IN v_insert_check) = 0
     OR position('syllabus-sources' IN v_insert_check) = 0 THEN
    RAISE EXCEPTION 'The class-owned syllabus Storage insert policy prerequisite is missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_uncommitted_syllabus_source(p_path text)
RETURNS boolean
LANGUAGE plpgsql
-- VOLATILE is required for correctness, not just for the advisory-lock side
-- effect: each count query must take a fresh MVCC snapshot after a concurrent
-- uploader releases the per-user lock.
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_class_id uuid;
  v_user_uncommitted_count integer;
  v_class_uncommitted_count integer;
  v_max_uncommitted_per_user constant integer := 12;
  v_max_uncommitted_per_class constant integer := 3;
BEGIN
  -- Reuse the strict owner/class/request/source.ext validation, but do not call
  -- owns_active_syllabus_storage_path: that policy function becomes the quota
  -- wrapper below and calling it here would recurse.
  IF v_user_id IS NULL
     OR NOT public.owns_syllabus_storage_path(p_path) THEN
    RETURN false;
  END IF;
  v_class_id := split_part(p_path, '/', 2)::uuid;
  IF NOT EXISTS (
    SELECT 1
    FROM public.classes owned_class
    WHERE owned_class.id = v_class_id
      AND owned_class.user_id = v_user_id
      AND owned_class.source_archived_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  -- The policy check happens before the new object is visible. Serialize all
  -- upload checks for this user so concurrent Storage requests cannot each see
  -- the same remaining slot and burst past the quota. Because this function is
  -- VOLATILE, the SELECT below sees a fresh snapshot after the lock is granted.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('syllabus-upload:' || v_user_id::text, 0)
  );

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE split_part(source_object.name, '/', 2) = v_class_id::text
    )::integer
  INTO v_user_uncommitted_count, v_class_uncommitted_count
  FROM storage.objects AS source_object
  WHERE source_object.bucket_id = 'syllabus-sources'
    AND split_part(source_object.name, '/', 1) = v_user_id::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.class_syllabi AS committed_syllabus
      WHERE committed_syllabus.storage_path = source_object.name
    );

  RETURN v_user_uncommitted_count < v_max_uncommitted_per_user
     AND v_class_uncommitted_count < v_max_uncommitted_per_class;
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_uncommitted_syllabus_source(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_uncommitted_syllabus_source(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_upload_uncommitted_syllabus_source(text) IS
  'Allows only owner/class/request-scoped syllabus uploads while limiting unfinished objects to 3 per class and 12 per student; checks are serialized per student.';

-- CREATE OR REPLACE preserves the function OID referenced by the already
-- applied Storage insert policy, adding quota enforcement without policy DDL
-- against the Supabase-managed table.
CREATE OR REPLACE FUNCTION public.owns_active_syllabus_storage_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN public.can_upload_uncommitted_syllabus_source(p_path);
END;
$$;

REVOKE ALL ON FUNCTION public.owns_active_syllabus_storage_path(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_active_syllabus_storage_path(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.owns_active_syllabus_storage_path(text) IS
  'Storage insert-policy boundary for active, owner-scoped syllabus paths with serialized unfinished-upload quotas.';
