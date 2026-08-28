import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CaptureButton } from "@/components/CaptureButton";
import { FocusModeProvider, useFocusMode } from "@/contexts/FocusModeContext";
import { CaptureProvider } from "@/contexts/CaptureContext";

import { FocusModeToggle } from "@/components/FocusModeToggle";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { CanvasAutoSync } from "@/components/CanvasAutoSync";

function HeaderSearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <button
        onClick={onOpen}
        className="hidden md:inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/40 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
        Search…
        <kbd className="ml-2 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70">⌘K</kbd>
      </button>
      <button
        onClick={onOpen}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground md:hidden"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>
    </>
  );
}


function LayoutShell({ children }: { children: React.ReactNode }) {
  const { mode } = useFocusMode();
  const { open, setOpen } = useCommandPalette();
  const { mode: dataMode } = useAuth();
  const dampen = mode === "hyperfocus"; // dim ambient orbs in hyperfocus

  // Keep the global shell neutral until auth resolves. Rendering the sidebar
  // or capture button here would briefly expose demo classes/actions to a
  // returning signed-in student.
  if (dataMode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground" aria-busy="true">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-9 w-9 rounded-xl bg-gradient-calm flex items-center justify-center text-primary-foreground font-bold">
            C
          </span>
          Loading Campus Companion…
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full max-w-full overflow-x-hidden relative">
        {/* Ambient aurora orbs — softer in hyperfocus mode */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className={`absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full blur-[120px] animate-float-slow transition-opacity duration-700 ${dampen ? "bg-primary/5 opacity-50" : "bg-primary/15"}`} />
          <div className={`absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full blur-[140px] animate-float-slow transition-opacity duration-700 ${dampen ? "bg-accent/5 opacity-50" : "bg-accent/15"}`} style={{ animationDelay: "2s" }} />
          <div className={`absolute -bottom-40 left-1/3 h-[420px] w-[420px] rounded-full blur-[140px] animate-float-slow transition-opacity duration-700 ${dampen ? "bg-primary/5 opacity-50" : "bg-primary/10"}`} style={{ animationDelay: "4s" }} />
        </div>

        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/50 px-3 glass md:h-14 md:gap-3 md:px-4">
            <SidebarTrigger className="-ml-1 h-11 w-11" />
            <span className="truncate text-xs font-medium tracking-wide text-muted-foreground sm:text-sm">Campus Companion</span>
            <div className="ml-auto flex items-center gap-2">
              <HeaderSearchButton onOpen={() => setOpen(true)} />
              <FocusModeToggle />
              
            </div>
          </header>
          <main className="flex-1 min-w-0 max-w-full p-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:p-6 lg:p-10 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
        <CaptureButton />
        <MobileBottomNav />
        <CommandPalette open={open} onOpenChange={setOpen} />
        <CanvasAutoSync />
      </div>
    </SidebarProvider>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, agreementStatus, mode, loading, recovering } = useAuth();
  // Keep the authenticated app shell, background sync, search, and capture
  // providers unmounted until the server-backed agreement receipt is current.
  // Rendering the route gate directly still allows it to redirect to the
  // public agreement page or show a bounded status check.
  if (user && agreementStatus !== "accepted") return <>{children}</>;
  // Once a closed signed-out session has settled, render the route guard
  // itself so it can redirect to login. Do not mount the sample-data shell,
  // sidebar, capture providers, or ambient app controls around that redirect.
  if (!user && mode === "loading" && !loading && !recovering) return <>{children}</>;
  // Only an identity change may clear owner-scoped drafts. Transient auth
  // loading/recovery states must not reconstruct providers or wipe forms.
  const ownerKey = user?.id ?? "anonymous";

  return (
    <FocusModeProvider key={ownerKey}>
      <CaptureProvider>
        <LayoutShell>{children}</LayoutShell>
      </CaptureProvider>
    </FocusModeProvider>
  );
}
