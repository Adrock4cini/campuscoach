
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_class_id text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date,
  estimated_minutes integer NOT NULL DEFAULT 30,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignments_priority_chk CHECK (priority IN ('low','medium','high')),
  CONSTRAINT assignments_status_chk CHECK (status IN ('not_started','in_progress','complete'))
);
CREATE INDEX assignments_user_idx ON public.assignments(user_id);
CREATE INDEX assignments_client_class_idx ON public.assignments(client_class_id);
CREATE INDEX assignments_due_idx ON public.assignments(due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_select_own" ON public.assignments FOR SELECT TO authenticated USING (public.owns_row(user_id));
CREATE POLICY "assignments_insert_own" ON public.assignments FOR INSERT TO authenticated WITH CHECK (public.owns_row(user_id));
CREATE POLICY "assignments_update_own" ON public.assignments FOR UPDATE TO authenticated USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "assignments_delete_own" ON public.assignments FOR DELETE TO authenticated USING (public.owns_row(user_id));

CREATE TRIGGER assignments_touch_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_class_id text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  exam_date date,
  topics text[] NOT NULL DEFAULT '{}',
  readiness integer NOT NULL DEFAULT 0,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_readiness_chk CHECK (readiness BETWEEN 0 AND 100)
);
CREATE INDEX exams_user_idx ON public.exams(user_id);
CREATE INDEX exams_client_class_idx ON public.exams(client_class_id);
CREATE INDEX exams_date_idx ON public.exams(exam_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exams_select_own" ON public.exams FOR SELECT TO authenticated USING (public.owns_row(user_id));
CREATE POLICY "exams_insert_own" ON public.exams FOR INSERT TO authenticated WITH CHECK (public.owns_row(user_id));
CREATE POLICY "exams_update_own" ON public.exams FOR UPDATE TO authenticated USING (public.owns_row(user_id)) WITH CHECK (public.owns_row(user_id));
CREATE POLICY "exams_delete_own" ON public.exams FOR DELETE TO authenticated USING (public.owns_row(user_id));

CREATE TRIGGER exams_touch_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
