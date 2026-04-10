import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lectures } from "@/data/demo";
import {
  ArrowLeft, Mic, Camera, FileText, FileUp,
  Brain, Sparkles, FlaskConical, Pencil,
} from "lucide-react";
import { ProfessorHints } from "@/components/ProfessorHints";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import type { ProfessorHint } from "@/data/demo";

const typeIcons = { recording: Mic, photo: Camera, manual: FileText, pdf: FileUp };
const typeLabels = { recording: "Recording", photo: "Board Photo", manual: "Manual Notes", pdf: "PDF Upload" };

export default function NoteDetail() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const note = lectures.find(l => l.id === noteId);
  const [hints, setHints] = useState<ProfessorHint[]>(note?.professorHints || []);
  const [editOpen, setEditOpen] = useState(false);

  if (!note) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Note not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/notes")}>Back to Notes</Button>
      </div>
    );
  }

  const Icon = typeIcons[note.type];

  const editFields: EditField[] = [
    { key: "title", label: "Title", type: "text" },
    { key: "date", label: "Date", type: "text" },
    { key: "className", label: "Class", type: "text" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/notes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-semibold text-foreground">{note.title}</h1>
          <p className="text-muted-foreground text-sm">{note.className} · {note.date}</p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Icon className="h-3 w-3" /> {typeLabels[note.type]}
        </Badge>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* Split view: Raw material + AI output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Raw material */}
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-foreground text-lg">📄 Source Material</h2>

          {note.transcript ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-sm font-display">Transcript</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground/80 leading-relaxed">{note.transcript}</p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card className="shadow-soft border-dashed">
              <CardContent className="p-5 text-center">
                <p className="text-sm text-muted-foreground">No transcript available for this {typeLabels[note.type].toLowerCase()}.</p>
                {note.type === 'photo' && <p className="text-xs text-muted-foreground mt-1">Board photo text was extracted by AI.</p>}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground text-sm mb-2">Topics Covered</h3>
              <div className="flex flex-wrap gap-2">
                {note.keyTopics.map(t => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

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
        </div>

        {/* Right: AI-generated study output */}
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-foreground text-lg">🤖 AI Study Output</h2>

          {note.keyPoints && note.keyPoints.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-sm font-display">Key Points</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {note.keyPoints.map((p, i) => (
                      <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {note.concepts && note.concepts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-sm font-display">Key Concepts & Vocabulary</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {note.concepts.map(c => (
                      <Badge key={c} variant="outline" className="bg-primary/5 text-primary border-primary/20">{c}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {!note.hasAINotes && (
            <Card className="shadow-soft border-primary/20 bg-primary/5">
              <CardContent className="p-5 text-center">
                <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">AI notes not yet generated</p>
                <p className="text-xs text-muted-foreground mt-1">Add more content to this lecture and AI will generate study materials.</p>
                <Button size="sm" className="mt-3 bg-gradient-calm border-0 text-primary-foreground">Generate AI Notes</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Study actions */}
      <Card className="shadow-card">
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-3">Study from this lecture</h3>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => navigate(`/study-lab?classId=${note.classId}`)}>
              <FlaskConical className="h-4 w-4 mr-1.5" /> Open in Study Lab
            </Button>
            <Button variant="outline" size="sm">
              <Brain className="h-4 w-4 mr-1.5" /> Generate Flashcards
            </Button>
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 mr-1.5" /> Generate Quiz
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditItemModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${note.title}`}
        fields={editFields}
        values={{ title: note.title, date: note.date, className: note.className }}
        onSave={() => {}}
      />
    </div>
  );
}
