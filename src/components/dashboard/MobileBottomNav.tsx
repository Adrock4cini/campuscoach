import { BookOpen, CalendarDays, Camera, House, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCapture } from "@/contexts/CaptureContext";
import { cn } from "@/lib/utils";

const destinations: { label: string; to: string; Icon: LucideIcon }[] = [
  { label: "Today", to: "/dashboard", Icon: House },
  { label: "Calendar", to: "/calendar", Icon: CalendarDays },
  { label: "Study", to: "/study-lab", Icon: Sparkles },
  { label: "Classes", to: "/classes", Icon: BookOpen },
];

function isActive(pathname: string, to: string) {
  if (to === "/dashboard") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function Destination({ item, active }: { item: (typeof destinations)[number]; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <item.Icon className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { open } = useCapture();

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="pointer-events-auto mx-auto grid max-w-md grid-cols-5 items-center gap-1 rounded-[28px] border border-border/60 bg-card/90 p-2 shadow-elevated backdrop-blur-xl">
        <Destination item={destinations[0]} active={isActive(pathname, destinations[0].to)} />
        <Destination item={destinations[1]} active={isActive(pathname, destinations[1].to)} />
        <button
          type="button"
          onClick={() => open()}
          aria-label="Capture"
          className="mx-auto -mt-6 flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-full bg-gradient-calm text-[10px] font-semibold text-primary-foreground shadow-elevated ring-4 ring-background/80 transition-transform active:scale-95"
        >
          <Camera className="h-5 w-5" />
          <span>Capture</span>
        </button>
        <Destination item={destinations[2]} active={isActive(pathname, destinations[2].to)} />
        <Destination item={destinations[3]} active={isActive(pathname, destinations[3].to)} />
      </div>
    </nav>
  );
}
