-- Extend the rollout pause to every authenticated browser boundary that can
-- persist raw or derived student input. Service-role migration, recovery, and
-- account-erasure paths deliberately remain outside these authenticated-only
-- restrictive policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.study_writes_are_available()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_paused boolean;
BEGIN
  -- Coordinate with set_study_writes_paused(): a write that obtains this
  -- shared lock first may drain, while a pause that obtains its update lock
  -- first makes every later browser write fail closed until resume.
  SELECT control.paused
    INTO v_paused
  FROM private.study_write_runtime_control control
  WHERE control.singleton
  FOR SHARE;

  RETURN NOT coalesce(v_paused, true);
END;
$$;

REVOKE ALL ON FUNCTION public.study_writes_are_available()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_writes_are_available()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.study_writes_are_available() IS
  'Fail-closed, lock-coordinated maintenance gate for authenticated browser raw-input writes.';

-- Keep the existing permissive owner policies as the ownership branch. These
-- restrictive policies are ANDed with them, so the pause cannot be bypassed by
-- another permissive INSERT/UPDATE policy.
DROP POLICY IF EXISTS captures_study_writes_available_insert ON public.captures;
CREATE POLICY captures_study_writes_available_insert
  ON public.captures AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS captures_study_writes_available_update ON public.captures;
CREATE POLICY captures_study_writes_available_update
  ON public.captures AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS materials_study_writes_available_insert ON public.materials;
CREATE POLICY materials_study_writes_available_insert
  ON public.materials AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS materials_study_writes_available_update ON public.materials;
CREATE POLICY materials_study_writes_available_update
  ON public.materials AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS processed_content_study_writes_available_insert
  ON public.processed_content;
CREATE POLICY processed_content_study_writes_available_insert
  ON public.processed_content AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS processed_content_study_writes_available_update
  ON public.processed_content;
CREATE POLICY processed_content_study_writes_available_update
  ON public.processed_content AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.study_writes_are_available()
  );

-- The browser uploads capture and syllabus sources directly to Storage. Each
-- policy is neutral for every other bucket and composes with the bucket's
-- existing owner/path/quota policies. Storage UPDATE/DELETE behavior is not
-- changed here.
DROP POLICY IF EXISTS capture_sources_study_writes_available_insert
  ON storage.objects;
CREATE POLICY capture_sources_study_writes_available_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'capture-sources'
    OR public.study_writes_are_available()
  );

DROP POLICY IF EXISTS syllabus_sources_study_writes_available_insert
  ON storage.objects;
CREATE POLICY syllabus_sources_study_writes_available_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'syllabus-sources'
    OR public.study_writes_are_available()
  );

COMMIT;
