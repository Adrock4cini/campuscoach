/**
 * useCoachFunction — the ONE hook the UI uses to invoke any
 * registered coach function. The UI does not care how the function
 * works internally.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { coachFunctionRegistry } from "./registry";
import type { CoachFunctionResult } from "./types";

export function useCoachFunction<I = unknown, P = unknown>(functionId: string) {
  const { user } = useAuth();
  const [result, setResult] = useState<CoachFunctionResult<P> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (input: I): Promise<CoachFunctionResult<P> | null> => {
      if (!user) {
        const err = "Not signed in — coach functions require a real user.";
        setError(err);
        return null;
      }
      setLoading(true);
      setError(null);
      const r = await coachFunctionRegistry.run<I, P>(functionId, input, {
        supabase,
        userId: user.id,
      });
      setResult(r);
      setLoading(false);
      if (r.status === "error") setError(r.error ?? "Coach function failed");
      return r;
    },
    [functionId, user],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { execute, result, loading, error, reset };
}
