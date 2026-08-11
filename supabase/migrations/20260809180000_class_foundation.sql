-- Class Foundation
-- Keep every existing compatibility key intact while normalizing the fields
-- needed to edit a class and bound recurring meetings to one semester.

ALTER TABLE public.classes
  ADD COLUMN term text,
  ADD COLUMN section text,
  ADD COLUMN semester_start_date date,
  ADD COLUMN semester_end_date date,
  ADD COLUMN weekdays text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN start_time time without time zone,
  ADD COLUMN end_time time without time zone,
  ADD COLUMN time_zone text;

-- Older rows can legitimately have no compatibility key. Use their durable
-- database UUID without changing any key that child records already reference.
UPDATE public.classes
SET client_class_id = id::text
WHERE client_class_id IS NULL OR btrim(client_class_id) = '';

UPDATE public.classes
SET
  term = coalesce(term, NULLIF(btrim(meta->>'term'), '')),
  section = coalesce(section, NULLIF(btrim(meta->>'section'), ''))
WHERE term IS NULL OR section IS NULL;

-- Backfill canonical weekdays only. Invalid legacy values stay in meta so the
-- migration cannot lose information and the editor can correct them later.
UPDATE public.classes AS class_row
SET weekdays = (
  SELECT coalesce(array_agg(canonical.day ORDER BY canonical.position), ARRAY[]::text[])
  FROM unnest(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[])
    WITH ORDINALITY AS canonical(day, position)
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(class_row.meta->'days') AS legacy(value)
    WHERE legacy.value = canonical.day
  )
)
WHERE cardinality(class_row.weekdays) = 0
  AND jsonb_typeof(class_row.meta->'days') = 'array';

ALTER TABLE public.classes
  ALTER COLUMN client_class_id SET NOT NULL,
  ADD CONSTRAINT classes_semester_date_order
    CHECK (
      semester_start_date IS NULL
      OR semester_end_date IS NULL
      OR semester_start_date <= semester_end_date
    ),
  ADD CONSTRAINT classes_weekdays_valid
    CHECK (weekdays <@ ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[]),
  ADD CONSTRAINT classes_meeting_time_order
    CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time);

CREATE OR REPLACE FUNCTION public.preserve_class_client_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.client_class_id IS NULL OR btrim(NEW.client_class_id) = '' THEN
      NEW.client_class_id := NEW.id::text;
    END IF;
  ELSIF NEW.client_class_id IS DISTINCT FROM OLD.client_class_id THEN
    RAISE EXCEPTION 'client_class_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_preserve_client_identity ON public.classes;
CREATE TRIGGER classes_preserve_client_identity
BEFORE INSERT OR UPDATE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.preserve_class_client_identity();

REVOKE EXECUTE ON FUNCTION public.preserve_class_client_identity()
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.classes.client_class_id IS
  'Immutable compatibility key used by existing routes and child records; new manual classes use classes.id::text.';
COMMENT ON COLUMN public.classes.weekdays IS
  'Canonical Monday-first meeting weekdays for the primary class meeting block.';
COMMENT ON COLUMN public.classes.time_zone IS
  'IANA time zone captured when a student saves the class schedule.';
