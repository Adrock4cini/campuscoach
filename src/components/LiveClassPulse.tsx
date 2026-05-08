import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Users, Sparkles } from "lucide-react";
import { useClassIntelligence } from "@/hooks/useClassIntelligence";
import { Link } from "react-router-dom";

interface Props {
  classId: string;
  className?: string;
}

/**
 * Compact, always-visible "the app is alive" strip.
 * Shows live contribution count, top trending topic, and weekly delta.
 */
export function LiveClassPulse({ classId, className }: Props) {
  const intel = useClassIntelligence(classId);
  const [tickerIdx, setTickerIdx] = useState(0);

  const messages = [
    intel.topics[0] && `${intel.topics[0].student_count} students focused on ${intel.topics[0].topic_name}`,
    intel.studyMoreCounts[0] && `Peers wished they'd reviewed ${intel.studyMoreCounts[0].topic} more`,
    intel.formatCounts[0] && `Recent exams lean ${intel.formatCounts[0].format.replace(/-/g, " ")}`,
    intel.weeklyContributions > 0 && `${intel.weeklyContributions} new insights this week`,
  ].filter(Boolean) as string[];

  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setTickerIdx((i) => (i + 1) % messages.length), 3500);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <Link
      to="/course-intelligence"
      className={`block group rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 to-accent/5 px-4 py-3 hover:border-primary/40 transition-colors ${className ?? ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Live class pulse
          </p>
          <div className="h-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={tickerIdx}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="text-sm font-medium text-foreground truncate"
              >
                {messages[tickerIdx] ?? "Be the first to add a class insight →"}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end text-right flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> Contributors
          </span>
          <span className="text-sm font-display font-semibold text-foreground">{intel.totalContributors}</span>
        </div>
      </div>
    </Link>
  );
}
