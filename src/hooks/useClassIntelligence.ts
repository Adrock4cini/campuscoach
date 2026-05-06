import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AggregatedTopic {
  topic_id: string;
  topic_name: string;
  score: number;
  probability: number;
  confidence_band: "High" | "Medium" | "Low";
  student_count: number;
  star_count: number;
  total_time_spent_minutes: number;
  miss_rate: number;
  post_exam_mentions: number;
  average_confidence: number;
}

export interface AggregatedDebrief {
  id: string;
  class_id: string;
  exam_name: string;
  date_taken: string;
  topics_mentioned: string[];
  format_tags: string[];
  study_more_tags: string[];
  difficulty: number;
  time_pressure: number;
  confidence: number;
  advice_notes: string | null;
  created_at: string;
}

export interface ClassIntelligenceSummary {
  topics: AggregatedTopic[];
  debriefs: AggregatedDebrief[];
  totalContributors: number;
  totalContributions: number;
  weeklyContributions: number;
  formatCounts: { format: string; mentions: number }[];
  studyMoreCounts: { topic: string; mentions: number }[];
  adviceTrends: string[];
  averageDifficulty: number;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useClassIntelligence(classId: string | null | undefined): ClassIntelligenceSummary {
  const [topics, setTopics] = useState<AggregatedTopic[]>([]);
  const [debriefs, setDebriefs] = useState<AggregatedDebrief[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [signalUsers, setSignalUsers] = useState(0);
  const [weekly, setWeekly] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!classId) {
      setTopics([]); setDebriefs([]); setLoading(false);
      return;
    }
    setLoading(true);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [scoresRes, debriefsRes, signalsRes, weeklySignalsRes, weeklyDebriefsRes] = await Promise.all([
      supabase.from("topic_scores").select("*").eq("class_id", classId).order("probability", { ascending: false }),
      supabase.from("exam_debriefs").select("*").eq("class_id", classId).order("created_at", { ascending: false }).limit(20),
      supabase.from("topic_signals").select("user_id", { count: "exact" }).eq("class_id", classId),
      supabase.from("topic_signals").select("id", { count: "exact" }).eq("class_id", classId).gte("created_at", weekAgo),
      supabase.from("exam_debriefs").select("id", { count: "exact" }).eq("class_id", classId).gte("created_at", weekAgo),
    ]);

    setTopics((scoresRes.data ?? []) as AggregatedTopic[]);
    setDebriefs((debriefsRes.data ?? []) as AggregatedDebrief[]);
    const uniqueUsers = new Set((signalsRes.data ?? []).map((r: any) => r.user_id));
    setSignalUsers(uniqueUsers.size);
    setSignalCount(signalsRes.count ?? 0);
    setWeekly((weeklySignalsRes.count ?? 0) + (weeklyDebriefsRes.count ?? 0));
    setLoading(false);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when new contributions land for this class
  useEffect(() => {
    if (!classId) return;
    const channel = supabase
      .channel(`ci-${classId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "topic_scores", filter: `class_id=eq.${classId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "exam_debriefs", filter: `class_id=eq.${classId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [classId, load]);

  // Derived aggregates from debriefs
  const formatMap: Record<string, number> = {};
  const studyMoreMap: Record<string, number> = {};
  const adviceSet = new Set<string>();
  let diffSum = 0;
  debriefs.forEach((d) => {
    d.format_tags?.forEach((f) => { formatMap[f] = (formatMap[f] || 0) + 1; });
    d.study_more_tags?.forEach((t) => { studyMoreMap[t] = (studyMoreMap[t] || 0) + 1; });
    if (d.advice_notes) adviceSet.add(d.advice_notes.trim());
    diffSum += d.difficulty || 0;
  });

  const formatCounts = Object.entries(formatMap).map(([format, mentions]) => ({ format, mentions })).sort((a, b) => b.mentions - a.mentions);
  const studyMoreCounts = Object.entries(studyMoreMap).map(([topic, mentions]) => ({ topic, mentions })).sort((a, b) => b.mentions - a.mentions);

  return {
    topics,
    debriefs,
    totalContributors: signalUsers + debriefs.length,
    totalContributions: signalCount + debriefs.length,
    weeklyContributions: weekly,
    formatCounts,
    studyMoreCounts,
    adviceTrends: Array.from(adviceSet).slice(0, 6),
    averageDifficulty: debriefs.length ? Math.round((diffSum / debriefs.length) * 10) / 10 : 0,
    loading,
    reload: load,
  };
}

// Helper to log a study session as a topic_signal (anonymous contribution)
export async function contributeStudySignal(input: {
  classId: string;
  topicId: string;
  topicName: string;
  starred?: boolean;
  confidence?: number;
  timeSpentMinutes?: number;
  accuracy?: number;
  incorrectCount?: number;
  sourceType?: string;
  sourceId?: string;
}) {
  const slug = input.topicId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return supabase.from("topic_signals").insert({
    user_id: getAnonUserId(),
    class_id: input.classId,
    topic_id: slug || "general",
    topic_name: input.topicName,
    starred: input.starred ?? false,
    confidence: input.confidence ?? null,
    time_spent_minutes: input.timeSpentMinutes ?? 0,
    accuracy: input.accuracy ?? null,
    incorrect_count: input.incorrectCount ?? 0,
    source_type: input.sourceType ?? "study-session",
    source_id: input.sourceId ?? null,
  });
}

// Persist an anonymous device-level identifier so this user's signals coalesce
function getAnonUserId(): string {
  const KEY = "cc_anon_user_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export { getAnonUserId };
