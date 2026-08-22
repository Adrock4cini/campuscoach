/**
 * Real "needs attention" container.
 *
 * Owns the resolution loop for overdue work: mark it done, say you're still
 * working on it, or archive it as no longer relevant. The teacher-assigned
 * due date is factual and is NEVER rewritten to silence a reminder — "still
 * doing it" only records progress, and stale priority decay handles the noise.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ClassInfo } from "@/data/demo";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { buildUrgentItems, type UrgentItem } from "@/lib/dashboard/urgentItems";
import { updateAssignment } from "@/lib/realData/assignments";
import { UrgentAttentionView, type UrgentResolution } from "@/components/dashboard/UrgentAttentionView";


export function RealUrgentAttention({ classes = [], now = new Date() }: { classes?: ClassInfo[]; now?: Date }) {
  const { items: assignments, loading: assignmentsLoading, reload: reloadAssignments } = useRealAssignments();
  const { items: exams, loading: examsLoading } = useRealExams();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo(
    () => buildUrgentItems(classes, assignments, exams, now),
    [classes, assignments, exams, now],
  );

  const resolve = async (item: UrgentItem, resolution: UrgentResolution) => {
    if (item.kind !== "assignment") return;
    setBusyId(item.id);
    const patch =
      resolution === "complete" ? { status: "complete" as const }
      : resolution === "still-doing" ? { status: "in_progress" as const, due_date: toDateKey(new Date(now)) }
      : { source_archived_at: new Date().toISOString() };

    const updated = await updateAssignment(item.id, patch);
    setBusyId(null);
    if (!updated) {
      toast.error("Couldn’t update that — nothing was lost, try again.");
      return;
    }
    toast.success(
      resolution === "complete" ? "Nice — marked done."
      : resolution === "still-doing" ? "Moved to today."
      : "Archived. It won’t nag you again.",
    );
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
    void reloadAssignments();
  };

  return (
    <UrgentAttentionView
      items={items}
      loading={assignmentsLoading || examsLoading}
      busyId={busyId}
      onResolve={(item, resolution) => { void resolve(item, resolution); }}
    />
  );
}
