import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Camera, FileUp, FileText, Plus } from "lucide-react";

const demoNotes = [
  {
    id: "n1",
    className: "Intro to Psychology",
    title: "Lecture 7: Memory Models",
    date: "April 2, 2026",
    type: "recording" as const,
    hasTranscript: true,
    hasAINotes: true,
    keyTopics: ["Short-term memory", "Encoding", "Retrieval cues"],
  },
  {
    id: "n2",
    className: "Biology II",
    title: "Lab Session: Cell Division",
    date: "April 1, 2026",
    type: "photo" as const,
    hasTranscript: false,
    hasAINotes: true,
    keyTopics: ["Mitosis phases", "Cytokinesis"],
  },
  {
    id: "n3",
    className: "College Algebra",
    title: "Chapter 4: Polynomial Functions",
    date: "March 31, 2026",
    type: "manual" as const,
    hasTranscript: false,
    hasAINotes: false,
    keyTopics: ["Degree", "Zeros", "End behavior"],
  },
  {
    id: "n4",
    className: "English Composition II",
    title: "Argumentative Essay Structure",
    date: "March 30, 2026",
    type: "pdf" as const,
    hasTranscript: false,
    hasAINotes: true,
    keyTopics: ["Thesis statement", "Counterarguments", "Evidence"],
  },
];

const typeIcons = {
  recording: Mic,
  photo: Camera,
  manual: FileText,
  pdf: FileUp,
};

const typeLabels = {
  recording: "Recording",
  photo: "Board Photo",
  manual: "Manual Notes",
  pdf: "PDF Upload",
};

export default function NotesPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Notes & Recordings</h1>
          <p className="text-muted-foreground mt-1">Capture class, and let AI turn it into study tools.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90">
            <Mic className="h-4 w-4 mr-1.5" /> Record
          </Button>
          <Button variant="outline" size="sm">
            <Camera className="h-4 w-4 mr-1.5" /> Photo
          </Button>
          <Button variant="outline" size="sm">
            <FileUp className="h-4 w-4 mr-1.5" /> Upload
          </Button>
        </div>
      </div>

      {/* Recording reminder */}
      <Card className="shadow-soft bg-surface-warm border-border">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            📢 <strong>Reminder:</strong> Always check your school and instructor's policies before recording lectures. 
            Some professors require permission first.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {demoNotes.map((note, i) => {
          const Icon = typeIcons[note.type];
          return (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-foreground">{note.title}</h3>
                        <Badge variant="secondary" className="text-xs">{typeLabels[note.type]}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{note.className} · {note.date}</p>
                      
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {note.hasTranscript && (
                          <Badge variant="outline" className="text-xs bg-success/5 text-success border-success/20">
                            Transcribed
                          </Badge>
                        )}
                        {note.hasAINotes && (
                          <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                            AI Notes Ready
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {note.keyTopics.map(t => (
                          <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Empty state helper */}
      <Card className="shadow-soft border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-3xl mb-3">📝</p>
          <h3 className="font-display font-semibold text-foreground mb-1">Capture more lectures</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Record audio, snap the board, or upload slides — AI will turn them into study-ready notes.
          </p>
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-1.5" /> Add Notes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
