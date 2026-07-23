-- Private Assignment/Material Capture foundation.
-- Images remain private to the owner; captures may only link to an assignment
-- or exam owned by that same student and belonging to the same class.

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS original_name TEXT,
  ADD COLUMN IF NOT EXISTS page_index INTEGER;

CREATE INDEX IF NOT EXISTS captures_assignment_idx
  ON public.captures(user_id, assignment_id)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS captures_exam_idx
  ON public.captures(user_id, exam_id)
  WHERE exam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_owner_hash_idx
  ON public.materials(user_id, content_hash)
  WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS materials_capture_page_idx
  ON public.materials(capture_id, page_index)
  WHERE capture_id IS NOT NULL AND page_index IS NOT NULL;

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_page_index_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_page_index_check
  CHECK (page_index IS NULL OR page_index BETWEEN 0 AND 3);

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_size_bytes_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_size_bytes_check
  CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 8000000);

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_content_hash_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_content_hash_check
  CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.enforce_capture_study_boundaries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_client_class_id TEXT;
  v_class_id UUID;
BEGIN
  IF NEW.assignment_id IS NOT NULL THEN
    SELECT user_id, client_class_id, class_id
      INTO v_owner, v_client_class_id, v_class_id
      FROM public.assignments
      WHERE id = NEW.assignment_id;
    IF NOT FOUND
       OR v_owner IS DISTINCT FROM NEW.user_id
       OR v_client_class_id IS DISTINCT FROM NEW.client_class_id
       OR (
         v_class_id IS NOT NULL
         AND NEW.class_id IS NOT NULL
         AND v_class_id IS DISTINCT FROM NEW.class_id
       ) THEN
      RAISE EXCEPTION 'Assignment must belong to the capture owner and class';
    END IF;
  END IF;

  IF NEW.exam_id IS NOT NULL THEN
    SELECT user_id, client_class_id, class_id
      INTO v_owner, v_client_class_id, v_class_id
      FROM public.exams
      WHERE id = NEW.exam_id;
    IF NOT FOUND
       OR v_owner IS DISTINCT FROM NEW.user_id
       OR v_client_class_id IS DISTINCT FROM NEW.client_class_id
       OR (
         v_class_id IS NOT NULL
         AND NEW.class_id IS NOT NULL
         AND v_class_id IS DISTINCT FROM NEW.class_id
       ) THEN
      RAISE EXCEPTION 'Exam must belong to the capture owner and class';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS captures_enforce_study_boundaries ON public.captures;
CREATE TRIGGER captures_enforce_study_boundaries
  BEFORE INSERT OR UPDATE OF user_id, client_class_id, class_id, assignment_id, exam_id
  ON public.captures
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_capture_study_boundaries();

CREATE OR REPLACE FUNCTION public.enforce_material_capture_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capture_owner UUID;
BEGIN
  IF NEW.capture_id IS NOT NULL THEN
    SELECT user_id INTO v_capture_owner
      FROM public.captures
      WHERE id = NEW.capture_id;

    IF NOT FOUND OR v_capture_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Material and capture owners must match';
    END IF;
  END IF;

  IF NEW.storage_path IS NOT NULL
     AND split_part(NEW.storage_path, '/', 1) IS DISTINCT FROM NEW.user_id::TEXT THEN
    RAISE EXCEPTION 'Material path must be owner scoped';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS materials_enforce_capture_owner ON public.materials;
CREATE TRIGGER materials_enforce_capture_owner
  BEFORE INSERT OR UPDATE OF capture_id, user_id, storage_path
  ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_material_capture_owner();

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'capture-sources',
  'capture-sources',
  false,
  8000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "capture_sources_owner_select" ON storage.objects;
CREATE POLICY "capture_sources_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'capture-sources'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "capture_sources_owner_insert" ON storage.objects;
CREATE POLICY "capture_sources_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capture-sources'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "capture_sources_owner_delete" ON storage.objects;
CREATE POLICY "capture_sources_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'capture-sources'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE OR REPLACE FUNCTION public.remove_unreferenced_capture_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.materials
       WHERE storage_path = OLD.storage_path
     ) THEN
    DELETE FROM storage.objects
      WHERE bucket_id = 'capture-sources'
        AND name = OLD.storage_path;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS materials_remove_unreferenced_source ON public.materials;
CREATE TRIGGER materials_remove_unreferenced_source
  AFTER DELETE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_unreferenced_capture_source();

COMMENT ON COLUMN public.captures.assignment_id IS
  'Optional same-owner, same-class assignment this source came from.';
COMMENT ON COLUMN public.captures.exam_id IS
  'Optional same-owner, same-class exam this source explicitly prepares for.';
COMMENT ON COLUMN public.materials.content_hash IS
  'SHA-256 used to avoid re-uploading identical private images for one student.';
