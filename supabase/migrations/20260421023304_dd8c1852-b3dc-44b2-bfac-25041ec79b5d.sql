CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.topic_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT false,
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 5),
  time_spent_minutes INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_minutes >= 0),
  accuracy NUMERIC(5,2) CHECK (accuracy >= 0 AND accuracy <= 100),
  incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
  source_type TEXT NOT NULL DEFAULT 'study-session',
  source_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  professor_id TEXT,
  exam_id TEXT,
  exam_name TEXT NOT NULL,
  date_taken DATE NOT NULL,
  topics_mentioned TEXT[] NOT NULL DEFAULT '{}',
  chapter_tags TEXT[] NOT NULL DEFAULT '{}',
  format_tags TEXT[] NOT NULL DEFAULT '{}',
  study_more_tags TEXT[] NOT NULL DEFAULT '{}',
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  time_pressure INTEGER NOT NULL CHECK (time_pressure BETWEEN 1 AND 5),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  surprises TEXT,
  advice_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.topic_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  score NUMERIC(12,2) NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence_band TEXT NOT NULL DEFAULT 'Low',
  student_count INTEGER NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL DEFAULT 0,
  total_time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  miss_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  post_exam_mentions INTEGER NOT NULL DEFAULT 0,
  average_confidence NUMERIC(4,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_signals_user_id ON public.topic_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_signals_class_topic ON public.topic_signals(class_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_exam_debriefs_user_id ON public.exam_debriefs(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_debriefs_class_id ON public.exam_debriefs(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_debriefs_topics_mentioned ON public.exam_debriefs USING GIN(topics_mentioned);
CREATE INDEX IF NOT EXISTS idx_topic_scores_class_id ON public.topic_scores(class_id);

ALTER TABLE public.topic_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_debriefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own topic signals" ON public.topic_signals;
CREATE POLICY "Users can view their own topic signals"
ON public.topic_signals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own topic signals" ON public.topic_signals;
CREATE POLICY "Users can create their own topic signals"
ON public.topic_signals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own topic signals" ON public.topic_signals;
CREATE POLICY "Users can update their own topic signals"
ON public.topic_signals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own topic signals" ON public.topic_signals;
CREATE POLICY "Users can delete their own topic signals"
ON public.topic_signals
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own exam debriefs" ON public.exam_debriefs;
CREATE POLICY "Users can view their own exam debriefs"
ON public.exam_debriefs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own exam debriefs" ON public.exam_debriefs;
CREATE POLICY "Users can create their own exam debriefs"
ON public.exam_debriefs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own exam debriefs" ON public.exam_debriefs;
CREATE POLICY "Users can update their own exam debriefs"
ON public.exam_debriefs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own exam debriefs" ON public.exam_debriefs;
CREATE POLICY "Users can delete their own exam debriefs"
ON public.exam_debriefs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can view aggregated topic scores" ON public.topic_scores;
CREATE POLICY "Authenticated users can view aggregated topic scores"
ON public.topic_scores
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.recompute_topic_scores(_class_id TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.topic_scores
  WHERE _class_id IS NULL OR class_id = _class_id;

  INSERT INTO public.topic_scores (
    class_id,
    topic_id,
    topic_name,
    score,
    probability,
    confidence_band,
    student_count,
    star_count,
    total_time_spent_minutes,
    miss_rate,
    post_exam_mentions,
    average_confidence,
    computed_at,
    created_at,
    updated_at
  )
  WITH signal_agg AS (
    SELECT
      ts.class_id,
      ts.topic_id,
      max(ts.topic_name) AS topic_name,
      count(DISTINCT ts.user_id) AS student_count,
      count(*) FILTER (WHERE ts.starred) AS star_count,
      coalesce(sum(ts.time_spent_minutes), 0) AS total_time_spent_minutes,
      coalesce(avg(CASE WHEN ts.accuracy IS NULL THEN NULL ELSE 100 - ts.accuracy END), 0) AS miss_rate,
      coalesce(avg(ts.confidence), 0) AS average_confidence
    FROM public.topic_signals ts
    WHERE _class_id IS NULL OR ts.class_id = _class_id
    GROUP BY ts.class_id, ts.topic_id
  ),
  debrief_mentions AS (
    SELECT
      ed.class_id,
      lower(trim(topic)) AS topic_id,
      count(DISTINCT ed.user_id) AS mention_students,
      count(*) AS post_exam_mentions
    FROM public.exam_debriefs ed,
    LATERAL unnest(ed.topics_mentioned) AS topic
    WHERE (_class_id IS NULL OR ed.class_id = _class_id)
      AND trim(topic) <> ''
    GROUP BY ed.class_id, lower(trim(topic))
  ),
  merged AS (
    SELECT
      coalesce(sa.class_id, dm.class_id) AS class_id,
      coalesce(sa.topic_id, dm.topic_id) AS topic_id,
      coalesce(sa.topic_name, initcap(replace(dm.topic_id, '-', ' '))) AS topic_name,
      coalesce(sa.student_count, dm.mention_students, 0) AS student_count,
      coalesce(sa.star_count, 0) AS star_count,
      coalesce(sa.total_time_spent_minutes, 0) AS total_time_spent_minutes,
      coalesce(sa.miss_rate, 0) AS miss_rate,
      coalesce(dm.post_exam_mentions, 0) AS post_exam_mentions,
      coalesce(sa.average_confidence, 0) AS average_confidence
    FROM signal_agg sa
    FULL OUTER JOIN debrief_mentions dm
      ON sa.class_id = dm.class_id
      AND lower(sa.topic_id) = lower(dm.topic_id)
  ),
  scored AS (
    SELECT
      class_id,
      topic_id,
      topic_name,
      student_count,
      star_count,
      total_time_spent_minutes,
      miss_rate,
      post_exam_mentions,
      average_confidence,
      ((star_count * 3)::numeric + (total_time_spent_minutes * 2)::numeric + (miss_rate * 4)::numeric + (post_exam_mentions * 5)::numeric) AS score
    FROM merged
  ),
  normalized AS (
    SELECT
      *,
      CASE
        WHEN max(score) OVER (PARTITION BY class_id) = 0 THEN 0
        ELSE round((score / max(score) OVER (PARTITION BY class_id)) * 100, 2)
      END AS probability
    FROM scored
  )
  SELECT
    class_id,
    topic_id,
    topic_name,
    score,
    probability,
    CASE
      WHEN probability >= 70 THEN 'High'
      WHEN probability >= 40 THEN 'Medium'
      ELSE 'Low'
    END AS confidence_band,
    student_count,
    star_count,
    total_time_spent_minutes,
    round(miss_rate, 2),
    post_exam_mentions,
    round(average_confidence, 2),
    now(),
    now(),
    now()
  FROM normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_topic_scores_from_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_topic_scores(COALESCE(NEW.class_id, OLD.class_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS topic_signals_recompute_scores ON public.topic_signals;
CREATE TRIGGER topic_signals_recompute_scores
AFTER INSERT OR UPDATE OR DELETE ON public.topic_signals
FOR EACH ROW
EXECUTE FUNCTION public.refresh_topic_scores_from_signal();

DROP TRIGGER IF EXISTS exam_debriefs_recompute_scores ON public.exam_debriefs;
CREATE TRIGGER exam_debriefs_recompute_scores
AFTER INSERT OR UPDATE OR DELETE ON public.exam_debriefs
FOR EACH ROW
EXECUTE FUNCTION public.refresh_topic_scores_from_signal();

DROP TRIGGER IF EXISTS update_topic_signals_updated_at ON public.topic_signals;
CREATE TRIGGER update_topic_signals_updated_at
BEFORE UPDATE ON public.topic_signals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_exam_debriefs_updated_at ON public.exam_debriefs;
CREATE TRIGGER update_exam_debriefs_updated_at
BEFORE UPDATE ON public.exam_debriefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_topic_scores_updated_at ON public.topic_scores;
CREATE TRIGGER update_topic_scores_updated_at
BEFORE UPDATE ON public.topic_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();