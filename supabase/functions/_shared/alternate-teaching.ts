/**
 * A zero-model teaching response for a mnemonic request that was routed to a
 * deterministic strategy. This is intentionally not a learning_artifacts row:
 * it is a small, request-scoped teaching turn backed only by the selected
 * concept and its exact grounded text.
 */

import { detectVerifiedShortcuts, type VerifiedShortcut } from "./math-shortcuts.ts";
import { STRATEGY_BY_ID } from "./strategy-catalog.ts";

export const ALTERNATE_TEACHING_SCHEMA_VERSION = "alternate-teaching-v1" as const;

export type AlternateTeachingExecutedStrategyId =
  | "compare-table"
  | "retrieval-question"
  | "verified-math-shortcut";

interface AlternateTeachingBase {
  schemaVersion: typeof ALTERNATE_TEACHING_SCHEMA_VERSION;
  /** The deterministic catalog strategy selected before execution. */
  selectedStrategyId: string;
  /** The deterministic method that actually authored the displayed turn. */
  executedStrategyId: AlternateTeachingExecutedStrategyId;
  deterministic: true;
  conceptId: string;
  conceptName: string;
  prompt: string;
  /** The exact source-supported answer. Never authored or paraphrased here. */
  answer: string;
  /** The exact excerpt used to support this teaching turn. */
  sourceExcerpt: string;
}

export interface RetrievalAlternateTeaching extends AlternateTeachingBase {
  kind: "retrieval-question";
  executedStrategyId: "retrieval-question";
}

export interface ComparisonAlternateTeaching extends AlternateTeachingBase {
  kind: "compare-table";
  executedStrategyId: "compare-table";
  items: [
    { label: string; evidence: string | null },
    { label: string; evidence: string | null },
  ];
}

export interface VerifiedMathShortcutAlternateTeaching extends AlternateTeachingBase {
  kind: "verified-math-shortcut";
  executedStrategyId: "verified-math-shortcut";
  shortcut: VerifiedShortcut;
}

export type AlternateTeaching =
  | RetrievalAlternateTeaching
  | ComparisonAlternateTeaching
  | VerifiedMathShortcutAlternateTeaching;

export interface AlternateTeachingInput {
  selectedStrategyId: string;
  conceptId: string;
  conceptName: string;
  exactTarget: string;
  sourceExcerpt?: string | null;
}

/** Academic values already visible to, and trusted by, the current UI. */
export interface AlternateTeachingBoundary {
  conceptId: string;
  conceptName: string;
  exactTarget: string;
  sourceExcerpt: string;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function comparisonLabels(conceptName: string): [string, string] | null {
  const match = conceptName.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i)
    ?? conceptName.match(/^(.+?)\s*\/\s*(.+)$/);
  if (!match) return null;
  const left = boundedText(match[1], 120);
  const right = boundedText(match[2], 120);
  return left && right && left.toLocaleLowerCase() !== right.toLocaleLowerCase()
    ? [left, right]
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts only text that follows an explicit `Label:` marker. If the source
 * does not state two separately labelled facts, the UI leaves the cells
 * unfilled and displays the exact contrast below instead of inventing cells.
 */
function labelledEvidence(
  source: string,
  label: string,
  otherLabel: string,
): string | null {
  const start = new RegExp(`(?:^|[.;]\\s*)${escapeRegExp(label)}\\s*:\\s*`, "i").exec(source);
  if (!start) return null;
  const valueStart = start.index + start[0].length;
  const remainder = source.slice(valueStart);
  const other = new RegExp(`(?:^|[.;]\\s*)${escapeRegExp(otherLabel)}\\s*:\\s*`, "i").exec(remainder);
  const exact = (other ? remainder.slice(0, other.index) : remainder).trim();
  return boundedText(exact, 500);
}

function retrieval(input: {
  selectedStrategyId: string;
  conceptId: string;
  conceptName: string;
  answer: string;
  sourceExcerpt: string;
}): RetrievalAlternateTeaching {
  return {
    schemaVersion: ALTERNATE_TEACHING_SCHEMA_VERSION,
    kind: "retrieval-question",
    selectedStrategyId: input.selectedStrategyId,
    executedStrategyId: "retrieval-question",
    deterministic: true,
    conceptId: input.conceptId,
    conceptName: input.conceptName,
    prompt: `Without looking, what do you need to remember about ${input.conceptName}?`,
    answer: input.answer,
    sourceExcerpt: input.sourceExcerpt,
  };
}

function verifiedMathShortcut(input: {
  selectedStrategyId: string;
  conceptId: string;
  conceptName: string;
  answer: string;
  sourceExcerpt: string;
  shortcut: VerifiedShortcut;
}): VerifiedMathShortcutAlternateTeaching {
  return {
    schemaVersion: ALTERNATE_TEACHING_SCHEMA_VERSION,
    kind: "verified-math-shortcut",
    selectedStrategyId: input.selectedStrategyId,
    executedStrategyId: "verified-math-shortcut",
    deterministic: true,
    conceptId: input.conceptId,
    conceptName: input.conceptName,
    prompt: `Use this checked shortcut for ${input.conceptName}.`,
    answer: input.answer,
    sourceExcerpt: input.sourceExcerpt,
    shortcut: input.shortcut,
  };
}

/**
 * Builds a grounded deterministic teaching turn. A compare request without a
 * real pair safely executes retrieval instead; the response records both the
 * requested and actually executed strategies so downstream UI cannot mislabel
 * the method.
 */
export function buildAlternateTeaching(input: AlternateTeachingInput): AlternateTeaching | null {
  const selected = STRATEGY_BY_ID[input.selectedStrategyId];
  if (!selected || selected.cost !== "deterministic") return null;
  const conceptId = boundedText(input.conceptId, 160);
  const conceptName = boundedText(input.conceptName, 300);
  const answer = boundedText(input.exactTarget, 500);
  const sourceExcerpt = boundedText(input.sourceExcerpt, 600) ?? answer;
  if (!conceptId || !conceptName || !answer || !sourceExcerpt) return null;
  if (!sourceExcerpt.includes(answer)) return null;

  if (input.selectedStrategyId === "verified-math-shortcut") {
    const shortcut = detectVerifiedShortcuts(`${answer}\n${sourceExcerpt}`, 1)[0];
    if (shortcut) {
      return verifiedMathShortcut({
        selectedStrategyId: input.selectedStrategyId,
        conceptId,
        conceptName,
        answer,
        sourceExcerpt,
        shortcut,
      });
    }
  }

  if (input.selectedStrategyId === "compare-table") {
    const labels = comparisonLabels(conceptName);
    if (labels) {
      return {
        schemaVersion: ALTERNATE_TEACHING_SCHEMA_VERSION,
        kind: "compare-table",
        selectedStrategyId: "compare-table",
        executedStrategyId: "compare-table",
        deterministic: true,
        conceptId,
        conceptName,
        prompt: `How are ${labels[0]} and ${labels[1]} different?`,
        answer,
        sourceExcerpt,
        items: [
          {
            label: labels[0],
            evidence: labelledEvidence(sourceExcerpt, labels[0], labels[1]),
          },
          {
            label: labels[1],
            evidence: labelledEvidence(sourceExcerpt, labels[1], labels[0]),
          },
        ],
      };
    }
  }

  return retrieval({
    selectedStrategyId: input.selectedStrategyId,
    conceptId,
    conceptName,
    answer,
    sourceExcerpt,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function selectedStrategyId(value: unknown): string | null {
  const id = boundedText(value, 120);
  return id && STRATEGY_BY_ID[id]?.cost === "deterministic" ? id : null;
}

function sameShortcut(value: unknown, expected: VerifiedShortcut): boolean {
  const candidate = record(value);
  if (!candidate) return false;
  const expectedKeys = ["conditions", "example", "id", "statement", "title", "verified", "why"];
  if (Object.keys(candidate).sort().join("|") !== expectedKeys.join("|")) return false;
  return candidate.id === expected.id
    && candidate.title === expected.title
    && candidate.statement === expected.statement
    && candidate.why === expected.why
    && candidate.conditions === expected.conditions
    && candidate.example === expected.example
    && candidate.verified === true;
}

/**
 * Runtime validation for the network/UI boundary. The canonical response is
 * rebuilt from the UI-known academic boundary, never from answer/source values
 * supplied by the network candidate itself.
 */
export function parseAlternateTeaching(
  value: unknown,
  expected: AlternateTeachingBoundary,
): AlternateTeaching | null {
  const candidate = record(value);
  if (!candidate || candidate.schemaVersion !== ALTERNATE_TEACHING_SCHEMA_VERSION) return null;
  if (candidate.deterministic !== true) return null;

  const selectedId = selectedStrategyId(candidate.selectedStrategyId);
  const executedStrategyId = boundedText(candidate.executedStrategyId, 120);
  const conceptId = boundedText(candidate.conceptId, 160);
  const conceptName = boundedText(candidate.conceptName, 300);
  const prompt = boundedText(candidate.prompt, 500);
  const answer = boundedText(candidate.answer, 500);
  const sourceExcerpt = boundedText(candidate.sourceExcerpt, 600);
  if (!selectedId || !executedStrategyId || !conceptId || !conceptName
    || !prompt || !answer || !sourceExcerpt) return null;
  const expectedConceptId = boundedText(expected.conceptId, 160);
  const expectedConceptName = boundedText(expected.conceptName, 300);
  const expectedTarget = boundedText(expected.exactTarget, 500);
  const expectedSource = boundedText(expected.sourceExcerpt, 600);
  if (!expectedConceptId || !expectedConceptName || !expectedTarget || !expectedSource) return null;
  if (conceptId !== expectedConceptId || conceptName !== expectedConceptName) return null;
  if (answer !== expectedTarget || sourceExcerpt !== expectedSource) return null;

  // Rebuild from the UI-known academic inputs. This verifies the deterministic
  // prompt, execution downgrade, and comparison cells instead of trusting
  // network-authored teaching copy that carries a plausible schema.
  const canonical = buildAlternateTeaching({
    selectedStrategyId: selectedId,
    conceptId: expectedConceptId,
    conceptName: expectedConceptName,
    exactTarget: expectedTarget,
    sourceExcerpt: expectedSource,
  });
  if (
    !canonical
    || canonical.kind !== candidate.kind
    || canonical.executedStrategyId !== executedStrategyId
    || canonical.prompt !== prompt
  ) return null;

  if (candidate.kind === "retrieval-question") {
    if (executedStrategyId !== "retrieval-question") return null;
    return canonical.kind === "retrieval-question" ? canonical : null;
  }

  if (candidate.kind === "verified-math-shortcut") {
    if (executedStrategyId !== "verified-math-shortcut") return null;
    if (canonical.kind !== "verified-math-shortcut") return null;
    return sameShortcut(candidate.shortcut, canonical.shortcut) ? canonical : null;
  }

  if (candidate.kind !== "compare-table" || executedStrategyId !== "compare-table") return null;
  if (!Array.isArray(candidate.items) || candidate.items.length !== 2) return null;
  const parsedItems = candidate.items.map((item) => {
    const row = record(item);
    const label = boundedText(row?.label, 120);
    const evidence = row?.evidence === null ? null : boundedText(row?.evidence, 500);
    return label && (row?.evidence === null || evidence)
      ? { label, evidence }
      : null;
  });
  if (!parsedItems[0] || !parsedItems[1]) return null;
  if (canonical.kind !== "compare-table") return null;
  const expectedItems = canonical.items;
  if (parsedItems.some((item, index) => (
    item?.label !== expectedItems[index].label
    || item?.evidence !== expectedItems[index].evidence
  ))) return null;
  return canonical;
}
