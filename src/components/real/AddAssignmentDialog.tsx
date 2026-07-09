/**
 * AddAssignmentDialog — real (Supabase) assignment creation for signed-in users.
 * Emits `real-assignments:changed` on success so pages can refresh.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { createAssignment, type AssignmentPriority, type AssignmentStatus } from "@/lib/realData/assignments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientClassId?: string;
  onCreated?: () => void;
}

export function AddAssignmentDialog({ open, onOpenChange, defaultClientClassId, onCreated }: Props) {
  const { user } = useAuth();
  const { classes: myClasses } = useMyClasses();
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(defaultClientClassId || "");
  const [dueDate, setDueDate] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [priority, setPriority] = useState<AssignmentPriority>("medium");
  const [status, setStatus] = useState<AssignmentStatus>("not_started");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setClassId(defaultClientClassId || myClasses[0]?.id || "");
    setDueDate("");
    setMinutes("60");
    setPriority("medium");
    setStatus("not_started");
    setNotes("");
  }, [open, defaultClientClassId, myClasses]);

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !classId) {
      toast.error("Title and class are required");
      return;
    }
    setSaving(true);
    const cls = myClasses.find((c) => c.id === classId);
    const row = await createAssignment(user.id, {
      title: title.trim(),
      clientClassId: classId,
      classUuid: (cls as any)?.uuid ?? null,
      dueDate: dueDate || null,
      estimatedMinutes: parseInt(minutes) || 30,
      priority,
      status,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!row) {
      toast.error("Couldn't save assignment");
      return;
    }
    toast.success("Assignment added");
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add assignment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Problem set 3" autoFocus />
          </div>
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>
                {myClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Estimated min</Label>
              <Input type="number" min="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: AssignmentPriority) => setPriority(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: AssignmentStatus) => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-calm text-primary-foreground border-0">
            {saving ? "Saving…" : "Add assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
