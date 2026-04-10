import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/data/demo";

interface EditEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
  defaultDay?: string;
  defaultHour?: number;
}

const eventTypes: { value: CalendarEventType; label: string }[] = [
  { value: "class", label: "Class" },
  { value: "exam", label: "Exam" },
  { value: "assignment", label: "Assignment Due" },
  { value: "work", label: "Work Shift" },
  { value: "study", label: "Study Session" },
  { value: "personal", label: "Personal" },
  { value: "academic-deadline", label: "Academic Deadline" },
  { value: "payment", label: "Tuition / Payment" },
  { value: "tutoring", label: "Tutoring" },
  { value: "office-hours", label: "Office Hours" },
];

const hours = Array.from({ length: 16 }, (_, i) => i + 6);

export function EditEventModal({ open, onOpenChange, event, onSave, onDelete, defaultDay, defaultHour }: EditEventModalProps) {
  const isEditing = !!event;
  const [label, setLabel] = useState(event?.label || "");
  const [type, setType] = useState<CalendarEventType>(event?.type || "personal");
  const [day, setDay] = useState(event?.day || defaultDay || "Mon");
  const [startHour, setStartHour] = useState(event?.startHour || defaultHour || 9);
  const [duration, setDuration] = useState(event?.duration || 1);
  const [description, setDescription] = useState(event?.description || "");

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      id: event?.id || `evt-${Date.now()}`,
      label: label.trim(),
      type,
      day,
      startHour,
      duration,
      description: description.trim() || undefined,
      editable: true,
    });
    onOpenChange(false);
  };

  const formatHour = (h: number) => {
    if (h === 12) return "12 PM";
    if (h > 12) return `${h - 12} PM`;
    return `${h} AM`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{isEditing ? "Edit Event" : "Add Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Event Name</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g., Office Hours, Study Group" autoFocus />
          </div>

          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={v => setType(v as CalendarEventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {eventTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Start</Label>
              <Select value={String(startHour)} onValueChange={v => setStartHour(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {hours.map(h => <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Hours</Label>
              <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0.5, 1, 1.5, 2, 2.5, 3, 4].map(d => <SelectItem key={d} value={String(d)}>{d}h</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add details..." className="min-h-[60px]" />
          </div>

          <div className="flex items-center gap-2 pt-2">
            {isEditing && onDelete && (
              <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => { onDelete(event.id); onOpenChange(false); }}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground" onClick={handleSave}>
              {isEditing ? "Save Changes" : "Add Event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
