import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import { detectCurrentClass } from "@/lib/autoClass";
import { useCapture } from "@/contexts/CaptureContext";

/**
 * The one + button. Opens the Quick Capture flow — the main habit
 * loop that feeds the Student Model / Campus Brain. Every screen
 * shares this entry point so muscle memory builds fast.
 */
export function CaptureButton() {
  const [now, setNow] = useState(() => new Date());
  const { open } = useCapture();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const detected = detectCurrentClass(now);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {detected && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full glass border border-primary/25 px-3 py-1 text-[11px] text-primary/90"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          {detected.name} · now
        </motion.div>
      )}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => open()}
        className="relative h-14 w-14 rounded-full bg-gradient-calm shadow-elevated flex items-center justify-center glow-primary focus-pulse"
        aria-label="Quick Capture"
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent ring-2 ring-background animate-pulse" />
      </motion.button>
    </div>
  );
}

// Keep imports even if unused, to avoid dead-import churn if we re-enable them later.
void X;
