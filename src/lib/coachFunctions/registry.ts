/**
 * Coach Function Registry — the single map the UI dispatches through.
 *
 * Adding a new function = register it here. UI code should NEVER
 * import a specific function module directly; it looks up by id.
 */
import type {
  CoachFunctionContext,
  CoachFunctionDefinition,
  CoachFunctionResult,
} from "./types";

import { whatShouldIDoNow } from "./functions/whatShouldIDoNow";
import { studyWeakestTopic } from "./functions/studyWeakestTopic";
import { prepareForExam } from "./functions/prepareForExam";
import { explainConcept } from "./functions/explainConcept";
import { whatAmIForgetting } from "./functions/whatAmIForgetting";

const DEFS: CoachFunctionDefinition<unknown, unknown>[] = [
  whatShouldIDoNow as unknown as CoachFunctionDefinition<unknown, unknown>,
  studyWeakestTopic as unknown as CoachFunctionDefinition<unknown, unknown>,
  prepareForExam as unknown as CoachFunctionDefinition<unknown, unknown>,
  explainConcept as unknown as CoachFunctionDefinition<unknown, unknown>,
  whatAmIForgetting as unknown as CoachFunctionDefinition<unknown, unknown>,
];

const REGISTRY = new Map<string, CoachFunctionDefinition<unknown, unknown>>(
  DEFS.map((d) => [d.id, d]),
);

export const coachFunctionRegistry = {
  list(): CoachFunctionDefinition<unknown, unknown>[] {
    return [...REGISTRY.values()];
  },
  get<I = unknown, P = unknown>(
    id: string,
  ): CoachFunctionDefinition<I, P> | undefined {
    return REGISTRY.get(id) as CoachFunctionDefinition<I, P> | undefined;
  },
  async run<I = unknown, P = unknown>(
    id: string,
    input: I,
    ctx: CoachFunctionContext,
  ): Promise<CoachFunctionResult<P>> {
    const def = REGISTRY.get(id) as CoachFunctionDefinition<I, P> | undefined;
    if (!def) {
      return {
        functionId: id,
        status: "error",
        title: "Unknown coach function",
        summary: `No coach function registered for id "${id}".`,
        evidence: [],
        actions: [],
        payload: {} as P,
        error: `unknown function: ${id}`,
      };
    }
    try {
      return await def.execute(input, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        functionId: id,
        status: "error",
        title: def.name,
        summary: "The coach ran into a problem answering that.",
        evidence: [],
        actions: [],
        payload: {} as P,
        error: message,
      };
    }
  },
};

export type CoachFunctionId =
  | "what_should_i_do_now"
  | "study_weakest_topic"
  | "prepare_for_exam"
  | "explain_concept"
  | "what_am_i_forgetting";
