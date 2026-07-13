
-- owns_row: does not need elevated privileges; switch to INVOKER
CREATE OR REPLACE FUNCTION public.owns_row(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() = _user_id;
$$;

-- Revoke public/anon/authenticated execute on internal DEFINER functions.
-- Triggers still fire (they don't require EXECUTE), and service_role retains access.
REVOKE ALL ON FUNCTION public.recompute_topic_scores(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_topic_scores_from_signal() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recompute_topic_scores(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_topic_scores_from_signal() TO service_role;
