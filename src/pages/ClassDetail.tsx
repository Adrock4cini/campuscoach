import { useParams, Link, useNavigate } from "react-router-dom";
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
  CheckCircle2, Circle, Loader2, Mic, FlaskConical,
} from "lucide-react";

export default function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const c = classes.find(cl => cl.id === classId);

  if (!c) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-muted-foreground">Class not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/classes")}>Back to Classes</Button>
      </div>
    );
  }

  const classAssignments = assignments.filter(a => a.classId === c.id);
  const classExams = exams.filter(e => e.classId === c.id);
  const classLectures = lectures.filter(l => l.classId === c.id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/classes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">{c.name}</h1>
          <p className="text-muted-foreground">Current topic: {c.currentTopic}</p>
        </div>
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

      {/* Suggested next step */}
      <Card className="shadow-soft border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-1">💡 Suggested Next Step</h3>
          <p className="text-sm text-muted-foreground mb-3">{c.suggestedAction}</p>
          <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90" onClick={() => navigate(`/study-lab?classId=${c.id}`)}>
            <FlaskConical className="h-4 w-4 mr-1.5" /> Start Studying
          </Button>
        </CardContent>
      </Card>

      {/* Chapter Progress */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg font-display">Chapter Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {c.chapters.map(ch => (
            <div key={ch.number} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
              {ch.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-success" /> :
               ch.status === 'in-progress' ? <Loader2 className="h-5 w-5 text-warning" /> :
               <Circle className="h-5 w-5 text-muted-foreground/30" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Ch {ch.number}: {ch.title}</p>
              </div>
              <Badge variant="secondary" className="text-xs capitalize">{ch.status.replace('-', ' ')}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Upcoming Assignments */}
      {classAssignments.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg font-display">Assignments</CardTitle></CardHeader>
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
    </div>
  );
}
