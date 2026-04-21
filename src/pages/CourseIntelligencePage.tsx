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
  FileText, Users, AlertTriangle, Target, ArrowRight, Library
} from "lucide-react";
import { classes } from "@/data/demo";
import {
  textbooks, classTextbookMap, professors, classProfessorMap,
  getCourseInsights, generateInsightSummary, examDebriefs, getPredictedTopics, getClassPulse,
} from "@/data/courseIntelligence";

export default function CourseIntelligencePage() {
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");

  const cls = classes.find(c => c.id === selectedClassId);
  const textbook = textbooks.find(t => t.id === classTextbookMap[selectedClassId]);
  const professor = professors.find(p => p.id === classProfessorMap[selectedClassId]);
  const insights = getCourseInsights(selectedClassId);
  const summaries = generateInsightSummary(selectedClassId);
  const debriefCount = examDebriefs.filter(d => d.classId === selectedClassId).length;
  const predictedTopics = getPredictedTopics(selectedClassId).slice(0, 3);
  const classPulse = getClassPulse(selectedClassId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground">Course Intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">Actionable guide from textbooks, professors, and peer insights</p>
      </div>

      {/* Class selector */}
      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {cls && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Class + Professor + Textbook */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-soft">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Professor</p>
                <p className="text-sm font-medium">{professor?.name || cls.professor}</p>
                <p className="text-xs text-muted-foreground">{professor?.department}</p>
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Textbook</p>
                <p className="text-sm font-medium truncate">{textbook?.title || "Not set"}</p>
                <p className="text-xs text-muted-foreground">{textbook ? `${textbook.edition} ed. · ${textbook.author}` : ""}</p>
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Peer Debriefs</p>
                <p className="text-sm font-medium">{debriefCount} student{debriefCount !== 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">shared insights</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Summary */}
          <Card className="shadow-card border-primary/20 bg-primary/5">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                <Sparkles className="h-4 w-4 text-primary" /> What the AI Learned About This Course
              </h3>
              <ul className="space-y-2">
                {summaries.map((s, i) => (
                  <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                <Target className="h-4 w-4 text-primary" /> 🎯 If you only study 3 things, study this:
              </h3>
              <div className="space-y-2">
                {predictedTopics.map((topic) => (
                  <div key={topic.topic} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground">{topic.probability}% likely · {topic.reason}</p>
                    </div>
                    <Badge variant="outline" className="text-xs border-primary/20 text-primary">{topic.confidence}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">{classPulse?.networkEffectLine}</p>
            </CardContent>
          </Card>

          {/* Chapter Progress */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display flex items-center gap-1.5">
                <Library className="h-4 w-4" /> Chapter Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cls.chapters.map(ch => {
                const emphasized = insights?.topicEmphasis.some(t =>
                  ch.title.toLowerCase().includes(t.topic.toLowerCase().split(" ")[0])
                );
                return (
                  <div key={ch.number} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/classes/${selectedClassId}`)}>
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      ch.status === "completed" ? "bg-success/15 text-success" :
                      ch.status === "in-progress" ? "bg-warning/15 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>{ch.number}</div>
                    <span className="text-sm flex-1">{ch.title}</span>
                    {emphasized && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">High emphasis</Badge>}
                    {ch.status === "completed" && <Badge variant="secondary" className="text-[10px]">Done</Badge>}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Insights detail */}
          {insights && (
            <>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><BarChart3 className="h-4 w-4" /> Topic Emphasis Patterns</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {insights.topicEmphasis.map(t => (
                    <div key={t.topic} className="flex items-center justify-between">
                      <span className="text-sm">{t.topic}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(t.mentions / debriefCount) * 100} className="h-2 w-20" />
                        <span className="text-xs text-muted-foreground">{Math.round((t.mentions / debriefCount) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-card border-warning/20 bg-warning/5">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5 text-warning"><AlertTriangle className="h-4 w-4" /> Common Struggle Areas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {insights.studyMorePatterns.map(t => (
                      <Badge key={t.topic} variant="outline" className="text-xs border-warning/30 text-warning">{t.topic}</Badge>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/study-lab?classId=${selectedClassId}`)}>
                    <Target className="h-3 w-3 mr-1" /> Practice These Topics
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><FileText className="h-4 w-4" /> Exam Format Patterns</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {insights.formatEmphasis.map(f => (
                      <Badge key={f.format} variant="secondary" className="text-xs capitalize">{f.format.replace(/-/g, " ")} ({f.mentions}x)</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><Users className="h-4 w-4" /> Top Peer Advice</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {insights.adviceTrends.map((a, i) => (
                    <div key={i} className="p-3 rounded-xl bg-muted/50 text-sm text-foreground/80 italic">"{a}"</div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {/* Actions */}
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
