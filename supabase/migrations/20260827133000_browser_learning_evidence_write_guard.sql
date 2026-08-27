-- Close the remaining direct authenticated-browser write boundaries for
-- student learning evidence. Existing permissive policies continue to define
-- the owner/write-shape branch; these restrictive policies compose the
-- current family-beta agreement and lock-coordinated maintenance pause with
-- every otherwise-valid write below. Service-role Edge/recovery writes remain
-- outside these authenticated-only policies.

BEGIN;

DROP POLICY IF EXISTS study_strategy_outcomes_launch_insert_guard
  ON public.study_strategy_outcomes;
CREATE POLICY study_strategy_outcomes_launch_insert_guard
  ON public.study_strategy_outcomes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND outcome_source = 'feedback'
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS topic_signals_launch_insert_guard
  ON public.topic_signals;
CREATE POLICY topic_signals_launch_insert_guard
  ON public.topic_signals AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS topic_signals_launch_update_guard
  ON public.topic_signals;
CREATE POLICY topic_signals_launch_update_guard
  ON public.topic_signals AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS exam_debriefs_launch_insert_guard
  ON public.exam_debriefs;
CREATE POLICY exam_debriefs_launch_insert_guard
  ON public.exam_debriefs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS exam_debriefs_launch_update_guard
  ON public.exam_debriefs;
CREATE POLICY exam_debriefs_launch_update_guard
  ON public.exam_debriefs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

-- Campus Brain uses browser UPSERT for idempotent capture/session signals, so
-- guard both the INSERT branch and the conflict-driven UPDATE branch.
DROP POLICY IF EXISTS campus_brain_signals_launch_insert_guard
  ON public.campus_brain_signals;
CREATE POLICY campus_brain_signals_launch_insert_guard
  ON public.campus_brain_signals AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS campus_brain_signals_launch_update_guard
  ON public.campus_brain_signals;
CREATE POLICY campus_brain_signals_launch_update_guard
  ON public.campus_brain_signals AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

COMMENT ON POLICY study_strategy_outcomes_launch_insert_guard
  ON public.study_strategy_outcomes IS
  'Authenticated feedback inserts require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY topic_signals_launch_insert_guard
  ON public.topic_signals IS
  'Authenticated topic-signal inserts require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY topic_signals_launch_update_guard
  ON public.topic_signals IS
  'Authenticated topic-signal updates require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY exam_debriefs_launch_insert_guard
  ON public.exam_debriefs IS
  'Authenticated exam-debrief inserts require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY exam_debriefs_launch_update_guard
  ON public.exam_debriefs IS
  'Authenticated exam-debrief updates require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY campus_brain_signals_launch_insert_guard
  ON public.campus_brain_signals IS
  'Authenticated Campus Brain signal inserts require ownership, the current family-beta agreement, and an open study-write gate.';
COMMENT ON POLICY campus_brain_signals_launch_update_guard
  ON public.campus_brain_signals IS
  'Authenticated Campus Brain signal upsert updates require ownership, the current family-beta agreement, and an open study-write gate.';

COMMIT;
