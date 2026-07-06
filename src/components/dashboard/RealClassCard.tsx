import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, User, ArrowRight, Mic, Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClassInfo } from "@/data/demo";

/**
 * RealClassCard — compact card for a student-added class.
 * Used on the Dashboard when the user has completed onboarding.
 * Kept intentionally minimal: no demo-only exam/assignment lookups.
 */
export function RealClassCard({ c, index = 0 }: { c: ClassInfo; index?: number }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur p-4 md:p-5 hover:border-border/80 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-3 w-3 rounded-full ${c.color} shrink-0`} />
          <h3 className="font-display font-semibold text-foreground truncate">{c.name}</h3>
        </div>
        <button
          onClick={() => navigate(`/classes/${c.id}`)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground mb-3">
        {c.professor && c.professor !== "TBD" && (
          <div className="flex items-center gap-1.5"><User className="h-3 w-3" />{c.professor}</div>
        )}
        {c.days.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {c.days.join("/")}{c.time ? ` · ${c.time}` : ""}
          </div>
        )}
        {c.location && (
          <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.location}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => navigate(`/notes?classId=${c.id}&action=record`)}>
          <Mic className="h-3.5 w-3.5 mr-1" /> Record
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/notes?classId=${c.id}&action=scan`)}>
          <Camera className="h-3.5 w-3.5 mr-1" /> Scan
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/study-lab?classId=${c.id}`)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Study
        </Button>
      </div>
    </motion.div>
  );
}
