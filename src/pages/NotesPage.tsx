import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { lectures } from "@/data/demo";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Camera,
  FileText,
  FileUp,
  Loader2,
  MessageSquareQuote,
  Mic,
  Plus,
  RefreshCw,
  StickyNote,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getTopicSignals, getTopStudentInsights } from "@/data/courseIntelligence";
import { ClassTabs } from "@/components/ClassTabs";
import { useAuth } from "@/contexts/AuthContext";
import { useCapture } from "@/contexts/CaptureContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import {
  getRecentCaptures,
  type PersistedCapture,
} from "@/lib/supabase/capturePersistence";
import { CAPTURE_LABELS } from "@/lib/capture/processor";
import type { CaptureKind } from "@/lib/capture/types";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";

const typeIcons = { recording: Mic, photo: Camera, manual: FileText, pdf: FileUp };
const typeLabels = { recording: "Recording", photo: "Board Photo", manual: "Manual Notes", pdf: "PDF Upload" };

const captureIcons: Record<CaptureKind, typeof Mic> = {
  "record-lecture": Mic,
  "scan-board": Camera,
  "scan-textbook": FileText,
  "upload-file": FileUp,
  "quick-note": StickyNote,
  "professor-hint": MessageSquareQuote,
  "ask-brain": Brain,
};

export default function NotesPage() {
  const { user, isDemoMode } = useAuth();
  return user && !isDemoMode ? <RealNotesPage /> : <DemoNotesPage />;
}

export function RealNotesPage() {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const {
    classes,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const [captures, setCaptures] = useState<PersistedCapture[]>([]);
  const [activeClass, setActiveClass] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setCaptures(await getRecentCaptures(50));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("capture:committed", onChange);
    window.addEventListener("concepts:extracted", onChange);
    return () => {
      window.removeEventListener("capture:committed", onChange);
      window.removeEventListener("concepts:extracted", onChange);
    };
  }, [refresh]);

  const filtered = useMemo(
    () => activeClass === "all"
      ? captures
      : captures.filter((capture) => capture.clientClassId === activeClass),
    [activeClass, captures],
  );

  const classNameFor = (id: string | null) => (
    classes.find((classInfo) => classInfo.id === id)?.name ?? "Class"
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Notes & Recordings</h1>
          <p className="text-sm text-muted-foreground mt-1">Everything you capture, kept with the right class.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button size="sm" onClick={() => openCapture("quick-note")}>
            <StickyNote className="h-4 w-4 mr-1.5" /> Quick note
          </Button>
          <Button variant="outline" size="sm" onClick={() => openCapture("professor-hint")}>
            <MessageSquareQuote className="h-4 w-4 mr-1.5" /> Professor hint
          </Button>
        </div>
      </div>

      {classesLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your classes…
        </div>
      ) : classesError ? (
        <ClassesLoadError onRetry={() => void reloadClasses()} />
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="p-7 text-center space-y-3">
            <StickyNote className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium text-foreground">Add a class before capturing notes</p>
              <p className="text-sm text-muted-foreground mt-1">That keeps every note and study set in the right place.</p>
            </div>
            <Button size="sm" onClick={() => navigate("/onboarding")}>Set up classes</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <label className="block max-w-xs">
            <span className="sr-only">Filter notes by class</span>
            <select
              aria-label="Filter notes by class"
              value={activeClass}
              onChange={(event) => setActiveClass(event.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border/60 bg-card text-sm text-foreground"
            >
              <option value="all">All classes</option>
              {classes.map((classInfo) => (
                <option key={classInfo.id} value={classInfo.id}>{classInfo.name}</option>
              ))}
            </select>
          </label>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your captures…
            </div>
          ) : loadError ? (
            <Card>
              <CardContent className="p-7 text-center space-y-3">
                <AlertTriangle className="h-7 w-7 text-warning mx-auto" />
                <div>
                  <p className="font-medium text-foreground">Couldn’t load your notes</p>
                  <p className="text-sm text-muted-foreground mt-1">Your saved work was not deleted.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void refresh()}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Try again
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center space-y-3">
                <StickyNote className="h-8 w-8 text-muted-foreground mx-auto" />
                <div>
                  <p className="font-medium text-foreground">No captures here yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Save a quick note or a professor hint to build Class Memory.</p>
                </div>
                <Button size="sm" onClick={() => openCapture("quick-note", activeClass === "all" ? undefined : activeClass)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add a note
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((capture) => {
                const kind = capture.kind as CaptureKind;
                const Icon = captureIcons[kind] ?? FileText;
                const readyToStudy = capture.processingStatus === "ready" && capture.keyConcepts.length > 0;
                const classId = capture.clientClassId;
                return (
                  <Card key={capture.id} className="shadow-card">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">
                                {capture.topic || CAPTURE_LABELS[kind] || "Class note"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {classNameFor(classId)} · {new Date(capture.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {CAPTURE_LABELS[kind] || "Capture"}
                            </Badge>
                          </div>

                          {(capture.summary || capture.rawText) && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                              {capture.summary || capture.rawText}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {readyToStudy && classId && (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/study-lab?${new URLSearchParams({
                                  classId,
                                  captureId: capture.id,
                                }).toString()}`)}
                              >
                                Study this <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            )}
                            {classId && (
                              <Button size="sm" variant={readyToStudy ? "ghost" : "outline"} onClick={() => navigate(`/classes/${classId}`)}>
                                {capture.processingStatus === "failed" ? "Open class to retry" : "Open class"}
                              </Button>
                            )}
                            {capture.processingStatus === "processing" && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Campus Brain is working
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="rounded-2xl border border-border/40 bg-card/40 px-4 py-3 flex items-center gap-3 text-muted-foreground">
            <Mic className="h-4 w-4 shrink-0" />
            <p className="text-xs">Lecture recording, board scanning, and file capture are coming next. They are shown as status—not buttons—until they save real student material.</p>
          </div>
        </>
      )}
    </div>
  );
}

function DemoNotesPage() {
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

      <ClassTabs value={activeClass} onChange={setActiveClass} />

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
        {filteredLectures.map((note, i) => {
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
