/**
 * Lightweight help sheet for a real assignment:
 * photograph it, admit "I don't get this", or mark complete.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, HelpCircle, CheckCircle2, FlaskConical } from "lucide-react";
import type { RealAssignment } from "@/lib/realData/assignments";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: RealAssignment | null;
  onPhotograph: (assignment: RealAssignment) => void;
  onDontGetIt: (assignment: RealAssignment) => void;
  onPractice: (assignment: RealAssignment) => void;
  onToggleComplete: (assignment: RealAssignment) => void;
};

export function AssignmentHelpDialog({
  open,
  onOpenChange,
  assignment,
  onPhotograph,
  onDontGetIt,
  onPractice,
  onToggleComplete,
}: Props) {
  if (!assignment) return null;
  const isComplete = assignment.status === "complete";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-left pr-6">{assignment.title}</DialogTitle>
          <DialogDescription className="text-left">
            Practice the problems, get unstuck on the topic, or check it off when you’re done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          <Button
            variant="outline"
            className="w-full justify-start h-12"
            onClick={() => {
              onPhotograph(assignment);
              onOpenChange(false);
            }}
          >
            <Camera className="h-4 w-4 mr-2 text-primary" />
            Photograph the assignment
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-12"
            onClick={() => {
              onDontGetIt(assignment);
              onOpenChange(false);
            }}
          >
            <HelpCircle className="h-4 w-4 mr-2 text-primary" />
            I don’t get this topic
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-12"
            onClick={() => {
              onPractice(assignment);
              onOpenChange(false);
            }}
          >
            <FlaskConical className="h-4 w-4 mr-2 text-primary" />
            Practice in Study Lab
          </Button>
          <Button
            className="w-full justify-start h-12 bg-gradient-calm border-0 text-primary-foreground"
            onClick={() => {
              onToggleComplete(assignment);
              onOpenChange(false);
            }}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {isComplete ? "Mark as not done" : "Mark assignment complete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
