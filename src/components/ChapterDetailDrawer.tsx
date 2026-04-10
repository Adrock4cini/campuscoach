import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfessorHints } from "@/components/ProfessorHints";
import {
  CheckCircle2, Circle, Loader2, Camera, FileUp, Sparkles,
  Brain, FlaskConical, Pencil, Save, ImagePlus, FileText, X,
  Lightbulb, AlertTriangle, BookOpen, Target
} from "lucide-react";
import type { Chapter, ProfessorHint } from "@/data/demo";
import { useNavigate } from "react-router-dom";

interface ChapterDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: Chapter | null;
  classId: string;
  className: string;
  onUpdateChapter?: (chapter: Chapter) => void;
}

export function ChapterDetailDrawer({ open, onOpenChange, chapter, classId, className, onUpdateChapter }: ChapterDetailDrawerProps) {
  const navigate = useNavigate();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Chapter['status']>("not-started");
  const [hints, setHints] = useState<ProfessorHint[]>([]);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Sync state when chapter changes
  const initChapter = (ch: Chapter) => {
    setTitle(ch.title);
    setNotes(ch.notes || "");
    setStatus(ch.status);
    setHints(ch.professorHints || []);
    setEditingTitle(false);
    setShowUpload(false);
  };

  if (!chapter) return null;

  // Initialize on open (use key-based approach)
  if (open && title === "" && chapter.title !== "") {
    initChapter(chapter);
  }

  const statusIcon = status === "completed" ? <CheckCircle2 className="h-5 w-5 text-success" /> :
    status === "in-progress" ? <Loader2 className="h-5 w-5 text-warning" /> :
    <Circle className="h-5 w-5 text-muted-foreground/30" />;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setTitle(""); onOpenChange(v); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            {statusIcon}
            <div className="flex-1">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-lg font-display font-semibold" autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTitle(false)}><Save className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <SheetTitle className="font-display text-lg cursor-pointer hover:text-primary transition-colors flex items-center gap-1" onClick={() => setEditingTitle(true)}>
                  Ch {chapter.number}: {title}
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </SheetTitle>
              )}
              <p className="text-sm text-muted-foreground">{className}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 pb-6">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
            <Select value={status} onValueChange={v => setStatus(v as Chapter['status'])}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not-started">Not Started</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Chapter Notes</label>
            <Textarea
              placeholder="Add notes about this chapter..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>

          {/* Upload Photo / PDF */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Uploads & Photos</label>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setShowUpload(!showUpload)}>
                <ImagePlus className="h-3 w-3" /> Add
              </Button>
            </div>

            {showUpload && (
              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="h-20 flex-col gap-2">
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="text-xs">Take Photo</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-20 flex-col gap-2">
                      <FileUp className="h-5 w-5 text-primary" />
                      <span className="text-xs">Upload File</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Take a photo of textbook pages or upload PDFs to extract and break down content
                  </p>
                </CardContent>
              </Card>
            )}

            {chapter.uploadedImages && chapter.uploadedImages.length > 0 && (
              <div className="flex gap-2 mt-2">
                {chapter.uploadedImages.map((img, i) => (
                  <div key={i} className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    📷 {i + 1}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extracted Text */}
          {chapter.extractedText && (
            <div>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 mb-1" onClick={() => setShowExtractedText(!showExtractedText)}>
                <FileText className="h-3 w-3" /> {showExtractedText ? "Hide" : "Show"} Extracted Text
              </Button>
              {showExtractedText && (
                <Card className="shadow-soft">
                  <CardContent className="p-3">
                    <p className="text-xs text-foreground/70 whitespace-pre-line">{chapter.extractedText}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* AI Breakdown */}
          {chapter.aiBreakdown ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> AI Chapter Breakdown
              </h4>

              {chapter.aiBreakdown.bigIdea && (
                <Card className="shadow-soft bg-primary/5 border-primary/20">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Big Idea</p>
                    <p className="text-sm text-foreground/80">{chapter.aiBreakdown.bigIdea}</p>
                  </CardContent>
                </Card>
              )}

              {chapter.aiBreakdown.keyTerms && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Key Terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {chapter.aiBreakdown.keyTerms.map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {chapter.aiBreakdown.professorCares && (
                <Card className="shadow-soft bg-warning/5 border-warning/20">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-warning mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> What the Professor Cares About</p>
                    <p className="text-sm text-foreground/80">{chapter.aiBreakdown.professorCares}</p>
                  </CardContent>
                </Card>
              )}

              {chapter.aiBreakdown.confusing && (
                <Card className="shadow-soft bg-danger/5 border-danger/20">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-danger mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> What Feels Confusing</p>
                    <p className="text-sm text-foreground/80">{chapter.aiBreakdown.confusing}</p>
                  </CardContent>
                </Card>
              )}

              {chapter.aiBreakdown.practiceNext && (
                <Card className="shadow-soft">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-foreground mb-1">📝 Practice Next</p>
                    <p className="text-sm text-foreground/80">{chapter.aiBreakdown.practiceNext}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="border-dashed border-primary/20 bg-primary/5">
              <CardContent className="p-4 text-center">
                <Sparkles className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Generate AI Breakdown</p>
                <p className="text-xs text-muted-foreground mt-1">Upload chapter content or add notes, then generate a study-friendly breakdown</p>
                <Button size="sm" className="mt-3 bg-gradient-calm border-0 text-primary-foreground text-xs">
                  <Sparkles className="h-3 w-3 mr-1" /> Generate Breakdown
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Professor Hints */}
          <ProfessorHints
            hints={hints}
            onAdd={h => setHints(prev => [...prev, h])}
            onDelete={id => setHints(prev => prev.filter(h => h.id !== id))}
            onTogglePin={id => setHints(prev => prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h))}
          />

          {/* Study Actions */}
          <div className="pt-2 border-t border-border space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Study This Chapter</h4>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { onOpenChange(false); navigate(`/study-lab?classId=${classId}`); }}>
                <Brain className="h-3 w-3 mr-1" /> Flashcards
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { onOpenChange(false); navigate(`/study-lab?classId=${classId}`); }}>
                <FlaskConical className="h-3 w-3 mr-1" /> Quiz Me
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
