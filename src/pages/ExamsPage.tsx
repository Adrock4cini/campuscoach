import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exams, getDaysUntil, getReadinessColor, classes } from "@/data/demo";
import {
  CheckCircle2, XCircle, ArrowRight, Pencil, ChevronDown,
  MoreHorizontal, Zap, Sparkles, Brain, Target,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import { ClassTabs } from "@/components/ClassTabs";
import {
  estimateExamGrade,
  getStudyFormatRecommendation,
} from "@/lib/intelligence";
import {
  buildLearningState,
  type LearningRecommendation,
} from "@/lib/intelligence/learningEngine";
import { RecommendationChips } from "@/components/intelligence/RecommendationChips";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { RealExamsView } from "@/components/real/RealExamsView";

/**
 * ExamsPage — signed-in students see their real exams; demo/anon users see
 * the intelligence-rich demo view.
 */
export default function ExamsPage() {
  const { user, isDemoMode } = useAuth();
  if (user && !isDemoMode) return <RealExamsView />;

  const navigate = useNavigate();
  const [activeClass, setActiveClass] = useState<string | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const filteredExams = activeClass === "all" ? exams : exams.filter(e => e.classId === activeClass);
  const sorted = [...filteredExams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const [editExam, setEditExam] = useState<typeof exams[0] | null>(null);

  const engineByClass = (() => {
    try {
      const state = buildLearningState();
      const map = new Map<string, { rec: LearningRecommendation; isTop: boolean }>();
      const topId = state.recommendations[0]?.id ?? null;
      state.classes.forEach((s) =>
        map.set(s.classId, { rec: s.recommendation, isTop: s.recommendation.id === topId }),
      );
      return map;
    } catch {
      return new Map<string, { rec: LearningRecommendation; isTop: boolean }>();
    }
  })();

  const editFields: EditField[] = [
    { key: "title", label: "Exam Title", type: "text" },
    { key: "date", label: "Exam Date", type: "date" },
    { key: "className", label: "Class", type: "text" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Exams</h1>
        <p className="text-xs text-muted-foreground mt-1">One next step per exam. No noise.</p>
      </div>

      <ClassTabs value={activeClass} onChange={setActiveClass} />

      <div className="space-y-3">
        {sorted.map((e, i) => {
          const days = getDaysUntil(e.date);
          const gradeEstimate = estimateExamGrade(e.readiness);
          const rec = getStudyFormatRecommendation(e.classId);
          const engine = engineByClass.get(e.classId);
          const isOpen = openId === e.id;
          const cls = classes.find((c) => c.id === e.classId);
          const daysChipTone =
            days <= 3 ? "text-danger border-danger/30 bg-danger/5" :
            days <= 7 ? "text-warning border-warning/30 bg-warning/5" :
            "text-muted-foreground border-border/40 bg-background/40";
          const urgencyBar =
            days <= 3 ? "bg-danger" :
            days <= 7 ? "bg-warning" :
            "bg-primary/60";

          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="shadow-card overflow-hidden relative border-border/60">
                <div className={cn("absolute left-0 top-0 bottom-0 w-1", urgencyBar)} aria-hidden />
                <CardContent className="p-4 pl-5">
                  {/* Level 1 header */}
                  <div className="flex items-center gap-3">
                    <MiniRing value={e.readiness} />

                    <Link to={`/exams/${e.id}`} className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-foreground hover:text-primary transition-colors truncate">
                        {e.title}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">{e.className}</p>
                    </Link>

                    <button
                      onClick={() => setOpenId(isOpen ? null : e.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      className="h-8 w-8 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                  </div>

                  {/* Chip row — visual language over paragraphs */}
                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
                      daysChipTone,
                    )}>
                      {days <= 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                    </span>
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border/40 bg-background/40 font-medium",
                      getReadinessColor(e.readiness),
                    )}>
                      {e.readiness}% ready
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border/40 bg-background/40 text-muted-foreground">
                      <Target className="h-3 w-3" /> {gradeEstimate}
                    </span>
                  </div>

                  {/* ONE primary action from the engine */}
                  <div className="mt-3 flex items-stretch gap-2">
                    <div className="flex-1 min-w-0 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground truncate">
                        {engine ? engine.rec.label : rec.label}
                        {!engine && rec.topic ? ` · ${rec.topic}` : ""}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-95 h-auto px-4 shrink-0"
                      onClick={() =>
                        navigate(
                          engine
                            ? engine.rec.route
                            : `/study-lab/session?mode=${rec.mode}&classId=${e.classId}&topic=${encodeURIComponent(rec.topic ?? "all")}`,
                        )
                      }
                    >
                      Study
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-auto w-9 shrink-0" aria-label="More study tools">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => navigate(`/study-lab/session?mode=flashcards&classId=${e.classId}`)}>
                          <Brain className="h-3.5 w-3.5 mr-2" /> Flashcards
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/study-lab/session?mode=multiple-choice&classId=${e.classId}`)}>
                          <Sparkles className="h-3.5 w-3.5 mr-2" /> Practice test
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/exams/${e.id}`)}>
                          <Target className="h-3.5 w-3.5 mr-2" /> Full detail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditExam(e)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit exam
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {engine && (
                    <RecommendationChips
                      recommendation={engine.rec}
                      isTop={engine.isTop}
                      className="mt-2"
                    />
                  )}

                  {/* Level 2 — reveal on tap */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <ChipGroup
                            Icon={CheckCircle2}
                            label="Strong"
                            tone="success"
                            items={e.strongAreas}
                          />
                          <ChipGroup
                            Icon={XCircle}
                            label="Needs work"
                            tone="danger"
                            items={e.weakAreas}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full border-dashed">
        + Add Exam
      </Button>

      {editExam && (
        <EditItemModal
          open={!!editExam}
          onOpenChange={(v) => { if (!v) setEditExam(null); }}
          title={`Edit ${editExam.title}`}
          fields={editFields}
          values={{ title: editExam.title, date: editExam.date, className: editExam.className }}
          onSave={() => setEditExam(null)}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function MiniRing({ value }: { value: number }) {
  const size = 44, stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ - (Math.max(0, Math.min(100, value)) / 100) * circ;
  const strokeClass =
    value < 55 ? "stroke-[hsl(var(--danger))]" :
    value < 75 ? "stroke-[hsl(var(--warning))]" :
    "stroke-[hsl(var(--success))]";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" opacity={0.4} />
        <motion.circle
          cx={size/2} cy={size/2} r={r}
          className={strokeClass}
          strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: dash }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-[10px] font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

function ChipGroup({
  Icon, label, items, tone,
}: {
  Icon: typeof CheckCircle2;
  label: string;
  items: string[];
  tone: "success" | "danger";
}) {
  const toneText = tone === "success" ? "text-success" : "text-danger";
  const chipTone =
    tone === "success"
      ? "border-success/25 bg-success/5 text-foreground/85"
      : "border-danger/25 bg-danger/5 text-foreground/85";
  return (
    <div>
      <div className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-wider mb-1.5", toneText)}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((a) => (
          <span
            key={a}
            className={cn("inline-block text-[11px] px-2 py-0.5 rounded-full border", chipTone)}
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
