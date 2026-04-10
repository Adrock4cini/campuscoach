import { Progress } from "@/components/ui/progress";
import { classes } from "@/data/demo";
import { modeLabels, StudyMode } from "@/data/questions";
import { X } from "lucide-react";

interface Props {
  classId: string;
  topic: string;
  mode: StudyMode;
  current: number;
  total: number;
  elapsed: number;
  durationLimit?: number | null;
  onExit: () => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SessionHeader({ classId, topic, mode, current, total, elapsed, durationLimit, onExit }: Props) {
  const cls = classes.find(c => c.id === classId);
  const remaining = durationLimit ? Math.max(0, durationLimit - elapsed) : null;
  const progressValue = durationLimit
    ? ((durationLimit - (remaining ?? 0)) / durationLimit) * 100
    : ((current + 1) / total) * 100;

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{cls?.name} · {topic === "all" ? "All Topics" : topic}</p>
          <p className="text-sm font-medium text-foreground">{modeLabels[mode]}</p>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null ? (
            <span className={`text-sm font-mono font-medium ${remaining < 10 ? "text-danger" : "text-foreground"}`}>
              {formatTime(remaining)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{formatTime(elapsed)}</span>
          )}
          <button onClick={onExit} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={progressValue} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {durationLimit ? `${current + 1} answered` : `${current + 1} / ${total}`}
        </span>
      </div>
    </div>
  );
}
