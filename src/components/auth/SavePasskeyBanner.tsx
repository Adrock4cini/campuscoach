import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  canUsePasskeys,
  consumePasskeyOfferPending,
  dismissPasskeyOffer,
  humanizePasskeyError,
  registerPasskey,
  shouldOfferPasskeySetup,
} from "@/lib/auth/passkeys";

/**
 * Soft prompt after a normal sign-in: save Face ID / passkey for next time.
 * Only shows for real signed-in users on supported devices.
 */
export function SavePasskeyBanner() {
  const { user, isDemoMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || isDemoMode || !canUsePasskeys() || !shouldOfferPasskeySetup(user.id)) {
      setOpen(false);
      return;
    }
    // Show after password/OAuth sign-in when we flagged the offer.
    if (consumePasskeyOfferPending(user.id)) {
      setOpen(true);
    }
  }, [user, isDemoMode]);

  if (!open || !user || isDemoMode) return null;

  async function onSave() {
    setBusy(true);
    try {
      const { error } = await registerPasskey();
      if (error) {
        toast.error("Couldn't set up faster sign-in", { description: humanizePasskeyError(error) });
        return;
      }
      dismissPasskeyOffer(user.id);
      setOpen(false);
      toast.success("Faster sign-in is ready", {
        description: "Next time, use Face ID, Touch ID, or your device passkey.",
      });
    } catch (error) {
      toast.error("Couldn't set up faster sign-in", { description: humanizePasskeyError(error) });
    } finally {
      setBusy(false);
    }
  }

  function onDismiss() {
    dismissPasskeyOffer(user.id);
    setOpen(false);
  }

  return (
    <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Set up faster sign-in</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use Face ID, Touch ID, or a device passkey. Your biometric information stays on your device.
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
            Not now
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-gradient-calm border-0 text-primary-foreground"
            onClick={() => void onSave()}
            disabled={busy}
          >
            {busy ? "Setting up\u2026" : "Set up"}
          </Button>
        </div>
      </div>
    </div>
  );
}
