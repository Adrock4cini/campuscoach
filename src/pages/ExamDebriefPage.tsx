import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Send, TrendingUp, Users, AlertTriangle, BarChart3, MessageSquare, Sparkles, Shield
} from "lucide-react";
import { classes, exams } from "@/data/demo";
import { type ExamFormat } from "@/data/courseIntelligence";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClassIntelligence, getAnonUserId } from "@/hooks/useClassIntelligence";

const FORMAT_OPTIONS: { value: ExamFormat; label: string }[] = [
  { value: "multiple-choice", label: "Multiple Choice" },
  { value: "true-false", label: "True / False" },
  { value: "short-answer", label: "Short Answer" },
  { value: "essay", label: "Essay" },
  { value: "word-problems", label: "Word Problems" },
  { value: "diagrams", label: "Diagrams" },
  { value: "definitions", label: "Definitions" },
  { value: "application-based", label: "Application-Based" },
  { value: "memorization-heavy", label: "Memorization-Heavy" },
];

function RatingBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/5</span>
      </div>
      <Progress value={value * 20} className={`h-2 ${color}`} />
    </div>
  );
}

export default function ExamDebriefPage() {
  const [tab, setTab] = useState("submit");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [difficulty, setDifficulty] = useState(3);
  const [timePressure, setTimePressure] = useState(3);
  const [confidence, setConfidence] = useState(3);
  const [formatTags, setFormatTags] = useState<ExamFormat[]>([]);
  const [emphasizedTopics, setEmphasizedTopics] = useState("");
  const [studyMore, setStudyMore] = useState("");
  const [surprises, setSurprises] = useState("");
  const [advice, setAdvice] = useState("");
  const [insightsClassId, setInsightsClassId] = useState(classes[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);

  const intel = useClassIntelligence(insightsClassId);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const classExams = exams.filter(e => e.classId === selectedClassId);

  const toggleFormat = (f: ExamFormat) => {
    setFormatTags(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const handleSubmit = async () => {
    if (!selectedClassId || !selectedExamId) {
      toast.error("Please select a class and exam");
      return;
    }
    const exam = exams.find(e => e.id === selectedExamId);
    setSubmitting(true);
    const { error } = await supabase.from("exam_debriefs").insert({
      user_id: getAnonUserId(),
      class_id: selectedClassId,
      exam_name: exam?.title || "Exam",
      date_taken: new Date().toISOString().split("T")[0],
      topics_mentioned: emphasizedTopics.split(",").map(s => s.trim()).filter(Boolean),
      chapter_tags: exam?.topics ?? [],
      format_tags: formatTags,
      study_more_tags: studyMore.split(",").map(s => s.trim()).filter(Boolean),
      difficulty,
      time_pressure: timePressure,
      confidence,
      surprises: surprises || null,
      advice_notes: advice || null,
    });
    setSubmitting(false);
    if (error) { toast.error("Couldn't submit — try again"); return; }
    toast.success("Debrief submitted! Your insights will help other students.");
    setTab("insights");
    setInsightsClassId(selectedClassId);
    setSelectedClassId(""); setSelectedExamId(""); setDifficulty(3); setTimePressure(3); setConfidence(3);
    setFormatTags([]); setEmphasizedTopics(""); setStudyMore(""); setSurprises(""); setAdvice("");
  };

  const summaries: string[] = [];
  if (intel.topics[0]) summaries.push(`Most mentioned: ${intel.topics.slice(0, 3).map(t => t.topic_name).join(", ")}`);
  if (intel.formatCounts[0]) summaries.push(`Exams lean toward ${intel.formatCounts[0].format.replace(/-/g, " ")} format`);
  if (intel.studyMoreCounts[0]) summaries.push(`Students wished they'd reviewed "${intel.studyMoreCounts[0].topic}" more`);
  if (intel.averageDifficulty >= 4) summaries.push("Recent exams are rated as difficult — plan extra time");
  const classDebriefs = intel.debriefs;
  const insights = intel.topics.length > 0 || classDebriefs.length > 0 ? {
    topicEmphasis: intel.topics.map(t => ({ topic: t.topic_name, mentions: t.student_count })),
    formatEmphasis: intel.formatCounts,
    studyMorePatterns: intel.studyMoreCounts,
    difficultyTrend: intel.averageDifficulty,
    adviceTrends: intel.adviceTrends,
  } : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground">Exam Debrief</h1>
        <p className="text-muted-foreground text-sm mt-1">Share study insights and learn from peer experiences</p>
      </div>

      {/* Ethics notice */}
      <Card className="border-primary/20 bg-primary/5 shadow-soft">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground/80">
            <p className="font-medium text-foreground mb-1">Community Guidelines</p>
            <p>Share general study insights, not exact test questions or answers. Help others prepare smarter without violating academic integrity.</p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submit" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Submit Debrief</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Community Insights</TabsTrigger>
        </TabsList>

        {/* SUBMIT TAB */}
        <TabsContent value="submit" className="space-y-4 mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base font-display">Post-Exam Reflection</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Class */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Class</label>
                <Select value={selectedClassId} onValueChange={v => { setSelectedClassId(v); setSelectedExamId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Exam */}
              {selectedClassId && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Exam</label>
                  <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                    <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                    <SelectContent>
                      {classExams.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Ratings */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Difficulty", value: difficulty, set: setDifficulty },
                  { label: "Time Pressure", value: timePressure, set: setTimePressure },
                  { label: "Confidence", value: confidence, set: setConfidence },
                ].map(r => (
                  <div key={r.label}>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{r.label}</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => r.set(n)}
                          className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors ${n <= r.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Format tags */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Exam Formats Used</label>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_OPTIONS.map(f => (
                    <Badge key={f.value} variant={formatTags.includes(f.value) ? "default" : "outline"}
                      className="cursor-pointer text-xs" onClick={() => toggleFormat(f.value)}>
                      {f.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Topics */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Which topics felt most emphasized?</label>
                <Input placeholder="e.g. Memory models, Encoding types" value={emphasizedTopics} onChange={e => setEmphasizedTopics(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">What do you wish you had studied more?</label>
                <Input placeholder="e.g. Retrieval cues, Interference theory" value={studyMore} onChange={e => setStudyMore(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">What surprised you?</label>
                <Textarea placeholder="General impressions (no exact questions)" value={surprises} onChange={e => setSurprises(e.target.value)} className="min-h-[60px]" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Advice for the next student?</label>
                <Textarea placeholder="Study tips, what to focus on..." value={advice} onChange={e => setAdvice(e.target.value)} className="min-h-[60px]" />
              </div>

              <Button className="w-full bg-gradient-calm border-0 text-primary-foreground" onClick={handleSubmit} disabled={submitting}>
                <Send className="h-4 w-4 mr-1.5" /> {submitting ? "Submitting…" : "Submit Debrief"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INSIGHTS TAB */}
        <TabsContent value="insights" className="space-y-4 mt-4">
          {/* Class selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">View insights for</label>
            <Select value={insightsClassId} onValueChange={setInsightsClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* AI Summary */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="shadow-card border-primary/20 bg-primary/5">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Insight Summary
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
          </motion.div>

          {insights && (
            <>
              {/* Topic Emphasis */}
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><BarChart3 className="h-4 w-4" /> Most Mentioned Topics</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {insights.topicEmphasis.map(t => (
                    <div key={t.topic} className="flex items-center justify-between">
                      <span className="text-sm">{t.topic}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(t.mentions / classDebriefs.length) * 100} className="h-2 w-24" />
                        <span className="text-xs text-muted-foreground">{t.mentions}x</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Format Emphasis */}
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><FileText className="h-4 w-4" /> Common Exam Formats</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {insights.formatEmphasis.map(f => (
                      <Badge key={f.format} variant="secondary" className="text-xs">
                        {f.format.replace(/-/g, " ")} ({f.mentions}x)
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Study More Areas */}
              <Card className="shadow-card border-warning/20 bg-warning/5">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5 text-warning"><AlertTriangle className="h-4 w-4" /> Common "Study This More" Areas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {insights.studyMorePatterns.map(t => (
                      <Badge key={t.topic} variant="outline" className="text-xs border-warning/30 text-warning">
                        {t.topic} ({t.mentions}x)
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Difficulty + Time Pressure */}
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display">Difficulty & Time Pressure</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <RatingBar value={insights.difficultyTrend} label="Average Difficulty" color="" />
                  <RatingBar value={Math.round(classDebriefs.reduce((s, d) => s + (d.time_pressure || 0), 0) / Math.max(classDebriefs.length, 1) * 10) / 10} label="Average Time Pressure" color="" />
                </CardContent>
              </Card>

              {/* Peer Advice */}
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base font-display flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> Peer Advice</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {insights.adviceTrends.map((a, i) => (
                    <div key={i} className="p-3 rounded-xl bg-muted/50 text-sm text-foreground/80">
                      <Users className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                      "{a}"
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {!insights && (
            <Card className="shadow-card">
              <CardContent className="p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No peer insights yet for this class</p>
                <p className="text-xs text-muted-foreground mt-1">Be the first to submit a debrief!</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
