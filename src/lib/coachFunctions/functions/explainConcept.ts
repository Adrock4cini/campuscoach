/**
 * explain_concept — generate a level-appropriate explanation of a
 * concept using the existing `generate-artifact` edge function.
 *
 * Concept-first: always loads the concept row from permanent memory
 * before invoking artifact generation. If the underlying artifact
 * kind isn't wired up yet, returns a graceful "reserved" status.
 */
import type { CoachFunctionDefinition, CoachFunctionResult } from "../types";

interface Input {
  conceptId: string;
  style?: "simple" | "standard" | "professor";
  examples?: boolean;
}

export interface ExplainConceptPayload {
  conceptId: string;
  conceptName: string;
  style: "simple" | "standard" | "professor";
  artifactKind: "eli5" | "study_guide" | "eli_professor";
  artifactId: string | null;
  text: string | null;
  reserved: boolean;
}

const KIND_BY_STYLE: Record<"simple" | "standard" | "professor", "eli5" | "study_guide" | "eli_professor"> = {
  simple: "eli5",
  standard: "study_guide",
  professor: "eli_professor",
};

export const explainConcept: CoachFunctionDefinition<Input, ExplainConceptPayload> = {
  id: "explain_concept",
  name: "Explain concept",
  description: "Explain a selected concept at the requested level.",
  category: "understand",
  requiredInputs: [{ name: "conceptId", type: "string", description: "Concept id to explain" }],
  optionalInputs: [
    { name: "style", type: "enum", enumValues: ["simple", "standard", "professor"], description: "Explanation level" },
    { name: "examples", type: "string", description: "Include worked examples" },
  ],
  outputType: "ExplainConceptPayload",
  async execute(input, ctx): Promise<CoachFunctionResult<ExplainConceptPayload>> {
    const style = input.style ?? "standard";
    const kind = KIND_BY_STYLE[style];

    // Concept-first: load the concept row from permanent memory.
    const { data: concept, error: cErr } = await ctx.supabase
      .from("concepts")
      .select("id, name, definition, client_class_id, professor_emphasis")
      .eq("id", input.conceptId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (cErr || !concept) {
      return {
        functionId: "explain_concept",
        status: "error",
        title: "Concept not found",
        summary: "That concept doesn't exist in your memory yet.",
        evidence: [],
        actions: [],
        payload: {
          conceptId: input.conceptId, conceptName: "", style, artifactKind: kind,
          artifactId: null, text: null, reserved: false,
        },
        error: cErr?.message ?? "concept not found",
      };
    }

    // Look for an existing non-stale artifact of this kind for this concept.
    const { data: existing } = await ctx.supabase
      .from("learning_artifacts")
      .select("id, payload, updated_at")
      .eq("user_id", ctx.userId)
      .eq("kind", kind)
      .eq("stale", false)
      .overlaps("concept_ids", [concept.id])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let artifactId = existing?.id ?? null;
    let text: string | null =
      (existing?.payload as { text?: string } | null)?.text ?? null;
    let reserved = false;

    if (!existing) {
      const { data, error } = await ctx.supabase.functions.invoke("generate-artifact", {
        body: { kind, conceptIds: [concept.id], classId: concept.client_class_id },
      });
      if (error) {
        // The generator currently only implements flashcards + multiple_choice;
        // other kinds are reserved. Surface gracefully.
        reserved = /reserved|not implemented/i.test(error.message);
        if (!reserved) throw new Error(error.message);
      } else {
        const artifact = (data as { artifact?: { id: string; payload: { text?: string } } } | null)?.artifact;
        artifactId = artifact?.id ?? null;
        text = artifact?.payload?.text ?? null;
      }
    }

    return {
      functionId: "explain_concept",
      status: reserved ? "empty" : "ok",
      title: `Explain: ${concept.name}`,
      summary: reserved
        ? `${style === "simple" ? "ELI5" : style === "professor" ? "Professor-level" : "Study-guide"} explanations are on the roadmap. The concept is in memory and ready.`
        : text ?? `Explanation generated for ${concept.name}.`,
      evidence: [
        {
          type: "mastery",
          label: `Concept "${concept.name}" in permanent memory`,
          source: "concepts",
          confidence: 1,
          weight: 0.6,
        },
        ...(concept.professor_emphasis
          ? [{
              type: "signal" as const,
              label: "Professor emphasized this concept",
              source: "concepts.professor_emphasis",
              confidence: 0.9,
              weight: 0.7,
            }]
          : []),
      ],
      actions: reserved
        ? []
        : [{ label: "Study this concept", to: concept.client_class_id ? `/study-lab?classId=${encodeURIComponent(concept.client_class_id)}` : "/study-lab", kind: "study" }],
      payload: {
        conceptId: concept.id,
        conceptName: concept.name,
        style,
        artifactKind: kind,
        artifactId,
        text,
        reserved,
      },
    };
  },
};
