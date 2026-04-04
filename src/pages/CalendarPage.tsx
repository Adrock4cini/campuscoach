import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { classes, workShifts, exams, assignments } from "@/data/demo";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7AM - 8PM

interface CalendarEvent {
  day: string;
  startHour: number;
  duration: number;
  label: string;
  type: "class" | "work" | "exam" | "assignment";
}

function buildEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  classes.forEach(c => {
    c.days.forEach(day => {
      const hour = parseInt(c.time);
      const isPM = c.time.includes("PM") && hour !== 12;
      const h = isPM ? hour + 12 : hour;
      events.push({ day, startHour: h, duration: 1, label: c.name, type: "class" });
    });
  });

  workShifts.forEach(s => {
    const startH = parseInt(s.startTime);
    const isPM = s.startTime.includes("PM") && startH !== 12;
    const endH = parseInt(s.endTime);
    const endPM = s.endTime.includes("PM") && endH !== 12;
    const start = isPM ? startH + 12 : startH;
    const end = endPM ? endH + 12 : endH;
    events.push({ day: s.day, startHour: start, duration: end - start, label: "Work", type: "work" });
  });

  return events;
}

const typeColors: Record<string, string> = {
  class: "bg-primary/15 text-primary border-primary/20",
  work: "bg-muted text-muted-foreground border-border",
  exam: "bg-danger/15 text-danger border-danger/20",
  assignment: "bg-warning/15 text-warning border-warning/20",
};

export default function CalendarPage() {
  const events = buildEvents();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Calendar</h1>
        <p className="text-muted-foreground mt-1">Week of April 4–10, 2026</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-primary/15 text-primary">Classes</Badge>
        <Badge variant="secondary" className="bg-muted text-muted-foreground">Work</Badge>
        <Badge variant="secondary" className="bg-danger/15 text-danger">Exams</Badge>
        <Badge variant="secondary" className="bg-warning/15 text-warning">Assignments</Badge>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="shadow-card overflow-x-auto">
          <CardContent className="p-0">
            <div className="min-w-[700px]">
              {/* Header */}
              <div className="grid grid-cols-8 border-b border-border">
                <div className="p-3 text-xs text-muted-foreground font-medium" />
                {days.map(d => (
                  <div key={d} className="p-3 text-center text-sm font-medium text-foreground border-l border-border">
                    {d}
                  </div>
                ))}
              </div>

              {/* Time slots */}
              {hours.map(h => (
                <div key={h} className="grid grid-cols-8 border-b border-border last:border-0" style={{ minHeight: 48 }}>
                  <div className="p-2 text-xs text-muted-foreground font-medium flex items-start justify-end pr-3">
                    {h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`}
                  </div>
                  {days.map(d => {
                    const event = events.find(e => e.day === d && e.startHour === h);
                    return (
                      <div key={d} className="border-l border-border relative p-0.5">
                        {event && (
                          <div
                            className={`rounded-md border px-2 py-1 text-xs font-medium ${typeColors[event.type]}`}
                            style={{ minHeight: event.duration * 48 - 4 }}
                          >
                            {event.label}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Suggestion */}
      <Card className="shadow-soft border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-2">🤖 AI Study Block Suggestion</h3>
          <p className="text-sm text-muted-foreground">
            "Best 45-minute study block for Algebra: <strong>Tuesday 3:30 PM</strong>. You're free before your evening, 
            and Algebra needs the most attention right now."
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
