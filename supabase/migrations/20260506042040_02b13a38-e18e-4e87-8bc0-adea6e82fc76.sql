
CREATE OR REPLACE FUNCTION public.recompute_topic_scores(_class_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.topic_scores
  WHERE _class_id IS NULL OR class_id = _class_id;

  INSERT INTO public.topic_scores (
    class_id, topic_id, topic_name, score, probability, confidence_band,
    student_count, star_count, total_time_spent_minutes, miss_rate,
    post_exam_mentions, average_confidence, computed_at, created_at, updated_at
  )
  WITH signal_agg AS (
    SELECT
      ts.class_id,
      lower(regexp_replace(trim(ts.topic_id), '[^a-zA-Z0-9]+', '-', 'g')) AS topic_key,
      max(ts.topic_name) AS topic_name,
      count(DISTINCT ts.user_id) AS student_count,
      count(*) FILTER (WHERE ts.starred) AS star_count,
      coalesce(sum(ts.time_spent_minutes), 0) AS total_time_spent_minutes,
      coalesce(avg(CASE WHEN ts.accuracy IS NULL THEN NULL ELSE 100 - ts.accuracy END), 0) AS miss_rate,
      coalesce(avg(ts.confidence), 0) AS average_confidence
    FROM public.topic_signals ts
    WHERE _class_id IS NULL OR ts.class_id = _class_id
    GROUP BY ts.class_id, lower(regexp_replace(trim(ts.topic_id), '[^a-zA-Z0-9]+', '-', 'g'))
  ),
  debrief_mentions AS (
    SELECT
      ed.class_id,
      lower(regexp_replace(trim(topic), '[^a-zA-Z0-9]+', '-', 'g')) AS topic_key,
      max(initcap(trim(topic))) AS topic_name,
      count(DISTINCT ed.user_id) AS mention_students,
      count(*) AS post_exam_mentions
    FROM public.exam_debriefs ed,
    LATERAL unnest(ed.topics_mentioned) AS topic
    WHERE (_class_id IS NULL OR ed.class_id = _class_id)
      AND trim(topic) <> ''
    GROUP BY ed.class_id, lower(regexp_replace(trim(topic), '[^a-zA-Z0-9]+', '-', 'g'))
  ),
  merged AS (
    SELECT
      coalesce(sa.class_id, dm.class_id) AS class_id,
      coalesce(sa.topic_key, dm.topic_key) AS topic_key,
      coalesce(sa.topic_name, dm.topic_name, initcap(replace(coalesce(sa.topic_key, dm.topic_key), '-', ' '))) AS topic_name,
      coalesce(sa.student_count, 0) + coalesce(dm.mention_students, 0) AS student_count,
      coalesce(sa.star_count, 0) AS star_count,
      coalesce(sa.total_time_spent_minutes, 0) AS total_time_spent_minutes,
      coalesce(sa.miss_rate, 0) AS miss_rate,
      coalesce(dm.post_exam_mentions, 0) AS post_exam_mentions,
      coalesce(sa.average_confidence, 0) AS average_confidence
    FROM signal_agg sa
    FULL OUTER JOIN debrief_mentions dm
      ON sa.class_id = dm.class_id AND sa.topic_key = dm.topic_key
  ),
  scored AS (
    SELECT *,
      ((star_count * 3)::numeric + (total_time_spent_minutes * 2)::numeric + (miss_rate * 4)::numeric + (post_exam_mentions * 5)::numeric) AS score
    FROM merged
  ),
  normalized AS (
    SELECT *,
      CASE WHEN max(score) OVER (PARTITION BY class_id) = 0 THEN 0
           ELSE round((score / max(score) OVER (PARTITION BY class_id)) * 100, 2)
      END AS probability
    FROM scored
  )
  SELECT
    class_id, topic_key, topic_name, score, probability,
    CASE WHEN probability >= 70 THEN 'High'
         WHEN probability >= 40 THEN 'Medium'
         ELSE 'Low' END,
    student_count, star_count, total_time_spent_minutes, round(miss_rate, 2),
    post_exam_mentions, round(average_confidence, 2), now(), now(), now()
  FROM normalized;
END;
$function$;

SELECT public.recompute_topic_scores(NULL);
