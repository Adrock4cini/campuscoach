-- Revoke direct EXECUTE from anon/authenticated on SECURITY DEFINER functions
-- exposed via the Data API. These functions are internal helpers (used by
-- triggers or RLS policies) and should not be callable by end users.

REVOKE EXECUTE ON FUNCTION public.recompute_topic_scores(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_topic_scores_from_signal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_row(uuid) FROM PUBLIC, anon, authenticated;

-- owns_row is referenced by RLS policies; policies evaluate as the row's
-- owner via SECURITY DEFINER semantics, so no grant to end-user roles is
-- needed. Keep service_role access for admin paths.
GRANT EXECUTE ON FUNCTION public.owns_row(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_topic_scores(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_topic_scores_from_signal() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
