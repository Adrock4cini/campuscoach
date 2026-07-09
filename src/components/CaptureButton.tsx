import { useEffect, useState } from "react";
import { Plus, Mic, Camera, StickyNote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { detectCurrentClass } from "@/lib/autoClass";
import { useCapture } from "@/contexts/CaptureContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import type { CaptureKind } from "@/lib/capture/types";

/**
 * Floating + capture button. The "Class Now" pill is driven by the demo
 * schedule, so it is shown ONLY in demo/anonymous mode. Authenticated
 * users see the plain capture button until we wire a real schedule.
 */
export function CaptureButton() {
  const [now, setNow] = useState(() => new Date());
  const { open } = useCapture();
  const { mode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Only surface the demo "Class Now" pill in demo mode. Real users and
  // the loading window see the plain capture button.
  const detected = mode === "demo" ? detectCurrentClass(now) : null;


  const quick = (kind: CaptureKind) => open(kind);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {detected && (
          <motion.div
            key={detected.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="glass border border-success/40 rounded-2xl shadow-elevated overflow-hidden max-w-[280px]"
          >
            <button
              onClick={() => navigate(`/classes/${detected.id}`)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-background/30 transition-colors"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{detected.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-success">Happening now</div>
              </div>
            </button>
            <div className="grid grid-cols-3 border-t border-border/40">
              <PillAction Icon={Mic}        label="Record"   onClick={() => quick("record-lecture")} />
              <PillAction Icon={Camera}     label="Scan"     onClick={() => quick("scan-board")} />
              <PillAction Icon={StickyNote} label="Notes"    onClick={() => quick("quick-note")} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

function PillAction({
  Icon, label, onClick,
}: { Icon: typeof Mic; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
