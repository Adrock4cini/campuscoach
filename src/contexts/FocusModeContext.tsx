import { createContext, useContext, useEffect, useState, ReactNode } from "react";

/**
 * FocusMode
 *  - "calm"       → default ADHD-friendly mode: aurora glows, generous whitespace
 *  - "hyperfocus" → distraction-reducing mode: ambient orbs/animations dampened,
 *                   accents desaturated, motion minimized via .hyperfocus root class
 */
export type FocusMode = "calm" | "hyperfocus";

interface FocusModeContextValue {
  mode: FocusMode;
  setMode: (m: FocusMode) => void;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | undefined>(undefined);

const STORAGE_KEY = "cc.focus-mode";

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<FocusMode>(() => {
    if (typeof window === "undefined") return "calm";
    return (localStorage.getItem(STORAGE_KEY) as FocusMode) || "calm";
  });

  // Reflect mode on <html> for CSS hooks
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("hyperfocus", mode === "hyperfocus");
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = (m: FocusMode) => setModeState(m);
  const toggle = () => setModeState((m) => (m === "calm" ? "hyperfocus" : "calm"));

  return (
    <FocusModeContext.Provider value={{ mode, setMode, toggle }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  const ctx = useContext(FocusModeContext);
  if (!ctx) throw new Error("useFocusMode must be used within FocusModeProvider");
  return ctx;
}
