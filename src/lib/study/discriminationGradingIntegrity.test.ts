import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("server-derived discrimination evidence", () => {
  const recorder = source("supabase/functions/record-study-result/index.ts");
  const runner = source("src/components/study/RealStudyRunner.tsx");
  const matchingGame = source("src/components/study/RealMatchingGame.tsx");
  const matchingSession = source("src/components/study/RealMatchingSession.tsx");
  const matchingState = source("src/lib/study/matchingSessionState.ts");

  it("submits first MC selections and grades them against the stored artifact", () => {
    expect(runner).toContain("firstSelectedIndex: picked");
    expect(recorder).toContain("gradeMultipleChoiceSelections(");
    expect(recorder).toContain("artifact.payload,");
    expect(recorder).toContain("correct: grade.correct");
    expect(recorder).toContain("firstSelectedIndex: grade.firstSelectedIndex");
    expect(recorder).toContain("multiple-choice result does not match its stored question");
  });

  it("submits immutable matching pair IDs and never grades the forced final pair", () => {
    expect(matchingGame).toContain("leftPairId: pair.id");
    expect(matchingGame).toContain("rightPairId: firstAttemptByPair[pair.id]");
    expect(matchingSession).toContain("matchingFirstChoices: completion.firstChoices");
    expect(recorder).toContain("gradeMatchingFirstChoices(artifact.payload");
    expect(recorder).toContain("firstLeftPairId: grade.leftPairId");
    expect(recorder).toContain("firstSelectedPairId: grade.rightPairId");
  });

  it("binds raw choices into the canonical attempt hash", () => {
    const hashStart = recorder.indexOf("async function studyResultRequestHash(");
    const hashSource = recorder.slice(hashStart);
    expect(hashSource).toContain("firstSelectedIndex?: number");
    expect(hashSource).toContain("firstLeftPairId?: string");
    expect(hashSource).toContain("firstSelectedPairId?: string");
    expect(hashSource).toContain("map(([conceptId, result]) => ({ conceptId, ...result }))");
  });

  it("persists only validated grading metadata for exact Match Lab reload repair", () => {
    expect(matchingSession).toContain("writeMatchingSessionState({");
    expect(matchingSession).toContain("restoredPendingRequest.current");
    expect(matchingSession).toContain("void saveRef.current()");
    expect(matchingState).toContain("hasOnlyKeys(parsed");
    expect(matchingState).not.toContain("sourceExcerpt");
    expect(matchingState).not.toContain("answerText:");
  });
});
