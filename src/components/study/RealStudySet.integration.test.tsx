import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealStudySet } from "./RealStudySet";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";
import { STUDY_CONTENT_VERSION, needsConciseStudyRebuild } from "../../../supabase/functions/_shared/study-content";
import { buildCapturePolicyGroundedExcerptMap } from "../../../supabase/functions/_shared/grounded-excerpt";
import { buildDeterministicFlashcards, buildDeterministicMultipleChoice, buildDeterministicMatchingPairs, validateArtifactPayload } from "../../../supabase/functions/_shared/artifact-validation";
import { assessSourceSufficiency } from "../../../supabase/functions/_shared/grounding-quality";
import { isTeachableAnswer } from "../../../supabase/functions/_shared/teachable-content";

const mocks = vi.hoisted(() => ({ saved: null as unknown, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ mode: "real", user: { id: "qa-student" } }) }));
vi.mock("@/lib/realData/hooks", () => ({ useRealExams: () => ({ items: [{ id: "quiz-1", title: "Quiz 1", exam_date: "2099-09-19", topics: ["memory"] }], loading: false }) }));
vi.mock("@/lib/study/strategyEvidence", async (original) => ({ ...await original<object>(), useStrategyEvidence: () => ({ evidence: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "overlaps"]) query[method] = () => query;
    query.maybeSingle = async () => ({ data: mocks.saved, error: null });
    return query;
  },
  functions: { invoke: mocks.invoke },
} }));

const slide = `PSYC 210 — Learning & Memory
Week 3 lecture slides
PSYC 210 · Week 3 · Dr. Hale · Fall 2026
Key concepts for Quiz 1
• Encoding: getting info into memory
• Storage: keeping it over time
• Retrieval: getting it back out
• Spacing effect beats massed practice
Assignment (from this slide — due Fri Sep 12)
Write 1 page: explain spacing effect in your own words
Quiz 1 — Friday Sep 19 in class
Covers: encoding, storage, retrieval, spacing effect
10 multiple choice. Bring a pencil. No notes.`;
const concepts = ["Encoding", "Storage", "Retrieval"].map((name) => ({ id: name, name, capture_id: "slide-1" }));
const sources = buildCapturePolicyGroundedExcerptMap(concepts, [{ id: "slide-1", kind: "scan-material", raw_text: slide }], { preferStudyClauses: true });
const expected = ["getting info into memory", "keeping it over time", "getting it back out"];
type Kind = "flashcards" | "multiple_choice" | "matching";
function generated(kind: Kind) {
  // Exercise the real source selection, deterministic builder and validation,
  // then the real hook and runner. Only database/HTTP boundaries are simulated.
  for (const concept of concepts) {
    expect(assessSourceSufficiency(sources.get(concept.id)!).sufficient).toBe(true);
    expect(isTeachableAnswer(sources.get(concept.id)!)).toBe(true);
  }
  const payload = kind === "flashcards" ? { cards: buildDeterministicFlashcards(concepts, sources, 3) }
    : kind === "multiple_choice" ? { questions: buildDeterministicMultipleChoice(concepts, sources, 3) }
    : { pairs: buildDeterministicMatchingPairs(concepts, sources, 3).pairs };
  const validated = validateArtifactPayload(kind, payload, { concepts, expectedCount: 3, sourceExcerptByConcept: sources });
  expect(validated.ok).toBe(true);
  if (validated.ok === false) throw new Error(validated.error);
  expect(needsConciseStudyRebuild(kind, validated.payload)).toBe(false);
  return {
    id: `${kind}-artifact`, user_id: "qa-student", client_class_id: "psych", kind,
    concept_ids: concepts.map(c => c.id), capture_id: null,
    study_scope_type: "exam", study_scope_id: "quiz-1", study_scope_label: "Quiz 1",
    study_scope_snapshot: { studyContentVersion: STUDY_CONTENT_VERSION },
    payload: validated.payload, prompt_version: CURRENT_ARTIFACT_PROMPT_VERSION, stale: false,
    created_at: "2026-09-17T02:00:00Z", updated_at: "2026-09-17T02:00:00Z",
  };
}

beforeEach(() => { mocks.saved = null; mocks.invoke.mockReset(); localStorage.clear(); });
describe("assessment Build & start across the real generation seam", () => {
  it.each<Kind>(["flashcards", "multiple_choice", "matching"])("opens concise %s after exactly one generation", async kind => {
    const artifact = generated(kind);
    mocks.invoke.mockResolvedValue({ data: { artifact, studyContentVersion: STUDY_CONTENT_VERSION }, error: null });
    render(<RealStudySet classId="psych" initialExamId="quiz-1" initialKind={kind} />);
    fireEvent.click(await screen.findByRole("button", { name: /build & start/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("generate-artifact", expect.objectContaining({ body: expect.objectContaining({ studyScope: expect.objectContaining({ type: "exam", id: "quiz-1" }) }) }));
    if (kind === "flashcards") {
      fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
      fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
      expect(screen.getByText(expected[0])).toBeInTheDocument();
      expect(screen.getByText("Show source").closest("details")).not.toHaveAttribute("open");
    }
    expect(screen.queryByText(/Refresh this set before studying/)).not.toBeInTheDocument();
    expect(screen.queryByText(slide)).not.toBeInTheDocument();
  });

  it("refreshes a short legacy multi-concept dump instead of allowing Start", async () => {
    const artifact = generated("flashcards");
    mocks.saved = { ...artifact, payload: { cards: [{ front: "Recall Encoding", back: "Encoding: getting info into memory • Storage: keeping it over time • Retrieval: getting it back out", conceptId: "Encoding", conceptName: "Encoding" }] } };
    mocks.invoke.mockResolvedValue({ data: { artifact, studyContentVersion: STUDY_CONTENT_VERSION }, error: null });
    render(<RealStudySet classId="psych" initialExamId="quiz-1" />);
    const refresh = await screen.findByRole("button", { name: /refresh from notes/i });
    expect(screen.queryByRole("button", { name: /start study session/i })).not.toBeInTheDocument();
    fireEvent.click(refresh);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it.each(["old backend", "bad payload"])("stops the refresh loop for %s without opening practice", async failure => {
    const artifact = generated("flashcards");
    if (failure === "bad payload") artifact.payload = { cards: [{ back: "word ".repeat(50) }] };
    mocks.invoke.mockResolvedValue({ data: { artifact, ...(failure === "bad payload" ? { studyContentVersion: STUDY_CONTENT_VERSION } : {}) }, error: null });
    render(<RealStudySet classId="psych" initialExamId="quiz-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /build & start/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be verified/);
    expect(screen.getByRole("button", { name: /build & start/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /build & start/i }));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a useful source error for schedule-only material without a refresh loop", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Add a definition or worked example for this study target." }), { status: 422 }) } });
    render(<RealStudySet classId="psych" initialExamId="quiz-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /build & start/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Add a definition/);
    expect(screen.queryByText(/Refresh this set before studying/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
