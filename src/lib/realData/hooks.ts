/**
 * Hooks for real assignments & exams — subscribed to their own change events
 * so any dialog that creates/edits triggers a refresh across the app.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listAssignments, type RealAssignment } from "./assignments";
import { listExams, type RealExam } from "./exams";

export function useRealAssignments(clientClassId?: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<RealAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const rows = await listAssignments(user.id, clientClassId);
    setItems(rows);
    setLoading(false);
  }, [user?.id, clientClassId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("real-assignments:changed", handler);
    return () => window.removeEventListener("real-assignments:changed", handler);
  }, [reload]);

  return { items, loading, reload };
}

export function useRealExams(clientClassId?: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<RealExam[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const rows = await listExams(user.id, clientClassId);
    setItems(rows);
    setLoading(false);
  }, [user?.id, clientClassId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("real-exams:changed", handler);
    return () => window.removeEventListener("real-exams:changed", handler);
  }, [reload]);

  return { items, loading, reload };
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
