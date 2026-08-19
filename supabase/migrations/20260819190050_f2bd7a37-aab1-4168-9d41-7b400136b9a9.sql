BEGIN;

-- Accounts that already had durable classes before onboarding gained its
-- explicit completion marker are established users. Backfill them once so the
-- client can stop treating a partially written first class as proof that a new
-- setup completed.
UPDATE public.profiles AS profile
SET onboarded_at = now()
WHERE profile.onboarded_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.classes AS course
    WHERE course.user_id = profile.user_id
      AND course.source_archived_at IS NULL
  );

COMMIT;