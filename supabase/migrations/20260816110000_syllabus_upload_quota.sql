-- Bound unfinished syllabus uploads at the Storage boundary. The AI parser's
-- request quota does not protect Storage because an authenticated client can
-- call the Storage API directly. Committed revisions do not consume these
-- slots, and an exact commit retry reuses its existing object without another
-- upload.

-- Supabase permits custom indexes for Storage RLS performance. Without this
-- partial expression index, each quota check would eventually scan every
-- student's object in the bucket as adoption grows.
CREATE INDEX IF NOT EXISTS syllabus_sources_owner_class_lookup
  ON storage.objects (
    bucket_id,
    (split_part(name, '/', 1)),
    (split_part(name, '/', 2))
  )
  WHERE bucket_id = 'syllabus-sources';

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
  -- Reuse the strict owner/class/request/source.ext path validation from the
  -- class-owned syllabus foundation, including the active-class check.
  IF v_user_id IS NULL
     OR NOT public.owns_active_syllabus_storage_path(p_path) THEN
    RETURN false;
  END IF;
  v_class_id := split_part(p_path, '/', 2)::uuid;

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

DROP POLICY IF EXISTS syllabus_sources_owner_insert ON storage.objects;
CREATE POLICY syllabus_sources_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'syllabus-sources'
    AND public.can_upload_uncommitted_syllabus_source(name)
  );

COMMENT ON FUNCTION public.can_upload_uncommitted_syllabus_source(text) IS
  'Allows only owner/class/request-scoped syllabus uploads while limiting unfinished objects to 3 per class and 12 per student; checks are serialized per student.';
