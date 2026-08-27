-- A client class id is a compatibility key inside one student's roster, not a
-- globally reserved course id. Preserve the owner-scoped identity required by
-- onboarding retries before removing the accidental global constraint.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.classes'::regclass
      AND conname = 'classes_user_client_class_id_unique'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_user_client_class_id_unique
      UNIQUE (user_id, client_class_id);
  END IF;
END;
$$;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_client_class_id_unique;

COMMENT ON CONSTRAINT classes_user_client_class_id_unique ON public.classes IS
  'A compatibility class key is unique within one student roster; different students may use the same client key.';

COMMIT;
