-- POST-WORKER DRAIN PREREQUISITE
--
-- Pause capture ingestion/processing, artifact generation and study-result
-- writes, then apply this migration only after every pre-release invocation has
-- drained. Keep that write quiescence in place through 20260827130000. Old
-- workers relied on the compatibility mirror; all workers in the new release
-- write concept_capture_evidence explicitly. This migration must commit before
-- 20260827130000 acquires the capture-first reconciliation locks, avoiding a
-- concept-lock -> mirror -> capture-lock cycle.

drop trigger if exists concept_primary_capture_evidence_mirror on public.concepts;
drop function if exists public.mirror_concept_primary_capture_evidence();
