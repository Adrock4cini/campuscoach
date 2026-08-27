-- Exact browser-capture retries may repair a mock processed row after a lost
-- response, but concurrent retries must never append duplicate derived rows.

BEGIN;

LOCK TABLE public.captures, public.processed_content
  IN SHARE ROW EXCLUSIVE MODE;

-- The prototype's owner RLS checked only processed_content.user_id. Without a
-- database relationship tying that owner to capture.user_id, one student could
-- reserve another student's (capture_id, fingerprint) before the owner retried.
-- Stop rather than grandfathering any such row before installing the global
-- request-fingerprint uniqueness boundary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.processed_content processed
    LEFT JOIN public.captures capture
      ON capture.id = processed.capture_id
    WHERE processed.capture_id IS NOT NULL
      AND (
        capture.id IS NULL
        OR capture.user_id IS DISTINCT FROM processed.user_id
      )
  ) THEN
    RAISE EXCEPTION USING
      errcode = '23514',
      message = 'Cross-owner processed capture rows must be remediated before capture retry lockdown';
  END IF;
END;
$$;

ALTER TABLE public.captures
  ADD CONSTRAINT captures_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.processed_content
  DROP CONSTRAINT processed_content_capture_id_fkey,
  ADD CONSTRAINT processed_content_capture_owner_fkey
    FOREIGN KEY (capture_id, user_id)
    REFERENCES public.captures(id, user_id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS processed_content_capture_request_unique
  ON public.processed_content(capture_id, model)
  WHERE model ~ '^mock-v1:[0-9a-f]{64}$';

COMMENT ON INDEX public.processed_content_capture_request_unique IS
  'One browser-derived mock result per immutable capture request fingerprint; server OCR models remain unaffected.';

COMMIT;
