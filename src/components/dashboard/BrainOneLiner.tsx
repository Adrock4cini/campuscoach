import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Brain, ArrowRight, ChevronDown } from "lucide-react";
import type { CampusBrainInsight } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

interface Props {
  insight: CampusBrainInsight;
}

/**
 * One-sentence Campus Brain surface. Expand for detail.
 */
export function BrainOneLiner({ insight }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-primary/20 bg-background/30 backdrop-blur"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="h-8 w-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <p className="flex-1 min-w-0 text-sm text-foreground/90 leading-snug line-clamp-2">
          {insight.body}
        </p>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && insight.action && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-border/30">
              <button
                onClick={() => navigate(insight.action!.to)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
              >
                {insight.action.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
