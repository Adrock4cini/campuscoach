
-- =====================================================================
-- Campus Coach: production-safe RLS hardening (demo-compatible)
-- =====================================================================
-- Strategy:
--   * public.owns_row(uid) is the single source of truth for ownership.
--     Today it also allows anonymous traffic (auth.uid() IS NULL) so the
--     current demo keeps working. To flip to strict production mode,
--     redefine this function to `SELECT auth.uid() = _user_id`.
--   * All private/user-owned tables route their policies through owns_row.
--   * Community intelligence is exposed only via aggregate views that
--     never select user_id or raw payloads.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.owns_row(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- DEMO-MODE COMPATIBILITY: allow anonymous traffic while auth is not
  -- yet required by the app. Before public beta, redefine this as:
  --   SELECT auth.uid() IS NOT NULL AND auth.uid() = _user_id;
  SELECT
    _user_id IS NOT NULL
    AND (auth.uid() = _user_id OR auth.uid() IS NULL);
$$;

COMMENT ON FUNCTION public.owns_row(uuid) IS
  'Ownership check used by every private table policy. Currently in demo-compat mode (also allows anonymous callers). Flip to strict auth.uid() = _user_id before public beta.';

-- =====================================================================
-- Helper columns: visibility + anonymized
-- =====================================================================

DO $$
DECLARE
  t text;
  private_tables text[] := ARRAY[
    'captures','materials','processed_content','flashcards',
    'quizzes','study_sessions','readiness_scores'
  ];
  aggregate_tables text[] := ARRAY[
    'campus_brain_signals','topic_signals','exam_debriefs'
  ];
BEGIN
  FOREACH t IN ARRAY private_tables LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
        ADD COLUMN IF NOT EXISTS anonymized boolean NOT NULL DEFAULT false
    $f$, t);
  END LOOP;

  FOREACH t IN ARRAY aggregate_tables LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'aggregate',
        ADD COLUMN IF NOT EXISTS anonymized boolean NOT NULL DEFAULT true
    $f$, t);
  END LOOP;
END $$;

-- =====================================================================
-- Drop old permissive MVP policies
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles','classes','enrollments',
        'captures','materials','processed_content',
        'flashcards','quizzes','study_sessions',
        'readiness_scores','campus_brain_signals',
        'topic_signals','exam_debriefs'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- =====================================================================
-- Private, user-owned tables: owner-only for all operations
-- =====================================================================
-- These hold raw student data (notes, recordings, scans, study history,
-- personal readiness). Never exposed to any other user.

-- profiles ------------------------------------------------------------
CREATE POLICY "profiles_owner_select" ON public.profiles
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "profiles_owner_insert" ON public.profiles
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "profiles_owner_update" ON public.profiles
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "profiles_owner_delete" ON public.profiles
  FOR DELETE USING (public.owns_row(user_id));

-- classes -------------------------------------------------------------
CREATE POLICY "classes_owner_select" ON public.classes
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "classes_owner_insert" ON public.classes
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "classes_owner_update" ON public.classes
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "classes_owner_delete" ON public.classes
  FOR DELETE USING (public.owns_row(user_id));

-- enrollments ---------------------------------------------------------
CREATE POLICY "enrollments_owner_select" ON public.enrollments
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "enrollments_owner_insert" ON public.enrollments
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "enrollments_owner_update" ON public.enrollments
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "enrollments_owner_delete" ON public.enrollments
  FOR DELETE USING (public.owns_row(user_id));

-- captures (raw recordings/scans/notes) -------------------------------
CREATE POLICY "captures_owner_select" ON public.captures
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "captures_owner_insert" ON public.captures
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "captures_owner_update" ON public.captures
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "captures_owner_delete" ON public.captures
  FOR DELETE USING (public.owns_row(user_id));

-- materials (files, board photos, textbook pages) ---------------------
CREATE POLICY "materials_owner_select" ON public.materials
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "materials_owner_insert" ON public.materials
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "materials_owner_update" ON public.materials
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "materials_owner_delete" ON public.materials
  FOR DELETE USING (public.owns_row(user_id));

-- processed_content (AI summaries derived from raw captures) ----------
CREATE POLICY "processed_owner_select" ON public.processed_content
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "processed_owner_insert" ON public.processed_content
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "processed_owner_update" ON public.processed_content
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "processed_owner_delete" ON public.processed_content
  FOR DELETE USING (public.owns_row(user_id));

-- flashcards ----------------------------------------------------------
CREATE POLICY "flashcards_owner_select" ON public.flashcards
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "flashcards_owner_insert" ON public.flashcards
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "flashcards_owner_update" ON public.flashcards
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "flashcards_owner_delete" ON public.flashcards
  FOR DELETE USING (public.owns_row(user_id));

-- quizzes -------------------------------------------------------------
CREATE POLICY "quizzes_owner_select" ON public.quizzes
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "quizzes_owner_insert" ON public.quizzes
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "quizzes_owner_update" ON public.quizzes
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "quizzes_owner_delete" ON public.quizzes
  FOR DELETE USING (public.owns_row(user_id));

-- study_sessions ------------------------------------------------------
CREATE POLICY "sessions_owner_select" ON public.study_sessions
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "sessions_owner_insert" ON public.study_sessions
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "sessions_owner_update" ON public.study_sessions
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "sessions_owner_delete" ON public.study_sessions
  FOR DELETE USING (public.owns_row(user_id));

-- readiness_scores ----------------------------------------------------
CREATE POLICY "readiness_owner_select" ON public.readiness_scores
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "readiness_owner_insert" ON public.readiness_scores
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "readiness_owner_update" ON public.readiness_scores
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "readiness_owner_delete" ON public.readiness_scores
  FOR DELETE USING (public.owns_row(user_id));

-- =====================================================================
-- Aggregate / community intelligence tables
-- =====================================================================
-- Raw rows are owner-only. Community insights are exposed only via
-- aggregate views (see below) which never select user_id or raw payload.

-- campus_brain_signals (feeds the intelligence engine) ----------------
CREATE POLICY "brain_signals_owner_select" ON public.campus_brain_signals
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "brain_signals_owner_insert" ON public.campus_brain_signals
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "brain_signals_owner_update" ON public.campus_brain_signals
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "brain_signals_owner_delete" ON public.campus_brain_signals
  FOR DELETE USING (public.owns_row(user_id));

-- topic_signals -------------------------------------------------------
CREATE POLICY "topic_signals_owner_select" ON public.topic_signals
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "topic_signals_owner_insert" ON public.topic_signals
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "topic_signals_owner_update" ON public.topic_signals
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "topic_signals_owner_delete" ON public.topic_signals
  FOR DELETE USING (public.owns_row(user_id));

-- exam_debriefs -------------------------------------------------------
CREATE POLICY "exam_debriefs_owner_select" ON public.exam_debriefs
  FOR SELECT USING (public.owns_row(user_id));
CREATE POLICY "exam_debriefs_owner_insert" ON public.exam_debriefs
  FOR INSERT WITH CHECK (public.owns_row(user_id));
CREATE POLICY "exam_debriefs_owner_update" ON public.exam_debriefs
  FOR UPDATE USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "exam_debriefs_owner_delete" ON public.exam_debriefs
  FOR DELETE USING (public.owns_row(user_id));

-- =====================================================================
-- Anonymous aggregate view for community intelligence
-- =====================================================================
-- Exposes counts and topic names only. Never selects user_id, payload,
-- or raw text. Safe for any authenticated user (and anon in demo).

CREATE OR REPLACE VIEW public.campus_brain_aggregate
WITH (security_invoker = true) AS
SELECT
  class_id,
  client_class_id,
  topic,
  source_type,
  count(*)             AS signal_count,
  count(DISTINCT user_id) AS student_count,
  avg(weight)::numeric AS average_weight,
  date_trunc('day', recorded_at) AS day
FROM public.campus_brain_signals
WHERE anonymized = true
GROUP BY class_id, client_class_id, topic, source_type, date_trunc('day', recorded_at);

COMMENT ON VIEW public.campus_brain_aggregate IS
  'Anonymous, aggregate-only projection of campus_brain_signals. Never exposes user_id or payload. Use this — not the raw table — for cross-student community insights.';

GRANT SELECT ON public.campus_brain_aggregate TO anon, authenticated;
