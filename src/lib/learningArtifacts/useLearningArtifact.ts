/**
 * useLearningArtifact — generic hook that fetches the freshest
 * non-stale artifact of a given `kind` for a scope (captureId or a
 * concept-id list), and can (re)generate it by calling the
 * `generate-artifact` edge function.
 *
 * Signed-out / demo users must NOT call this hook — it always talks
 * to Supabase. Demo flows keep using local generators (studyFromCapture).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ArtifactKind, LearningArtifact, StudyScope } from "./types";
import { describeFunctionError } from "./functionError";

export interface LearningArtifactScope {
  captureId?: string;
  conceptIds?: string[];
  classId?: string;
  topic?: string;
  studyScope?: StudyScope;
}

interface UseLearningArtifactState<K extends ArtifactKind> {
  artifact: LearningArtifact<K> | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
}

export function useLearningArtifact<K extends ArtifactKind>(
  kind: K,
  scope: LearningArtifactScope,
) {
  const [state, setState] = useState<UseLearningArtifactState<K>>({
    artifact: null,
    loading: true,
    generating: false,
    error: null,
  });
  const requestVersion = useRef(0);

  const scopeKey = JSON.stringify({
    captureId: scope.captureId ?? null,
    conceptIds: scope.conceptIds ?? null,
    classId: scope.classId ?? null,
    topic: scope.topic ?? null,
    studyScope: scope.studyScope ?? null,
  });

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let q = supabase
        .from("learning_artifacts")
        .select("*")
        .eq("kind", kind)
        .eq("stale", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (scope.captureId) q = q.eq("capture_id", scope.captureId);
      else if (scope.conceptIds?.length) q = q.overlaps("concept_ids", scope.conceptIds);
      // Class is an additional boundary, not merely a fallback selector. It
      // protects direct capture/Coach links from loading a historically
      // mis-associated artifact that happens to share the explicit ID.
      if (scope.classId) q = q.eq("client_class_id", scope.classId);
      if (scope.studyScope) {
        q = q
          .eq("study_scope_type", scope.studyScope.type)
          .eq("study_scope_id", scope.studyScope.id);
      }

      const { data, error } = await q.maybeSingle();
      if (request !== requestVersion.current) return;
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
    } catch (error) {
      if (request !== requestVersion.current) return;
      setState({
        artifact: null,
        loading: false,
        generating: false,
        error: error instanceof Error ? error.message : "Couldn’t load this study set.",
      });
    }
  }, [kind, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  const generate = useCallback(
    async (opts?: { regenerate?: boolean; count?: number }) => {
      const request = ++requestVersion.current;
      setState((s) => ({ ...s, generating: true, error: null }));
      try {
        const { data, error } = await supabase.functions.invoke("generate-artifact", {
          body: {
            kind,
            captureId: scope.captureId,
            conceptIds: scope.conceptIds,
            classId: scope.classId,
            topic: scope.topic,
            studyScope: scope.studyScope,
            count: opts?.count,
            regenerate: opts?.regenerate ?? false,
          },
        });
        if (request !== requestVersion.current) return null;
        if (error) {
          const message = await describeFunctionError(error);
          if (request !== requestVersion.current) return null;
          setState((s) => ({ ...s, generating: false, error: message }));
          return null;
        }
        const artifact = ((data as { artifact: unknown } | null)?.artifact ?? null) as LearningArtifact<K> | null;
        setState({ artifact, loading: false, generating: false, error: null });
        return artifact;
      } catch (error) {
        if (request !== requestVersion.current) return null;
        setState((s) => ({
          ...s,
          generating: false,
          error: error instanceof Error ? error.message : "Couldn’t build this study set.",
        }));
        return null;
      }
    },
    [kind, scopeKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { ...state, reload: load, generate };
}
