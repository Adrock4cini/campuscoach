/**
 * Small "Invite classmates" trigger that opens InviteClassmatesModal.
 *
 * Renders a compact strip:
 *   [icon] More classmates = smarter study insights.  [Invite]
 *
 * Two visual sizes: `strip` (default, inline card) and `inline`
 * (bare button for tight surfaces like the Campus Brain insight card).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, Sparkles } from "lucide-react";
import { InviteClassmatesModal } from "./InviteClassmatesModal";
import { cn } from "@/lib/utils";

interface Props {
  classId: string;
  className: string;
  variant?: "strip" | "inline";
  wrapperClassName?: string;
}

export function InviteClassmatesButton({
  classId,
  className,
  variant = "strip",
  wrapperClassName,
}: Props) {
  const [open, setOpen] = useState(false);

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
          onClick={() => setOpen(true)}
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
          More classmates = smarter study insights.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => setOpen(true)}
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
