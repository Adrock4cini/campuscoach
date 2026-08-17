/**
 * Hooks for real assignments & exams — subscribed to their own change events
 * so any dialog that creates/edits triggers a refresh across the app.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listAssignments, type RealAssignment } from "./assignments";
import { listExams, type RealExam } from "./exams";

export function useRealAssignments(clientClassId?: string, enabled = true) {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<RealAssignment[]>([]);
  const scopeKey = enabled && userId ? `${userId}:${clientClassId ?? "*"}` : "none";
  const [itemsScope, setItemsScope] = useState(scopeKey);
  const itemsScopeRef = useRef(scopeKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!enabled) { itemsScopeRef.current = "none"; setItems([]); setItemsScope("none"); setLoading(false); setError(null); return; }
    if (!userId) { itemsScopeRef.current = "none"; setItems([]); setItemsScope("none"); setLoading(false); setError(null); return; }
    setItems((current) => itemsScopeRef.current === scopeKey ? current : []);
    itemsScopeRef.current = scopeKey;
    setItemsScope(scopeKey);
    setLoading(true);
    setError(null);
    try {
      const rows = await listAssignments(userId, clientClassId);
      if (request !== requestVersion.current) return;
      setItems(rows);
    } catch {
      if (request !== requestVersion.current) return;
      setError("We couldn’t load your assignments.");
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [userId, clientClassId, enabled, scopeKey]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("real-assignments:changed", handler);
    return () => window.removeEventListener("real-assignments:changed", handler);
  }, [reload]);

  return {
    items: itemsScope === scopeKey ? items : [],
    loading: itemsScope === scopeKey ? loading : enabled && !!userId,
    error: itemsScope === scopeKey ? error : null,
    reload,
  };
}

export function useRealExams(clientClassId?: string, enabled = true) {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<RealExam[]>([]);
  const scopeKey = enabled && userId ? `${userId}:${clientClassId ?? "*"}` : "none";
  const [itemsScope, setItemsScope] = useState(scopeKey);
  const itemsScopeRef = useRef(scopeKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!enabled) { itemsScopeRef.current = "none"; setItems([]); setItemsScope("none"); setLoading(false); setError(null); return; }
    if (!userId) { itemsScopeRef.current = "none"; setItems([]); setItemsScope("none"); setLoading(false); setError(null); return; }
    setItems((current) => itemsScopeRef.current === scopeKey ? current : []);
    itemsScopeRef.current = scopeKey;
    setItemsScope(scopeKey);
    setLoading(true);
    setError(null);
    try {
      const rows = await listExams(userId, clientClassId);
      if (request !== requestVersion.current) return;
      setItems(rows);
    } catch {
      if (request !== requestVersion.current) return;
      setError("We couldn’t load your exams.");
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [userId, clientClassId, enabled, scopeKey]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("real-exams:changed", handler);
    return () => window.removeEventListener("real-exams:changed", handler);
  }, [reload]);

  return {
    items: itemsScope === scopeKey ? items : [],
    loading: itemsScope === scopeKey ? loading : enabled && !!userId,
    error: itemsScope === scopeKey ? error : null,
    reload,
  };
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
