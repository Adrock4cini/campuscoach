import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  assignments, getPriorityColor, getStatusLabel, getDaysUntil
} from "@/data/demo";
import {
  ArrowUpDown, Lightbulb, ListChecks, HelpCircle, FileEdit, Sparkles, Pencil,
  MoreHorizontal, Play, Clock, Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import { ClassTabs } from "@/components/ClassTabs";
import { useAssignmentPriorities } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

/**
 * AssignmentsPage — Progressive Intelligence surface.
 * The screen answers ONE question per card: "How do I finish this?"
 *
 * Level 1 (glance): title · class · due chip · priority dot · one AI first-step
 * Level 2 (tap):    open the assignment detail
 * Secondary tools:  behind a "More" dropdown (steps, expected, outline, quiz…)
 */
export default function AssignmentsPage() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<"smart" | "date">("smart");
  const [aiModal, setAiModal] = useState<{ assignmentId: string; type: string } | null>(null);
  const [editAssignment, setEditAssignment] = useState<typeof assignments[0] | null>(null);
  const [activeClass, setActiveClass] = useState<string | "all">("all");

  const engineOrder = useAssignmentPriorities();
  const rankIndex = new Map(engineOrder.map((p, i) => [p.assignmentId, i]));
  const priorityById = new Map(engineOrder.map((p) => [p.assignmentId, p]));

  const filtered = activeClass === "all" ? assignments : assignments.filter(a => a.classId === activeClass);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "smart") {
      const ra = rankIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rankIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Assignments</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered.filter(a => a.status !== "turned-in").length} active
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setSortBy(sortBy === "smart" ? "date" : "smart")}
        >
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
          {sortBy === "smart" ? "AI priority" : "Due date"}
        </Button>
      </div>

      <ClassTabs value={activeClass} onChange={setActiveClass} />

      <div className="space-y-3">
        {sorted.map((a, i) => {
          const days = getDaysUntil(a.dueDate);
          const priority = priorityById.get(a.id);
          const urgencyBar =
            days <= 0 ? "bg-danger" :
            days <= 1 ? "bg-danger/70" :
            days <= 3 ? "bg-warning" :
            days <= 7 ? "bg-primary/60" : "bg-muted";
          const dueChip =
            days <= 0 ? "Due today" :
            days === 1 ? "Due tomorrow" :
            `Due in ${days}d`;
          const dueTone =
            days <= 1 ? "text-danger border-danger/30 bg-danger/5" :
            days <= 3 ? "text-warning border-warning/30 bg-warning/5" :
            "text-muted-foreground border-border/40 bg-background/40";

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="shadow-card overflow-hidden relative border-border/60">
                <div className={cn("absolute left-0 top-0 bottom-0 w-1", urgencyBar)} aria-hidden />
                <CardContent className="p-4 pl-5">
                  {/* Level 1 — glanceable header */}
                  <div className="flex items-start gap-3">
                    <Link to={`/assignments/${a.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-semibold text-foreground hover:text-primary transition-colors truncate">
                          {a.title}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 h-4 ${getPriorityColor(a.priority)}`}
                          title={`${a.priority} priority`}
                        >
                          {a.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.className}</p>
                    </Link>

                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditAssignment(a)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  {/* Chip row — icons + color do the talking */}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
                      dueTone,
                    )}>
                      <Clock className="h-3 w-3" />
                      {dueChip}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border/40 bg-background/40 text-muted-foreground">
                      ⏱ {a.estimatedTime}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border/40 bg-background/40 text-muted-foreground">
                      {getStatusLabel(a.status)}
                    </span>
                  </div>

                  {/* ONE primary action — engine's first step + Start CTA */}
                  {priority && (
                    <div className="mt-3 flex items-stretch gap-2">
                      <div className="flex-1 min-w-0 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs text-foreground truncate">{priority.firstStep}</span>
                      </div>
                      <Button
                        size="sm"
                        className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-95 h-auto px-4 shrink-0"
                        onClick={() => navigate(`/assignments/${a.id}`)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Start
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-auto w-9 shrink-0" aria-label="More study tools">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setAiModal({ assignmentId: a.id, type: "steps" })}>
                            <ListChecks className="h-3.5 w-3.5 mr-2" /> Break into steps
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAiModal({ assignmentId: a.id, type: "expected" })}>
                            <HelpCircle className="h-3.5 w-3.5 mr-2" /> What's expected?
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAiModal({ assignmentId: a.id, type: "start" })}>
                            <Lightbulb className="h-3.5 w-3.5 mr-2" /> Help me start
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAiModal({ assignmentId: a.id, type: "outline" })}>
                            <FileEdit className="h-3.5 w-3.5 mr-2" /> Outline
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAiModal({ assignmentId: a.id, type: "quiz" })}>
                            <Sparkles className="h-3.5 w-3.5 mr-2" /> Quiz me
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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
              {aiModal?.type === "steps" && "Break Into Steps"}
              {aiModal?.type === "expected" && "What's Expected"}
              {aiModal?.type === "start" && "Help Me Start"}
              {aiModal?.type === "outline" && "Rough Outline"}
              {aiModal?.type === "quiz" && "Quiz Me"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground/80 leading-relaxed space-y-2 whitespace-pre-line">
            {aiModal?.type === "steps" && "1. Read through the full instructions (10 min)\n2. Identify what you already know (5 min)\n3. Research and gather sources (20 min)\n4. Create an outline (15 min)\n5. Write the first draft (1-2 hours)\n6. Review and revise (30 min)\n\nStart with step 1 — just reading. That's it for now!"}
            {aiModal?.type === "expected" && "Your professor is looking for:\n\n✓ Clear understanding of the material\n✓ Original thinking and connections\n✓ Proper formatting and citations\n✓ Timely submission\n\nFocus on showing you engaged with the content."}
            {aiModal?.type === "start" && "The hardest part is starting. Here's your first 10 minutes:\n\n1. Open a blank doc (1 min)\n2. Write your name and the title (1 min)\n3. Write ONE sentence about the main idea (3 min)\n4. List 3 points you want to make (5 min)\n\nThat's it! You're started. The rest flows from here. 💪"}
            {aiModal?.type === "outline" && "I. Introduction\n   - Context/hook\n   - Main argument\n\nII. Key Point 1\n   - Evidence\n   - Analysis\n\nIII. Key Point 2\n   - Evidence\n   - Analysis\n\nIV. Conclusion\n   - Summary\n   - Final thought"}
            {aiModal?.type === "quiz" && "Quick check — can you answer these?\n\n1. What's the main topic of this assignment?\n2. What format does your professor expect?\n3. What sources do you need?\n4. What's the most important thing to include?\n\nIf you can answer these, you're ready to start writing!"}
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
