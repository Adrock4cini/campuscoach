
-- 1. Harden owns_row: require an authenticated session
CREATE OR REPLACE FUNCTION public.owns_row(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() = _user_id;
$$;

-- 2. Restrict reference-table INSERTs to authenticated users (replace WITH CHECK true)
DROP POLICY IF EXISTS "Anyone can add schools (MVP)" ON public.schools;
CREATE POLICY "Authenticated users can add schools"
  ON public.schools FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Courses insertable" ON public.courses;
CREATE POLICY "Authenticated users can add courses"
  ON public.courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Course instances insertable" ON public.course_instances;
CREATE POLICY "Authenticated users can add course instances"
  ON public.course_instances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Revoke public EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.owns_row(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_topic_scores(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_topic_scores_from_signal() FROM PUBLIC, anon, authenticated;

-- owns_row is called from RLS policies; policies execute as the row's evaluator role,
-- and SECURITY DEFINER means the function runs as its owner regardless — no grant needed
-- to the client roles for RLS to keep working.
