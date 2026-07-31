-- Universal Canvas fallback. The private calendar-feed URL behaves like a
-- credential, so it is encrypted and never exposed through the client API.

CREATE TABLE public.canvas_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  feed_url_ciphertext TEXT NOT NULL,
  canvas_base_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'error')),
  last_sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (last_sync_status IN ('never', 'syncing', 'success', 'partial', 'error')),
  last_sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_calendar_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canvas_calendar_connections FROM anon, authenticated;
GRANT ALL ON public.canvas_calendar_connections TO service_role;

CREATE TRIGGER canvas_calendar_connections_touch_updated_at
  BEFORE UPDATE ON public.canvas_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

