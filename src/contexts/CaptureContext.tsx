import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import type { CaptureKind } from "@/lib/capture/types";

/** Extra context an entry point already knows, so the student re-types nothing. */
export interface CaptureOpenOptions {
  classId?: string;
  /** Attach the capture to a real assignment (Assignment → "Get help"). */
  assignmentId?: string;
  /** Attach the capture to a real test (Test → "Add material"). */
  examId?: string;
  topic?: string;
}

interface CaptureContextValue {
  open: (kind?: CaptureKind, classIdOrOptions?: string | CaptureOpenOptions) => void;
  close: () => void;
}

const Ctx = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [initial, setInitial] = useState<CaptureKind | undefined>(undefined);
  const [options, setOptions] = useState<CaptureOpenOptions>({});

  const open = useCallback((kind?: CaptureKind, classIdOrOptions?: string | CaptureOpenOptions) => {
    setInitial(kind);
    setOptions(
      typeof classIdOrOptions === "string"
        ? { classId: classIdOrOptions }
        : classIdOrOptions ?? {},
    );
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <CaptureFlow
        open={isOpen}
        initialKind={initial}
        initialClassId={options.classId}
        initialAssignmentId={options.assignmentId}
        initialExamId={options.examId}
        initialTopic={options.topic}
        onClose={close}
      />
    </Ctx.Provider>
  );
}

export function useCapture() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapture must be used inside <CaptureProvider>");
  return v;
}
