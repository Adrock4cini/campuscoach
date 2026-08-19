-- A mobile client may lose a successful response and retry the same retained
-- capture draft. Stable client operation ids make those retries converge on
-- one capture, one set of pages, and one signal instead of duplicating work.

BEGIN;

-- Preserve any historical duplicate rows, but retire duplicate local markers
-- before enforcing the invariant for new writes.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, local_id
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.captures
  WHERE local_id IS NOT NULL
)
UPDATE public.captures AS capture
SET local_id = NULL
FROM ranked
WHERE capture.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS captures_owner_local_id_unique
  ON public.captures(user_id, local_id);

-- The old partial page index cannot be inferred by PostgREST's ON CONFLICT
-- clause. A regular unique index still permits multiple NULL values and makes
-- per-page upserts retry-safe.
DROP INDEX IF EXISTS public.materials_capture_page_idx;
CREATE UNIQUE INDEX IF NOT EXISTS materials_capture_page_unique
  ON public.materials(capture_id, page_index);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, source_type, source_id
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.campus_brain_signals
  WHERE source_id IS NOT NULL
)
UPDATE public.campus_brain_signals AS signal
SET source_id = NULL
FROM ranked
WHERE signal.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS campus_brain_signal_source_unique
  ON public.campus_brain_signals(user_id, source_type, source_id);

-- Only capture-generated topic signals use their source id as a durable
-- operation key. Other study flows may intentionally reuse a source label.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, source_type, source_id
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.topic_signals
  WHERE source_type LIKE 'capture:%'
    AND source_id IS NOT NULL
)
UPDATE public.topic_signals AS signal
SET source_id = NULL
FROM ranked
WHERE signal.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS topic_signal_capture_source_unique
  ON public.topic_signals(user_id, source_type, source_id)
  WHERE source_type LIKE 'capture:%' AND source_id IS NOT NULL;

COMMIT;
