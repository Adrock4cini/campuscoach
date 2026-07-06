import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Brain, ArrowRight, Eye, Sparkles, Lightbulb, Radar } from "lucide-react";
import type { CampusBrainInsight } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const kindMap = {
  noticed:   { verb: "noticed",   Icon: Eye,       tone: "text-primary"  },
  predicts:  { verb: "predicts",  Icon: Radar,     tone: "text-accent"   },
  recommends:{ verb: "recommends",Icon: Sparkles,  tone: "text-warning"  },
  learned:   { verb: "learned",   Icon: Lightbulb, tone: "text-success"  },
} as const;

interface Props {
  insight: CampusBrainInsight;
  compact?: boolean;
  className?: string;
}

/**
 * Renders one Campus Brain insight in the consistent voice used
 * across the app: "Campus Brain <verb>… <body>".
 */
export function CampusBrainInsightCard({ insight, compact, className }: Props) {
  const navigate = useNavigate();
  const meta = kindMap[insight.kind];
  const Icon = meta.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/25 glass",
        !compact && "shadow-elegant",
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/20 blur-[80px]" />
      </div>

      <div className={cn("relative flex items-start gap-3", compact ? "p-3" : "p-4")}>
        <div className="h-9 w-9 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Brain className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-primary/90">
            <Icon className={cn("h-3 w-3", meta.tone)} />
            Campus Brain {meta.verb}
          </div>
          <p className="text-sm text-foreground/90 mt-1 leading-snug">
            {insight.body}
          </p>

          {insight.action && !compact && (
            <button
              onClick={() => navigate(insight.action!.to)}
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
            >
              {insight.action.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
