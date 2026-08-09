/**
 * AddExamDialog — real (Supabase) exam creation for signed-in users.
 * Emits `real-exams:changed` on success.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { createExam } from "@/lib/realData/exams";
import { DatePickerField } from "@/components/forms/DatePickerField";

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
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setClassId(defaultClientClassId || "");
    setExamDate("");
    setTopicsRaw("");
    setNotes("");
  }, [open, defaultClientClassId]); // initialize once per opening

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !classId || !examDate) {
      toast.error("Title, class, and exam date are required");
      return;
    }
    setSaving(true);
    try {
      const topics = topicsRaw
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const row = await createExam(user.id, {
        title: title.trim(),
        clientClassId: classId,
        examDate: examDate || null,
        topics,
        // Readiness is earned from concept mastery, never self-reported.
        readiness: 0,
        notes: notes.trim() || null,
      });
      if (!row) {
        toast.error("Couldn't save exam");
        return;
      }
      toast.success("Exam added");
      window.dispatchEvent(new CustomEvent("real-exams:changed"));
      onCreated?.();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save exam. Your work is still here.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add exam</DialogTitle>
          <DialogDescription>
            Add the date and topics. Readiness will grow from your study results.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="exam-title">Title</Label>
            <Input id="exam-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm 1" autoFocus />
          </div>
          <div>
            <Label htmlFor="exam-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="exam-class"><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>
                {myClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DatePickerField id="exam-date" label="Exam date" value={examDate} onChange={setExamDate} required />
          <div>
            <Label htmlFor="exam-topics">Topics <span className="text-xs text-muted-foreground">(comma or newline separated)</span></Label>
            <Textarea id="exam-topics" value={topicsRaw} onChange={(e) => setTopicsRaw(e.target.value)} rows={2} placeholder="Chapter 3, Chapter 4, Integrals" />
          </div>
          <div>
            <Label htmlFor="exam-notes">Notes</Label>
            <Textarea id="exam-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
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
