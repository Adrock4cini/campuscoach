import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { studyAttemptDisposition } from "../../supabase/functions/_shared/retry-integrity";
import {
  sameSavedItemResults,
  validArtifactItemResults,
  validItemResult,
} from "../../supabase/functions/_shared/study-item-results";

describe("study result retry integrity", () => {
  const now = Date.parse("2026-07-21T14:00:00.000Z");

  it("returns a completed attempt instead of applying mastery twice", () => {
    expect(studyAttemptDisposition("completed", "2026-07-21T13:00:00.000Z", now))
      .toBe("return-cached");
  });

  it("waits for an active request and safely resumes an abandoned one", () => {
    expect(studyAttemptDisposition("processing", "2026-07-21T13:59:50.000Z", now))
      .toBe("wait");
    expect(studyAttemptDisposition("processing", "2026-07-21T13:58:00.000Z", now))
      .toBe("resume");
  });

  it("resumes a failed attempt through the idempotent concept ledger", () => {
    expect(studyAttemptDisposition("failed", "2026-07-21T13:59:50.000Z", now))
      .toBe("resume");
  });

  it("ships an item ledger and derives mastery through its atomic RPC", () => {
    const legacyMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260721143000_add_retry_integrity.sql",
    ), "utf8");
    const itemMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20260807200000_item_level_study_results.sql",
    ), "utf8");
    const legacyEdgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result/index.ts",
    ), "utf8");
    const itemEdgeFunction = readFileSync(resolve(
      process.cwd(),
      "supabase/functions/record-study-result-v2/index.ts",
    ), "utf8");

    expect(legacyMigration).toContain("primary key (user_id, client_attempt_id, concept_id)");
    expect(itemMigration).toContain("primary key (user_id, client_attempt_id, item_index)");
    expect(itemMigration).toContain("function public.apply_study_item_result");
    expect(itemMigration).toContain(
      "revoke all on table public.study_item_results from public, anon, authenticated",
    );
    expect(itemMigration).toContain("for update of session;");
    expect(itemMigration).toContain("v_answer_correct := p_selected_choice_index = v_answer_index");
    expect(itemMigration).toContain("v_evidence_type = 'self_report' and v_answer_correct");
    expect(legacyEdgeFunction).toMatch(
      /supabase\.rpc\(\s*"apply_study_concept_result"/,
    );
    expect(itemEdgeFunction).toMatch(
      /supabase\.rpc\(\s*"apply_study_item_result"/,
    );
    expect(itemEdgeFunction).not.toContain(
      'import "../record-study-result/index.ts"',
    );
    expect(itemEdgeFunction).not.toContain(
      '.upsert(rows, { onConflict: "user_id,concept_id" })',
    );
  });

  it("rejects client-owned correctness and concept attribution", () => {
    expect(validItemResult({
      itemIndex: 0,
      confidence: "high",
      selectedChoiceIndex: 1,
    })).toBe(true);
    expect(validItemResult({
      itemIndex: 0,
      confidence: "high",
      selectedChoiceIndex: 1,
      correct: true,
    })).toBe(false);
    expect(validItemResult({
      itemIndex: 0,
      confidence: "high",
      conceptId: "client-chosen",
      selfReportedCorrect: true,
    })).toBe(false);
  });

  it("preflights every stored item and response before mastery can change", () => {
    const concepts = ["concept-a"];
    const responses = [
      { itemIndex: 0, confidence: "high" as const, selectedChoiceIndex: 1 },
      { itemIndex: 1, confidence: "medium" as const, selectedChoiceIndex: 0 },
    ];

    expect(validArtifactItemResults("multiple_choice", [
      {
        conceptId: "concept-a",
        choices: ["Incorrect", "Correct"],
        answerIndex: 1,
      },
      {
        conceptId: "concept-a",
        choices: ["Correct", "Incorrect"],
        answerIndex: 0,
      },
    ], concepts, responses)).toBe(true);

    expect(validArtifactItemResults("multiple_choice", [
      {
        conceptId: "concept-a",
        choices: ["Incorrect", "Correct"],
        answerIndex: 1,
      },
      {
        conceptId: "concept-a",
        choices: ["Only one choice"],
        answerIndex: 2,
      },
    ], concepts, responses)).toBe(false);

    expect(validArtifactItemResults("multiple_choice", [{
      conceptId: "concept-a",
      choices: ["Incorrect", "Correct"],
      answerIndex: 1,
    }], concepts, [{
      itemIndex: 0,
      confidence: "low",
      selectedChoiceIndex: 2,
    }])).toBe(false);
  });

  it("accepts an exact completed retry and rejects altered evidence", () => {
    const saved = [{
      item_index: 0,
      answer_confidence: "high",
      selected_choice_index: 1,
      self_reported_correct: null,
    }];
    expect(sameSavedItemResults([{
      itemIndex: 0,
      confidence: "high",
      selectedChoiceIndex: 1,
    }], saved)).toBe(true);
    expect(sameSavedItemResults([{
      itemIndex: 0,
      confidence: "low",
      selectedChoiceIndex: 1,
    }], saved)).toBe(false);
  });
});
