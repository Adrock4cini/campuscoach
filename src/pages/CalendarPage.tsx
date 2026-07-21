import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateCalendarEvents, eventTypeColors, academicDates } from "@/data/demo";
import { EditEventModal } from "@/components/EditEventModal";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Pencil, Trash2 } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/data/demo";
import { useAuth } from "@/contexts/AuthContext";
import { RealCalendarView } from "@/components/real/RealCalendarView";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 14 }, (_, i) => i + 7);

const filterOptions = ["Classes", "Work", "Exams", "Assignments", "Personal", "Academic"] as const;
const filterTypeMap: Record<string, CalendarEventType[]> = {
  Classes: ["class"],
  Work: ["work"],
  Exams: ["exam"],
  Assignments: ["assignment"],
  Personal: ["personal", "study"],
  Academic: ["academic-deadline", "payment", "tutoring", "office-hours"],
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (weekStart.getMonth() === end.getMonth()) {
    return `${months[weekStart.getMonth()]} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${months[weekStart.getMonth()]} ${weekStart.getDate()} – ${months[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function getDateForDay(weekStart: Date, dayIndex: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

export default function CalendarPage() {
  const { mode } = useAuth();
  if (mode === "loading") return null;
  if (mode === "real") return <RealCalendarView />;
  return <DemoCalendarPage />;
}

function DemoCalendarPage() {
  const navigate = useNavigate();
  const today = new Date("2026-04-04");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(today));
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(filterOptions));
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [addDay, setAddDay] = useState<string | undefined>();
  const [addHour, setAddHour] = useState<number | undefined>();

  const baseEvents = useMemo(() => generateCalendarEvents(currentWeekStart), [currentWeekStart]);
  const allEvents = [...baseEvents, ...customEvents];

  const filteredEvents = allEvents.filter(e => {
    for (const [filterName, types] of Object.entries(filterTypeMap)) {
      if (types.includes(e.type)) {
        return activeFilters.has(filterName);
      }
    }
    return true;
  });

  // Academic dates for this week
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekAcademicDates = academicDates.filter(ad => {
    const d = new Date(ad.date);
    return d >= currentWeekStart && d <= weekEnd;
  });

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  };

  const goToPrev = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const goToNext = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const goToToday = () => {
    setCurrentWeekStart(getWeekStart(today));
  };

  const isCurrentWeek = getWeekStart(today).getTime() === currentWeekStart.getTime();

  const handleSaveEvent = (event: CalendarEvent) => {
    setCustomEvents(prev => {
      const idx = prev.findIndex(e => e.id === event.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = event;
        return next;
      }
      return [...prev, event];
    });
    setEditingEvent(null);
  };

  const handleDeleteEvent = (id: string) => {
    setCustomEvents(prev => prev.filter(e => e.id !== id));
    setEditingEvent(null);
  };

  const handleCellClick = (day: string, hour: number) => {
    const existingEvent = filteredEvents.find(e => e.day === day && e.startHour === hour);
    if (existingEvent?.editable) {
      setEditingEvent(existingEvent);
      setEditModalOpen(true);
    } else if (!existingEvent) {
      setAddDay(day);
      setAddHour(hour);
      setEditingEvent(null);
      setEditModalOpen(true);
    } else if (existingEvent.linkedRoute) {
      navigate(existingEvent.linkedRoute);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Calendar</h1>
        <p className="text-muted-foreground mt-1">Week of {formatWeekRange(currentWeekStart)}</p>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card rounded-lg border border-border p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant={isCurrentWeek ? "default" : "ghost"} size="sm" className={`h-8 text-xs ${isCurrentWeek ? "bg-gradient-calm border-0 text-primary-foreground" : ""}`} onClick={goToToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-90 gap-1" onClick={() => { setEditingEvent(null); setAddDay(undefined); setAddHour(undefined); setEditModalOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Event
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map(f => {
          const typeKey = filterTypeMap[f][0];
          return (
            <Badge
              key={f}
              variant="secondary"
              className={`cursor-pointer transition-all ${activeFilters.has(f) ? (eventTypeColors[typeKey] || "bg-muted text-muted-foreground") : "bg-muted/50 text-muted-foreground/50"}`}
              onClick={() => toggleFilter(f)}
            >
              {f}
            </Badge>
          );
        })}
      </div>

      {/* Academic Dates Banner */}
      {weekAcademicDates.length > 0 && (
        <Card className="shadow-soft border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Academic Dates This Week
            </p>
            <div className="space-y-1">
              {weekAcademicDates.map(ad => (
                <p key={ad.id} className="text-sm text-foreground/80">
                  📌 <strong>{ad.label}</strong> — {new Date(ad.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {ad.description && <span className="text-muted-foreground"> · {ad.description}</span>}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar Grid */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <Card className="shadow-card overflow-x-auto">
          <CardContent className="p-0">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 border-b border-border">
                <div className="p-3 text-xs text-muted-foreground font-medium" />
                {days.map((d, i) => {
                  const date = getDateForDay(currentWeekStart, i);
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <div key={d} className={`p-3 text-center border-l border-border ${isToday ? "bg-primary/5" : ""}`}>
                      <p className="text-sm font-medium text-foreground">{d}</p>
                      <p className={`text-xs ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{date.getDate()}</p>
                    </div>
                  );
                })}
              </div>

              {hours.map(h => (
                <div key={h} className="grid grid-cols-8 border-b border-border last:border-0" style={{ minHeight: 48 }}>
                  <div className="p-2 text-xs text-muted-foreground font-medium flex items-start justify-end pr-3">
                    {h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`}
                  </div>
                  {days.map(d => {
                    const event = filteredEvents.find(e => e.day === d && e.startHour === h);
                    return (
                      <div
                        key={d}
                        className="border-l border-border relative p-0.5 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => handleCellClick(d, h)}
                      >
                        {event && (
                          <div
                            className={`rounded-md border px-2 py-1 text-xs font-medium transition-opacity ${eventTypeColors[event.type] || "bg-muted text-muted-foreground border-border"} ${event.editable ? "hover:ring-1 hover:ring-primary/30" : "hover:opacity-80"}`}
                            style={{ minHeight: event.duration * 48 - 4 }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (event.editable) {
                                setEditingEvent(event);
                                setEditModalOpen(true);
                              } else if (event.linkedRoute) {
                                navigate(event.linkedRoute);
                              }
                            }}
                          >
                            <span>{event.label}</span>
                            {event.editable && <Pencil className="h-2.5 w-2.5 inline ml-1 opacity-50" />}
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

      <EditEventModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        event={editingEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        defaultDay={addDay}
        defaultHour={addHour}
      />
    </div>
  );
}
