-- Require the durable current family-beta receipt at direct browser write
-- boundaries that can persist raw or derived student input. This migration is
-- applied only after the compatible agreement client is published (see the
-- rollout runbook); existing Auth metadata is never accepted as evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_current_family_beta_agreement()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.family_beta_agreement_acceptances receipt
      WHERE receipt.user_id = auth.uid()
        AND receipt.accepted_by = auth.uid()
        AND receipt.agreement_version = '2026-08-17'
        AND receipt.accepted_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.has_current_family_beta_agreement()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_family_beta_agreement()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.has_current_family_beta_agreement() IS
  'Server-side current-version receipt check for authenticated raw-input write policies; Auth metadata is never evidence.';

-- Existing owner policies remain the permissive ownership branch. These
-- restrictive policies are ANDed with every permissive branch, so adding a
-- future capture/material/processed policy cannot accidentally bypass agreement
-- acceptance.
DROP POLICY IF EXISTS captures_current_agreement_insert ON public.captures;
CREATE POLICY captures_current_agreement_insert
  ON public.captures AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS captures_current_agreement_update ON public.captures;
CREATE POLICY captures_current_agreement_update
  ON public.captures AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS materials_current_agreement_insert ON public.materials;
CREATE POLICY materials_current_agreement_insert
  ON public.materials AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS materials_current_agreement_update ON public.materials;
CREATE POLICY materials_current_agreement_update
  ON public.materials AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS processed_content_current_agreement_insert ON public.processed_content;
CREATE POLICY processed_content_current_agreement_insert
  ON public.processed_content AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS processed_content_current_agreement_update ON public.processed_content;
CREATE POLICY processed_content_current_agreement_update
  ON public.processed_content AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

-- Capture and syllabus uploads bypass Edge when a browser writes directly to
-- Storage, so enforce the same receipt independently at storage.objects. The
-- condition is neutral for every other bucket and composes with each bucket's
-- existing (or subsequently installed) strict owner/path/quota policy.
DROP POLICY IF EXISTS syllabus_sources_current_agreement_insert ON storage.objects;
DROP POLICY IF EXISTS student_sources_current_agreement_insert ON storage.objects;
CREATE POLICY student_sources_current_agreement_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('capture-sources', 'syllabus-sources')
    OR public.has_current_family_beta_agreement()
  );

COMMIT;
