-- 1. SECURITY DEFINER trigger functions must not be directly callable
REVOKE EXECUTE ON FUNCTION public.enforce_capture_study_boundaries() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_material_capture_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_unreferenced_capture_source() FROM PUBLIC, anon, authenticated;

-- 2. Owner-scoped access to Canvas connections, excluding secret ciphertext columns
GRANT SELECT (
  id, user_id, canvas_base_url, canvas_user_id, canvas_user_name,
  token_expires_at, status, last_sync_status, last_sync_error,
  last_synced_at, sync_counts, created_at, updated_at
) ON public.canvas_connections TO authenticated;
GRANT DELETE ON public.canvas_connections TO authenticated;
GRANT ALL ON public.canvas_connections TO service_role;

CREATE POLICY "Users can view their own Canvas connection"
  ON public.canvas_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own Canvas connection"
  ON public.canvas_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT (
  id, user_id, canvas_base_url, status, last_sync_status, last_sync_error,
  last_synced_at, sync_counts, created_at, updated_at
) ON public.canvas_calendar_connections TO authenticated;
GRANT DELETE ON public.canvas_calendar_connections TO authenticated;
GRANT ALL ON public.canvas_calendar_connections TO service_role;

CREATE POLICY "Users can view their own Canvas calendar connection"
  ON public.canvas_calendar_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own Canvas calendar connection"
  ON public.canvas_calendar_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Backend-only tables stay fully closed to app roles
REVOKE ALL ON public.canvas_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.ai_request_rate_limits FROM anon, authenticated;
GRANT ALL ON public.canvas_oauth_states TO service_role;
GRANT ALL ON public.ai_request_rate_limits TO service_role;
COMMENT ON TABLE public.canvas_oauth_states IS 'Backend-only OAuth handshake state. No client policies by design (fails closed); accessed exclusively via service role in edge functions.';
COMMENT ON TABLE public.ai_request_rate_limits IS 'Backend-only AI rate limit counters. No client policies by design (fails closed); accessed exclusively via the security definer quota function.';

-- 4. Explicit owner-scoped UPDATE policy for capture-sources storage
CREATE POLICY "capture_sources_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'capture-sources' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'capture-sources' AND (storage.foldername(name))[1] = auth.uid()::text);
