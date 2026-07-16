import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { NotebookPen, Sparkles, Brain, TrendingUp, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const KEY = "cc_onboarded_v1";

const steps = [
  {
    icon: NotebookPen,
    title: "Save what matters",
    body: "Add a quick note or professor hint and choose the class it belongs to. Your original words stay connected to what Campus Brain creates.",
    tint: "from-primary/30 to-accent/20",
  },
  {
    icon: Sparkles,
    title: "Campus Brain finds the concepts",
    body: "It turns your class material into grounded concepts without padding a short note into facts you never provided.",
    tint: "from-accent/30 to-primary/20",
  },
  {
    icon: Brain,
    title: "Study the right material",
    body: "Build evidence-backed flashcards and questions. Every card stays linked to the concept and source that created it.",
    tint: "from-primary/30 to-success/20",
  },
  {
    icon: TrendingUp,
    title: "Your coach learns with you",
    body: "Mark what you knew and what needs review. Campus Companion updates mastery and improves your next recommendation.",
    tint: "from-success/30 to-primary/20",
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  const close = () => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  };

  const s = steps[step];
  const Icon = s.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] min-w-0 overflow-hidden border-border/60 p-0 sm:max-w-md">
        <VisuallyHidden>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>{s.body}</DialogDescription>
        </VisuallyHidden>
        <div className={`min-w-0 bg-gradient-to-br p-5 sm:p-6 ${s.tint}`}>
          <div className="h-14 w-14 rounded-2xl bg-background/40 backdrop-blur flex items-center justify-center mb-4">
            <Icon className="h-7 w-7 text-foreground" />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/60 mb-1">
                Step {step + 1} of {steps.length}
              </p>
              <h2 className="break-words text-2xl font-display font-semibold text-foreground leading-tight">
                {s.title}
              </h2>
              <p className="mt-2 break-words text-sm leading-relaxed text-foreground/75">{s.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 bg-card p-4 min-[360px]:grid-cols-[auto_minmax(0,1fr)] min-[360px]:items-center">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 min-[360px]:justify-self-end">
            <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
            <Button
              size="sm"
              className="min-w-0 bg-gradient-calm border-0 px-3 text-primary-foreground"
              onClick={() => (step < steps.length - 1 ? setStep(step + 1) : close())}
            >
              {step < steps.length - 1 ? "Next" : "Start studying"}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
