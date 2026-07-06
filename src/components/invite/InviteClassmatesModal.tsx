/**
 * Invite Classmates modal.
 *
 * Class-specific invite surface. Explains the network effect,
 * shows a share link, copy button, SMS/share text, and a QR
 * placeholder. Every action funnels through `trackInviteEvent`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  MessageSquare,
  Share2,
  QrCode,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAggregateInsightsForClass } from "@/lib/intelligence/aggregateSignals";
import {
  buildInviteLink,
  buildInviteMessage,
  describeInviteConfidence,
  trackInviteEvent,
} from "@/lib/invite/inviteTracking";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
}

const tierStyles = {
  starting: "border-muted-foreground/30 text-muted-foreground",
  growing: "border-primary/40 text-primary",
  strong: "border-success/50 text-success",
} as const;

export function InviteClassmatesModal({
  open,
  onOpenChange,
  classId,
  className,
}: Props) {
  const { toast } = useToast();
  const { insights } = useAggregateInsightsForClass(classId);

  const link = useMemo(() => buildInviteLink(classId), [classId]);
  const message = useMemo(() => buildInviteMessage(className), [className]);
  const [customMessage, setCustomMessage] = useState(message);

  useEffect(() => setCustomMessage(message), [message]);

  const studentCount = insights.reduce(
    (max, i) => Math.max(max, i.studentCount),
    1
  );
  const confidence = describeInviteConfidence(studentCount);

  // Fire invite_created the first time the modal opens for this class.
  useEffect(() => {
    if (open) {
      trackInviteEvent("invite_created", { classId, className });
    }
  }, [open, classId, className]);

  const copy = async (value: string, channel: "copy" | "sms" | "share") => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: "Invite ready to paste." });
      trackInviteEvent("invite_copied", { classId, className, channel });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text and copy manually.",
        variant: "destructive",
      });
    }
  };

  const nativeShare = async () => {
    const body = `${customMessage}\n\n${link}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & {
          share: (data: ShareData) => Promise<void>;
        }).share({
          title: `Campus Coach — ${className}`,
          text: customMessage,
          url: link,
        });
        trackInviteEvent("invite_shared", {
          classId,
          className,
          channel: "share",
        });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await copy(body, "share");
  };

  const smsShare = () => {
    const body = encodeURIComponent(`${customMessage}\n\n${link}`);
    const href = `sms:?&body=${body}`;
    trackInviteEvent("invite_shared", { classId, className, channel: "sms" });
    if (typeof window !== "undefined") window.location.href = href;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Invite classmates to {className}
          </DialogTitle>
          <DialogDescription>
            More classmates = smarter study insights.
          </DialogDescription>
        </DialogHeader>

        {/* Confidence tier */}
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {confidence.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {studentCount === 1
                ? "You're the first signal here."
                : `${studentCount} classmates contributing signals.`}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px]", tierStyles[confidence.tier])}
          >
            {confidence.tier === "strong"
              ? "10+"
              : confidence.tier === "growing"
                ? "3–9"
                : "1–2"}
          </Badge>
        </div>

        {/* Share link */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Share link
          </label>
          <div className="flex gap-2">
            <Input value={link} readOnly className="text-xs font-mono" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(link, "copy")}
              className="shrink-0"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
          </div>
        </div>

        {/* Invite message */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Message
          </label>
          <Textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={3}
            className="text-sm resize-none"
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={smsShare}>
            <MessageSquare className="h-4 w-4 mr-1.5" /> SMS
          </Button>
          <Button variant="outline" size="sm" onClick={nativeShare}>
            <Share2 className="h-4 w-4 mr-1.5" /> Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              copy(`${customMessage}\n\n${link}`, "copy")
            }
          >
            <Copy className="h-4 w-4 mr-1.5" /> Text
          </Button>
        </div>

        {/* QR placeholder */}
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 p-4 flex items-center gap-3">
          <div className="h-16 w-16 rounded-lg border border-border/50 bg-background/60 flex items-center justify-center">
            <QrCode className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">
              QR code (coming soon)
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Classmates will be able to scan and join this class brain from
              anywhere.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-success" />
          Notes, scans, and recordings stay private. Only anonymous class
          signals are shared.
        </p>
      </DialogContent>
    </Dialog>
  );
}
