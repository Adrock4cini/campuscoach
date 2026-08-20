import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  classes, assignments, exams, lectures,
  getDaysUntil, getReadinessColor, getReadinessLabel, getPriorityColor,
} from "@/data/demo";
import {
  ArrowLeft, MapPin, Clock, User, BookOpen, ArrowRight,
  CheckCircle2, Circle, Loader2, MessageSquare, FlaskConical, Pencil, Plus, Mic, CalendarRange, FileText, Camera,
} from "lucide-react";
import { ProfessorHints } from "@/components/ProfessorHints";
import { ChapterDetailDrawer } from "@/components/ChapterDetailDrawer";
import { EditItemModal, type EditField } from "@/components/EditItemModal";
import type { ProfessorHint, Chapter } from "@/data/demo";
import { getClassPulse, getPredictedTopics, getRecommendedStudyMode, getTopStudentInsights } from "@/data/courseIntelligence";
import { ClassMemory } from "@/components/capture/ClassMemory";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useCapture } from "@/contexts/CaptureContext";
import { RealClassAssignmentsExams } from "@/components/real/RealClassAssignmentsExams";
import { SyllabusNextStep } from "@/components/real/SyllabusNextStep";
import { ClassTopicTargets } from "@/components/real/ClassTopicTargets";
import { ClassUpNext } from "@/components/real/ClassUpNext";
import { ClassReadinessCard } from "@/components/real/ClassReadinessCard";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { formatDateKey } from "@/lib/calendar/dateKey";

export default function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isDemoMode } = useAuth();
  const { classes: myClasses, loading: classesLoading, error: classesError, reload: reloadClasses } = useMyClasses();
  const { open: openCapture } = useCapture();
  const realMode = !!user && !isDemoMode;

  const realClass = realMode ? myClasses.find((cl) => cl.id === classId) : null;
  const demoClass = !realMode ? classes.find((cl) => cl.id === classId) : null;
  const c = realClass || demoClass;

  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [classHints, setClassHints] = useState<ProfessorHint[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!realClass || searchParams.get("capture") !== "1") return;
    openCapture(undefined, realClass.id);
    const next = new URLSearchParams(searchParams);
    next.delete("capture");
    setSearchParams(next, { replace: true });
  }, [openCapture, realClass, searchParams, setSearchParams]);

  const syllabusSaved = searchParams.get("saved") === "syllabus";
  const dismissSyllabusSaved = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("saved");
    setSearchParams(next, { replace: true });
  };

  if (realMode && classesLoading && !c) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading your class…</p>;
  }

  if (realMode && classesError && !c) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <ClassesLoadError onRetry={() => void reloadClasses()} />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Class not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/classes")}>Back to Classes</Button>
      </div>
    );
  }

  // Real classes render a simplified view — no demo assignments/exams/chapter data.
  if (realClass) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {classesError && (
          <div role="status" className="rounded-xl border border-warning/25 bg-warning/5 p-3 text-sm text-muted-foreground">
            We couldn’t refresh this class. Showing the last details loaded; nothing was deleted.
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Back to classes" onClick={() => navigate("/classes")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground truncate">{c.name}</h1>
            {c.currentTopic && (
              <p className="text-muted-foreground text-sm">Current topic: {c.currentTopic}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-11 shrink-0" onClick={() => navigate(`/classes/${c.id}/edit`)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Edit class</span>
            <span className="sm:hidden">Edit</span>
          </Button>
        </div>

        {syllabusSaved && (
          <SyllabusNextStep classId={c.id} className={c.name} onDismiss={dismissSyllabusSaved} />
        )}


        <ClassUpNext classId={c.id} className={c.name} />

        <ClassReadinessCard classId={c.id} />

        <RealClassAssignmentsExams classId={c.id} />

        <Card className="shadow-card border-primary/20 bg-primary/5 overflow-hidden">
          <CardContent className="p-4 sm:p-5 space-y-3 min-w-0">
            <div>
              <h3 className="font-display font-semibold text-foreground">Capture something from this class</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                A photo, a note, or something your teacher emphasized. Campus Brain turns it into study sets.
              </p>
            </div>
            <div className="space-y-2">
              <Button className="h-12 w-full rounded-2xl bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => openCapture(undefined, c.id)}>
                <Plus className="h-4 w-4 mr-1.5" /> Capture
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => openCapture("scan-assignment", c.id)}>
                  <Camera className="h-4 w-4 mr-1.5" /> Homework help
                </Button>
                <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => openCapture("professor-hint", c.id)}>
                  <MessageSquare className="h-4 w-4 mr-1.5" /> Teacher hint
                </Button>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/study-lab?classId=${c.id}`)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
              >
                <FlaskConical className="h-4 w-4" /> Study this class
              </button>
            </div>
          </CardContent>
        </Card>

        <ClassTopicTargets classId={c.id} className={c.name} schedule={c.schedule} />

        <ClassMemory classId={c.id} className={c.name} />

        <Card className="shadow-card border-primary/20">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display font-semibold text-foreground">Class syllabus</h2>
                  <Badge variant="outline" className={c.hasSyllabus ? "border-success/30 text-success" : "text-muted-foreground"}>
                    {c.hasSyllabus ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Circle className="mr-1 h-3.5 w-3.5" />}
                    {c.hasSyllabus ? "Syllabus connected" : "No syllabus added"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {c.hasSyllabus
                    ? "Assignments, quizzes, exam dates, and topics from this syllabus are connected to your calendar and Study Lab."
                    : "Add the PDF or one clear photo. We’ll pull out assignments, quizzes, exam dates, and topics for you to review."}
                </p>
                {!c.hasSyllabus && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary">How it works</summary>
                    <p className="pb-1 leading-relaxed">
                      For several paper pages, scan them into one PDF first. Nothing is saved to your class, calendar, or
                      dashboard until you review it. If this class does not use a syllabus, you can skip this.
                    </p>
                  </details>
                )}
              </div>
            </div>
            <Button className="h-11 shrink-0" asChild>
              <Link to={`/classes/${encodeURIComponent(c.id)}/syllabus`}>
                {c.hasSyllabus ? "View or replace syllabus" : "Add syllabus"}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
            {c.professor && c.professor !== "TBD" && (
              <div className="flex items-center gap-2"><User className="h-4 w-4" /> {c.professor}</div>
            )}
            {(c.days.length > 0 || c.time) && (
              <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {c.days.join(", ")}{c.time ? `${c.days.length ? " · " : ""}${c.time}${c.endTime ? `–${c.endTime}` : ""}` : ""}</div>
            )}
            {c.location && (
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {c.location}</div>
            )}
            {(c.courseCode || c.term || c.section) && (
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> {[c.courseCode, c.term, c.section ? `Section ${c.section}` : ""].filter(Boolean).join(" · ")}</div>
            )}
            {(c.semesterStartDate || c.semesterEndDate) && (
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4" />
                {[c.semesterStartDate, c.semesterEndDate]
                  .filter(Boolean)
                  .map((date) => formatDateKey(date, { month: "short", day: "numeric" }))
                  .join(" – ")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }


  const classAssignments = assignments.filter(a => a.classId === c.id);
  const classExams = exams.filter(e => e.classId === c.id);
  const classLectures = lectures.filter(l => l.classId === c.id);
  const classPulse = getClassPulse(c.id);
  const predictedTopics = getPredictedTopics(c.id).slice(0, 3);
  const recommendedStudyMode = getRecommendedStudyMode(c.id);
  const topInsights = getTopStudentInsights(c.id).slice(0, 2);

  const editFields: EditField[] = [
    { key: "name", label: "Class Name", type: "text" },
    { key: "professor", label: "Teacher or instructor", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "time", label: "Time", type: "text" },
    { key: "currentTopic", label: "Current Topic", type: "text" },
    { key: "nextExamDate", label: "Next Exam Date", type: "date" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/classes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">{c.name}</h1>
          <p className="text-muted-foreground">Current topic: {c.currentTopic}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* Info row */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-card">
          <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" /> {c.professor}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> {c.days.join("/")} · {c.time}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {c.location}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Readiness */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-foreground">Readiness</h3>
              <span className={`text-xl font-bold ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
            </div>
            <Progress value={c.readiness} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">{getReadinessLabel(c.readiness)}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* 1. What to Study */}
      <Card className="shadow-soft border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <p className="text-xs font-medium text-primary mb-1">1. 🎯 What to Study</p>
          <h3 className="font-display font-semibold text-foreground mb-1">{predictedTopics[0]?.topic ?? c.currentTopic}</h3>
          <p className="text-sm text-muted-foreground mb-1">{predictedTopics[0]?.probability ?? 78}% likely to matter next · {predictedTopics[0]?.reason ?? c.suggestedAction}</p>
          <p className="text-xs text-muted-foreground mb-3">{classPulse?.classComparison}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {predictedTopics.map((topic) => (
              <Badge key={topic.topic} variant="outline" className="text-xs border-primary/20 text-primary">{topic.flags[0] ?? "🎯"} {topic.topic}</Badge>
            ))}
          </div>
          <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => navigate(`/study-lab?classId=${c.id}`)}>
            <FlaskConical className="h-4 w-4 mr-1.5" /> Start Studying
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-primary mb-1">2. 🧠 Study</p>
            <h3 className="font-display font-semibold text-foreground">{recommendedStudyMode.label}</h3>
            <p className="text-sm text-muted-foreground mt-1">Focused on what matters most.</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">{recommendedStudyMode.reason}</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => navigate(`/study-lab/session?mode=${recommendedStudyMode.mode}&classId=${c.id}&topic=${encodeURIComponent(predictedTopics[0]?.topic ?? "all")}`)}>
                <ArrowRight className="h-4 w-4 mr-1.5" /> {recommendedStudyMode.cta}
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/focus-sprint?classId=${c.id}&duration=25`)}>Focus Sprint</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-primary mb-1">4. 📊 Class Intelligence</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">🔥 Trending</span><span className="font-medium text-foreground">{classPulse?.trending.topic ?? c.currentTopic}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">⭐ Most starred</span><span className="font-medium text-foreground">{classPulse?.mostStarred.topic ?? c.currentTopic}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">⚠️ Most missed</span><span className="font-medium text-foreground">{classPulse?.mostStruggled.topic ?? c.currentTopic}</span></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">{classPulse?.networkEffectLine}</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Notes & Insights */}
      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="mb-4">
            <p className="text-xs font-medium text-primary mb-1">3. 📝 Notes & Insights</p>
            <div className="space-y-2">
              {topInsights.map((insight) => (
                <div key={insight} className="rounded-lg bg-muted/40 p-3 text-sm text-foreground/80">💡 {insight}</div>
              ))}
            </div>
          </div>
          <ProfessorHints
            hints={classHints}
            onAdd={h => setClassHints(prev => [...prev, h])}
            onDelete={id => setClassHints(prev => prev.filter(h => h.id !== id))}
            onTogglePin={id => setClassHints(prev => prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h))}
          />
        </CardContent>
      </Card>

      {/* Class Memory */}
      <ClassMemory classId={c.id} className={c.name} />


      {/* Chapter Progress */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg font-display">Chapter Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {c.chapters.map(ch => (
            <div
              key={ch.number}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors group"
              onClick={() => { setSelectedChapter(ch); setDrawerOpen(true); }}
            >
              {ch.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-success" /> :
               ch.status === 'in-progress' ? <Loader2 className="h-5 w-5 text-warning" /> :
               <Circle className="h-5 w-5 text-muted-foreground/30" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Ch {ch.number}: {ch.title}</p>
                {ch.professorHints && ch.professorHints.length > 0 && (
                  <p className="text-xs text-primary mt-0.5">📌 {ch.professorHints.length} hint{ch.professorHints.length > 1 ? "s" : ""}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs capitalize">{ch.status.replace('-', ' ')}</Badge>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Upcoming Assignments */}
      {classAssignments.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-display">Assignments</CardTitle>
              <Link to="/assignments" className="text-xs text-primary hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {classAssignments.map(a => (
              <Link key={a.id} to={`/assignments/${a.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground">Due in {getDaysUntil(a.dueDate)} days</p>
                </div>
                <Badge variant="secondary" className={`text-xs ${getPriorityColor(a.priority)}`}>{a.priority}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Exams */}
      {classExams.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg font-display">Exams</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {classExams.map(e => (
              <Link key={e.id} to={`/exams/${e.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{getDaysUntil(e.date)} days away · {e.readiness}% ready</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lectures */}
      {classLectures.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg font-display flex items-center gap-2"><Mic className="h-5 w-5 text-primary" /> Lectures</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {classLectures.map(l => (
              <Link key={l.id} to={`/notes/${l.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.date}</p>
                </div>
                {l.hasAINotes && <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">AI Notes</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grading Weights */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg font-display">Grading Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {c.gradingWeights.map(g => (
            <div key={g.category} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{g.category}</span>
              <span className="text-sm font-semibold text-foreground">{g.weight}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Chapter Detail Drawer */}
      <ChapterDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        chapter={selectedChapter}
        classId={c.id}
        className={c.name}
      />

      {/* Edit Class Modal */}
      <EditItemModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${c.name}`}
        fields={editFields}
        values={{
          name: c.name,
          professor: c.professor,
          location: c.location,
          time: c.time,
          currentTopic: c.currentTopic,
          nextExamDate: c.nextExamDate,
        }}
        onSave={(vals) => { /* mock save */ }}
      />
    </div>
  );
}
