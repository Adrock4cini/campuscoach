/**
 * Small "Invite classmates" trigger that opens InviteClassmatesModal.
 *
 * Variants:
 * - strip (default): inline card with value prop + Invite
 * - inline: bare button for tight surfaces
 * - postStudy: one soft prompt after a saved study session
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, Sparkles, X } from "lucide-react";
import { InviteClassmatesModal } from "./InviteClassmatesModal";
import {
  markPostStudyInviteSeen,
  trackInviteEvent,
} from "@/lib/invite/inviteTracking";
import { cn } from "@/lib/utils";

interface Props {
  classId: string;
  className: string;
  variant?: "strip" | "inline" | "postStudy";
  wrapperClassName?: string;
  onDismiss?: () => void;
}

export function InviteClassmatesButton({
  classId,
  className,
  variant = "strip",
  wrapperClassName,
  onDismiss,
}: Props) {
  const [open, setOpen] = useState(false);

  const openModal = () => setOpen(true);

  if (variant === "inline") {
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5",
            wrapperClassName
          )}
          onClick={openModal}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite classmates
        </Button>
        <InviteClassmatesModal
          open={open}
          onOpenChange={setOpen}
          classId={classId}
          className={className}
        />
      </>
    );
  }

  if (variant === "postStudy") {
    return (
      <>
        <div
          className={cn(
            "rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 space-y-2",
            wrapperClassName
          )}
        >
          <div className="flex items-start gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Study gets sharper with classmates
              </p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                Invite people in this class. Anonymous signals help everyone
                focus on what the professor actually tests — notes stay private.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss invite prompt"
              className="text-muted-foreground hover:text-foreground p-1 -mr-1"
              onClick={() => {
                markPostStudyInviteSeen(classId);
                trackInviteEvent("invite_prompt_shown", {
                  classId,
                  className,
                  channel: "post_study",
                });
                onDismiss?.();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              markPostStudyInviteSeen(classId);
              trackInviteEvent("invite_prompt_shown", {
                classId,
                className,
                channel: "post_study",
              });
              openModal();
            }}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Invite classmates
          </Button>
        </div>
        <InviteClassmatesModal
          open={open}
          onOpenChange={setOpen}
          classId={classId}
          className={className}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 flex items-center gap-3",
          wrapperClassName
        )}
      >
        <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <p className="text-xs text-foreground/90 flex-1 min-w-0">
          Works alone. Better with classmates — class brain spots what this course emphasizes.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={openModal}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Invite
        </Button>
      </div>
      <InviteClassmatesModal
        open={open}
        onOpenChange={setOpen}
        classId={classId}
        className={className}
      />
    </>
  );
}
