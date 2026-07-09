/**
 * AddExamDialog — real (Supabase) exam creation for signed-in users.
 * Emits `real-exams:changed` on success.
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
import { createExam } from "@/lib/realData/exams";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientClassId?: string;
  onCreated?: () => void;
}

export function AddExamDialog({ open, onOpenChange, defaultClientClassId, onCreated }: Props) {
  const { user } = useAuth();
  const { classes: myClasses } = useMyClasses();
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(defaultClientClassId || "");
  const [examDate, setExamDate] = useState("");
  const [topicsRaw, setTopicsRaw] = useState("");
  const [readiness, setReadiness] = useState("30");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setClassId(defaultClientClassId || myClasses[0]?.id || "");
    setExamDate("");
    setTopicsRaw("");
    setReadiness("30");
    setNotes("");
  }, [open, defaultClientClassId, myClasses]);

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !classId) {
      toast.error("Title and class are required");
      return;
    }
    setSaving(true);
    const topics = topicsRaw
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const row = await createExam(user.id, {
      title: title.trim(),
      clientClassId: classId,
      examDate: examDate || null,
      topics,
      readiness: Math.max(0, Math.min(100, parseInt(readiness) || 0)),
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!row) {
      toast.error("Couldn't save exam");
      return;
    }
    toast.success("Exam added");
    window.dispatchEvent(new CustomEvent("real-exams:changed"));
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add exam</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm 1" autoFocus />
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
              <Label>Exam date</Label>
              <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div>
              <Label>Readiness (%)</Label>
              <Input type="number" min="0" max="100" value={readiness} onChange={(e) => setReadiness(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Topics <span className="text-xs text-muted-foreground">(comma or newline separated)</span></Label>
            <Textarea value={topicsRaw} onChange={(e) => setTopicsRaw(e.target.value)} rows={2} placeholder="Chapter 3, Chapter 4, Integrals" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-calm text-primary-foreground border-0">
            {saving ? "Saving…" : "Add exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
