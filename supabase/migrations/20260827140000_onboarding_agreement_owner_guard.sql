-- Close the remaining authenticated-browser onboarding boundaries.
--
-- The route gate already requires the current durable family-beta agreement,
-- but profiles, rosters, deadlines, and study history are also direct PostgREST
-- write surfaces. Restrictive policies make that requirement authoritative in
-- the database; unused v0 artifact tables become browser-read-only. The owner-
-- reference triggers prevent a row owned by one student from pointing at
-- another student's class or client identity, including service-role writes.

BEGIN;

LOCK TABLE public.schools,
  public.profiles,
  public.classes,
  public.class_syllabi,
  public.class_syllabus_requests,
  public.enrollments,
  public.assignments,
  public.exams,
  public.flashcards,
  public.quizzes,
  public.study_sessions,
  public.readiness_scores,
  public.study_memory_feedback
  IN SHARE ROW EXCLUSIVE MODE;

-- Do not reinterpret or delete existing student data. A drifted environment
-- must stop for an operator-reviewed repair before the invariant is installed.
DO $$
DECLARE
  v_child_table text;
  v_has_invalid_reference boolean;
BEGIN
  FOREACH v_child_table IN ARRAY ARRAY[
    'enrollments',
    'assignments',
    'exams',
    'flashcards',
    'quizzes',
    'study_sessions',
    'readiness_scores',
    'class_syllabus_requests'
  ] LOOP
    EXECUTE pg_catalog.format(
      $query$
        SELECT EXISTS (
          SELECT 1
          FROM public.%I child
          LEFT JOIN public.classes roster_class
            ON roster_class.id = child.class_id
          WHERE child.class_id IS NOT NULL
            AND (
              roster_class.id IS NULL
              OR roster_class.user_id IS DISTINCT FROM child.user_id
              OR (
                pg_catalog.to_jsonb(child)->>'client_class_id' IS NOT NULL
                AND roster_class.client_class_id IS DISTINCT FROM
                  pg_catalog.to_jsonb(child)->>'client_class_id'
              )
            )
        )
      $query$,
      v_child_table
    ) INTO v_has_invalid_reference;

    IF v_has_invalid_reference THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = pg_catalog.format(
          '%s contains an invalid owner/class/client identity',
          v_child_table
        );
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.class_syllabus_requests request
    LEFT JOIN public.class_syllabi syllabus
      ON syllabus.id = request.syllabus_id
    WHERE request.syllabus_id IS NOT NULL
      AND (
        syllabus.id IS NULL
        OR syllabus.user_id IS DISTINCT FROM request.user_id
        OR syllabus.class_id IS DISTINCT FROM request.class_id
        OR syllabus.client_class_id IS DISTINCT FROM request.client_class_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'class_syllabus_requests contains a mismatched syllabus identity';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_owned_class_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.class_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.classes roster_class
       WHERE roster_class.id = NEW.class_id
         AND roster_class.user_id = NEW.user_id
         AND (
           pg_catalog.to_jsonb(NEW)->>'client_class_id' IS NULL
           OR roster_class.client_class_id IS NOT DISTINCT FROM
             pg_catalog.to_jsonb(NEW)->>'client_class_id'
         )
       FOR KEY SHARE
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('%s class must belong to the row owner', TG_TABLE_NAME);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_syllabus_request_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.syllabus_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.class_syllabi syllabus
       WHERE syllabus.id = NEW.syllabus_id
         AND syllabus.user_id = NEW.user_id
         AND syllabus.class_id = NEW.class_id
         AND syllabus.client_class_id = NEW.client_class_id
       FOR KEY SHARE
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'class syllabus request must reference its own class syllabus';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_class_owner_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'class ownership is immutable';
  END IF;

  IF NEW.client_class_id IS DISTINCT FROM OLD.client_class_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'class client identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;

-- Restrictive RLS is authoritative for direct PostgREST writes, but a
-- SECURITY DEFINER RPC runs as its owner and can bypass table RLS. Keep the
-- same agreement boundary at the row trigger layer whenever the request still
-- carries an Auth subject. SECURITY DEFINER makes current_user the function
-- owner, so it is not evidence that the caller is trusted. Use the verified JWT
-- role for API traffic and SESSION_USER only for a short direct-SQL operator
-- allowlist; an anon request with auth.uid() = NULL must never inherit trust.
CREATE OR REPLACE FUNCTION public.enforce_family_beta_write_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_jwt_role text := NULLIF(auth.role(), '');
  v_session_role text := SESSION_USER;
BEGIN
  -- Deleting an owned class legitimately invokes these ON DELETE SET NULL
  -- actions as nested UPDATE triggers. Require the referenced class to already
  -- be gone and every other field to be byte-for-byte equivalent, so trigger
  -- depth alone cannot turn an arbitrary nested UPDATE into a bypass.
  IF TG_OP = 'UPDATE'
     AND pg_catalog.pg_trigger_depth() > 1
     AND TG_TABLE_NAME IN (
       'assignments',
       'exams',
       'flashcards',
       'quizzes',
       'study_sessions'
     ) THEN
    IF pg_catalog.to_jsonb(OLD)->>'class_id' IS NOT NULL
       AND pg_catalog.to_jsonb(NEW)->>'class_id' IS NULL
       AND pg_catalog.to_jsonb(NEW)->>'user_id'
         IS NOT DISTINCT FROM pg_catalog.to_jsonb(OLD)->>'user_id'
       AND (pg_catalog.to_jsonb(NEW) - 'class_id')
         IS NOT DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'class_id')
       AND NOT EXISTS (
         SELECT 1
         FROM public.classes roster_class
         WHERE roster_class.id =
           (pg_catalog.to_jsonb(OLD)->>'class_id')::uuid
       ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Service-key API work and direct operator recovery remain available. Do not
  -- use auth.uid() IS NULL here: both anon JWTs and direct SQL sessions have no
  -- subject, and treating them alike would reopen the browser boundary.
  IF v_jwt_role = 'service_role'
     OR (
       v_jwt_role IS NULL
       AND v_session_role IN ('postgres', 'supabase_admin', 'service_role')
     ) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_current_family_beta_agreement() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Accept the current family beta agreement before continuing';
  END IF;

  -- This helper takes a shared row lock on the private pause singleton. Either
  -- the write drains first or the operator's pause wins first and this write
  -- fails; a SECURITY DEFINER caller cannot race around the handoff.
  IF NOT public.study_writes_are_available() THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'study_writes_paused';
  END IF;

  RETURN NEW;
END;
$$;

-- Artifact validation emits exactly these canonical technique ids. The original
-- feedback table/RPC predated nine of them, so a valid generated memory aid could
-- render but its Helpful/Try another signal would fail at the database boundary.
ALTER TABLE public.study_memory_feedback
  DROP CONSTRAINT IF EXISTS study_memory_feedback_technique_check;
ALTER TABLE public.study_memory_feedback
  ADD CONSTRAINT study_memory_feedback_technique_check CHECK (
    technique IN (
      'acronym',
      'acrostic',
      'first_letter_sentence',
      'word_roots',
      'sound_alike',
      'familiar_bridge',
      'visual',
      'story',
      'chunking',
      'body_map',
      'compare_contrast',
      'rhyme',
      'number_shape',
      'worked_example',
      'association',
      'other'
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
    'acronym',
    'acrostic',
    'first_letter_sentence',
    'word_roots',
    'sound_alike',
    'familiar_bridge',
    'visual',
    'story',
    'chunking',
    'body_map',
    'compare_contrast',
    'rhyme',
    'number_shape',
    'worked_example',
    'association',
    'other'
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
    user_id,
    artifact_id,
    concept_id,
    technique,
    helpful
  ) VALUES (
    v_user_id,
    p_artifact_id,
    p_concept_id,
    p_technique,
    p_helpful
  )
  ON CONFLICT (user_id, artifact_id, concept_id) DO UPDATE SET
    technique = excluded.technique,
    helpful = excluded.helpful,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_owned_class_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_syllabus_request_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_class_owner_reassignment()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_family_beta_write_boundary()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  TO authenticated, service_role;

-- These v0 artifact/readiness tables are not used by the launch client. Keep
-- historical SELECT compatibility, but close every browser mutation privilege
-- and remove the old write policies so a later grant cannot silently reactivate
-- them. Service-role projection and account-erasure privileges are unchanged.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.flashcards
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quizzes
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.readiness_scores
  FROM anon, authenticated;

DROP POLICY IF EXISTS flashcards_owner_insert ON public.flashcards;
DROP POLICY IF EXISTS flashcards_owner_update ON public.flashcards;
DROP POLICY IF EXISTS flashcards_owner_delete ON public.flashcards;
DROP POLICY IF EXISTS quizzes_owner_insert ON public.quizzes;
DROP POLICY IF EXISTS quizzes_owner_update ON public.quizzes;
DROP POLICY IF EXISTS quizzes_owner_delete ON public.quizzes;
DROP POLICY IF EXISTS readiness_owner_insert ON public.readiness_scores;
DROP POLICY IF EXISTS readiness_owner_update ON public.readiness_scores;
DROP POLICY IF EXISTS readiness_owner_delete ON public.readiness_scores;

-- Study history remains an authenticated launch-client write surface. Anonymous
-- mutation is not part of the closed Family Beta contract.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.study_sessions FROM anon;

DROP TRIGGER IF EXISTS profiles_enforce_current_agreement_write
  ON public.profiles;
CREATE TRIGGER profiles_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS schools_enforce_current_agreement_write
  ON public.schools;
CREATE TRIGGER schools_enforce_current_agreement_write
BEFORE INSERT
ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS classes_enforce_current_agreement_write
  ON public.classes;
CREATE TRIGGER classes_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS enrollments_enforce_current_agreement_write
  ON public.enrollments;
CREATE TRIGGER enrollments_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS assignments_enforce_current_agreement_write
  ON public.assignments;
CREATE TRIGGER assignments_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS exams_enforce_current_agreement_write
  ON public.exams;
CREATE TRIGGER exams_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.exams
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS study_sessions_enforce_current_agreement_write
  ON public.study_sessions;
CREATE TRIGGER study_sessions_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.study_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

-- commit_class_syllabus is an authenticated SECURITY DEFINER RPC. Every new
-- commit path touches one of these two tables before returning (an exact request
-- retry is read-only), so an unaccepted browser session cannot use the RPC to
-- persist data around the row guards.
DROP TRIGGER IF EXISTS class_syllabi_enforce_current_agreement_write
  ON public.class_syllabi;
CREATE TRIGGER class_syllabi_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.class_syllabi
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS class_syllabus_requests_enforce_current_agreement_write
  ON public.class_syllabus_requests;
CREATE TRIGGER class_syllabus_requests_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.class_syllabus_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

-- record_memory_trick_feedback is also an authenticated SECURITY DEFINER RPC.
-- Keep its upsert under the same receipt and lock-coordinated pause boundary.
DROP TRIGGER IF EXISTS study_memory_feedback_enforce_current_agreement_write
  ON public.study_memory_feedback;
CREATE TRIGGER study_memory_feedback_enforce_current_agreement_write
BEFORE INSERT OR UPDATE
ON public.study_memory_feedback
FOR EACH ROW
EXECUTE FUNCTION public.enforce_family_beta_write_boundary();

DROP TRIGGER IF EXISTS classes_owner_immutable
  ON public.classes;
CREATE TRIGGER classes_owner_immutable
BEFORE UPDATE OF user_id, client_class_id
ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.prevent_class_owner_reassignment();

DROP TRIGGER IF EXISTS enrollments_enforce_owned_class
  ON public.enrollments;
CREATE TRIGGER enrollments_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id
ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS assignments_enforce_owned_class
  ON public.assignments;
CREATE TRIGGER assignments_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS exams_enforce_owned_class
  ON public.exams;
CREATE TRIGGER exams_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.exams
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS flashcards_enforce_owned_class
  ON public.flashcards;
CREATE TRIGGER flashcards_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.flashcards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS quizzes_enforce_owned_class
  ON public.quizzes;
CREATE TRIGGER quizzes_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.quizzes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS study_sessions_enforce_owned_class
  ON public.study_sessions;
CREATE TRIGGER study_sessions_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.study_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS readiness_scores_enforce_owned_class
  ON public.readiness_scores;
CREATE TRIGGER readiness_scores_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.readiness_scores
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS class_syllabus_requests_enforce_owned_class
  ON public.class_syllabus_requests;
CREATE TRIGGER class_syllabus_requests_enforce_owned_class
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id
ON public.class_syllabus_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owned_class_reference();

DROP TRIGGER IF EXISTS class_syllabus_requests_enforce_syllabus_reference
  ON public.class_syllabus_requests;
CREATE TRIGGER class_syllabus_requests_enforce_syllabus_reference
BEFORE INSERT OR UPDATE OF user_id, class_id, client_class_id, syllabus_id
ON public.class_syllabus_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_syllabus_request_reference();

-- The original permissive policies still define the owner/write-shape branch.
-- These authenticated-only restrictive policies compose the current agreement
-- with every otherwise-valid browser INSERT or UPDATE. DELETE remains governed
-- only by the existing owner policies, and service_role continues to bypass RLS.
DROP POLICY IF EXISTS profiles_current_agreement_insert
  ON public.profiles;
CREATE POLICY profiles_current_agreement_insert
  ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS profiles_current_agreement_update
  ON public.profiles;
CREATE POLICY profiles_current_agreement_update
  ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS classes_current_agreement_insert
  ON public.classes;
CREATE POLICY classes_current_agreement_insert
  ON public.classes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS classes_current_agreement_update
  ON public.classes;
CREATE POLICY classes_current_agreement_update
  ON public.classes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS enrollments_current_agreement_insert
  ON public.enrollments;
CREATE POLICY enrollments_current_agreement_insert
  ON public.enrollments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS enrollments_current_agreement_update
  ON public.enrollments;
CREATE POLICY enrollments_current_agreement_update
  ON public.enrollments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS assignments_current_agreement_insert
  ON public.assignments;
CREATE POLICY assignments_current_agreement_insert
  ON public.assignments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS assignments_current_agreement_update
  ON public.assignments;
CREATE POLICY assignments_current_agreement_update
  ON public.assignments AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS exams_current_agreement_insert
  ON public.exams;
CREATE POLICY exams_current_agreement_insert
  ON public.exams AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS exams_current_agreement_update
  ON public.exams;
CREATE POLICY exams_current_agreement_update
  ON public.exams AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
  );

DROP POLICY IF EXISTS study_sessions_current_agreement_insert
  ON public.study_sessions;
CREATE POLICY study_sessions_current_agreement_insert
  ON public.study_sessions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_current_family_beta_agreement()
    AND public.study_writes_are_available()
  );

DROP POLICY IF EXISTS study_sessions_current_agreement_update
  ON public.study_sessions;
CREATE POLICY study_sessions_current_agreement_update
  ON public.study_sessions AS RESTRICTIVE FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS schools_current_agreement_insert
  ON public.schools;
CREATE POLICY schools_current_agreement_insert
  ON public.schools AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_current_family_beta_agreement());

COMMENT ON FUNCTION public.enforce_owned_class_reference() IS
  'Rejects class references whose owner or client identity differs from the child row.';
COMMENT ON FUNCTION public.enforce_syllabus_request_reference() IS
  'Rejects syllabus request results whose syllabus owner, class, or client identity differs from the request.';
COMMENT ON FUNCTION public.prevent_class_owner_reassignment() IS
  'Keeps class owner/client identity immutable so child reference checks remain durable.';
COMMENT ON FUNCTION public.enforce_family_beta_write_boundary() IS
  'Fails closed on authenticated onboarding, study-history, syllabus, or memory-feedback writes without the current durable agreement or while study writes are paused, including SECURITY DEFINER call paths.';

COMMIT;
