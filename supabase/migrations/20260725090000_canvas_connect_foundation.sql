-- Secure, read-only Canvas import.
-- OAuth credentials stay service-role only; student coursework remains protected
-- by the existing owner-scoped RLS policies.

CREATE TABLE public.canvas_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_base_url TEXT NOT NULL,
  canvas_user_id TEXT,
  canvas_user_name TEXT,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reauth', 'error')),
  last_sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (last_sync_status IN ('never', 'syncing', 'success', 'partial', 'error')),
  last_sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, canvas_base_url)
);

ALTER TABLE public.canvas_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canvas_connections FROM anon, authenticated;
GRANT ALL ON public.canvas_connections TO service_role;

CREATE TRIGGER canvas_connections_touch_updated_at
  BEFORE UPDATE ON public.canvas_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.canvas_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_base_url TEXT NOT NULL,
  redirect_path TEXT NOT NULL DEFAULT '/integrations/canvas',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canvas_oauth_states FROM anon, authenticated;
GRANT ALL ON public.canvas_oauth_states TO service_role;

ALTER TABLE public.classes
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'canvas')),
  ADD COLUMN external_id TEXT,
  ADD COLUMN source_url TEXT,
  ADD COLUMN source_updated_at TIMESTAMPTZ,
  ADD COLUMN source_archived_at TIMESTAMPTZ;

ALTER TABLE public.assignments
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'canvas')),
  ADD COLUMN external_id TEXT,
  ADD COLUMN source_url TEXT,
  ADD COLUMN source_updated_at TIMESTAMPTZ,
  ADD COLUMN source_due_at TIMESTAMPTZ,
  ADD COLUMN source_archived_at TIMESTAMPTZ;

ALTER TABLE public.exams
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'canvas')),
  ADD COLUMN external_id TEXT,
  ADD COLUMN source_url TEXT,
  ADD COLUMN source_updated_at TIMESTAMPTZ,
  ADD COLUMN source_due_at TIMESTAMPTZ,
  ADD COLUMN source_archived_at TIMESTAMPTZ;

CREATE UNIQUE INDEX classes_external_identity_unique
  ON public.classes (user_id, source, external_id);
CREATE UNIQUE INDEX assignments_external_identity_unique
  ON public.assignments (user_id, source, external_id);
CREATE UNIQUE INDEX exams_external_identity_unique
  ON public.exams (user_id, source, external_id);

CREATE INDEX classes_active_source_idx
  ON public.classes (user_id, source, source_archived_at);
CREATE INDEX assignments_active_source_idx
  ON public.assignments (user_id, source, source_archived_at);
CREATE INDEX exams_active_source_idx
  ON public.exams (user_id, source, source_archived_at);
