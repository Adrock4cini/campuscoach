-- owns_row() is called from RLS policies on virtually every user-owned
-- table. When the query runs as `authenticated` or `anon`, Postgres checks
-- EXECUTE on the function even though it is SECURITY DEFINER. The previous
-- lock-down revoked those grants, which broke every authenticated read.
--
-- owns_row only returns a boolean derived from auth.uid(); it cannot leak
-- data. Restore EXECUTE so RLS works, and keep the other SECURITY DEFINER
-- helpers locked down.
GRANT EXECUTE ON FUNCTION public.owns_row(uuid) TO anon, authenticated;
