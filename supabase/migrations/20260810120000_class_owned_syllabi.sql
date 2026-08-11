-- Class-owned syllabus sources and transactional calendar reconciliation.
-- A syllabus is private to one student and one durable class UUID. Reimports
-- create an immutable source revision while reconciling only that class's
-- syllabus-owned deadlines; manual and Canvas rows are never candidates.

CREATE TABLE public.class_syllabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  client_class_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  request_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 500),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  )),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 15000000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  parsed_data jsonb NOT NULL CHECK (jsonb_typeof(parsed_data) = 'object'),
  reviewed_data jsonb NOT NULL CHECK (jsonb_typeof(reviewed_data) = 'object'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, revision),
  UNIQUE (user_id, request_id)
);

CREATE UNIQUE INDEX class_syllabi_one_active_per_class
  ON public.class_syllabi(class_id)
  WHERE archived_at IS NULL;
CREATE INDEX class_syllabi_owner_class_history
  ON public.class_syllabi(user_id, class_id, revision DESC);

-- The request ledger makes an exact retry safe even when a same-content
-- reimport was a no-op and its newly uploaded duplicate object was removed.
CREATE TABLE public.class_syllabus_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  client_class_id text NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  parsed_data jsonb NOT NULL CHECK (jsonb_typeof(parsed_data) = 'object'),
  reviewed_data jsonb NOT NULL CHECK (jsonb_typeof(reviewed_data) = 'object'),
  syllabus_id uuid REFERENCES public.class_syllabi(id) ON DELETE SET NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.class_syllabi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_syllabus_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.class_syllabi FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.class_syllabus_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.class_syllabi TO authenticated;
GRANT SELECT ON public.class_syllabus_requests TO authenticated;
GRANT ALL ON public.class_syllabi, public.class_syllabus_requests TO service_role;

CREATE POLICY class_syllabi_owner_select
  ON public.class_syllabi FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY class_syllabus_requests_owner_select
  ON public.class_syllabus_requests FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE TRIGGER class_syllabi_touch_updated_at
  BEFORE UPDATE ON public.class_syllabi
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'syllabus-sources',
  'syllabus-sources',
  false,
  15000000,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.owns_syllabus_storage_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_parts text[];
  v_user_id uuid := auth.uid();
  v_class_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_path IS NULL THEN
    RETURN false;
  END IF;
  v_parts := string_to_array(p_path, '/');
  IF array_length(v_parts, 1) <> 4
     OR v_parts[1] <> v_user_id::text
     OR v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_parts[4] !~ '^source\.(pdf|jpg|jpeg|png|webp|heic|heif)$' THEN
    RETURN false;
  END IF;
  v_class_id := v_parts[2]::uuid;
  RETURN EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = v_class_id AND user_id = v_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owns_syllabus_storage_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_syllabus_storage_path(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owns_active_syllabus_storage_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  IF NOT public.owns_syllabus_storage_path(p_path) THEN
    RETURN false;
  END IF;
  v_class_id := split_part(p_path, '/', 2)::uuid;
  RETURN EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = v_class_id AND user_id = auth.uid() AND source_archived_at IS NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owns_active_syllabus_storage_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_active_syllabus_storage_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS syllabus_sources_owner_select ON storage.objects;
CREATE POLICY syllabus_sources_owner_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'syllabus-sources' AND public.owns_syllabus_storage_path(name));

DROP POLICY IF EXISTS syllabus_sources_owner_insert ON storage.objects;
CREATE POLICY syllabus_sources_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'syllabus-sources' AND public.owns_active_syllabus_storage_path(name));

DROP POLICY IF EXISTS syllabus_sources_owner_delete_uncommitted ON storage.objects;
CREATE POLICY syllabus_sources_owner_delete_uncommitted
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'syllabus-sources'
    AND public.owns_syllabus_storage_path(name)
    AND NOT EXISTS (
      SELECT 1 FROM public.class_syllabi WHERE storage_path = name
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_class_syllabus_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_class_owner uuid;
  v_client_class_id text;
  v_parts text[];
  v_object_metadata jsonb;
BEGIN
  SELECT user_id, client_class_id
    INTO v_class_owner, v_client_class_id
    FROM public.classes
    WHERE id = NEW.class_id AND source_archived_at IS NULL;
  IF NOT FOUND
     OR v_class_owner IS DISTINCT FROM NEW.user_id
     OR v_client_class_id IS DISTINCT FROM NEW.client_class_id THEN
    RAISE EXCEPTION 'Syllabus must use its owner class and immutable client class id';
  END IF;

  v_parts := string_to_array(NEW.storage_path, '/');
  IF array_length(v_parts, 1) <> 4
     OR v_parts[1] IS DISTINCT FROM NEW.user_id::text
     OR v_parts[2] IS DISTINCT FROM NEW.class_id::text
     OR v_parts[3] IS DISTINCT FROM NEW.request_id::text
     OR v_parts[4] !~ '^source\.(pdf|jpg|jpeg|png|webp|heic|heif)$' THEN
    RAISE EXCEPTION 'Syllabus source path must be owner/class/request scoped';
  END IF;

  SELECT metadata INTO v_object_metadata
    FROM storage.objects
    WHERE bucket_id = 'syllabus-sources' AND name = NEW.storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Syllabus source object does not exist';
  END IF;
  IF coalesce(v_object_metadata->>'size', '') !~ '^[0-9]+$'
     OR (v_object_metadata->>'size')::bigint IS DISTINCT FROM NEW.size_bytes
     OR lower(coalesce(v_object_metadata->>'mimetype', '')) IS DISTINCT FROM NEW.mime_type THEN
    RAISE EXCEPTION 'Syllabus source metadata does not match the committed file';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_syllabi_enforce_integrity ON public.class_syllabi;
CREATE TRIGGER class_syllabi_enforce_integrity
  BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id, request_id, storage_path
  ON public.class_syllabi
  FOR EACH ROW EXECUTE FUNCTION public.enforce_class_syllabus_integrity();

REVOKE EXECUTE ON FUNCTION public.enforce_class_syllabus_integrity()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.assignments
  ADD COLUMN syllabus_id uuid REFERENCES public.class_syllabi(id) ON DELETE SET NULL;
ALTER TABLE public.exams
  ADD COLUMN syllabus_id uuid REFERENCES public.class_syllabi(id) ON DELETE SET NULL;

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_source_check;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_source_check CHECK (source IN ('manual', 'canvas', 'syllabus'));
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_source_check;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_source_check CHECK (source IN ('manual', 'canvas', 'syllabus'));

CREATE INDEX assignments_syllabus_idx ON public.assignments(syllabus_id) WHERE syllabus_id IS NOT NULL;
CREATE INDEX exams_syllabus_idx ON public.exams(syllabus_id) WHERE syllabus_id IS NOT NULL;

-- Recognize only the legacy rows that the old importer marked both ways.
-- The legacy external identity is unique and deliberately cannot collide with
-- the new stable item identities.
UPDATE public.assignments
SET meta = (meta - 'source' - 'source_key') || jsonb_build_object(
      'legacy_syllabus_edit_preserved', true,
      'detached_from_syllabus_at', now()
    )
WHERE source = 'manual'
  AND meta->>'source' = 'syllabus'
  AND meta ? 'source_key'
  AND nullif(btrim(meta->>'source_key'), '') IS NOT NULL
  AND meta->>'source_key' IS DISTINCT FROM concat(
    'assignment:', coalesce(client_class_id, ''), ':', coalesce(due_date::text, ''), ':', lower(btrim(title))
  );

UPDATE public.assignments
SET source = 'syllabus',
    external_id = 'legacy:' || md5(meta->>'source_key') || ':' || id::text,
    meta = meta || jsonb_build_object(
      'syllabus_title', title,
      'syllabus_due_date', due_date,
      'legacy_syllabus_import', true
    )
WHERE source = 'manual'
  AND meta->>'source' = 'syllabus'
  AND meta ? 'source_key'
  AND nullif(btrim(meta->>'source_key'), '') IS NOT NULL
  AND meta->>'source_key' = concat(
    'assignment:', coalesce(client_class_id, ''), ':', coalesce(due_date::text, ''), ':', lower(btrim(title))
  );

UPDATE public.exams
SET meta = (meta - 'source' - 'source_key') || jsonb_build_object(
      'legacy_syllabus_edit_preserved', true,
      'detached_from_syllabus_at', now()
    )
WHERE source = 'manual'
  AND meta->>'source' = 'syllabus'
  AND meta ? 'source_key'
  AND nullif(btrim(meta->>'source_key'), '') IS NOT NULL
  AND meta->>'source_key' IS DISTINCT FROM concat(
    'exam:', coalesce(client_class_id, ''), ':', coalesce(exam_date::text, ''), ':', lower(btrim(title))
  );

UPDATE public.exams
SET source = 'syllabus',
    external_id = 'legacy:' || md5(meta->>'source_key') || ':' || id::text,
    meta = meta || jsonb_build_object(
      'syllabus_title', title,
      'syllabus_exam_date', exam_date,
      'legacy_syllabus_import', true
    )
WHERE source = 'manual'
  AND meta->>'source' = 'syllabus'
  AND meta ? 'source_key'
  AND nullif(btrim(meta->>'source_key'), '') IS NOT NULL
  AND meta->>'source_key' = concat(
    'exam:', coalesce(client_class_id, ''), ':', coalesce(exam_date::text, ''), ':', lower(btrim(title))
  );

CREATE OR REPLACE FUNCTION public.enforce_deadline_syllabus_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_class_id uuid;
  v_client_class_id text;
BEGIN
  IF NEW.syllabus_id IS NULL THEN
    IF NEW.source = 'syllabus' THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'New syllabus deadlines must be committed through the syllabus transaction';
      END IF;
      IF OLD.source IS DISTINCT FROM 'syllabus'
         OR OLD.syllabus_id IS NOT NULL
         OR coalesce(OLD.meta->>'legacy_syllabus_import', 'false') <> 'true'
         OR coalesce(NEW.meta->>'legacy_syllabus_import', 'false') <> 'true' THEN
        RAISE EXCEPTION 'New syllabus deadlines must be committed through the syllabus transaction';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id
         OR NEW.class_id IS DISTINCT FROM OLD.class_id
         OR NEW.client_class_id IS DISTINCT FROM OLD.client_class_id THEN
        RAISE EXCEPTION 'A legacy syllabus deadline cannot move between owners or classes';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source IS DISTINCT FROM 'syllabus' THEN
    RAISE EXCEPTION 'A syllabus-linked deadline must have syllabus source';
  END IF;
  SELECT user_id, class_id, client_class_id
    INTO v_owner, v_class_id, v_client_class_id
    FROM public.class_syllabi
    WHERE id = NEW.syllabus_id;
  IF NOT FOUND
     OR v_owner IS DISTINCT FROM NEW.user_id
     OR v_class_id IS DISTINCT FROM NEW.class_id
     OR v_client_class_id IS DISTINCT FROM NEW.client_class_id THEN
    RAISE EXCEPTION 'Syllabus deadline must share its source owner and class';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignments_enforce_syllabus_boundary ON public.assignments;
CREATE TRIGGER assignments_enforce_syllabus_boundary
  BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id, source, syllabus_id
  ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deadline_syllabus_boundary();
DROP TRIGGER IF EXISTS exams_enforce_syllabus_boundary ON public.exams;
CREATE TRIGGER exams_enforce_syllabus_boundary
  BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id, source, syllabus_id
  ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deadline_syllabus_boundary();

REVOKE EXECUTE ON FUNCTION public.enforce_deadline_syllabus_boundary()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commit_class_syllabus(
  p_class_id uuid,
  p_client_class_id text,
  p_request_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_content_hash text,
  p_parsed_data jsonb,
  p_reviewed_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_previous public.class_syllabi%ROWTYPE;
  v_existing_request public.class_syllabus_requests%ROWTYPE;
  v_syllabus public.class_syllabi%ROWTYPE;
  v_item jsonb;
  v_existing_assignment public.assignments%ROWTYPE;
  v_existing_exam public.exams%ROWTYPE;
  v_external_id text;
  v_revision integer;
  v_weekdays text[] := ARRAY[]::text[];
  v_start_time text;
  v_end_time text;
  v_start_date text;
  v_end_date text;
  v_schedule jsonb := '[]'::jsonb;
  v_new_schedule jsonb := '[]'::jsonb;
  v_object_metadata jsonb;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO v_class
    FROM public.classes
    WHERE id = p_class_id AND user_id = v_user_id AND source_archived_at IS NULL
    FOR UPDATE;
  IF NOT FOUND OR v_class.client_class_id IS DISTINCT FROM p_client_class_id THEN
    RAISE EXCEPTION 'Target class was not found for this student';
  END IF;

  SELECT * INTO v_existing_request
    FROM public.class_syllabus_requests
    WHERE user_id = v_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_request.class_id IS DISTINCT FROM p_class_id
       OR v_existing_request.client_class_id IS DISTINCT FROM p_client_class_id
       OR v_existing_request.storage_path IS DISTINCT FROM p_storage_path
       OR v_existing_request.original_name IS DISTINCT FROM p_original_name
       OR v_existing_request.mime_type IS DISTINCT FROM p_mime_type
       OR v_existing_request.size_bytes IS DISTINCT FROM p_size_bytes
       OR v_existing_request.content_hash IS DISTINCT FROM p_content_hash
       OR v_existing_request.parsed_data IS DISTINCT FROM p_parsed_data
       OR v_existing_request.reviewed_data IS DISTINCT FROM p_reviewed_data THEN
      RAISE EXCEPTION 'A syllabus request id cannot be reused with different input';
    END IF;
    RETURN v_existing_request.result || jsonb_build_object('retry', true);
  END IF;

  IF p_storage_path IS NULL
     OR p_storage_path <> concat(v_user_id, '/', p_class_id, '/', p_request_id, '/',
       CASE p_mime_type
         WHEN 'application/pdf' THEN 'source.pdf'
         WHEN 'image/jpeg' THEN 'source.jpg'
         WHEN 'image/png' THEN 'source.png'
         WHEN 'image/webp' THEN 'source.webp'
         WHEN 'image/heic' THEN 'source.heic'
         WHEN 'image/heif' THEN 'source.heif'
         ELSE 'invalid'
       END)
     OR coalesce(p_size_bytes, 0) NOT BETWEEN 1 AND 15000000
     OR coalesce(p_content_hash, '') !~ '^[0-9a-f]{64}$'
     OR nullif(btrim(p_original_name), '') IS NULL
     OR char_length(p_original_name) > 500
     OR octet_length(p_parsed_data::text) > 2000000
     OR octet_length(p_reviewed_data::text) > 1000000
     OR jsonb_typeof(p_parsed_data) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_reviewed_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid syllabus source or payload';
  END IF;
  SELECT metadata INTO v_object_metadata
    FROM storage.objects
    WHERE bucket_id = 'syllabus-sources' AND name = p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Uploaded syllabus source was not found';
  END IF;
  IF coalesce(v_object_metadata->>'size', '') !~ '^[0-9]+$'
     OR (v_object_metadata->>'size')::bigint IS DISTINCT FROM p_size_bytes
     OR lower(coalesce(v_object_metadata->>'mimetype', '')) IS DISTINCT FROM p_mime_type THEN
    RAISE EXCEPTION 'Uploaded syllabus metadata does not match the commit';
  END IF;

  IF jsonb_typeof(p_reviewed_data->'class') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_reviewed_data->'assignments') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_reviewed_data->'exams') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_reviewed_data->'schedule') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_reviewed_data->'assignments') > 500
     OR jsonb_array_length(p_reviewed_data->'exams') > 200
     OR jsonb_array_length(p_reviewed_data->'schedule') > 500 THEN
    RAISE EXCEPTION 'Invalid reviewed syllabus structure';
  END IF;
  IF jsonb_typeof(p_reviewed_data->'selectedClassIndex') IS DISTINCT FROM 'number'
     OR coalesce(p_reviewed_data->>'selectedClassIndex', '') !~ '^([0-9]|[12][0-9])$'
     OR jsonb_typeof(p_reviewed_data->'sourceClassName') IS DISTINCT FROM 'string'
     OR char_length(p_reviewed_data->>'sourceClassName') > 300
     OR jsonb_typeof(p_reviewed_data->'sourceClassCode') IS DISTINCT FROM 'string'
     OR char_length(p_reviewed_data->>'sourceClassCode') > 100 THEN
    RAISE EXCEPTION 'Invalid reviewed syllabus audit fields';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT value FROM jsonb_array_elements(p_reviewed_data->'assignments')
      UNION ALL SELECT value FROM jsonb_array_elements(p_reviewed_data->'exams')
      UNION ALL SELECT value FROM jsonb_array_elements(p_reviewed_data->'schedule')
    ) items
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
      OR jsonb_typeof(value->'included') IS DISTINCT FROM 'boolean'
      OR coalesce(value->>'key', '') !~ '^[a-z]+:[0-9a-f]{8}:[0-9]+$'
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT value->>'key' AS item_key FROM jsonb_array_elements(p_reviewed_data->'assignments')
      UNION ALL SELECT value->>'key' FROM jsonb_array_elements(p_reviewed_data->'exams')
      UNION ALL SELECT value->>'key' FROM jsonb_array_elements(p_reviewed_data->'schedule')
    ) keys
    GROUP BY item_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Syllabus item identities must be valid and unique';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_reviewed_data->'assignments') item
    WHERE coalesce(item->>'key', '') !~ '^assignment:[0-9a-f]{8}:[0-9]+$'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_reviewed_data->'exams') item
    WHERE coalesce(item->>'key', '') !~ '^exam:[0-9a-f]{8}:[0-9]+$'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_reviewed_data->'schedule') item
    WHERE coalesce(item->>'key', '') !~ '^schedule:[0-9a-f]{8}:[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'Syllabus item identity does not match its item kind';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reviewed_data->'assignments') LOOP
    IF jsonb_typeof(v_item->'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'dueDate') IS DISTINCT FROM 'string'
       OR char_length(v_item->>'title') > 300
       OR char_length(v_item->>'dueDate') > 40 THEN
      RAISE EXCEPTION 'Assignment review fields are invalid';
    END IF;
    IF (v_item->>'included')::boolean AND (
      nullif(btrim(v_item->>'title'), '') IS NULL
      OR char_length(v_item->>'title') > 300
      OR coalesce(v_item->>'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    ) THEN RAISE EXCEPTION 'Included assignments require a title and date'; END IF;
    IF (v_item->>'included')::boolean THEN PERFORM (v_item->>'dueDate')::date; END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reviewed_data->'exams') LOOP
    IF jsonb_typeof(v_item->'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'examDate') IS DISTINCT FROM 'string'
       OR char_length(v_item->>'title') > 300
       OR char_length(v_item->>'examDate') > 40 THEN
      RAISE EXCEPTION 'Exam review fields are invalid';
    END IF;
    IF jsonb_typeof(v_item->'topics') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_item->'topics') > 100 THEN
      RAISE EXCEPTION 'Exam topics must be a bounded array';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_item->'topics') topic
      WHERE jsonb_typeof(topic) IS DISTINCT FROM 'string'
        OR char_length(topic #>> '{}') > 200
    ) THEN RAISE EXCEPTION 'Exam topic text is invalid'; END IF;
    IF (v_item->>'included')::boolean AND (
      nullif(btrim(v_item->>'title'), '') IS NULL
      OR char_length(v_item->>'title') > 300
      OR coalesce(v_item->>'examDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    ) THEN RAISE EXCEPTION 'Included exams require a title and date'; END IF;
    IF (v_item->>'included')::boolean THEN PERFORM (v_item->>'examDate')::date; END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reviewed_data->'schedule') LOOP
    IF jsonb_typeof(v_item->'topic') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'date') IS DISTINCT FROM 'string'
       OR char_length(v_item->>'topic') > 500
       OR char_length(v_item->>'date') > 40 THEN
      RAISE EXCEPTION 'Schedule review fields are invalid';
    END IF;
    IF jsonb_typeof(v_item->'dueItems') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_item->'dueItems') > 100 THEN
      RAISE EXCEPTION 'Schedule due items must be a bounded array';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_item->'dueItems') due_item
      WHERE jsonb_typeof(due_item) IS DISTINCT FROM 'string'
        OR char_length(due_item #>> '{}') > 300
    ) THEN RAISE EXCEPTION 'Schedule due item text is invalid'; END IF;
    IF (v_item->>'included')::boolean AND (
      nullif(btrim(v_item->>'topic'), '') IS NULL
      OR char_length(v_item->>'topic') > 500
      OR coalesce(v_item->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    ) THEN RAISE EXCEPTION 'Included schedule topics require a topic and date'; END IF;
    IF (v_item->>'included')::boolean THEN PERFORM (v_item->>'date')::date; END IF;
  END LOOP;

  IF jsonb_typeof(p_reviewed_data->'class'->'weekdays') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_reviewed_data->'class'->'weekdays') > 7
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(p_reviewed_data->'class'->'weekdays') day(value)
       WHERE value NOT IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')
     ) THEN
    RAISE EXCEPTION 'Class weekdays must use canonical values';
  END IF;
  IF char_length(coalesce(p_reviewed_data->'class'->>'term', '')) > 120 THEN
    RAISE EXCEPTION 'Class term is too long';
  END IF;
  IF jsonb_typeof(p_reviewed_data->'class'->'startTime') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_reviewed_data->'class'->'endTime') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_reviewed_data->'class'->'term') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_reviewed_data->'class'->'semesterStartDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_reviewed_data->'class'->'semesterEndDate') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Class schedule fields must be strings';
  END IF;
  IF jsonb_array_length(p_reviewed_data->'class'->'weekdays')
     <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_reviewed_data->'class'->'weekdays') day(value)) THEN
    RAISE EXCEPTION 'Class weekdays cannot be duplicated';
  END IF;
  SELECT coalesce(array_agg(canonical.day ORDER BY canonical.position), ARRAY[]::text[])
    INTO v_weekdays
    FROM unnest(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[])
      WITH ORDINALITY canonical(day, position)
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_reviewed_data->'class'->'weekdays') selected(value)
      WHERE selected.value = canonical.day
    );

  v_start_time := coalesce(p_reviewed_data->'class'->>'startTime', '');
  v_end_time := coalesce(p_reviewed_data->'class'->>'endTime', '');
  v_start_date := coalesce(p_reviewed_data->'class'->>'semesterStartDate', '');
  v_end_date := coalesce(p_reviewed_data->'class'->>'semesterEndDate', '');
  IF (v_start_time <> '' AND v_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     OR (v_end_time <> '' AND v_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     OR (v_end_time <> '' AND v_start_time = '')
     OR ((v_start_time <> '' OR v_end_time <> '') AND cardinality(v_weekdays) = 0)
     OR (cardinality(v_weekdays) > 0 AND (v_start_time = '' OR v_start_date = '' OR v_end_date = ''))
     OR (v_start_date <> '' AND v_start_date !~ '^\d{4}-\d{2}-\d{2}$')
     OR (v_end_date <> '' AND v_end_date !~ '^\d{4}-\d{2}-\d{2}$') THEN
    RAISE EXCEPTION 'Class meeting schedule is incomplete or invalid';
  END IF;
  IF v_start_time <> '' AND v_end_time <> '' AND v_start_time >= v_end_time THEN
    RAISE EXCEPTION 'Class end time must be after its start time';
  END IF;
  IF v_start_date <> '' THEN PERFORM v_start_date::date; END IF;
  IF v_end_date <> '' THEN PERFORM v_end_date::date; END IF;
  IF v_start_date <> '' AND v_end_date <> '' AND v_start_date::date > v_end_date::date THEN
    RAISE EXCEPTION 'Semester end date must be on or after its start date';
  END IF;

  SELECT * INTO v_previous FROM public.class_syllabi
    WHERE class_id = p_class_id AND archived_at IS NULL
    FOR UPDATE;
  IF FOUND AND v_previous.content_hash = p_content_hash
     AND v_previous.reviewed_data = p_reviewed_data THEN
    v_result := jsonb_build_object(
      'syllabusId', v_previous.id,
      'revision', v_previous.revision,
      'noOp', true,
      'retry', false,
      'cleanupPath', CASE WHEN p_storage_path IS DISTINCT FROM v_previous.storage_path
        THEN p_storage_path ELSE NULL END
    );
    INSERT INTO public.class_syllabus_requests (
      user_id, request_id, class_id, client_class_id, storage_path, original_name,
      mime_type, size_bytes, content_hash, parsed_data, reviewed_data, syllabus_id, result
    ) VALUES (
      v_user_id, p_request_id, p_class_id, p_client_class_id, p_storage_path, p_original_name,
      p_mime_type, p_size_bytes, p_content_hash, p_parsed_data, p_reviewed_data, v_previous.id, v_result
    );
    RETURN v_result;
  END IF;

  SELECT coalesce(max(revision), 0) + 1 INTO v_revision
    FROM public.class_syllabi
    WHERE class_id = p_class_id;
  IF v_previous.id IS NOT NULL THEN
    UPDATE public.class_syllabi SET archived_at = now() WHERE id = v_previous.id;
  END IF;
  INSERT INTO public.class_syllabi (
    user_id, class_id, client_class_id, revision, request_id, storage_path,
    original_name, mime_type, size_bytes, content_hash, parsed_data, reviewed_data
  ) VALUES (
    v_user_id, p_class_id, p_client_class_id, v_revision, p_request_id, p_storage_path,
    btrim(p_original_name), p_mime_type, p_size_bytes, p_content_hash, p_parsed_data, p_reviewed_data
  ) RETURNING * INTO v_syllabus;

  -- Student edits to source title/date become manual rows before reconciliation,
  -- so the import never silently overwrites their work.
  UPDATE public.assignments
  SET source = 'manual', syllabus_id = NULL, external_id = NULL,
      source_url = NULL, source_updated_at = NULL, source_due_at = NULL,
      source_archived_at = NULL,
      meta = (meta - 'source' - 'source_key' - 'syllabus_title' - 'syllabus_due_date')
        || jsonb_build_object('detached_from_syllabus_at', now())
  WHERE user_id = v_user_id AND class_id = p_class_id
    AND source = 'syllabus' AND source_archived_at IS NULL
    AND (
      meta->>'syllabus_title' IS DISTINCT FROM title
      OR meta->>'syllabus_due_date' IS DISTINCT FROM coalesce(due_date::text, '')
    );
  UPDATE public.exams
  SET source = 'manual', syllabus_id = NULL, external_id = NULL,
      source_url = NULL, source_updated_at = NULL, source_due_at = NULL,
      source_archived_at = NULL,
      meta = (meta - 'source' - 'source_key' - 'syllabus_title' - 'syllabus_exam_date')
        || jsonb_build_object('detached_from_syllabus_at', now())
  WHERE user_id = v_user_id AND class_id = p_class_id
    AND source = 'syllabus' AND source_archived_at IS NULL
    AND (
      meta->>'syllabus_title' IS DISTINCT FROM title
      OR meta->>'syllabus_exam_date' IS DISTINCT FROM coalesce(exam_date::text, '')
    );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reviewed_data->'assignments') LOOP
    IF NOT (v_item->>'included')::boolean THEN CONTINUE; END IF;
    v_external_id := concat('syllabus:', p_class_id, ':assignment:', v_item->>'key');
    SELECT * INTO v_existing_assignment FROM public.assignments
      WHERE user_id = v_user_id AND class_id = p_class_id
        AND source = 'syllabus' AND external_id = v_external_id
        AND meta->>'syllabus_title' = title
        AND meta->>'syllabus_due_date' = coalesce(due_date::text, '')
      FOR UPDATE;
    IF NOT FOUND THEN
      SELECT candidate.* INTO v_existing_assignment
      FROM public.assignments candidate
      WHERE candidate.user_id = v_user_id
        AND candidate.class_id = p_class_id
        AND candidate.source = 'syllabus'
        AND candidate.source_archived_at IS NULL
        AND regexp_replace(lower(btrim(candidate.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
          = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
        AND (
          (
            candidate.meta->>'syllabus_due_date' = v_item->>'dueDate'
            AND (
              SELECT count(*) FROM public.assignments sibling
              WHERE sibling.user_id = v_user_id
                AND sibling.class_id = p_class_id
                AND sibling.source = 'syllabus'
                AND sibling.source_archived_at IS NULL
                AND regexp_replace(lower(btrim(sibling.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
                AND sibling.meta->>'syllabus_due_date' = v_item->>'dueDate'
            ) = 1
            AND (
              SELECT count(*) FROM jsonb_array_elements(p_reviewed_data->'assignments') incoming
              WHERE (incoming->>'included')::boolean
                AND regexp_replace(lower(btrim(incoming->>'title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
                AND incoming->>'dueDate' = v_item->>'dueDate'
            ) = 1
          )
          OR (
            (
              SELECT count(*) FROM public.assignments sibling
              WHERE sibling.user_id = v_user_id
                AND sibling.class_id = p_class_id
                AND sibling.source = 'syllabus'
                AND sibling.source_archived_at IS NULL
                AND regexp_replace(lower(btrim(sibling.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
            ) = 1
            AND (
              SELECT count(*) FROM jsonb_array_elements(p_reviewed_data->'assignments') incoming
              WHERE (incoming->>'included')::boolean
                AND regexp_replace(lower(btrim(incoming->>'title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
            ) = 1
          )
        )
      FOR UPDATE;
    END IF;
    IF FOUND THEN
      UPDATE public.assignments
      SET class_id = p_class_id, client_class_id = p_client_class_id,
          syllabus_id = v_syllabus.id, title = btrim(v_item->>'title'),
          due_date = (v_item->>'dueDate')::date,
          source_updated_at = now(), source_due_at = ((v_item->>'dueDate') || 'T12:00:00Z')::timestamptz,
          external_id = v_external_id, source_archived_at = NULL,
          meta = meta || jsonb_build_object(
            'source', 'syllabus', 'source_key', v_item->>'key',
            'syllabus_title', btrim(v_item->>'title'),
            'syllabus_due_date', v_item->>'dueDate'
          )
      WHERE id = v_existing_assignment.id;
    ELSE
      INSERT INTO public.assignments (
        user_id, class_id, client_class_id, syllabus_id, title, due_date,
        source, external_id, source_updated_at, source_due_at, meta
      ) VALUES (
        v_user_id, p_class_id, p_client_class_id, v_syllabus.id,
        btrim(v_item->>'title'), (v_item->>'dueDate')::date,
        'syllabus', v_external_id, now(), ((v_item->>'dueDate') || 'T12:00:00Z')::timestamptz,
        jsonb_build_object(
          'source', 'syllabus', 'source_key', v_item->>'key',
          'syllabus_title', btrim(v_item->>'title'),
          'syllabus_due_date', v_item->>'dueDate'
        )
      );
    END IF;
  END LOOP;

  UPDATE public.assignments AS deadline_row
  SET source_archived_at = now(), source_updated_at = now()
  WHERE deadline_row.user_id = v_user_id AND deadline_row.class_id = p_class_id
    AND deadline_row.source = 'syllabus' AND deadline_row.source_archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_reviewed_data->'assignments') item
      WHERE (item->>'included')::boolean
        AND deadline_row.external_id = concat('syllabus:', p_class_id, ':assignment:', item->>'key')
    );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reviewed_data->'exams') LOOP
    IF NOT (v_item->>'included')::boolean THEN CONTINUE; END IF;
    v_external_id := concat('syllabus:', p_class_id, ':exam:', v_item->>'key');
    SELECT * INTO v_existing_exam FROM public.exams
      WHERE user_id = v_user_id AND class_id = p_class_id
        AND source = 'syllabus' AND external_id = v_external_id
        AND meta->>'syllabus_title' = title
        AND meta->>'syllabus_exam_date' = coalesce(exam_date::text, '')
      FOR UPDATE;
    IF NOT FOUND THEN
      SELECT candidate.* INTO v_existing_exam
      FROM public.exams candidate
      WHERE candidate.user_id = v_user_id
        AND candidate.class_id = p_class_id
        AND candidate.source = 'syllabus'
        AND candidate.source_archived_at IS NULL
        AND regexp_replace(lower(btrim(candidate.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
          = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
        AND (
          (
            candidate.meta->>'syllabus_exam_date' = v_item->>'examDate'
            AND (
              SELECT count(*) FROM public.exams sibling
              WHERE sibling.user_id = v_user_id
                AND sibling.class_id = p_class_id
                AND sibling.source = 'syllabus'
                AND sibling.source_archived_at IS NULL
                AND regexp_replace(lower(btrim(sibling.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
                AND sibling.meta->>'syllabus_exam_date' = v_item->>'examDate'
            ) = 1
            AND (
              SELECT count(*) FROM jsonb_array_elements(p_reviewed_data->'exams') incoming
              WHERE (incoming->>'included')::boolean
                AND regexp_replace(lower(btrim(incoming->>'title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
                AND incoming->>'examDate' = v_item->>'examDate'
            ) = 1
          )
          OR (
            (
              SELECT count(*) FROM public.exams sibling
              WHERE sibling.user_id = v_user_id
                AND sibling.class_id = p_class_id
                AND sibling.source = 'syllabus'
                AND sibling.source_archived_at IS NULL
                AND regexp_replace(lower(btrim(sibling.meta->>'syllabus_title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
            ) = 1
            AND (
              SELECT count(*) FROM jsonb_array_elements(p_reviewed_data->'exams') incoming
              WHERE (incoming->>'included')::boolean
                AND regexp_replace(lower(btrim(incoming->>'title')), '[[:space:]]+', ' ', 'g')
                  = regexp_replace(lower(btrim(v_item->>'title')), '[[:space:]]+', ' ', 'g')
            ) = 1
          )
        )
      FOR UPDATE;
    END IF;
    IF FOUND THEN
      UPDATE public.exams
      SET class_id = p_class_id, client_class_id = p_client_class_id,
          syllabus_id = v_syllabus.id, title = btrim(v_item->>'title'),
          exam_date = (v_item->>'examDate')::date,
          topics = ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item->'topics', '[]'::jsonb))),
          source_updated_at = now(), source_due_at = ((v_item->>'examDate') || 'T12:00:00Z')::timestamptz,
          external_id = v_external_id, source_archived_at = NULL,
          meta = meta || jsonb_build_object(
            'source', 'syllabus', 'source_key', v_item->>'key',
            'syllabus_title', btrim(v_item->>'title'),
            'syllabus_exam_date', v_item->>'examDate',
            'syllabus_topics', coalesce(v_item->'topics', '[]'::jsonb)
          )
      WHERE id = v_existing_exam.id;
    ELSE
      INSERT INTO public.exams (
        user_id, class_id, client_class_id, syllabus_id, title, exam_date, topics,
        source, external_id, source_updated_at, source_due_at, meta
      ) VALUES (
        v_user_id, p_class_id, p_client_class_id, v_syllabus.id,
        btrim(v_item->>'title'), (v_item->>'examDate')::date,
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item->'topics', '[]'::jsonb))),
        'syllabus', v_external_id, now(), ((v_item->>'examDate') || 'T12:00:00Z')::timestamptz,
        jsonb_build_object(
          'source', 'syllabus', 'source_key', v_item->>'key',
          'syllabus_title', btrim(v_item->>'title'),
          'syllabus_exam_date', v_item->>'examDate',
          'syllabus_topics', coalesce(v_item->'topics', '[]'::jsonb)
        )
      );
    END IF;
  END LOOP;

  UPDATE public.exams AS deadline_row
  SET source_archived_at = now(), source_updated_at = now()
  WHERE deadline_row.user_id = v_user_id AND deadline_row.class_id = p_class_id
    AND deadline_row.source = 'syllabus' AND deadline_row.source_archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_reviewed_data->'exams') item
      WHERE (item->>'included')::boolean
        AND deadline_row.external_id = concat('syllabus:', p_class_id, ':exam:', item->>'key')
    );

  SELECT coalesce(jsonb_agg(existing_item), '[]'::jsonb)
  INTO v_schedule
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_class.meta->'schedule') = 'array'
      THEN v_class.meta->'schedule'
      ELSE '[]'::jsonb
    END
  ) existing_item
  WHERE coalesce(existing_item->>'source', '') <> 'syllabus';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', item->>'date',
    'topic', btrim(item->>'topic'),
    'dueItems', coalesce(item->'dueItems', '[]'::jsonb),
    'source', 'syllabus',
    'sourceKey', item->>'key',
    'syllabusId', v_syllabus.id
  ) ORDER BY item->>'date'), '[]'::jsonb)
  INTO v_new_schedule
  FROM jsonb_array_elements(p_reviewed_data->'schedule') item
  WHERE (item->>'included')::boolean;
  v_schedule := v_schedule || v_new_schedule;

  UPDATE public.classes
  SET weekdays = v_weekdays,
      start_time = nullif(v_start_time, '')::time,
      end_time = nullif(v_end_time, '')::time,
      term = nullif(btrim(coalesce(p_reviewed_data->'class'->>'term', '')), ''),
      semester_start_date = nullif(v_start_date, '')::date,
      semester_end_date = nullif(v_end_date, '')::date,
      meta = jsonb_set(
        jsonb_set(coalesce(meta, '{}'::jsonb), '{schedule}', v_schedule, true),
        '{syllabus}', jsonb_build_object(
          'activeSyllabusId', v_syllabus.id,
          'revision', v_syllabus.revision,
          'reviewedAt', now()
        ), true
      )
  WHERE id = p_class_id AND user_id = v_user_id;

  v_result := jsonb_build_object(
    'syllabusId', v_syllabus.id,
    'revision', v_syllabus.revision,
    'noOp', false,
    'retry', false,
    'cleanupPath', NULL
  );
  INSERT INTO public.class_syllabus_requests (
    user_id, request_id, class_id, client_class_id, storage_path, original_name,
    mime_type, size_bytes, content_hash, parsed_data, reviewed_data, syllabus_id, result
  ) VALUES (
    v_user_id, p_request_id, p_class_id, p_client_class_id, p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, p_content_hash, p_parsed_data, p_reviewed_data, v_syllabus.id, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_class_syllabus(
  uuid, text, uuid, text, text, text, bigint, text, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_class_syllabus(
  uuid, text, uuid, text, text, text, bigint, text, jsonb, jsonb
) TO authenticated, service_role;

COMMENT ON TABLE public.class_syllabi IS
  'Private, immutable source revisions for one student-owned class; only one revision is active.';
COMMENT ON FUNCTION public.commit_class_syllabus(uuid, text, uuid, text, text, text, bigint, text, jsonb, jsonb) IS
  'Atomically commits one reviewed class-owned syllabus revision and reconciles only its syllabus deadlines.';
