import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { exams, getDaysUntil, getReadinessColor, getReadinessLabel, getReadinessBg } from "@/data/demo";
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { EditItemModal, type EditField } from "@/components/EditItemModal";

export default function ExamsPage() {
  const sorted = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const [editExam, setEditExam] = useState<typeof exams[0] | null>(null);

  const editFields: EditField[] = [
    { key: "title", label: "Exam Title", type: "text" },
    { key: "date", label: "Exam Date", type: "date" },
    { key: "className", label: "Class", type: "text" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Exams</h1>
        <p className="text-muted-foreground mt-1">Know where you stand. No surprises.</p>
      </div>

      <div className="space-y-5">
        {sorted.map((e, i) => {
          const days = getDaysUntil(e.date);
          const gradeEstimate = e.readiness >= 80 ? "A-/B+" : e.readiness >= 65 ? "B/B-" : e.readiness >= 45 ? "C+/B-" : "C/C-";

          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className={`shadow-card ${days <= 5 ? "border-danger/20" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <Link to={`/exams/${e.id}`} className="flex-1">
                      <h3 className="font-display font-semibold text-foreground text-lg hover:text-primary transition-colors">{e.title}</h3>
                      <p className="text-sm text-muted-foreground">{e.className} · {days} days away</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditExam(e)}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Badge variant="secondary" className={days <= 5 ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}>
                        {days <= 5 ? `${days} days!` : `${days} days`}
                      </Badge>
                    </div>
                  </div>

                  <div className={`rounded-lg p-4 mb-4 ${getReadinessBg(e.readiness)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Overall Readiness</span>
                      <span className={`text-xl font-bold ${getReadinessColor(e.readiness)}`}>{e.readiness}%</span>
                    </div>
                    <Progress value={e.readiness} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {getReadinessLabel(e.readiness)} · Estimated grade: <strong>{gradeEstimate}</strong>.
                      {e.readiness < 70 ? " But there's time to improve!" : " You're in good shape."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-success/5 p-3">
                      <h4 className="text-xs font-semibold text-success mb-2 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Strong Areas
                      </h4>
                      <ul className="space-y-1">
                        {e.strongAreas.map(a => (
                          <li key={a} className="text-sm text-foreground/80">✓ {a}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg bg-danger/5 p-3">
                      <h4 className="text-xs font-semibold text-danger mb-2 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Needs Work
                      </h4>
                      <ul className="space-y-1">
                        {e.weakAreas.map(a => (
                          <li key={a} className="text-sm text-foreground/80">✗ {a}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Link to={`/exams/${e.id}`}>
                      <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90">
                        <ArrowRight className="h-4 w-4 mr-1" /> Start Study Plan
                      </Button>
                    </Link>
                    <Link to={`/exams/${e.id}`}>
                      <Button variant="outline" size="sm">Practice Test</Button>
                    </Link>
                    <Link to={`/exams/${e.id}`}>
                      <Button variant="outline" size="sm">Flashcards</Button>
                    </Link>
                  </div>
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
