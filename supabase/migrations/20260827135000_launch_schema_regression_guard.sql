-- Repair final-schema regressions discovered by the blank-replay audit.
--
-- Keep one aggregate refresh trigger per source table and bind every strategy
-- outcome reference to the same owner as the outcome row. The ownership
-- trigger protects service-role projections as well as authenticated feedback
-- inserts, so a future policy change cannot reopen the cross-owner boundary.

BEGIN;

LOCK TABLE public.topic_signals,
  public.exam_debriefs,
  public.study_strategy_outcomes
  IN SHARE ROW EXCLUSIVE MODE;

-- Migration 20260506041844 replaced the aggregate refresh trigger names but
-- did not remove the original pair. Retain its current canonical trg_* pair.
DROP TRIGGER IF EXISTS topic_signals_recompute_scores
  ON public.topic_signals;
DROP TRIGGER IF EXISTS exam_debriefs_recompute_scores
  ON public.exam_debriefs;

-- Do not silently reinterpret or delete durable learning evidence. A drifted
-- environment must stop here for an operator-reviewed recovery.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.study_strategy_outcomes outcome
    JOIN public.classes class
      ON class.id = outcome.class_id
    WHERE class.user_id IS DISTINCT FROM outcome.user_id
  ) THEN
    RAISE EXCEPTION
      'study_strategy_outcomes contains a class_id owned by another user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.study_strategy_outcomes outcome
    JOIN public.learning_artifacts artifact
      ON artifact.id = outcome.artifact_id
    WHERE artifact.user_id IS DISTINCT FROM outcome.user_id
  ) THEN
    RAISE EXCEPTION
      'study_strategy_outcomes contains an artifact_id owned by another user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_strategy_outcome_owner_boundaries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.class_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.classes class
       WHERE class.id = NEW.class_id
         AND class.user_id = NEW.user_id
       FOR KEY SHARE
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'study strategy outcome class must belong to the outcome owner';
  END IF;

  IF NEW.artifact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.learning_artifacts artifact
       WHERE artifact.id = NEW.artifact_id
         AND artifact.user_id = NEW.user_id
       FOR KEY SHARE
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'study strategy outcome artifact must belong to the outcome owner';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.enforce_strategy_outcome_owner_boundaries()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS study_strategy_outcomes_enforce_owner_boundaries
  ON public.study_strategy_outcomes;
CREATE TRIGGER study_strategy_outcomes_enforce_owner_boundaries
BEFORE INSERT OR UPDATE OF user_id, class_id, artifact_id
ON public.study_strategy_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_strategy_outcome_owner_boundaries();

-- Keep the browser-facing policy independently explicit. The trigger remains
-- authoritative for browser and service-role writes alike.
DROP POLICY IF EXISTS "Owners record their own strategy outcomes"
  ON public.study_strategy_outcomes;
CREATE POLICY "Owners record their own strategy outcomes"
  ON public.study_strategy_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND outcome_source = 'feedback'
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = study_strategy_outcomes.class_id
          AND class.user_id = study_strategy_outcomes.user_id
      )
    )
    AND (
      artifact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.learning_artifacts artifact
        WHERE artifact.id = study_strategy_outcomes.artifact_id
          AND artifact.user_id = study_strategy_outcomes.user_id
      )
    )
  );

COMMENT ON FUNCTION public.enforce_strategy_outcome_owner_boundaries() IS
  'Rejects class or artifact references that are not owned by the strategy-outcome owner.';

COMMENT ON POLICY "Owners record their own strategy outcomes"
  ON public.study_strategy_outcomes IS
  'Authenticated feedback can reference only classes and artifacts owned by the same student.';

COMMIT;
