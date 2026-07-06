import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import type { CaptureKind } from "@/lib/capture/types";

interface CaptureContextValue {
  open: (kind?: CaptureKind) => void;
  close: () => void;
}

const Ctx = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [initial, setInitial] = useState<CaptureKind | undefined>(undefined);

  const open = useCallback((kind?: CaptureKind) => {
    setInitial(kind);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <CaptureFlow open={isOpen} initialKind={initial} onClose={close} />
    </Ctx.Provider>
  );
}

export function useCapture() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapture must be used inside <CaptureProvider>");
  return v;
}
