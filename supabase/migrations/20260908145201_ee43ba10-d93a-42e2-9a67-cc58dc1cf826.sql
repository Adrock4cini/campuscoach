ALTER TABLE public.study_memory_feedback
  DROP CONSTRAINT IF EXISTS study_memory_feedback_technique_check;
ALTER TABLE public.study_memory_feedback
  ADD CONSTRAINT study_memory_feedback_technique_check CHECK (
    technique IN (
      'acronym','acrostic','first_letter_sentence','word_roots','sound_alike',
      'phonetic_bridge','familiar_bridge','visual','story','chunking','body_map',
      'compare_contrast','rhyme','number_shape','worked_example','association','other'
    )
  );

COMMENT ON CONSTRAINT study_memory_feedback_technique_check
  ON public.study_memory_feedback IS
  'Matches the canonical mnemonic technique catalog used by generate-artifact.';

CREATE OR REPLACE FUNCTION public.record_memory_trick_feedback(
  p_artifact_id uuid,
  p_concept_id uuid,
  p_technique text,
  p_helpful boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_technique NOT IN (
    'acronym','acrostic','first_letter_sentence','word_roots','sound_alike',
    'phonetic_bridge','familiar_bridge','visual','story','chunking','body_map',
    'compare_contrast','rhyme','number_shape','worked_example','association','other'
  ) THEN
    RAISE EXCEPTION 'Invalid memory technique';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.learning_artifacts artifact
    JOIN public.concepts concept
      ON concept.id = p_concept_id
     AND concept.user_id = v_user_id
    WHERE artifact.id = p_artifact_id
      AND artifact.user_id = v_user_id
      AND artifact.kind = 'mnemonic'
      AND artifact.stale IS FALSE
      AND p_concept_id = ANY(artifact.concept_ids)
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(artifact.payload -> 'items', '[]'::jsonb)) item
        WHERE item ->> 'conceptId' = p_concept_id::text
          AND item ->> 'technique' = p_technique
      )
  ) THEN
    RAISE EXCEPTION 'Memory trick does not match this concept';
  END IF;

  INSERT INTO public.study_memory_feedback (
    user_id, artifact_id, concept_id, technique, helpful
  ) VALUES (
    v_user_id, p_artifact_id, p_concept_id, p_technique, p_helpful
  )
  ON CONFLICT (user_id, artifact_id, concept_id) DO UPDATE SET
    technique = excluded.technique,
    helpful = excluded.helpful,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  TO authenticated, service_role;