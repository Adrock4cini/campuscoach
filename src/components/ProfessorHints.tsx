import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pin, Plus, Pencil, Trash2, X, Check, MessageSquare } from "lucide-react";
import type { ProfessorHint } from "@/data/demo";

interface ProfessorHintsProps {
  hints: ProfessorHint[];
  onAdd?: (hint: ProfessorHint) => void;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  compact?: boolean;
}

const tagLabels: Record<string, string> = {
  "exam-hint": "Exam Hint",
  "assignment-note": "Assignment",
  "class-reminder": "Reminder",
  "general": "General",
};

const tagColors: Record<string, string> = {
  "exam-hint": "bg-danger/10 text-danger border-danger/20",
  "assignment-note": "bg-warning/10 text-warning border-warning/20",
  "class-reminder": "bg-primary/10 text-primary border-primary/20",
  "general": "bg-muted text-muted-foreground border-border",
};

export function ProfessorHints({ hints, onAdd, onDelete, onTogglePin, compact }: ProfessorHintsProps) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTag, setNewTag] = useState<ProfessorHint['tag']>("general");

  const sorted = [...hints].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd?.({
      id: `ph-${Date.now()}`,
      text: newText.trim(),
      tag: newTag,
      pinned: false,
      createdAt: new Date().toISOString().split("T")[0],
    });
    setNewText("");
    setNewTag("general");
    setAdding(false);
  };

  if (compact && hints.length === 0 && !adding) {
    return (
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setAdding(true)}>
        <Plus className="h-3 w-3" /> Add hint
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4 text-primary" />
          Professor Hints & Notes
        </h4>
        {!adding && (
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        )}
      </div>

      {sorted.map(hint => (
        <div key={hint.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${hint.pinned ? "bg-warning/5 border-warning/20" : "bg-muted/30 border-border"}`}>
          {hint.pinned && <Pin className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/80">{hint.text}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={`text-[10px] ${tagColors[hint.tag]}`}>{tagLabels[hint.tag]}</Badge>
              <span className="text-[10px] text-muted-foreground">{hint.createdAt}</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onTogglePin?.(hint.id)}>
              <Pin className={`h-3 w-3 ${hint.pinned ? "text-warning" : "text-muted-foreground"}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete?.(hint.id)}>
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}

      {hints.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">No hints yet. Add one to remember what the professor said!</p>
      )}

      {adding && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
          <Textarea
            placeholder='e.g., "Professor said this will be on the exam"'
            value={newText}
            onChange={e => setNewText(e.target.value)}
            className="min-h-[60px] text-sm bg-background"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Select value={newTag} onValueChange={v => setNewTag(v as ProfessorHint['tag'])}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exam-hint">Exam Hint</SelectItem>
                <SelectItem value="assignment-note">Assignment</SelectItem>
                <SelectItem value="class-reminder">Reminder</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs bg-gradient-calm border-0 text-primary-foreground" onClick={handleAdd}>
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
