import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUserId } from "@/hooks/useClassIntelligence";
import { confirmPlannerDate, loadPlannerDates, type PendingPlannerDate } from "@/lib/capture/plannerPersistence";
import { CAPTURE_PLANNER_VERSION, plannerDateWarnings, validPlannerDate } from "@/lib/capture/plannerDates";

interface Props { classId: string; className?: string; captureIds?: string[] }
type ReviewRow = PendingPlannerDate & { checked: boolean; editedTitle: string; editedDate: string; saved?: boolean };

/** Shared by photo completion, file completion and the class surface.
 * Only confirmed inserts affect assignments/exams/calendar; never mastery.
 */
export function CapturePlannerReview(props: Props) {
  const ownerId = getAuthenticatedUserId();
  const captureKey = props.captureIds ? [...props.captureIds].sort().join(",") : "*";
  // Remount on account/class/source changes so a previous student's draft is
  // never rendered while the next scope is loading.
  if (!ownerId) return null;
  return <PlannerReview key={`${ownerId}:${props.classId}:${captureKey}`} {...props} ownerId={ownerId} captureKey={captureKey} />;
}

function PlannerReview({ classId, className, ownerId, captureKey }: Props & { ownerId: string; captureKey: string }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const saving = useRef(false);
  const request = useRef(0);
  const reload = useCallback(async () => {
    if (saving.current) return;
    const version = ++request.current;
    setLoading(true); setError("");
    try {
      const proposals = await loadPlannerDates(ownerId, classId, captureKey === "*" ? undefined : captureKey.split(",").filter(Boolean));
      if (!mounted.current || request.current !== version || getAuthenticatedUserId() !== ownerId) return;
      setRows(current => proposals.map(proposal => {
        const old = current.find(row => row.plannerId === proposal.plannerId);
        return { ...proposal, checked: old?.checked ?? false, editedTitle: old?.editedTitle ?? proposal.title, editedDate: old?.editedDate ?? proposal.date };
      }));
    } catch (failure) {
      if (mounted.current && request.current === version) setError(failure instanceof Error ? failure.message : "Could not review dates.");
    } finally { if (mounted.current && request.current === version) setLoading(false); }
  }, [ownerId, classId, captureKey]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const changed = () => void reload();
    window.addEventListener("capture:committed", changed);
    window.addEventListener("concepts:extracted", changed);
    window.addEventListener("capture-planner:changed", changed);
    return () => { mounted.current = false; window.removeEventListener("capture:committed", changed); window.removeEventListener("concepts:extracted", changed); window.removeEventListener("capture-planner:changed", changed); };
  }, [reload]);

  const edit = (id: string, patch: Partial<ReviewRow>) => setRows(current => current.map(row => row.plannerId === id ? { ...row, ...patch } : row));
  const selected = rows.filter(row => row.checked && !row.saved);
  const save = async () => {
    if (saving.current || !selected.length) return;
    saving.current = true; request.current++; setBusy(true); setError(""); setMessage("");
    let added = 0; let existing = 0;
    try {
      for (const row of selected) {
        if (!mounted.current || getAuthenticatedUserId() !== ownerId) break;
        const outcome = await confirmPlannerDate(ownerId, row, { title: row.editedTitle, date: row.editedDate });
        if (outcome === "added") added++; else existing++;
        if (mounted.current) edit(row.plannerId, { saved: true, checked: false });
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not save dates. Please retry.");
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false); setLoading(false);
        setMessage(`${added} added to your planner${existing ? ` · ${existing} already saved` : ""}. Saved items appear in Assignments, Tests and Calendar.`);
      }
    }
  };
  if (getAuthenticatedUserId() !== ownerId) return null;
  if (loading && !rows.length) return <p role="status" className="text-xs text-muted-foreground">Checking saved material for dates…</p>;
  if (!rows.length && !error && !message) return null;
  const pending = rows.filter(row => !row.saved).length;
  return <section aria-label="Dates from class material" data-feature={CAPTURE_PLANNER_VERSION} className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
    <div>
      <h3 className="font-semibold">{pending ? `${pending} possible ${pending === 1 ? "date" : "dates"} found` : "Dates from class material"}</h3>
      <p className="text-sm text-muted-foreground">For {className || "this class"}. Nothing is added until you check the source and confirm.</p>
    </div>
    {pending > 0 && <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => setExpanded(value => !value)}>{expanded ? "Review later" : "Review dates for planner"}</Button>}
    {expanded && <div className="space-y-4">
      {rows.map((row, index) => <fieldset key={row.plannerId} disabled={busy || row.saved} className="min-w-0 space-y-2 rounded-xl border bg-background p-3">
        <legend className="px-1 text-sm font-medium">{row.kind === "exam" ? "Test / quiz" : "Assignment"}{row.saved ? " · Saved" : ""}</legend>
        <p className="break-words text-xs text-muted-foreground">Source: {row.sourceLabel}</p>
        <blockquote className="break-words border-l-2 border-primary/30 pl-2 text-sm">{row.excerpt}</blockquote>
        <label className="block text-sm">Title
          <input aria-label={`Title ${index + 1}`} className="mt-1 min-h-11 w-full rounded-lg border bg-background p-2" maxLength={180} value={row.editedTitle} onChange={e => edit(row.plannerId, { editedTitle: e.target.value, checked: false })} />
        </label>
        <label className="block text-sm">{row.kind === "exam" ? "Test date" : "Due date"}
          <input type="date" aria-label={`Date ${index + 1}`} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-background p-2" value={row.editedDate} onChange={e => edit(row.plannerId, { editedDate: e.target.value, checked: false })} />
        </label>
        {[...row.warnings, ...plannerDateWarnings(row.excerpt, row.editedDate)].map(warning => <p key={warning} className="text-xs text-warning">{warning}</p>)}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={row.checked} disabled={row.saved || busy || !validPlannerDate(row.editedDate) || !row.editedTitle.trim()} onChange={e => edit(row.plannerId, { checked: e.target.checked })} />
          {row.saved ? "Saved to planner" : "I checked this title and date — add it"}
        </label>
      </fieldset>)}
      {pending > 0 && <Button className="min-h-11 w-full" disabled={busy || !selected.length || selected.some(row => !validPlannerDate(row.editedDate) || !row.editedTitle.trim())} onClick={() => void save()}>{busy ? "Adding checked dates…" : `Add ${selected.length} checked ${selected.length === 1 ? "date" : "dates"}`}</Button>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <div role="alert" className="text-sm"><p>{error}</p><Button variant="ghost" disabled={busy} onClick={() => void reload()}>Recheck saved dates</Button></div>}
  </section>;
}
