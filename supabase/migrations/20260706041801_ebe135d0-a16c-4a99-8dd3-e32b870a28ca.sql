-- =========================================================
-- Campus Coach — MVP data foundation
-- =========================================================
-- Follows the existing anon-friendly pattern used by
-- topic_signals / exam_debriefs: user_id is a client-supplied
-- anon UUID (from localStorage). Policies allow anon inserts +
-- reads so the demo keeps working without auth. When real auth
-- lands we can tighten policies without changing table shape.
-- =========================================================

-- ---------- reference / identity ----------

CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schools TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schools are readable by anyone" ON public.schools FOR SELECT USING (true);
CREATE POLICY "Anyone can add schools (MVP)" ON public.schools FOR INSERT WITH CHECK (true);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  major text,
  year text,
  encouragement_tone text DEFAULT 'warm',
  default_study_length integer DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX profiles_user_id_idx ON public.profiles(user_id);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable (MVP)"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles insertable (MVP)" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Profiles updatable (MVP)"  ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

-- ---------- catalog ----------

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courses readable"   ON public.courses FOR SELECT USING (true);
CREATE POLICY "Courses insertable" ON public.courses FOR INSERT WITH CHECK (true);

CREATE TABLE public.course_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  term text,
  year integer,
  professor_id text,
  professor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_instances_course_idx ON public.course_instances(course_id);
GRANT SELECT ON public.course_instances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_instances TO authenticated;
GRANT ALL ON public.course_instances TO service_role;
ALTER TABLE public.course_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course instances readable"   ON public.course_instances FOR SELECT USING (true);
CREATE POLICY "Course instances insertable" ON public.course_instances FOR INSERT WITH CHECK (true);

-- ---------- per-student roster ----------

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Stable client-side id used by demo data (e.g. "psych101"). Keeps
  -- existing UI wiring working while real course_instance_ids fill in.
  client_class_id text,
  course_instance_id uuid REFERENCES public.course_instances(id) ON DELETE SET NULL,
  name text NOT NULL,
  professor text,
  location text,
  color text,
  current_topic text,
  readiness integer DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_user_idx ON public.classes(user_id);
CREATE INDEX classes_client_idx ON public.classes(client_class_id);
GRANT SELECT ON public.classes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Classes readable (MVP)"   ON public.classes FOR SELECT USING (true);
CREATE POLICY "Classes insertable (MVP)" ON public.classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Classes updatable (MVP)"  ON public.classes FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, class_id)
);
GRANT SELECT ON public.enrollments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enrollments readable"   ON public.enrollments FOR SELECT USING (true);
CREATE POLICY "Enrollments insertable" ON public.enrollments FOR INSERT WITH CHECK (true);

-- ---------- Quick Capture pipeline ----------

CREATE TABLE public.captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Client-side class id (demo) — keeps things working before we
  -- migrate the roster fully to public.classes.
  client_class_id text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  kind text NOT NULL,                -- record-lecture, scan-board, etc.
  topic text,
  chapter text,
  captured_on date NOT NULL DEFAULT (now()::date),
  raw_text text,
  processing_status text NOT NULL DEFAULT 'queued',
  flashcards_ready boolean NOT NULL DEFAULT false,
  local_id text,                     -- id from the client-side store
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captures_user_idx        ON public.captures(user_id);
CREATE INDEX captures_client_class_idx ON public.captures(client_class_id);
CREATE INDEX captures_created_idx     ON public.captures(created_at DESC);
GRANT SELECT ON public.captures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captures TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.captures TO anon;
GRANT ALL ON public.captures TO service_role;
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Captures readable (MVP)"    ON public.captures FOR SELECT USING (true);
CREATE POLICY "Captures insertable (MVP)"  ON public.captures FOR INSERT WITH CHECK (true);
CREATE POLICY "Captures updatable (MVP)"   ON public.captures FOR UPDATE USING (true) WITH CHECK (true);

-- Raw uploaded bytes / URLs live here so `captures` stays lean.
CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid REFERENCES public.captures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,                -- audio, image, pdf, doc, text
  storage_path text,                 -- e.g. captures/<user>/<file>
  mime_type text,
  size_bytes integer,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX materials_capture_idx ON public.materials(capture_id);
GRANT SELECT, INSERT, UPDATE ON public.materials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Materials readable"   ON public.materials FOR SELECT USING (true);
CREATE POLICY "Materials insertable" ON public.materials FOR INSERT WITH CHECK (true);

-- Outputs of the (currently mock) processing pipeline.
CREATE TABLE public.processed_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid REFERENCES public.captures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  summary text,
  key_concepts text[] NOT NULL DEFAULT '{}',
  transcript text,
  ocr_text text,
  outline jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX processed_capture_idx ON public.processed_content(capture_id);
GRANT SELECT, INSERT, UPDATE ON public.processed_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processed_content TO authenticated;
GRANT ALL ON public.processed_content TO service_role;
ALTER TABLE public.processed_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Processed readable"   ON public.processed_content FOR SELECT USING (true);
CREATE POLICY "Processed insertable" ON public.processed_content FOR INSERT WITH CHECK (true);
CREATE POLICY "Processed updatable"  ON public.processed_content FOR UPDATE USING (true) WITH CHECK (true);

-- ---------- study artifacts ----------

CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  client_class_id text,
  capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  front text NOT NULL,
  back text NOT NULL,
  topic text,
  ease numeric NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 1,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flashcards_user_idx ON public.flashcards(user_id);
GRANT SELECT, INSERT, UPDATE ON public.flashcards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Flashcards readable"   ON public.flashcards FOR SELECT USING (true);
CREATE POLICY "Flashcards insertable" ON public.flashcards FOR INSERT WITH CHECK (true);
CREATE POLICY "Flashcards updatable"  ON public.flashcards FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  client_class_id text,
  capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  title text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quizzes_user_idx ON public.quizzes(user_id);
GRANT SELECT, INSERT, UPDATE ON public.quizzes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Quizzes readable"   ON public.quizzes FOR SELECT USING (true);
CREATE POLICY "Quizzes insertable" ON public.quizzes FOR INSERT WITH CHECK (true);
CREATE POLICY "Quizzes updatable"  ON public.quizzes FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  client_class_id text,
  mode text,                        -- flashcards, quiz, focus-sprint, etc.
  duration_minutes integer NOT NULL DEFAULT 0,
  score numeric,
  topic text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX study_sessions_user_idx ON public.study_sessions(user_id);
CREATE INDEX study_sessions_started_idx ON public.study_sessions(started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessions readable"   ON public.study_sessions FOR SELECT USING (true);
CREATE POLICY "Sessions insertable" ON public.study_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Sessions updatable"  ON public.study_sessions FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.readiness_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  client_class_id text,
  readiness integer NOT NULL,
  momentum integer,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX readiness_user_idx ON public.readiness_scores(user_id);
CREATE INDEX readiness_computed_idx ON public.readiness_scores(computed_at DESC);
GRANT SELECT, INSERT ON public.readiness_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.readiness_scores TO authenticated;
GRANT ALL ON public.readiness_scores TO service_role;
ALTER TABLE public.readiness_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readiness readable"   ON public.readiness_scores FOR SELECT USING (true);
CREATE POLICY "Readiness insertable" ON public.readiness_scores FOR INSERT WITH CHECK (true);

-- ---------- Campus Brain signal log ----------
-- Higher-level than topic_signals — every event Campus Brain reasons
-- from (captures, sessions, hints, questions) lands here so the
-- Student Model can be rebuilt from history.

CREATE TABLE public.campus_brain_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  client_class_id text,
  source_type text NOT NULL,        -- capture:record-lecture, session, exam-debrief, ...
  source_id text,
  topic text,
  weight numeric NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cbs_user_idx        ON public.campus_brain_signals(user_id);
CREATE INDEX cbs_class_idx       ON public.campus_brain_signals(client_class_id);
CREATE INDEX cbs_recorded_idx    ON public.campus_brain_signals(recorded_at DESC);
GRANT SELECT, INSERT ON public.campus_brain_signals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_brain_signals TO authenticated;
GRANT ALL ON public.campus_brain_signals TO service_role;
ALTER TABLE public.campus_brain_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brain signals readable"   ON public.campus_brain_signals FOR SELECT USING (true);
CREATE POLICY "Brain signals insertable" ON public.campus_brain_signals FOR INSERT WITH CHECK (true);

-- ---------- updated_at triggers ----------

CREATE TRIGGER trg_profiles_updated_at         BEFORE UPDATE ON public.profiles         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_schools_updated_at          BEFORE UPDATE ON public.schools          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_courses_updated_at          BEFORE UPDATE ON public.courses          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_course_instances_updated_at BEFORE UPDATE ON public.course_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_classes_updated_at          BEFORE UPDATE ON public.classes          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_captures_updated_at         BEFORE UPDATE ON public.captures         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_processed_updated_at        BEFORE UPDATE ON public.processed_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_flashcards_updated_at       BEFORE UPDATE ON public.flashcards       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_quizzes_updated_at          BEFORE UPDATE ON public.quizzes          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
