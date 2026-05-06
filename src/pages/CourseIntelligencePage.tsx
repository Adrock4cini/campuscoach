import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen, Brain, TrendingUp, Sparkles, BarChart3,
  FileText, Users, AlertTriangle, Target, ArrowRight, Library, Activity, Wifi
} from "lucide-react";
import { classes } from "@/data/demo";
import { textbooks, classTextbookMap, professors, classProfessorMap } from "@/data/courseIntelligence";
import { useClassIntelligence } from "@/hooks/useClassIntelligence";
import { ContributeHub } from "@/components/ContributeHub";

export default function CourseIntelligencePage() {
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");

  const cls = classes.find(c => c.id === selectedClassId);
  const textbook = textbooks.find(t => t.id === classTextbookMap[selectedClassId]);
  const professor = professors.find(p => p.id === classProfessorMap[selectedClassId]);
  const intel = useClassIntelligence(selectedClassId);

  const top3 = intel.topics.slice(0, 3);
  const struggles = intel.topics.filter((t) => t.miss_rate >= 30 || t.average_confidence > 0 && t.average_confidence <= 2.5).slice(0, 5);
  const hasData = intel.topics.length > 0 || intel.debriefs.length > 0;

  const summaryLines: string[] = [];
  if (top3.length) summaryLines.push(`Students most often focused on: ${top3.map(t => t.topic_name).join(", ")}`);
  if (intel.formatCounts[0]) summaryLines.push(`Exams lean toward ${intel.formatCounts[0].format.replace(/-/g, " ")} format`);
  if (intel.studyMoreCounts[0]) summaryLines.push(`Students wished they'd studied "${intel.studyMoreCounts[0].topic}" more`);
  if (intel.averageDifficulty >= 4) summaryLines.push("Recent exams have been rated as difficult — plan extra study time");
  if (!summaryLines.length && hasData) summaryLines.push("Insights are forming — contribute to sharpen them.");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground">Course Intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time, crowdsourced insights from students taking this class.</p>
      </div>

      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {cls && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Network signal */}
          <Card className="shadow-soft border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Based on <strong>{intel.totalContributors}</strong> student{intel.totalContributors !== 1 ? "s" : ""} · {intel.totalContributions} contribution{intel.totalContributions !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {intel.weeklyContributions > 0
                    ? `${intel.weeklyContributions} new insight${intel.weeklyContributions === 1 ? "" : "s"} this week — confidence increasing.`
                    : "Be the first to share something this week."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Class + Professor + Textbook */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-soft"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Professor</p>
              <p className="text-sm font-medium">{professor?.name || cls.professor}</p>
              <p className="text-xs text-muted-foreground">{professor?.department}</p>
            </CardContent></Card>
            <Card className="shadow-soft"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Textbook</p>
              <p className="text-sm font-medium truncate">{textbook?.title || "Not set"}</p>
              <p className="text-xs text-muted-foreground">{textbook ? `${textbook.edition} ed. · ${textbook.author}` : ""}</p>
            </CardContent></Card>
            <Card className="shadow-soft"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Peer Debriefs</p>
              <p className="text-sm font-medium">{intel.debriefs.length}</p>
              <p className="text-xs text-muted-foreground">past exam reflections</p>
            </CardContent></Card>
          </div>

          {!hasData && (
            <Card className="shadow-card border-dashed">
              <CardContent className="p-6 text-center">
                <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No student insights yet for this class</p>
                <p className="text-xs text-muted-foreground mt-1">Be the first to add a debrief or study insight and help others succeed.</p>
                <Button size="sm" className="mt-3 bg-gradient-calm border-0 text-primary-foreground" onClick={() => navigate("/exam-debrief")}>
                  Add the first debrief
                </Button>
              </CardContent>
            </Card>
          )}

          {/* AI summary */}
          {summaryLines.length > 0 && (
            <Card className="shadow-card border-primary/20 bg-primary/5">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" /> What students are telling us
                </h3>
                <ul className="space-y-2">
                  {summaryLines.map((s, i) => (
                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Top 3 to study */}
          {top3.length > 0 && (
            <Card className="shadow-card">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                  <Target className="h-4 w-4 text-primary" /> 🎯 If you only study 3 things
                </h3>
                <div className="space-y-2">
                  {top3.map((topic) => (
                    <div key={topic.topic_id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{topic.topic_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(topic.probability)}% emphasis · based on {topic.student_count} student{topic.student_count !== 1 ? "s" : ""}
                          {topic.post_exam_mentions > 0 && ` · mentioned in ${topic.post_exam_mentions} debrief${topic.post_exam_mentions !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs border-primary/20 text-primary flex-shrink-0">{topic.confidence_band}</Badge>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground"
                    onClick={() => navigate(`/study-lab/session?mode=multiple-choice&classId=${selectedClassId}&topic=${encodeURIComponent(top3[0].topic_name)}`)}>
                    <Brain className="h-3.5 w-3.5 mr-1.5" /> Practice most-tested topics
                  </Button>
                  {struggles[0] && (
                    <Button size="sm" variant="outline"
                      onClick={() => navigate(`/study-lab/session?mode=flashcards&classId=${selectedClassId}&topic=${encodeURIComponent(struggles[0].topic_name)}`)}>
                      <Target className="h-3.5 w-3.5 mr-1.5" /> Study weak areas
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Most important chapters */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><Library className="h-4 w-4" /> Most Important Chapters</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {cls.chapters.map(ch => {
                const emphasized = top3.some(t => ch.title.toLowerCase().includes(t.topic_name.toLowerCase().split(" ")[0]));
                return (
                  <div key={ch.number} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/classes/${selectedClassId}`)}>
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      ch.status === "completed" ? "bg-success/15 text-success" :
                      ch.status === "in-progress" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                    }`}>{ch.number}</div>
                    <span className="text-sm flex-1">{ch.title}</span>
                    {emphasized && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">High emphasis</Badge>}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Common weak areas */}
          {struggles.length > 0 && (
            <Card className="shadow-card border-warning/20 bg-warning/5">
              <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5 text-warning"><AlertTriangle className="h-4 w-4" /> Common Weak Areas</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 mb-3">
                  {struggles.map(t => (
                    <div key={t.topic_id} className="flex items-center justify-between">
                      <span className="text-sm">{t.topic_name}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, t.miss_rate)} className="h-2 w-20" />
                        <span className="text-xs text-muted-foreground">{Math.round(t.miss_rate)}% miss</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline"
                  onClick={() => navigate(`/study-lab/session?mode=flashcards&classId=${selectedClassId}&topic=${encodeURIComponent(struggles[0].topic_name)}`)}>
                  <Target className="h-3 w-3 mr-1" /> Generate quiz from student insights
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Exam style trends */}
          {intel.formatCounts.length > 0 && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><FileText className="h-4 w-4" /> Exam Style Trends</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {intel.formatCounts.map(f => (
                    <Badge key={f.format} variant="secondary" className="text-xs capitalize">
                      {f.format.replace(/-/g, " ")} · {f.mentions}x
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Student advice */}
          {intel.adviceTrends.length > 0 && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><Users className="h-4 w-4" /> Student Advice</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {intel.adviceTrends.map((a, i) => (
                  <div key={i} className="p-3 rounded-xl bg-muted/50 text-sm text-foreground/80 italic">"{a}"</div>
                ))}
              </CardContent>
            </Card>
          )}

          <ContributeHub defaultClassId={selectedClassId} />

          <div className="flex gap-3 flex-wrap pt-2">
            <Button className="bg-gradient-calm border-0 text-primary-foreground" onClick={() => navigate(`/study-lab?classId=${selectedClassId}`)}>
              <Brain className="h-4 w-4 mr-1.5" /> Study This Course
            </Button>
            <Button variant="outline" onClick={() => navigate("/exam-debrief")}>
              <ArrowRight className="h-4 w-4 mr-1.5" /> Submit Debrief
            </Button>
            <Button variant="outline" onClick={() => navigate(`/classes/${selectedClassId}`)}>
              <BookOpen className="h-4 w-4 mr-1.5" /> Class Details
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
