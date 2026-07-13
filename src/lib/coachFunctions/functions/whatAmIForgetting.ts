/**
 * what_am_i_forgetting — surface concepts decaying / overdue for
 * review, ranked by urgency × upcoming-exam weight.
 */
import type { CoachFunctionDefinition, CoachFunctionResult } from "../types";
import { daysBetween, loadExams, loadMastery } from "../dataLoaders";

interface Input {
  classId?: string;
  limit?: number;
}

export interface ForgettingItem {
  conceptId: string;
  conceptName: string;
  classId: string;
  strength: number;
  daysOverdue: number; // negative = not yet due; positive = overdue
  urgency: number; // 0..1
  reason: string;
}

export interface WhatAmIForgettingPayload {
  items: ForgettingItem[];
  suggestedArtifactKind: "flashcards" | "multiple_choice";
}

export const whatAmIForgetting: CoachFunctionDefinition<Input, WhatAmIForgettingPayload> = {
  id: "what_am_i_forgetting",
  name: "What am I forgetting?",
  description: "Find concepts decaying or overdue for review.",
  category: "memory",
  requiredInputs: [],
  optionalInputs: [
    { name: "classId", type: "string", description: "Constrain to one class" },
    { name: "limit", type: "number", description: "Max items to return (default 8)" },
  ],
  outputType: "WhatAmIForgettingPayload",
  async execute(input, ctx): Promise<CoachFunctionResult<WhatAmIForgettingPayload>> {
    const now = ctx.now ?? new Date();
    const [mastery, exams] = await Promise.all([loadMastery(ctx), loadExams(ctx)]);
    const scope = input.classId ? mastery.filter((m) => m.class_id === input.classId) : mastery;
    const limit = input.limit ?? 8;

    const examProx = new Map<string, number>();
    for (const e of exams) {
      const d = daysBetween(e.exam_date, now);
      if (d === null || d < 0) continue;
      const boost = Math.max(0, 1 - d / 14);
      const cur = examProx.get(e.class_id) ?? 0;
      if (boost > cur) examProx.set(e.class_id, boost);
    }

    const items: ForgettingItem[] = scope
      .filter((m) => m.attempts > 0) // "forgetting" requires having seen it at least once
      .map((m) => {
        const dueDays = daysBetween(m.next_review_at, now);
        const daysOverdue = dueDays === null ? 0 : -dueDays; // dueDays<=0 => overdue
        const overdueBoost = daysOverdue > 0 ? Math.min(1, daysOverdue / 7) : -0.2;
        const decay = 1 - m.strength;
        const examBoost = examProx.get(m.class_id) ?? 0;
        const urgency = Math.max(0, Math.min(1, decay * 0.5 + overdueBoost * 0.4 + examBoost * 0.3));
        const reason = daysOverdue > 0
          ? `${daysOverdue}d overdue for review`
          : m.strength < 0.5
            ? `Only ${Math.round(m.strength * 100)}% strength`
            : `Softening — last seen ${m.last_seen_at ? new Date(m.last_seen_at).toLocaleDateString() : "a while ago"}`;
        return {
          conceptId: m.concept_id,
          conceptName: m.concept_name,
          classId: m.class_id,
          strength: m.strength,
          daysOverdue,
          urgency,
          reason,
        };
      })
      .filter((r) => r.urgency > 0.15)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, limit);

    if (items.length === 0) {
      return {
        functionId: "what_am_i_forgetting",
        status: "empty",
        title: "Nothing decaying yet",
        summary: "Every concept you've studied is still fresh. Come back after your next session.",
        evidence: [{ type: "review", label: "0 concepts overdue", source: "user_concept_mastery.next_review_at", confidence: 1, weight: 0.2 }],
        actions: [],
        payload: { items: [], suggestedArtifactKind: "flashcards" },
      };
    }

    const overdueCount = items.filter((i) => i.daysOverdue > 0).length;
    const weakCount = items.filter((i) => i.strength < 0.5).length;
    const kind: "flashcards" | "multiple_choice" =
      items[0].strength < 0.4 ? "flashcards" : "multiple_choice";

    return {
      functionId: "what_am_i_forgetting",
      status: "ok",
      title: `${items.length} concept${items.length === 1 ? "" : "s"} slipping`,
      summary: overdueCount
        ? `${overdueCount} overdue for review — 10 minutes of recall will pull them back.`
        : `Softening but not yet overdue — a quick pass now prevents the decay.`,
      evidence: [
        ...(overdueCount
          ? [{
              type: "review" as const,
              label: `${overdueCount} overdue for review`,
              source: "user_concept_mastery.next_review_at",
              confidence: 1,
              weight: Math.min(1, overdueCount / items.length),
            }]
          : []),
        ...(weakCount
          ? [{
              type: "mastery" as const,
              label: `${weakCount} below 50% strength`,
              source: "user_concept_mastery",
              confidence: 1,
              weight: Math.min(1, weakCount / items.length),
            }]
          : []),
      ],
      actions: [
        { label: `Review these ${items.length} now`, to: items[0].classId ? `/study-lab?classId=${encodeURIComponent(items[0].classId)}` : "/study-lab", kind: "review" },
      ],
      minutes: 10,
      payload: { items, suggestedArtifactKind: kind },
    };
  },
};
