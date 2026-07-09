import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, Users, TrendingUp, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const KEY = "cc_onboarded_v1";

const steps = [
  {
    icon: Camera,
    title: "Capture anything in one tap",
    body: "Record lectures, snap the board, drop a textbook page. The capture button follows you on every screen.",
    tint: "from-primary/30 to-accent/20",
  },
  {
    icon: Sparkles,
    title: "AI organizes it instantly",
    body: "We detect the class, extract concepts, summarize, and turn it into flashcards — within seconds.",
    tint: "from-accent/30 to-primary/20",
  },
  {
    icon: Users,
    title: "Your class makes it smarter",
    body: "Anonymous patterns from classmates surface what's likely on the exam — never their private notes.",
    tint: "from-primary/30 to-success/20",
  },
  {
    icon: TrendingUp,
    title: "Your readiness improves daily",
    body: "Every capture, debrief, and study sprint sharpens the predictions for you and everyone in your class.",
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
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/60">
        <VisuallyHidden>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>{s.body}</DialogDescription>
        </VisuallyHidden>
        <div className={`p-6 bg-gradient-to-br ${s.tint}`}>
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
              <h2 className="text-2xl font-display font-semibold text-foreground leading-tight">
                {s.title}
              </h2>
              <p className="text-sm text-foreground/75 mt-2">{s.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-4 flex items-center justify-between bg-card">
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
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
            <Button
              size="sm"
              className="bg-gradient-calm border-0 text-primary-foreground"
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
