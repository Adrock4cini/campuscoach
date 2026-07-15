/**
 * useLearningArtifact — generic hook that fetches the freshest
 * non-stale artifact of a given `kind` for a scope (captureId or a
 * concept-id list), and can (re)generate it by calling the
 * `generate-artifact` edge function.
 *
 * Signed-out / demo users must NOT call this hook — it always talks
 * to Supabase. Demo flows keep using local generators (studyFromCapture).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ArtifactKind, LearningArtifact } from "./types";

interface Scope {
  captureId?: string;
  conceptIds?: string[];
  classId?: string;
  topic?: string;
}

interface UseLearningArtifactState<K extends ArtifactKind> {
  artifact: LearningArtifact<K> | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
}

export function useLearningArtifact<K extends ArtifactKind>(
  kind: K,
  scope: Scope,
) {
  const [state, setState] = useState<UseLearningArtifactState<K>>({
    artifact: null,
    loading: true,
    generating: false,
    error: null,
  });

  const scopeKey = JSON.stringify({
    captureId: scope.captureId ?? null,
    conceptIds: scope.conceptIds ?? null,
    classId: scope.classId ?? null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    let q = supabase
      .from("learning_artifacts")
      .select("*")
      .eq("kind", kind)
      .eq("stale", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (scope.captureId) q = q.eq("capture_id", scope.captureId);
    else if (scope.conceptIds?.length) q = q.overlaps("concept_ids", scope.conceptIds);
    else if (scope.classId) q = q.eq("client_class_id", scope.classId);

    const { data, error } = await q.maybeSingle();
    if (error) {
      setState({ artifact: null, loading: false, generating: false, error: error.message });
      return;
    }
    setState({
      artifact: (data as unknown as LearningArtifact<K> | null) ?? null,
      loading: false,
      generating: false,
      error: null,
    });
  }, [kind, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(
    async (opts?: { regenerate?: boolean; count?: number }) => {
      setState((s) => ({ ...s, generating: true, error: null }));
      const { data, error } = await supabase.functions.invoke("generate-artifact", {
        body: {
          kind,
          captureId: scope.captureId,
          conceptIds: scope.conceptIds,
          classId: scope.classId,
          topic: scope.topic,
          count: opts?.count,
          regenerate: opts?.regenerate ?? false,
        },
      });
      if (error) {
        setState((s) => ({ ...s, generating: false, error: error.message }));
        return null;
      }
      const artifact = ((data as { artifact: unknown } | null)?.artifact ?? null) as LearningArtifact<K> | null;
      setState({ artifact, loading: false, generating: false, error: null });
      return artifact;
    },
    [kind, scopeKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { ...state, reload: load, generate };
}
