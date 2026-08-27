import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isCanvasConnectEnabled } from "@/lib/canvas/feature";

/** Keeps the unfinished institutional integration unreachable in safe builds. */
export function CanvasConnectGate({ children }: { children: ReactNode }) {
  if (!isCanvasConnectEnabled()) return <Navigate to="/classes" replace />;
  return <>{children}</>;
}
