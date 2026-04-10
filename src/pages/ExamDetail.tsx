import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { exams, getDaysUntil, getReadinessColor, getReadinessLabel, getReadinessBg } from "@/data/demo";
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Brain, Target, Zap, Pencil,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfessorHints } from "@/components/ProfessorHints";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import type { ProfessorHint } from "@/data/demo";

export default function ExamDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const e = exams.find(ex => ex.id === examId);
  const [hints, setHints] = useState<ProfessorHint[]>(e?.professorHints || []);

  if (!e) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Exam not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/exams")}>Back to Exams</Button>
      </div>
    );
  }

  const days = getDaysUntil(e.date);
  const gradeEstimate = e.readiness >= 80 ? "A-/B+" : e.readiness >= 65 ? "B/B-" : e.readiness >= 45 ? "C+/B-" : "C/C-";

  const editFields: EditField[] = [
    { key: "title", label: "Exam Title", type: "text" },
    { key: "date", label: "Exam Date", type: "date" },
    { key: "className", label: "Class", type: "text" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/exams")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-semibold text-foreground">{e.title}</h1>
          <p className="text-muted-foreground text-sm">{e.className} · {days} days away</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* Readiness */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={`shadow-card ${getReadinessBg(e.readiness)}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-foreground">Overall Readiness</h3>
              <span className={`text-2xl font-bold ${getReadinessColor(e.readiness)}`}>{e.readiness}%</span>
            </div>
            <Progress value={e.readiness} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">
              {getReadinessLabel(e.readiness)} · Estimated grade today: <strong>{gradeEstimate}</strong>.
              {e.readiness < 70 ? " But there's still time to improve!" : " Keep it up!"}
            </p>
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

      {/* Topics */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg font-display">Topics Covered</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {e.topics.map(t => (
              <Badge key={t} variant="secondary">{t}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strong / Weak */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-card bg-success/5 border-success/20">
          <CardContent className="p-5">
            <h4 className="text-sm font-semibold text-success mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Strong Areas
            </h4>
            <ul className="space-y-2">
              {e.strongAreas.map(a => (
                <li key={a} className="text-sm text-foreground/80 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-success" /> {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="shadow-card bg-danger/5 border-danger/20">
          <CardContent className="p-5">
            <h4 className="text-sm font-semibold text-danger mb-3 flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Needs Work
            </h4>
            <ul className="space-y-2">
              {e.weakAreas.map(a => (
                <li key={a} className="text-sm text-foreground/80 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-danger" /> {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recommended Study Plan */}
      <Card className="shadow-soft border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-2">📋 Recommended Study Plan</h3>
          <div className="space-y-2 text-sm text-foreground/80">
            <p>Based on your current readiness, here's what would help the most:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Focus on weak areas first: {e.weakAreas.join(", ")}</li>
              <li>Complete 2 focused study sessions (25 min each)</li>
              <li>Take a practice test to identify remaining gaps</li>
              <li>Review flashcards for key vocabulary</li>
              <li>Do a final quick review the day before</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => navigate(`/study-lab?classId=${e.classId}`)}>
          <ArrowRight className="h-4 w-4 mr-1.5" /> Start Study Plan
        </Button>
        <Button variant="outline" onClick={() => setActiveModal("practice")}>
          <Target className="h-4 w-4 mr-1.5" /> Practice Test
        </Button>
        <Button variant="outline" onClick={() => setActiveModal("flashcards")}>
          <Brain className="h-4 w-4 mr-1.5" /> Flashcards
        </Button>
      </div>

      {/* Modals */}
      <Dialog open={activeModal === "practice"} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Practice Test</DialogTitle></DialogHeader>
          <div className="text-sm text-foreground/80 space-y-3">
            <p>Ready to test yourself on <strong>{e.title}</strong>?</p>
            <p>This will cover: {e.topics.join(", ")}</p>
            <Button className="w-full bg-gradient-calm border-0 text-primary-foreground" onClick={() => { setActiveModal(null); navigate(`/study-lab?classId=${e.classId}`); }}>
              <Zap className="h-4 w-4 mr-1.5" /> Start Practice Test
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "flashcards"} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Flashcards</DialogTitle></DialogHeader>
          <div className="text-sm text-foreground/80 space-y-3">
            <p>Flashcard deck for <strong>{e.title}</strong></p>
            <p>Focus on your weak areas: {e.weakAreas.join(", ")}</p>
            <Button className="w-full bg-gradient-calm border-0 text-primary-foreground" onClick={() => { setActiveModal(null); navigate(`/study-lab?classId=${e.classId}`); }}>
              <Brain className="h-4 w-4 mr-1.5" /> Start Flashcards
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditItemModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${e.title}`}
        fields={editFields}
        values={{ title: e.title, date: e.date, className: e.className }}
        onSave={() => {}}
      />
    </div>
  );
}
