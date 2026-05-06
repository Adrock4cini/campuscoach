import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { classes } from "@/data/demo";
import { contributeStudySignal } from "@/hooks/useClassIntelligence";
import { toast } from "sonner";
import { MessageSquare, Lightbulb, BookOpen, Camera, Sparkles } from "lucide-react";

interface Props {
  defaultClassId?: string;
  variant?: "card" | "inline";
}

export function ContributeHub({ defaultClassId, variant = "card" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<null | "hint" | "insight">(null);
  const [classId, setClassId] = useState(defaultClassId ?? classes[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setTopic(""); setNote(""); };

  const submit = async (kind: "hint" | "insight") => {
    if (!classId || !topic.trim()) {
      toast.error("Add a class and topic");
      return;
    }
    setSubmitting(true);
    const { error } = await contributeStudySignal({
      classId,
      topicId: topic.trim(),
      topicName: topic.trim(),
      starred: true,
      confidence: 3,
      timeSpentMinutes: 0,
      sourceType: kind === "hint" ? "professor-hint" : "study-insight",
      sourceId: note.slice(0, 200),
    });
    setSubmitting(false);
    if (error) { toast.error("Couldn't share — try again"); return; }
    toast.success(kind === "hint" ? "Hint shared with the class 🎯" : "Insight added — thanks!");
    setOpen(null);
    reset();
  };

  const actions = [
    { key: "debrief", icon: MessageSquare, label: "Add Exam Debrief", desc: "Share what showed up", onClick: () => navigate("/exam-debrief") },
    { key: "hint", icon: Lightbulb, label: "Add Professor Hint", desc: "Pass it forward", onClick: () => setOpen("hint") },
    { key: "insight", icon: Sparkles, label: "Add Study Insight", desc: "What clicked for you?", onClick: () => setOpen("insight") },
    { key: "chapter", icon: Camera, label: "Upload Chapter Photo", desc: "Notes or textbook page", onClick: () => navigate(defaultClassId ? `/classes/${defaultClassId}` : "/classes") },
  ];

  const grid = (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((a) => (
        <button
          key={a.key}
          onClick={a.onClick}
          className="text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group"
        >
          <a.icon className="h-4 w-4 text-primary mb-1.5" />
          <p className="text-sm font-medium text-foreground leading-tight">{a.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {variant === "card" ? (
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-foreground">Contribute to your class</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Every insight you add makes the predictions sharper for you and your classmates.
            </p>
            {grid}
          </CardContent>
        </Card>
      ) : grid}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{open === "hint" ? "Add a professor hint" : "Add a study insight"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Topic</label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Polynomial Roots" maxLength={80} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                {open === "hint" ? "What did the professor emphasize?" : "What helped you?"}
              </label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="Keep it general — no exact exam content." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={() => open && submit(open)} disabled={submitting} className="bg-gradient-calm border-0 text-primary-foreground">
              {submitting ? "Sharing…" : "Share with class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
