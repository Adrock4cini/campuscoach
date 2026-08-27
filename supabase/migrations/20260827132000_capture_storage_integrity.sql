-- Launch boundary for private capture-source bytes.
--
-- The browser uploads one immutable object at an owner/capture/hash path and
-- then commits an exact material row. Storage INSERT checks are serialized and
-- bounded, object UPDATE is denied, and browser DELETE is limited to objects
-- that have not been committed to a material. Abandoned uploads are claimed in
-- bounded batches for deletion through the Storage API by the internal cleanup
-- worker; this migration never deletes rows from the managed Storage schema.

BEGIN;

-- The original prototype granted these tables to anon before strict owner RLS
-- replaced its demo policies. Strict RLS already denies anonymous rows, but
-- stale table grants are unnecessary attack surface at launch.
REVOKE ALL ON TABLE public.captures, public.materials FROM anon;

CREATE OR REPLACE FUNCTION public.can_upload_capture_source(p_path text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_capture_id uuid;
  v_parts text[];
  v_owner_object_count integer;
  v_capture_object_count integer;
  v_owner_orphan_count integer;
  v_owner_bytes bigint;
  v_max_owner_objects constant integer := 256;
  v_max_owner_bytes constant bigint := 512000000;
  v_max_file_bytes constant bigint := 8000000;
  v_max_capture_objects constant integer := 4;
  v_max_owner_orphans constant integer := 12;
  v_current_agreement_version constant text := '2026-08-17';
BEGIN
  v_parts := string_to_array(coalesce(p_path, ''), '/');
  IF v_user_id IS NULL
     OR array_length(v_parts, 1) <> 3
     OR v_parts[1] IS DISTINCT FROM v_user_id::text
     OR v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_parts[3] !~ '^[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$' THEN
    RETURN false;
  END IF;
  v_capture_id := v_parts[2]::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.family_beta_agreement_acceptances receipt
    WHERE receipt.user_id = v_user_id
      AND receipt.accepted_by = v_user_id
      AND receipt.agreement_version = v_current_agreement_version
      AND receipt.accepted_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.captures capture
    WHERE capture.id = v_capture_id
      AND capture.user_id = v_user_id
      AND capture.kind IN ('scan-assignment', 'scan-material')
      AND capture.processing_status IN ('queued', 'processing', 'failed')
      AND capture.practice_source_status <> 'confirmed'
      AND capture.concept_extraction_claim_id IS NULL
      AND coalesce(capture.meta->>'sourceImageCount', '') ~ '^[1-4]$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.concepts concept
        WHERE concept.capture_id = capture.id
          AND concept.user_id = capture.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.concept_capture_evidence evidence
        WHERE evidence.capture_id = capture.id
          AND evidence.user_id = capture.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.processed_content processed
        WHERE processed.capture_id = capture.id
          AND processed.user_id = capture.user_id
      )
  ) THEN
    RETURN false;
  END IF;

  -- Fence both cleanup and concurrent uploads for this exact object before the
  -- broader owner quota lock. Cleanup uses only the path lock, so this order
  -- cannot deadlock with a cleanup claim.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('capture-source-path:' || p_path, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.capture_source_cleanup_claims claim
    WHERE claim.storage_path = p_path
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RETURN false;
  END IF;

  -- An upload response may be lost after Storage durably creates the object.
  -- Let the exact INSERT reach Storage's unique-path conflict even at quota;
  -- the client then commits/reconciles the unchanged material row. UPDATE is
  -- denied separately, so this path can never overwrite the existing bytes.
  IF EXISTS (
    SELECT 1
    FROM storage.objects object
    WHERE object.bucket_id = 'capture-sources'
      AND object.name = p_path
  ) THEN
    RETURN true;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('capture-source-owner:' || v_user_id::text, 0)
  );

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE split_part(object.name, '/', 2) = v_capture_id::text
    )::integer,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.materials material
        WHERE material.storage_path = object.name
      )
    )::integer,
    coalesce(sum(
      CASE
        WHEN coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
          THEN (object.metadata->>'size')::bigint
        ELSE v_max_file_bytes
      END
    ), 0)::bigint
  INTO
    v_owner_object_count,
    v_capture_object_count,
    v_owner_orphan_count,
    v_owner_bytes
  FROM storage.objects object
  WHERE object.bucket_id = 'capture-sources'
    AND split_part(object.name, '/', 1) = v_user_id::text;

  -- The bucket independently caps each new object at 8 MB. Reserving a full
  -- file's headroom makes the 512 MB owner cap fail closed before INSERT.
  RETURN v_capture_object_count < v_max_capture_objects
     AND v_owner_orphan_count < v_max_owner_orphans
     AND v_owner_object_count < v_max_owner_objects
     AND v_owner_bytes <= v_max_owner_bytes - v_max_file_bytes;
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_capture_source(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_capture_source(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_upload_capture_source(text) IS
  'Serialized current-agreement capture Storage insert boundary: strict owner/capture/hash paths, 4 objects per capture, 12 unfinished objects, 256 objects and 512 MB per owner, with exact immutable retry support.';

CREATE OR REPLACE FUNCTION public.can_delete_uncommitted_capture_source(p_path text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR split_part(coalesce(p_path, ''), '/', 1) IS DISTINCT FROM auth.uid()::text
     OR coalesce(p_path, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$' THEN
    RETURN false;
  END IF;

  -- Serialize this policy decision with both material commits and cleanup
  -- claims, then recheck while the exact path fence is held.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('capture-source-path:' || p_path, 0)
  );
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.materials material
    WHERE material.storage_path = p_path
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.capture_source_cleanup_claims claim
    WHERE claim.storage_path = p_path
      AND claim.lease_expires_at > clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_delete_uncommitted_capture_source(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_uncommitted_capture_source(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_delete_uncommitted_capture_source(text) IS
  'Allows a student to clean up only an owner-scoped capture object that has not been committed to any material row.';

-- Rebuild the known permissive policies around the server-validated helpers.
-- Restrictive policies make the capture bucket safe even if another permissive
-- Storage policy is introduced for a different bucket later.
DROP POLICY IF EXISTS capture_sources_owner_insert ON storage.objects;
CREATE POLICY capture_sources_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capture-sources'
    AND public.can_upload_capture_source(name)
  );

DROP POLICY IF EXISTS capture_sources_integrity_insert ON storage.objects;
CREATE POLICY capture_sources_integrity_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'capture-sources'
    OR public.can_upload_capture_source(name)
  );

DROP POLICY IF EXISTS capture_sources_owner_update ON storage.objects;
DROP POLICY IF EXISTS capture_sources_immutable_update ON storage.objects;
CREATE POLICY capture_sources_immutable_update
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'capture-sources')
  WITH CHECK (bucket_id <> 'capture-sources');

DROP POLICY IF EXISTS capture_sources_owner_delete ON storage.objects;
CREATE POLICY capture_sources_owner_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'capture-sources'
    AND public.can_delete_uncommitted_capture_source(name)
  );

DROP POLICY IF EXISTS capture_sources_integrity_delete ON storage.objects;
CREATE POLICY capture_sources_integrity_delete
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'capture-sources'
    OR public.can_delete_uncommitted_capture_source(name)
  );

DROP POLICY IF EXISTS capture_sources_integrity_select ON storage.objects;
CREATE POLICY capture_sources_integrity_select
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'capture-sources'
    OR split_part(name, '/', 1) = auth.uid()::text
  );

-- The legacy material trigger deleted managed Storage rows directly. Retire it
-- before tightening material provenance: unreferenced bytes are now short-lived
-- orphans removed only through the Storage API by the fenced cleanup worker.
DROP TRIGGER IF EXISTS materials_remove_unreferenced_source ON public.materials;
DROP FUNCTION IF EXISTS public.remove_unreferenced_capture_source();

CREATE INDEX IF NOT EXISTS materials_storage_path_lookup
  ON public.materials(storage_path)
  WHERE storage_path IS NOT NULL;

-- Do not silently grandfather ambiguous source provenance. Operators must
-- inventory and repair any legacy mismatch through a reviewed Storage-API move
-- and matching database transaction before retrying this migration; SQL must
-- never rewrite or move the underlying bytes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects object
    WHERE object.bucket_id = 'capture-sources'
      AND object.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$'
  ) THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Noncanonical capture source objects must be inventoried and remediated before Storage lockdown';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.materials material
    JOIN public.captures capture
      ON capture.id = material.capture_id
    WHERE capture.kind IN ('scan-assignment', 'scan-material')
      AND capture.user_id IS DISTINCT FROM material.user_id
  ) THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Legacy cross-owner scan material links must be remediated before Storage lockdown';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.materials material
    WHERE (
        EXISTS (
          SELECT 1
          FROM public.captures capture
          WHERE capture.id = material.capture_id
            AND capture.kind IN ('scan-assignment', 'scan-material')
        )
        OR coalesce(material.storage_path, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$'
      )
      AND (
        material.kind IS DISTINCT FROM 'image'
        OR material.storage_path IS NULL
        OR material.capture_id IS NULL
        OR material.content_hash IS NULL
        OR material.content_hash !~ '^[0-9a-f]{64}$'
        OR material.page_index IS NULL
        OR material.page_index NOT BETWEEN 0 AND 3
        OR material.size_bytes IS NULL
        OR material.size_bytes NOT BETWEEN 1 AND 8000000
        OR lower(coalesce(material.mime_type, '')) NOT IN (
          'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.captures capture
          WHERE capture.id = material.capture_id
            AND capture.user_id = material.user_id
            AND capture.kind IN ('scan-assignment', 'scan-material')
            AND coalesce(capture.meta->>'sourceImageCount', '') ~ '^[1-4]$'
            AND material.page_index < (capture.meta->>'sourceImageCount')::integer
        )
        OR material.storage_path IS DISTINCT FROM concat(
          material.user_id::text,
          '/',
          material.capture_id::text,
          '/',
          material.content_hash,
          CASE lower(coalesce(material.mime_type, ''))
            WHEN 'image/jpeg' THEN '.jpg'
            WHEN 'image/png' THEN '.png'
            WHEN 'image/webp' THEN '.webp'
            WHEN 'image/heic' THEN '.heic'
            WHEN 'image/heif' THEN '.heif'
            ELSE '.invalid'
          END
        )
        OR NOT EXISTS (
          SELECT 1
          FROM storage.objects object
          WHERE object.bucket_id = 'capture-sources'
            AND object.name = material.storage_path
            AND coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
            AND (object.metadata->>'size')::bigint = material.size_bytes
            AND lower(coalesce(object.metadata->>'mimetype', '')) = lower(material.mime_type)
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Legacy capture source provenance must be remediated before Storage lockdown';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_capture_material_source_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_parts text[];
  v_expected_mime text;
  v_object_metadata jsonb;
  v_capture_kind text;
  v_capture_user_id uuid;
  v_processing_status text;
  v_claim_id uuid;
  v_practice_source_status text;
  v_expected_source_count integer;
BEGIN
  -- Serialize the entire source set with the worker claim by locking the
  -- parent capture. A material either commits before processing and is read,
  -- or observes the live claim and fails closed.
  SELECT
    capture.kind,
    capture.user_id,
    capture.processing_status,
    capture.concept_extraction_claim_id,
    capture.practice_source_status,
    CASE
      WHEN coalesce(capture.meta->>'sourceImageCount', '') ~ '^[1-4]$'
        THEN (capture.meta->>'sourceImageCount')::integer
      ELSE NULL
    END
  INTO
    v_capture_kind,
    v_capture_user_id,
    v_processing_status,
    v_claim_id,
    v_practice_source_status,
    v_expected_source_count
  FROM public.captures capture
  WHERE capture.id = NEW.capture_id
  FOR UPDATE;

  IF NOT FOUND OR v_capture_kind NOT IN ('scan-assignment', 'scan-material') THEN
    -- A canonical capture-bucket path may not be hidden behind a null,
    -- unrelated, or non-scan capture relationship.
    IF coalesce(NEW.storage_path, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$' THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = 'Capture source path requires its owned scan capture';
    END IF;
    RETURN NEW;
  END IF;

  IF v_capture_user_id IS DISTINCT FROM NEW.user_id
     OR NEW.kind IS DISTINCT FROM 'image'
     OR NEW.storage_path IS NULL
     OR v_processing_status NOT IN ('queued', 'processing', 'failed')
     OR v_practice_source_status = 'confirmed'
     OR v_claim_id IS NOT NULL
     OR v_expected_source_count IS NULL
     OR EXISTS (
       SELECT 1
       FROM public.concepts concept
       WHERE concept.capture_id = NEW.capture_id
         AND concept.user_id = NEW.user_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.concept_capture_evidence evidence
       WHERE evidence.capture_id = NEW.capture_id
         AND evidence.user_id = NEW.user_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.processed_content processed
       WHERE processed.capture_id = NEW.capture_id
         AND processed.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Capture material set is closed for processing';
  END IF;

  v_parts := string_to_array(NEW.storage_path, '/');
  v_expected_mime := CASE split_part(v_parts[3], '.', 2)
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
    WHEN 'webp' THEN 'image/webp'
    WHEN 'heic' THEN 'image/heic'
    WHEN 'heif' THEN 'image/heif'
    ELSE 'invalid'
  END;
  IF array_length(v_parts, 1) <> 3
     OR v_parts[1] IS DISTINCT FROM NEW.user_id::text
     OR v_parts[2] IS DISTINCT FROM NEW.capture_id::text
     OR v_parts[3] !~ '^[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$'
     OR split_part(v_parts[3], '.', 1) IS DISTINCT FROM NEW.content_hash
     OR NEW.page_index IS NULL
     OR NEW.page_index NOT BETWEEN 0 AND 3
     OR NEW.page_index >= v_expected_source_count
     OR NEW.size_bytes IS NULL
     OR NEW.size_bytes NOT BETWEEN 1 AND 8000000
     OR lower(coalesce(NEW.mime_type, '')) IS DISTINCT FROM v_expected_mime THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Capture material source metadata is invalid';
  END IF;

  SELECT object.metadata
    INTO v_object_metadata
    FROM storage.objects object
    WHERE object.bucket_id = 'capture-sources'
      AND object.name = NEW.storage_path;
  IF NOT FOUND
     OR coalesce(v_object_metadata->>'size', '') !~ '^[0-9]+$'
     OR (v_object_metadata->>'size')::bigint IS DISTINCT FROM NEW.size_bytes
     OR lower(coalesce(v_object_metadata->>'mimetype', '')) IS DISTINCT FROM v_expected_mime THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Capture source object does not match its material';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_capture_material_source_integrity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materials_10_enforce_capture_source_integrity ON public.materials;
CREATE TRIGGER materials_10_enforce_capture_source_integrity
  BEFORE INSERT OR UPDATE OF
    user_id, capture_id, kind, storage_path, mime_type, size_bytes,
    content_hash, original_name, page_index
  ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.enforce_capture_material_source_integrity();

CREATE OR REPLACE FUNCTION public.protect_capture_material_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Only a capture-source image enters this release's immutable provenance
  -- boundary. Older audio/document material keeps its existing lifecycle.
  IF (
       (OLD.kind = 'image' AND coalesce(OLD.storage_path, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$')
       OR (NEW.kind = 'image' AND coalesce(NEW.storage_path, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$')
     ) AND (
       OLD.capture_id IS DISTINCT FROM NEW.capture_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.kind IS DISTINCT FROM NEW.kind
       OR OLD.storage_path IS DISTINCT FROM NEW.storage_path
       OR OLD.mime_type IS DISTINCT FROM NEW.mime_type
       OR OLD.size_bytes IS DISTINCT FROM NEW.size_bytes
       OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
       OR OLD.original_name IS DISTINCT FROM NEW.original_name
       OR OLD.page_index IS DISTINCT FROM NEW.page_index
     ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Capture material source fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_capture_material_source_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materials_05_protect_capture_source_mutation ON public.materials;
CREATE TRIGGER materials_05_protect_capture_source_mutation
  BEFORE UPDATE OF
    user_id, capture_id, kind, storage_path, mime_type, size_bytes,
    content_hash, original_name, page_index
  ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.protect_capture_material_source_mutation();

CREATE OR REPLACE FUNCTION public.protect_capture_material_source_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_processing_status text;
  v_claim_id uuid;
  v_practice_source_status text;
BEGIN
  IF pg_catalog.pg_trigger_depth() > 1
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN OLD;
  END IF;

  IF OLD.kind IS DISTINCT FROM 'image' OR OLD.storage_path IS NULL THEN
    RETURN OLD;
  END IF;

  -- Serialize against the worker's claim update by locking the parent capture.
  -- If cleanup wins, it commits before the worker reads materials. If the
  -- worker wins, its claim id makes this direct delete fail closed.
  SELECT
    capture.processing_status,
    capture.concept_extraction_claim_id,
    capture.practice_source_status
  INTO
    v_processing_status,
    v_claim_id,
    v_practice_source_status
  FROM public.captures capture
  WHERE capture.id = OLD.capture_id
    AND capture.user_id = OLD.user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_practice_source_status = 'confirmed'
     OR v_processing_status NOT IN ('queued', 'processing', 'failed')
     OR v_claim_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.concepts concept
       WHERE concept.capture_id = OLD.capture_id
         AND concept.user_id = OLD.user_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.concept_capture_evidence evidence
       WHERE evidence.capture_id = OLD.capture_id
         AND evidence.user_id = OLD.user_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.processed_content processed
       WHERE processed.capture_id = OLD.capture_id
         AND processed.user_id = OLD.user_id
     ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Processed capture sources require server-side cleanup';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_capture_material_source_deletion()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materials_05_protect_capture_source_deletion ON public.materials;
CREATE TRIGGER materials_05_protect_capture_source_deletion
  BEFORE DELETE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.protect_capture_material_source_deletion();

-- Replace the earlier capture-delete guard with the final Storage-aware
-- boundary. DELETE already locks the capture row; the worker's claim UPDATE
-- takes the same row lock. Whichever commits first is therefore observed by
-- the other operation, and a browser can never cascade-delete a live source.
CREATE OR REPLACE FUNCTION public.protect_capture_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() > 1
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN OLD;
  END IF;

  IF OLD.concept_extraction_claim_id IS NOT NULL
     OR OLD.practice_source_status <> 'not_required'
     OR EXISTS (
       SELECT 1
       FROM public.concept_capture_evidence evidence
       WHERE evidence.user_id = OLD.user_id
         AND evidence.capture_id = OLD.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.concepts concept
       WHERE concept.user_id = OLD.user_id
         AND concept.capture_id = OLD.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.processed_content processed
       WHERE processed.user_id = OLD.user_id
         AND processed.capture_id = OLD.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.learning_artifacts artifact
       WHERE artifact.user_id = OLD.user_id
         AND artifact.capture_id = OLD.id
     ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Processed or active captures require server-side cleanup';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_capture_deletion()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_capture_deletion()
  TO service_role;

-- A private, fenced ledger coordinates cleanup claims with late exact retries.
CREATE TABLE public.capture_source_cleanup_claims (
  storage_path text PRIMARY KEY,
  object_created_at timestamptz NOT NULL,
  eligible_before timestamptz NOT NULL,
  claim_token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 1000000),
  CHECK (lease_expires_at > claimed_at)
);

ALTER TABLE public.capture_source_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capture_source_cleanup_claims
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.capture_source_cleanup_claims TO service_role;

CREATE INDEX capture_source_cleanup_claims_lease_lookup
  ON public.capture_source_cleanup_claims(lease_expires_at, storage_path);

CREATE OR REPLACE FUNCTION public.guard_capture_source_cleanup_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.storage_path IS NULL OR NEW.kind IS DISTINCT FROM 'image' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('capture-source-path:' || NEW.storage_path, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.capture_source_cleanup_claims claim
    WHERE claim.storage_path = NEW.storage_path
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Capture source upload expired before it was saved';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_capture_source_cleanup_claim()
  FROM PUBLIC, anon, authenticated;

-- PostgreSQL fires same-timing triggers alphabetically. Acquire the cleanup
-- fence before the existing owner/integrity checks can commit a material.
DROP TRIGGER IF EXISTS materials_00_guard_capture_source_cleanup_claim ON public.materials;
CREATE TRIGGER materials_00_guard_capture_source_cleanup_claim
  BEFORE INSERT OR UPDATE OF storage_path ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.guard_capture_source_cleanup_claim();

CREATE OR REPLACE FUNCTION public.get_capture_cleanup_invocation_digest()
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

REVOKE ALL ON FUNCTION public.get_capture_cleanup_invocation_digest()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_capture_cleanup_invocation_digest()
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_abandoned_capture_sources(
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

  WITH releasable AS (
    SELECT claim.storage_path
    FROM public.capture_source_cleanup_claims claim
    WHERE claim.lease_expires_at <= v_now
      AND (
        NOT EXISTS (
          SELECT 1
          FROM storage.objects object
          WHERE object.bucket_id = 'capture-sources'
            AND object.name = claim.storage_path
        )
        OR EXISTS (
          SELECT 1
          FROM public.materials material
          WHERE material.storage_path = claim.storage_path
        )
      )
    ORDER BY claim.lease_expires_at, claim.storage_path
    LIMIT 200
  )
  DELETE FROM public.capture_source_cleanup_claims claim
  USING releasable
  WHERE claim.storage_path = releasable.storage_path
    AND claim.lease_expires_at <= v_now;

  FOR v_path IN
    SELECT claim.storage_path
    FROM public.capture_source_cleanup_claims claim
    WHERE claim.claim_token = p_claim_token
      AND claim.lease_expires_at > v_now
    ORDER BY claim.storage_path
    LIMIT p_limit
  LOOP
    storage_path := v_path;
    RETURN NEXT;
    v_returned := v_returned + 1;
  END LOOP;
  IF v_returned >= p_limit THEN RETURN; END IF;

  FOR v_path, v_created_at IN
    SELECT object.name, object.created_at
    FROM storage.objects object
    WHERE object.bucket_id = 'capture-sources'
      AND object.created_at < v_eligible_before
      AND object.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$'
      AND NOT EXISTS (
        SELECT 1
        FROM public.materials material
        WHERE material.storage_path = object.name
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.capture_source_cleanup_claims claim
        WHERE claim.storage_path = object.name
          AND claim.lease_expires_at > v_now
      )
    -- Every multi-object cleanup operation acquires path fences in the same
    -- lexical order, avoiding advisory-lock inversions under concurrency.
    ORDER BY object.name
    LIMIT (p_limit - v_returned) * 4
  LOOP
    EXIT WHEN v_returned >= p_limit;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('capture-source-path:' || v_path, 0)
    );
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'capture-sources'
        AND object.name = v_path
        AND object.created_at < v_eligible_before
    ) OR EXISTS (
      SELECT 1
      FROM public.materials material
      WHERE material.storage_path = v_path
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.capture_source_cleanup_claims (
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
    ON CONFLICT ON CONSTRAINT capture_source_cleanup_claims_pkey DO UPDATE
      SET claim_token = EXCLUDED.claim_token,
          claimed_at = EXCLUDED.claimed_at,
          eligible_before = EXCLUDED.eligible_before,
          lease_expires_at = EXCLUDED.lease_expires_at,
          attempts = public.capture_source_cleanup_claims.attempts + 1
      WHERE public.capture_source_cleanup_claims.lease_expires_at <= v_now;

    IF FOUND THEN
      storage_path := v_path;
      RETURN NEXT;
      v_returned := v_returned + 1;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_capture_sources(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_capture_sources(uuid, integer, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_capture_cleanup_claims(
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
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('capture-source-path:' || v_path, 0)
    );
    IF EXISTS (
      SELECT 1
      FROM public.capture_source_cleanup_claims claim
      JOIN storage.objects object
        ON object.bucket_id = 'capture-sources'
       AND object.name = claim.storage_path
      WHERE claim.storage_path = v_path
        AND claim.claim_token = p_claim_token
        AND claim.lease_expires_at > v_now
        AND object.created_at < claim.eligible_before
        AND NOT EXISTS (
          SELECT 1
          FROM public.materials material
          WHERE material.storage_path = claim.storage_path
        )
    ) THEN
      UPDATE public.capture_source_cleanup_claims claim
      SET lease_expires_at = v_now + interval '15 minutes'
      WHERE claim.storage_path = v_path
        AND claim.claim_token = p_claim_token
        AND claim.lease_expires_at > v_now;
      storage_path := v_path;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_capture_cleanup_claims(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_capture_cleanup_claims(uuid, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_capture_cleanup_claims(
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
  DELETE FROM public.capture_source_cleanup_claims claim
  WHERE claim.claim_token = p_claim_token
    AND claim.storage_path = ANY(p_storage_paths);
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_capture_cleanup_claims(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_capture_cleanup_claims(uuid, text[])
  TO service_role;

COMMENT ON TABLE public.capture_source_cleanup_claims IS
  'Private, short-lived fenced claims for uncommitted capture sources awaiting Storage API deletion.';

COMMIT;
