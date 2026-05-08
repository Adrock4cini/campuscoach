import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CaptureButton } from "@/components/CaptureButton";
import { OnboardingDialog } from "@/components/OnboardingDialog";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full relative">
        {/* Ambient aurora orbs — fixed, behind content */}
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className="absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-primary/15 blur-[120px] animate-float-slow" />
          <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-accent/15 blur-[140px] animate-float-slow" style={{ animationDelay: "2s" }} />
          <div className="absolute -bottom-40 left-1/3 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[140px] animate-float-slow" style={{ animationDelay: "4s" }} />
        </div>

        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <header className="h-14 flex items-center border-b border-border/50 px-4 glass sticky top-0 z-30">
            <SidebarTrigger className="mr-3" />
            <span className="text-sm text-muted-foreground font-medium tracking-wide">Campus Companion</span>
            <span className="ml-auto text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 hidden sm:inline">AI Academic OS</span>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-10 overflow-auto">
            {children}
          </main>
        </div>
        <CaptureButton />
        <OnboardingDialog />
      </div>
    </SidebarProvider>
  );
}
