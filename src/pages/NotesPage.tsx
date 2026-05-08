import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { lectures } from "@/data/demo";
import { Mic, Camera, FileUp, FileText, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { getTopicSignals, getTopStudentInsights } from "@/data/courseIntelligence";
import { ClassTabs } from "@/components/ClassTabs";

const typeIcons = { recording: Mic, photo: Camera, manual: FileText, pdf: FileUp };
const typeLabels = { recording: "Recording", photo: "Board Photo", manual: "Manual Notes", pdf: "PDF Upload" };

export default function NotesPage() {
  const [activeClass, setActiveClass] = useState<string | "all">("all");
  const filteredLectures = activeClass === "all" ? lectures : lectures.filter(l => l.classId === activeClass);
  const insightClass = activeClass === "all" ? "psych101" : activeClass;
  const topInsights = getTopStudentInsights(insightClass).slice(0, 2);
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

      <Card className="shadow-soft bg-surface-warm border-border">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            📢 <strong>Reminder:</strong> Always check your school and instructor's policies before recording lectures. 
            Some professors require permission first.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-card border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="font-display font-semibold text-foreground mb-2">💡 Top insights from students</h3>
          <div className="space-y-2">
            {topInsights.map((insight) => (
              <p key={insight} className="text-sm text-foreground/80">{insight}</p>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {lectures.map((note, i) => {
          const Icon = typeIcons[note.type];
          return (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Link to={`/notes/${note.id}`}>
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
                            <Badge key={t} variant="secondary" className="text-xs">⭐ {t}</Badge>
                          ))}
                          {note.keyTopics.slice(0, 1).map(t => getTopicSignals(note.classId, t).slice(0, 2).map(signal => (
                            <Badge key={`${note.id}-${t}-${signal}`} variant="outline" className="text-xs border-primary/20 text-primary">{signal}</Badge>
                          )))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

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
