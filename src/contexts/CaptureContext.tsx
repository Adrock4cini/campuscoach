import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import type { CaptureKind } from "@/lib/capture/types";
import { useAuth } from "@/contexts/AuthContext";

const PdfStudyImportDialog = lazy(() => import("@/components/capture/PdfStudyImportDialog"));

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
  const { user, isDemoMode } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const [pdfOwner, setPdfOwner] = useState<string | null>(null);
  const [initial, setInitial] = useState<CaptureKind | undefined>(undefined);
  const [options, setOptions] = useState<CaptureOpenOptions>({});

  const open = useCallback((kind?: CaptureKind, classIdOrOptions?: string | CaptureOpenOptions) => {
    setInitial(kind);
    setOptions(
      typeof classIdOrOptions === "string"
        ? { classId: classIdOrOptions }
        : classIdOrOptions ?? {},
    );
    if (kind === "upload-file" && user && !isDemoMode) {
      setOpen(false); setPdfOwner(user.id);
    } else { setPdfOwner(null); setOpen(true); }
  }, [user, isDemoMode]);
  const close = useCallback(() => { setOpen(false); setPdfOwner(null); }, []);

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
        onUploadDocument={context => {
          if (!user || isDemoMode) return;
          setOptions(context); setOpen(false); setPdfOwner(user.id);
        }}
      />
      {pdfOwner && pdfOwner === user?.id && !isDemoMode && <Suspense fallback={<p role="status">Opening PDF import…</p>}>
        <PdfStudyImportDialog key={pdfOwner} ownerId={pdfOwner} initial={options} onClose={close} />
      </Suspense>}
    </Ctx.Provider>
  );
}

export function useCapture() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapture must be used inside <CaptureProvider>");
  return v;
}
