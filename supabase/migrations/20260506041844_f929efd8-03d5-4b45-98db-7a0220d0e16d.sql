
-- Allow public (anon) contributions and reads so the crowdsourced layer works without auth gating
DROP POLICY IF EXISTS "Users can view their own topic signals" ON public.topic_signals;
DROP POLICY IF EXISTS "Users can create their own topic signals" ON public.topic_signals;
DROP POLICY IF EXISTS "Users can update their own topic signals" ON public.topic_signals;
DROP POLICY IF EXISTS "Users can delete their own topic signals" ON public.topic_signals;

CREATE POLICY "Anyone can view topic signals (aggregate use)"
  ON public.topic_signals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can contribute topic signals"
  ON public.topic_signals FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their own exam debriefs" ON public.exam_debriefs;
DROP POLICY IF EXISTS "Users can create their own exam debriefs" ON public.exam_debriefs;
DROP POLICY IF EXISTS "Users can update their own exam debriefs" ON public.exam_debriefs;
DROP POLICY IF EXISTS "Users can delete their own exam debriefs" ON public.exam_debriefs;

CREATE POLICY "Anyone can view exam debriefs (aggregate use)"
  ON public.exam_debriefs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can contribute exam debriefs"
  ON public.exam_debriefs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view aggregated topic scores" ON public.topic_scores;
CREATE POLICY "Anyone can view aggregated topic scores"
  ON public.topic_scores FOR SELECT TO anon, authenticated USING (true);

-- Triggers to recompute aggregates when contributions land
DROP TRIGGER IF EXISTS trg_refresh_scores_on_signal ON public.topic_signals;
CREATE TRIGGER trg_refresh_scores_on_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.topic_signals
  FOR EACH ROW EXECUTE FUNCTION public.refresh_topic_scores_from_signal();

DROP TRIGGER IF EXISTS trg_refresh_scores_on_debrief ON public.exam_debriefs;
CREATE TRIGGER trg_refresh_scores_on_debrief
  AFTER INSERT OR UPDATE OR DELETE ON public.exam_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.refresh_topic_scores_from_signal();

CREATE INDEX IF NOT EXISTS idx_topic_signals_class ON public.topic_signals (class_id);
CREATE INDEX IF NOT EXISTS idx_exam_debriefs_class ON public.exam_debriefs (class_id);
CREATE INDEX IF NOT EXISTS idx_topic_scores_class ON public.topic_scores (class_id);
