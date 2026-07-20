import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, BookOpen, CalendarDays, FlaskConical, GraduationCap,
  Mic, Map, Award, TrendingUp, MessageSquare, BarChart3, Settings,
  Sparkles, Search, Timer,
} from "lucide-react";
import { classes, assignments, exams } from "@/data/demo";
import { useFocusMode } from "@/contexts/FocusModeContext";
import { useAuth } from "@/contexts/AuthContext";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global ⌘K command palette.
 * Hosts navigation, class jumps, an "act on" list (assignments / exams),
 * and Focus-mode commands. One unified search surface.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { setMode } = useFocusMode();
  const { mode } = useAuth();
  const demoMode = mode === "demo";

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search classes, assignments, pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go(demoMode ? "/your-week" : "/dashboard")}>
            <Sparkles className="mr-2 h-4 w-4" /> See today's plan
          </CommandItem>
          {demoMode && (
            <CommandItem onSelect={() => go("/focus-sprint")}>
              <Timer className="mr-2 h-4 w-4" /> Begin a focus sprint
            </CommandItem>
          )}
          <CommandItem onSelect={() => go("/study-lab")}>
            <FlaskConical className="mr-2 h-4 w-4" /> Open Study Lab
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/dashboard")}><LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard</CommandItem>
          <CommandItem onSelect={() => go("/classes")}><BookOpen className="mr-2 h-4 w-4" /> All Classes</CommandItem>
          <CommandItem onSelect={() => go("/study-lab")}><FlaskConical className="mr-2 h-4 w-4" /> Study Lab</CommandItem>
          <CommandItem onSelect={() => go("/assignments")}><BookOpen className="mr-2 h-4 w-4" /> Assignments</CommandItem>
          <CommandItem onSelect={() => go("/exams")}><GraduationCap className="mr-2 h-4 w-4" /> Exams</CommandItem>
          {demoMode && (
            <>
              <CommandItem onSelect={() => go("/calendar")}><CalendarDays className="mr-2 h-4 w-4" /> Calendar</CommandItem>
              <CommandItem onSelect={() => go("/notes")}><Mic className="mr-2 h-4 w-4" /> Notes & Recordings</CommandItem>
              <CommandItem onSelect={() => go("/path-to-graduation")}><Map className="mr-2 h-4 w-4" /> Path to Graduation</CommandItem>
              <CommandItem onSelect={() => go("/scholarships")}><Award className="mr-2 h-4 w-4" /> Scholarships</CommandItem>
              <CommandItem onSelect={() => go("/course-intelligence")}><TrendingUp className="mr-2 h-4 w-4" /> Class Intelligence</CommandItem>
              <CommandItem onSelect={() => go("/exam-debrief")}><MessageSquare className="mr-2 h-4 w-4" /> Exam Debrief</CommandItem>
              <CommandItem onSelect={() => go("/progress")}><BarChart3 className="mr-2 h-4 w-4" /> Progress</CommandItem>
              <CommandItem onSelect={() => go("/settings")}><Settings className="mr-2 h-4 w-4" /> Settings</CommandItem>
            </>
          )}
        </CommandGroup>

        {demoMode && (
          <>
            <CommandSeparator />

            <CommandGroup heading="Classes">
              {classes.map((c) => (
                <CommandItem key={c.id} value={`class ${c.name} ${c.professor}`} onSelect={() => go(`/classes/${c.id}`)}>
                  <span className={`mr-2 h-2 w-2 rounded-full ${c.color}`} />
                  {c.name}
                  <span className="ml-auto text-xs text-muted-foreground">{c.readiness}%</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Assignments">
              {assignments.slice(0, 8).map((a) => (
                <CommandItem key={a.id} value={`assignment ${a.title} ${a.className}`} onSelect={() => go(`/assignments/${a.id}`)}>
                  <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                  {a.title}
                  <span className="ml-auto text-xs text-muted-foreground">{a.className}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Exams">
              {exams.map((e) => (
                <CommandItem key={e.id} value={`exam ${e.title} ${e.className}`} onSelect={() => go(`/exams/${e.id}`)}>
                  <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
                  {e.title}
                  <span className="ml-auto text-xs text-muted-foreground">{e.className}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Focus mode">
          <CommandItem onSelect={() => { setMode("calm"); onOpenChange(false); }}>
            <Sparkles className="mr-2 h-4 w-4" /> Switch to Calm mode
          </CommandItem>
          <CommandItem onSelect={() => { setMode("hyperfocus"); onOpenChange(false); }}>
            <Timer className="mr-2 h-4 w-4" /> Switch to Hyperfocus mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Hook — global ⌘K / Ctrl+K listener that toggles the palette.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
