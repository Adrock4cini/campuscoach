import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { BookOpen, ClipboardList, GraduationCap, FileText, FileUp, Mic, Calendar, MessageSquare } from "lucide-react";
import { useCapture } from "@/contexts/CaptureContext";
import type { CaptureKind } from "@/lib/capture/types";

interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actions: Array<{
  label: string;
  icon: typeof BookOpen;
  desc: string;
  route?: string;
  captureKind?: CaptureKind;
}> = [
  { label: "Add Class", icon: BookOpen, desc: "Set up a new class", route: "/onboarding" },
  { label: "Add Assignment", icon: ClipboardList, desc: "Track a new assignment", route: "/assignments" },
  { label: "Add Exam", icon: GraduationCap, desc: "Add an upcoming exam", route: "/exams" },
  { label: "Open Calendar", icon: Calendar, desc: "See tests and assignments", route: "/calendar" },
  { label: "Add Note", icon: FileText, desc: "Create a class note", captureKind: "quick-note" },
  { label: "Upload Syllabus", icon: FileUp, desc: "Upload & analyze a syllabus", route: "/onboarding?import=syllabus" },
  { label: "Professor Hint", icon: MessageSquare, desc: "Save what the professor emphasized", captureKind: "professor-hint" },
];

export function QuickAddModal({ open, onOpenChange }: QuickAddModalProps) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Quick Add</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {actions.map(action => (
            <button
              key={action.label}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              onClick={() => {
                onOpenChange(false);
                if (action.captureKind) openCapture(action.captureKind);
                else if (action.route) navigate(action.route);
              }}
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <action.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.desc}</p>
              </div>
            </button>
          ))}
          <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 text-left" aria-disabled="true">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Mic className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Record Lecture</p>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Coming next</span>
              </div>
              <p className="text-xs text-muted-foreground">Not tappable until recordings save reliably</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
