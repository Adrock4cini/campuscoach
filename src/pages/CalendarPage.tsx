import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { calendarEvents } from "@/data/demo";
import { useNavigate } from "react-router-dom";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 14 }, (_, i) => i + 7);

const typeColors: Record<string, string> = {
  class: "bg-primary/15 text-primary border-primary/20",
  work: "bg-muted text-muted-foreground border-border",
  exam: "bg-danger/15 text-danger border-danger/20",
  assignment: "bg-warning/15 text-warning border-warning/20",
  study: "bg-success/15 text-success border-success/20",
};

const filterOptions = ["Classes", "Work", "Exams", "Assignments"] as const;
const filterTypeMap: Record<string, string> = {
  Classes: "class",
  Work: "work",
  Exams: "exam",
  Assignments: "assignment",
};

export default function CalendarPage() {
  const navigate = useNavigate();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["Classes", "Work", "Exams", "Assignments"]));

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  const filteredEvents = calendarEvents.filter(e => {
    const filterName = Object.entries(filterTypeMap).find(([, v]) => v === e.type)?.[0];
    return filterName ? activeFilters.has(filterName) : true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Calendar</h1>
        <p className="text-muted-foreground mt-1">Week of April 4–10, 2026</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filterOptions.map(f => (
          <Badge
            key={f}
            variant="secondary"
            className={`cursor-pointer transition-all ${
              activeFilters.has(f)
                ? typeColors[filterTypeMap[f]]
                : "bg-muted/50 text-muted-foreground/50"
            }`}
            onClick={() => toggleFilter(f)}
          >
            {f}
          </Badge>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <Card className="shadow-card overflow-x-auto">
          <CardContent className="p-0">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 border-b border-border">
                <div className="p-3 text-xs text-muted-foreground font-medium" />
                {days.map(d => (
                  <div key={d} className="p-3 text-center text-sm font-medium text-foreground border-l border-border">{d}</div>
                ))}
              </div>

              {hours.map(h => (
                <div key={h} className="grid grid-cols-8 border-b border-border last:border-0" style={{ minHeight: 48 }}>
                  <div className="p-2 text-xs text-muted-foreground font-medium flex items-start justify-end pr-3">
                    {h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`}
                  </div>
                  {days.map(d => {
                    const event = filteredEvents.find(e => e.day === d && e.startHour === h);
                    return (
                      <div key={d} className="border-l border-border relative p-0.5">
                        {event && (
                          <div
                            className={`rounded-md border px-2 py-1 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${typeColors[event.type]}`}
                            style={{ minHeight: event.duration * 48 - 4 }}
                            onClick={() => {
                              if (event.linkedRoute) navigate(event.linkedRoute);
                            }}
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
