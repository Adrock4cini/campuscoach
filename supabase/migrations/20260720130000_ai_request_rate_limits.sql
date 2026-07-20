-- Durable, per-user limits for paid AI edge functions.
-- The table is service-role only; students cannot read or change counters.
CREATE TABLE IF NOT EXISTS public.ai_request_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL CHECK (char_length(function_name) BETWEEN 1 AND 80),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, function_name, window_start)
);

ALTER TABLE public.ai_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_request_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_request_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_request_quota(
  p_user_id UUID,
  p_function_name TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL
     OR char_length(p_function_name) NOT BETWEEN 1 AND 80
     OR p_limit < 1
     OR p_window_seconds < 60 THEN
    RETURN FALSE;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.ai_request_rate_limits (
    user_id,
    function_name,
    window_start,
    request_count,
    last_requested_at
  )
  VALUES (p_user_id, p_function_name, v_window_start, 1, now())
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE SET
    request_count = public.ai_request_rate_limits.request_count + 1,
    last_requested_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_request_quota(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_request_quota(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.ai_request_rate_limits IS
  'Service-role-only counters used to protect paid AI edge functions from abuse.';
