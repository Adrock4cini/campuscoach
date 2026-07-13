-- Add unique constraint required by onboarding upsert (onConflict: "client_class_id")
-- Scoped per-user so multiple students can independently own the same slug.
ALTER TABLE public.classes
  ADD CONSTRAINT classes_user_client_class_id_unique
  UNIQUE (user_id, client_class_id);
