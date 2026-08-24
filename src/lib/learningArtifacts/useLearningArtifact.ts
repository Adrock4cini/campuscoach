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
import { useAuth } from "@/contexts/AuthContext";
import type { ArtifactKind, LearningArtifact, StudyScope } from "./types";
import { checkCaptureConceptReadiness } from "./captureReadiness";
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
  /** True when generation was blocked because the capture is still extracting. */
  captureProcessing: boolean;
  scopeKey: string;
}

export function useLearningArtifact<K extends ArtifactKind>(
  kind: K,
  scope: LearningArtifactScope,
) {
  const { mode, user } = useAuth();
  const scopeKey = JSON.stringify({
    owner: `${mode}:${user?.id ?? "anonymous"}`,
    kind,
    captureId: scope.captureId ?? null,
    conceptIds: scope.conceptIds ?? null,
    classId: scope.classId ?? null,
    topic: scope.topic ?? null,
    studyScope: scope.studyScope ?? null,
  });
  const [state, setState] = useState<UseLearningArtifactState<K>>({
    artifact: null,
    loading: true,
    generating: false,
    error: null,
    captureProcessing: false,
    scopeKey,
  });
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setState((s) => ({
      artifact: s.scopeKey === scopeKey ? s.artifact : null,
      loading: true,
      generating: false,
      error: null,
      captureProcessing: false,
      scopeKey,
    }));
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
        setState({ artifact: null, loading: false, generating: false, error: error.message, captureProcessing: false, scopeKey });
        return;
      }
      setState({
        artifact: (data as unknown as LearningArtifact<K> | null) ?? null,
        loading: false,
        generating: false,
        error: null,
        captureProcessing: false,
        scopeKey,
      });
    } catch (error) {
      if (request !== requestVersion.current) return;
      setState({
        artifact: null,
        loading: false,
        generating: false,
        error: error instanceof Error ? error.message : "Couldn’t load this study set.",
        captureProcessing: false,
        scopeKey,
      });
    }
  }, [kind, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  const generate = useCallback(
    async (opts?: {
      regenerate?: boolean;
      count?: number;
      strategyId?: string;
      modality?: string;
      /** Technique families the student just rejected ("try another way"). */
      rejectFamilies?: string[];
    }) => {
      const request = ++requestVersion.current;
      setState((s) => ({
        artifact: s.scopeKey === scopeKey ? s.artifact : null,
        loading: false,
        generating: true,
        error: null,
        captureProcessing: false,
        scopeKey,
      }));
      try {
        // A capture is only studyable once concept extraction wrote rows for
        // it. Ask first so a fast tap shows "still reading" instead of a 404.
        if (scope.captureId) {
          const readiness = await checkCaptureConceptReadiness(scope.captureId);
          if (request !== requestVersion.current) return null;
          if (readiness.state === "processing") {
            setState((s) => ({
              ...s,
              generating: false,
              captureProcessing: true,
              error: "Still reading your capture. Your capture is saved — retry processing if this does not clear.",
            }));
            return null;
          }
          if (readiness.state === "empty") {
            setState((s) => ({
              ...s,
              generating: false,
              error: "We couldn’t pull anything studyable out of this capture. Add a note or a clearer photo, then try again.",
            }));
            return null;
          }
        }

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
            strategyId: opts?.strategyId ?? null,
            modality: opts?.modality ?? null,
            rejectFamilies: opts?.rejectFamilies ?? null,
          },
        });
        if (request !== requestVersion.current) return null;
        if (error) {
          const message = await describeFunctionError(error, scope.captureId ? { scope: "capture" } : {});
          if (request !== requestVersion.current) return null;
          setState((s) => ({ ...s, generating: false, error: message }));
          return null;
        }
        const artifact = ((data as { artifact: unknown } | null)?.artifact ?? null) as LearningArtifact<K> | null;
        setState({ artifact, loading: false, generating: false, error: null, captureProcessing: false, scopeKey });
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

  const visibleState = state.scopeKey === scopeKey
    ? state
    : { artifact: null, loading: true, generating: false, error: null, captureProcessing: false, scopeKey };

  return { ...visibleState, reload: load, generate };
}
