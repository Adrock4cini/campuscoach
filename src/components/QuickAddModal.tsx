import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { BookOpen, ClipboardList, GraduationCap, FileText, FileUp, Mic } from "lucide-react";

interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actions = [
  { label: "Add Class", icon: BookOpen, desc: "Set up a new class", route: "/classes" },
  { label: "Add Assignment", icon: ClipboardList, desc: "Track a new assignment", route: "/assignments" },
  { label: "Add Exam", icon: GraduationCap, desc: "Add an upcoming exam", route: "/exams" },
  { label: "Add Note", icon: FileText, desc: "Create a note manually", route: "/notes" },
  { label: "Upload Syllabus", icon: FileUp, desc: "Upload & analyze a syllabus", route: "/classes" },
  { label: "Record Lecture", icon: Mic, desc: "Start a class recording", route: "/notes" },
];

export function QuickAddModal({ open, onOpenChange }: QuickAddModalProps) {
  const navigate = useNavigate();

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
                navigate(action.route);
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
