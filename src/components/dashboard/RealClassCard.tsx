import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, User, ChevronRight, Mic, Camera, Sparkles } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * RealClassCard — a large, tappable class card.
 *
 * Presentation only. Every action inside is a generous tap target
 * so the dashboard feels effortless on mobile. Functionality is
 * unchanged from the previous version.
 */
export function RealClassCard({ c, index = 0 }: { c: ClassInfo; index?: number }) {
  const navigate = useNavigate();

  const meta = [
    c.professor && c.professor !== "TBD" ? { Icon: User, text: c.professor } : null,
    c.days.length > 0 ? { Icon: Clock, text: `${c.days.join("/")}${c.time ? ` · ${c.time}` : ""}` } : null,
    c.location ? { Icon: MapPin, text: c.location } : null,
  ].filter(Boolean) as { Icon: typeof User; text: string }[];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32 }}
      className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/70 backdrop-blur-md shadow-sm hover:shadow-elegant hover:border-border/80 transition-all"
    >
      {/* Header — the whole row is tappable and opens the class. */}
      <button
        onClick={() => navigate(`/classes/${c.id}`)}
        className="w-full flex items-center gap-3 p-5 md:p-6 text-left"
      >
        <span
          className={cn(
            "h-10 w-10 rounded-2xl shrink-0 flex items-center justify-center text-primary-foreground font-display font-semibold text-sm",
            c.color,
          )}
          aria-hidden
        >
          {c.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-foreground truncate leading-tight">
            {c.name}
          </h3>
          {meta[0] && (
            <p className="mt-0.5 text-[12px] text-muted-foreground truncate flex items-center gap-1.5">
              <meta[0].Icon className="h-3 w-3 shrink-0" />
              {meta[0].text}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {meta.length > 1 && (
        <div className="px-5 md:px-6 -mt-2 pb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {meta.slice(1).map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <m.Icon className="h-3 w-3" /> {m.text}
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="mx-5 md:mx-6 border-t border-border/40" />

      {/* Primary actions — 3 equal, large tap tiles */}
      <div className="grid grid-cols-3 gap-1.5 p-3">
        <ActionTile
          Icon={Mic}
          label="Record"
          onClick={() => navigate(`/notes?classId=${c.id}&action=record`)}
        />
        <ActionTile
          Icon={Camera}
          label="Scan"
          onClick={() => navigate(`/notes?classId=${c.id}&action=scan`)}
        />
        <ActionTile
          Icon={Sparkles}
          label="Study"
          onClick={() => navigate(`/study-lab?classId=${c.id}`)}
          emphasized
        />
      </div>
    </motion.article>
  );
}

function ActionTile({
  Icon,
  label,
  onClick,
  emphasized = false,
}: {
  Icon: typeof Mic;
  label: string;
  onClick: () => void;
  emphasized?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-[64px] rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors active:scale-[0.98]",
        emphasized
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-background/50 text-foreground/80 hover:bg-background/80 hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span>{label}</span>
    </button>
  );
}
