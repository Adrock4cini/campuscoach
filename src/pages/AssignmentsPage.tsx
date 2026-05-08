import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  assignments, getPriorityColor, getStatusLabel, getDaysUntil
} from "@/data/demo";
import { ArrowUpDown, Lightbulb, ListChecks, HelpCircle, FileEdit, Sparkles, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import { getAssignmentStartSuggestion } from "@/data/courseIntelligence";
import { ClassTabs } from "@/components/ClassTabs";

export default function AssignmentsPage() {
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('date');
  const [aiModal, setAiModal] = useState<{ assignmentId: string; type: string } | null>(null);
  const [editAssignment, setEditAssignment] = useState<typeof assignments[0] | null>(null);
  const [activeClass, setActiveClass] = useState<string | "all">("all");

  const filtered = activeClass === "all" ? assignments : assignments.filter(a => a.classId === activeClass);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'priority') {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const editFields: EditField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "estimatedTime", label: "Time Estimate", type: "text" },
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ]},
    { key: "instructions", label: "Instructions", type: "textarea" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Assignments</h1>
          <p className="text-muted-foreground mt-1">{filtered.filter(a => a.status !== 'turned-in').length} active</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortBy(sortBy === 'date' ? 'priority' : 'date')}
        >
          <ArrowUpDown className="h-4 w-4 mr-1.5" />
          Sort by {sortBy === 'date' ? 'priority' : 'due date'}
        </Button>
      </div>

      <ClassTabs value={activeClass} onChange={setActiveClass} />

      <div className="space-y-4">
        {sorted.map((a, i) => {
          const days = getDaysUntil(a.dueDate);
          const urgency = days <= 1 ? "border-danger/30" : days <= 3 ? "border-warning/30" : "border-border";
          const startSuggestion = getAssignmentStartSuggestion(a.id);

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className={`shadow-card ${urgency}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-2">
                    <Link to={`/assignments/${a.id}`} className="block flex-1">
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-display font-semibold text-foreground hover:text-primary transition-colors">{a.title}</h3>
                            <Badge variant="secondary" className={`text-xs ${getPriorityColor(a.priority)}`}>
                              {a.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{a.className}</p>
                          <p className="text-sm text-foreground/80 mb-3">{a.instructions}</p>
                          {startSuggestion && (
                            <div className="mb-3 rounded-lg bg-primary/5 border border-primary/10 p-3">
                              <p className="text-xs font-medium text-primary">{startSuggestion.label}</p>
                              <p className="text-sm text-foreground mt-1">{startSuggestion.step}</p>
                              <p className="text-xs text-muted-foreground mt-1">{startSuggestion.supportingLine}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>⏱ {a.estimatedTime}</span>
                            <span>📅 Due {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>
                            <Badge variant="outline" className="text-xs">{getStatusLabel(a.status)}</Badge>
                          </div>
                        </div>
                      </div>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => setEditAssignment(a)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  {/* AI Actions */}
                  <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setAiModal({ assignmentId: a.id, type: "steps" })}>
                      <ListChecks className="h-3 w-3 mr-1" /> Break into steps
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setAiModal({ assignmentId: a.id, type: "expected" })}>
                      <HelpCircle className="h-3 w-3 mr-1" /> What's expected?
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setAiModal({ assignmentId: a.id, type: "start" })}>
                      <Lightbulb className="h-3 w-3 mr-1" /> Help me start
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setAiModal({ assignmentId: a.id, type: "outline" })}>
                      <FileEdit className="h-3 w-3 mr-1" /> Outline
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setAiModal({ assignmentId: a.id, type: "quiz" })}>
                      <Sparkles className="h-3 w-3 mr-1" /> Quiz me
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full border-dashed">
        + Add Assignment
      </Button>

      <Dialog open={!!aiModal} onOpenChange={() => setAiModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {aiModal?.type === 'steps' && 'Break Into Steps'}
              {aiModal?.type === 'expected' && "What's Expected"}
              {aiModal?.type === 'start' && 'Help Me Start'}
              {aiModal?.type === 'outline' && 'Rough Outline'}
              {aiModal?.type === 'quiz' && 'Quiz Me'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground/80 leading-relaxed space-y-2">
            {aiModal?.type === 'steps' && <p>1. Read through the full instructions (10 min){'\n'}2. Identify what you already know (5 min){'\n'}3. Research and gather sources (20 min){'\n'}4. Create an outline (15 min){'\n'}5. Write the first draft (1-2 hours){'\n'}6. Review and revise (30 min){'\n\n'}Start with step 1 — just reading. That's it for now!</p>}
            {aiModal?.type === 'expected' && <p>Your professor is looking for:{'\n\n'}✓ Clear understanding of the material{'\n'}✓ Original thinking and connections{'\n'}✓ Proper formatting and citations{'\n'}✓ Timely submission{'\n\n'}Focus on showing you engaged with the content.</p>}
            {aiModal?.type === 'start' && <p>The hardest part is starting. Here's your first 10 minutes:{'\n\n'}1. Open a blank doc (1 min){'\n'}2. Write your name and the title (1 min){'\n'}3. Write ONE sentence about the main idea (3 min){'\n'}4. List 3 points you want to make (5 min){'\n\n'}That's it! You're started. The rest flows from here. 💪</p>}
            {aiModal?.type === 'outline' && <p>I. Introduction{'\n'}   - Context/hook{'\n'}   - Main argument{'\n\n'}II. Key Point 1{'\n'}   - Evidence{'\n'}   - Analysis{'\n\n'}III. Key Point 2{'\n'}   - Evidence{'\n'}   - Analysis{'\n\n'}IV. Conclusion{'\n'}   - Summary{'\n'}   - Final thought</p>}
            {aiModal?.type === 'quiz' && <p>Quick check — can you answer these?{'\n\n'}1. What's the main topic of this assignment?{'\n'}2. What format does your professor expect?{'\n'}3. What sources do you need?{'\n'}4. What's the most important thing to include?{'\n\n'}If you can answer these, you're ready to start writing!</p>}
          </div>
        </DialogContent>
      </Dialog>

      {editAssignment && (
        <EditItemModal
          open={!!editAssignment}
          onOpenChange={(v) => { if (!v) setEditAssignment(null); }}
          title={`Edit ${editAssignment.title}`}
          fields={editFields}
          values={{
            title: editAssignment.title,
            dueDate: editAssignment.dueDate,
            estimatedTime: editAssignment.estimatedTime,
            priority: editAssignment.priority,
            instructions: editAssignment.instructions,
          }}
          onSave={() => setEditAssignment(null)}
        />
      )}
    </div>
  );
}
