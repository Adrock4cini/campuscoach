import { useEffect, useState } from "react";
import { Plus, Mic, Camera, FileUp, StickyNote, MessageSquare, Lightbulb, Image, Sparkles, X, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { detectCurrentClass } from "@/lib/autoClass";
import { contributeStudySignal } from "@/hooks/useClassIntelligence";
import { toast } from "sonner";

interface CaptureAction {
  label: string;
  icon: typeof Mic;
  hint: string;
  run: (classId: string | null, navigate: ReturnType<typeof useNavigate>) => void;
}

const ACTIONS: CaptureAction[] = [
  { label: "Record Lecture",     icon: Mic,          hint: "Audio → AI transcript",   run: (_id, nav) => nav("/notes") },
  { label: "Snap Board Photo",   icon: Camera,       hint: "OCR + concepts",          run: (_id, nav) => nav("/notes") },
  { label: "Upload Textbook",    icon: FileUp,       hint: "Detect chapter + summary", run: (id, nav) => nav(id ? `/classes/${id}` : "/classes") },
  { label: "Homework Screenshot", icon: Image,       hint: "Linked to assignment",    run: (_id, nav) => nav("/assignments") },
  { label: "Quick Note",         icon: StickyNote,   hint: "Saved + tagged",          run: (_id, nav) => nav("/notes") },
  { label: "Voice Thought",      icon: Mic,          hint: "30-sec idea capture",     run: (_id, nav) => nav("/notes") },
  { label: "Professor Hint",     icon: MessageSquare, hint: "Shared with class",      run: (id, nav) => nav(id ? `/classes/${id}` : "/classes") },
  { label: "Study Insight",      icon: Lightbulb,    hint: "Boosts class predictions", run: (_id, nav) => nav("/exam-debrief") },
];

export function CaptureButton() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const detected = detectCurrentClass(now);

  const handleAction = async (a: CaptureAction) => {
    setOpen(false);
    if (detected && (a.label === "Snap Board Photo" || a.label === "Upload Textbook")) {
      // Log a signal so the user sees their contribution count rise.
      await contributeStudySignal({
        classId: detected.id,
        topicId: detected.currentTopic,
        topicName: detected.currentTopic,
        starred: true,
        timeSpentMinutes: 0,
        sourceType: "capture",
      });
      toast.success(`Capturing for ${detected.name} → ${detected.currentTopic}`);
    }
    a.run(detected?.id ?? null, navigate);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-16 right-0 w-[320px] rounded-2xl glass-strong border border-border/60 shadow-elevated p-3"
          >
            <div className="px-2 py-2 mb-2 rounded-xl bg-gradient-to-r from-primary/15 to-accent/10 border border-primary/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-[11px] uppercase tracking-[0.18em] text-primary/90 font-medium">
                  {detected ? "Capture for" : "Capture"}
                </p>
              </div>
              <p className="text-sm font-display font-semibold text-foreground mt-0.5">
                {detected ? detected.name : "Pick anything to capture"}
              </p>
              {detected && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Topic: {detected.currentTopic} · auto-detected
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {ACTIONS.map((a, i) => (
                <motion.button
                  key={a.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => handleAction(a)}
                  className="text-left p-2.5 rounded-lg border border-border/50 bg-background/30 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <a.icon className="h-4 w-4 text-primary mb-1" />
                  <p className="text-[12px] font-medium text-foreground leading-tight">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{a.hint}</p>
                </motion.button>
              ))}
            </div>

            <div className="mt-2 px-2 py-1.5 text-[10px] text-muted-foreground/80 flex items-center gap-1">
              <Wand2 className="h-3 w-3" /> Each capture sharpens your class predictions.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="relative h-14 w-14 rounded-full bg-gradient-calm shadow-elevated flex items-center justify-center glow-primary focus-pulse"
        aria-label="Capture"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X className="h-6 w-6 text-primary-foreground" /> : <Plus className="h-6 w-6 text-primary-foreground" />}
        </motion.div>
        {!open && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent ring-2 ring-background animate-pulse" />
        )}
      </motion.button>
    </div>
  );
}
