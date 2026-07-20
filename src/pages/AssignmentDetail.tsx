import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assignments, getDaysUntil, getPriorityColor, getStatusLabel } from "@/data/demo";
import {
  ArrowLeft, ListChecks, HelpCircle, Lightbulb, FileEdit,
  Sparkles, Clock, CheckCircle2, Pencil, Bell,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ProfessorHints } from "@/components/ProfessorHints";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Assignment, ProfessorHint } from "@/data/demo";
import { getAssignmentStartSuggestion } from "@/data/courseIntelligence";

const aiResponses: Record<string, { title: string; content: string }> = {
  steps: {
    title: "Break Into Steps",
    content: "Here's a plan to tackle this:\n\n1. Read through the full instructions carefully (10 min)\n2. Brainstorm your main argument or topic (15 min)\n3. Find and bookmark 2-3 key sources (20 min)\n4. Create a rough outline with thesis + 3 body points (15 min)\n5. Write the introduction paragraph (20 min)\n6. Write body paragraphs one at a time (45 min each)\n7. Write conclusion (15 min)\n8. Proofread and check formatting (20 min)\n\nYou don't have to do it all at once. Start with step 1 today!",
  },
  expected: {
    title: "What's Expected",
    content: "Based on the instructions, your professor is looking for:\n\n✓ A clear, debatable thesis statement\n✓ At least 4 scholarly sources (not Wikipedia)\n✓ Proper MLA formatting (headers, citations, Works Cited)\n✓ 5 full pages of content\n✓ Logical argument structure with evidence\n✓ Counterargument addressed\n\nTip: Professors often give higher grades when you show you've engaged deeply with the sources, not just dropped quotes in.",
  },
  start: {
    title: "Help Me Start",
    content: "Starting is the hardest part. Here's your first 15 minutes:\n\n1. Open a blank doc and type your name + header (2 min)\n2. Write ONE sentence about what you want to argue (3 min)\n3. Google your topic + 'scholarly articles' and open 3 tabs (5 min)\n4. Skim the abstracts and write down 3 interesting points (5 min)\n\nThat's it! You now have momentum. The rest gets easier from here. 💪",
  },
  outline: {
    title: "Rough Outline",
    content: "Here's a starter outline:\n\nI. Introduction\n   - Hook / attention grabber\n   - Background context\n   - Thesis statement\n\nII. Body Paragraph 1: Strongest argument\n   - Topic sentence\n   - Evidence from source\n   - Analysis\n\nIII. Body Paragraph 2: Supporting argument\n   - Topic sentence\n   - Evidence from source\n   - Analysis\n\nIV. Body Paragraph 3: Counterargument + rebuttal\n   - Acknowledge opposing view\n   - Explain why your position is stronger\n\nV. Conclusion\n   - Restate thesis\n   - Summary of key points\n   - Final thought / call to action",
  },
  quiz: {
    title: "Quiz Me",
    content: "Let's test your understanding:\n\nQ1: What makes a thesis statement 'debatable'?\nA: It takes a position that someone could reasonably disagree with.\n\nQ2: How many scholarly sources are required?\nA: At least 4.\n\nQ3: What's the difference between a counterargument and a rebuttal?\nA: A counterargument is the opposing view; a rebuttal explains why it's weaker than your position.\n\nQ4: What citation style should you use?\nA: MLA format.\n\nHow did you do? Review any you missed!",
  },
};

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Assignment["status"] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const a = assignments.find(as => as.id === assignmentId);
  const [hints, setHints] = useState<ProfessorHint[]>(a?.professorHints || []);

  if (!a) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Assignment not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/assignments")}>Back to Assignments</Button>
      </div>
    );
  }

  const currentStatus = status || a.status;
  const days = getDaysUntil(a.dueDate);
  const modal = modalKey ? aiResponses[modalKey] : null;
  const startSuggestion = getAssignmentStartSuggestion(a.id);

  const editFields: EditField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "estimatedTime", label: "Estimated Time", type: "text" },
    { key: "instructions", label: "Instructions", type: "textarea" },
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ]},
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/assignments")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-semibold text-foreground">{a.title}</h1>
          <p className="text-muted-foreground text-sm">{a.className}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Status & meta */}
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className={`${getPriorityColor(a.priority)}`}>{a.priority} priority</Badge>
              <Badge variant="outline">{getStatusLabel(currentStatus)}</Badge>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {a.estimatedTime}
              </div>
              <div className="text-sm text-muted-foreground">
                📅 Due {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">Instructions</h3>
              <p className="text-sm text-foreground/80">{a.instructions}</p>
            </div>

            {startSuggestion && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <p className="text-xs font-medium text-primary">{startSuggestion.label}</p>
                <p className="text-sm text-foreground mt-1">{startSuggestion.step}</p>
                <p className="text-xs text-muted-foreground mt-1">{startSuggestion.supportingLine}</p>
              </div>
            )}

            {/* Status buttons */}
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-2">Update Progress</h3>
              <div className="flex gap-2 flex-wrap">
                {(['not-started', 'started', 'draft-done', 'turned-in'] as Assignment["status"][]).map((s) => (
                  <Button
                    key={s}
                    variant={currentStatus === s ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setStatus(s)}
                  >
                    {currentStatus === s && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {getStatusLabel(s)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Reminder */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setReminderSet(!reminderSet)}>
                <Bell className={`h-3.5 w-3.5 ${reminderSet ? "text-primary" : ""}`} />
                {reminderSet ? "Reminder set ✓" : "Set reminder"}
              </Button>
              {!reminderSet && (
                <Select onValueChange={() => setReminderSet(true)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="When?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same-day">Same day</SelectItem>
                    <SelectItem value="1-day">1 day before</SelectItem>
                    <SelectItem value="3-days">3 days before</SelectItem>
                    <SelectItem value="1-week">1 week before</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Professor Hints */}
      <Card className="shadow-card">
        <CardContent className="p-5">
          <ProfessorHints
            hints={hints}
            onAdd={h => setHints(prev => [...prev, h])}
            onDelete={id => setHints(prev => prev.filter(h => h.id !== id))}
            onTogglePin={id => setHints(prev => prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h))}
          />
        </CardContent>
      </Card>

      {/* AI Actions */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg font-display">AI Study Helper</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Let AI help you tackle this assignment:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" className="justify-start" onClick={() => setModalKey("steps")}>
              <ListChecks className="h-4 w-4 mr-2" /> Break into steps
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setModalKey("expected")}>
              <HelpCircle className="h-4 w-4 mr-2" /> What's expected?
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setModalKey("start")}>
              <Lightbulb className="h-4 w-4 mr-2" /> Help me start
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setModalKey("outline")}>
              <FileEdit className="h-4 w-4 mr-2" /> Generate outline
            </Button>
            <Button variant="outline" className="justify-start sm:col-span-2" onClick={() => setModalKey("quiz")}>
              <Sparkles className="h-4 w-4 mr-2" /> Quiz me on the material
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Response Modal */}
      <Dialog open={!!modal} onOpenChange={() => setModalKey(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{modal?.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
            {modal?.content}
          </div>
        </DialogContent>
      </Dialog>

      <EditItemModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${a.title}`}
        fields={editFields}
        values={{ title: a.title, dueDate: a.dueDate, estimatedTime: a.estimatedTime, instructions: a.instructions, priority: a.priority }}
        onSave={() => {}}
      />
    </div>
  );
}
