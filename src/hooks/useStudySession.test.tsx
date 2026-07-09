/**
 * Journey test — Study session lifecycle.
 *
 * Verifies the engine that backs every Study Lab mode: setup → active
 * → results, with correct/incorrect counts flowing into the final
 * score. This is the loop that feeds readiness/momentum, so a break
 * here silently breaks a core promise of the product.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStudySession } from "@/hooks/useStudySession";
import type { StudyQuestion } from "@/data/questions";

const q = (id: string): StudyQuestion => ({
  id,
  classId: "psych101",
  topic: "Memory Models",
  type: "true-false",
  difficulty: "easy",
  question: `Q ${id}`,
  answer: "true",
});

describe("study session journey", () => {
  it("moves setup → active → results and tallies score", () => {
    const { result } = renderHook(() => useStudySession());

    expect(result.current.phase).toBe("setup");

    act(() => {
      result.current.startSession({
        classId: "psych101",
        topic: "Memory Models",
        mode: "true-false",
        difficulty: "easy",
        questions: [q("1"), q("2"), q("3")],
      });
    });

    expect(result.current.phase).toBe("active");
    expect(result.current.session?.totalQuestions).toBe(3);

    act(() => result.current.recordAnswer("1", true, "true"));
    act(() => result.current.nextQuestion());
    act(() => result.current.recordAnswer("2", false, "false"));
    act(() => result.current.nextQuestion());
    act(() => result.current.recordAnswer("3", true, "true"));
    act(() => result.current.endSession());

    expect(result.current.phase).toBe("results");
    expect(result.current.session?.correctCount).toBe(2);
    expect(result.current.session?.incorrectCount).toBe(1);
    expect(result.current.scorePercent).toBe(67);
  });
});
