import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  consumePasskeyOfferPending,
  dismissPasskeyOffer,
  humanizePasskeyError,
  isPasskeySupported,
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
    if (!user || isDemoMode || !isPasskeySupported() || !shouldOfferPasskeySetup()) {
      setOpen(false);
      return;
    }
    // Show after password/OAuth sign-in when we flagged the offer.
    if (consumePasskeyOfferPending()) {
      setOpen(true);
    }
  }, [user, isDemoMode]);

  if (!open || !user || isDemoMode) return null;

  async function onSave() {
    setBusy(true);
    const { error } = await registerPasskey("This device");
    setBusy(false);
    if (error) {
      toast.error("Couldn't save Face ID", { description: humanizePasskeyError(error) });
      return;
    }
    dismissPasskeyOffer();
    setOpen(false);
    toast.success("Face ID saved", {
      description: "Next time, open Campus Companion and tap Continue with Face ID.",
    });
  }

  function onDismiss() {
    dismissPasskeyOffer();
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
            <p className="text-sm font-medium text-foreground">Sign in faster with Face ID</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Save a passkey on this phone. Next visit: Face ID instead of your password.
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
            {busy ? "Saving\u2026" : "Save Face ID"}
          </Button>
        </div>
      </div>
    </div>
  );
}
