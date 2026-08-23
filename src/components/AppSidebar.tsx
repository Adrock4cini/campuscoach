import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  FlaskConical,
  BarChart3,
  Settings,
  GraduationCap,
  Mic,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Award,
  Map,
  User,
  LogOut,
  LogIn,
  Link2,
  ScanFace,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { sidebarClassLabel } from "@/lib/app/sidebarClassLabel";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import {
  canUsePasskeys,
  humanizePasskeyError,
  registerPasskey,
} from "@/lib/auth/passkeys";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { classes as demoClasses } from "@/data/demo";

interface SidebarItemDefinition {
  title: string;
  url: string;
  icon: LucideIcon;
  dotColor?: string;
}

interface SidebarGroupDefinition {
  label: string;
  items: SidebarItemDefinition[];
}

// These destinations remain discoverable, but signed-in students get a static
// coming-soon boundary until each page is backed by their real data.
const COMING_SOON_FOR_REAL = new Set<string>([
  "/your-week",
  "/path-to-graduation",
  "/scholarships",
  "/course-intelligence",
  "/exam-debrief",
  "/progress",
  "/settings",
]);

function buildGroups(
  classList: { id: string; name: string; color: string; courseCode?: string | null }[],
): SidebarGroupDefinition[] {
  const classItems = [
    { title: "All Classes", url: "/classes", icon: BookOpen },
    ...classList.map((c) => ({
      title: sidebarClassLabel(c),
      url: `/classes/${c.id}`,
      icon: BookOpen,
      dotColor: c.color,
    })),
  ];

  return [
    {
      label: "Today",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Your Week", url: "/your-week", icon: Sparkles },
      ],
    },
    {
      label: "Classes",
      items: classItems,
    },
    {
      label: "Tools",
      items: [
        { title: "Calendar", url: "/calendar", icon: CalendarDays },
        { title: "Notes & Recordings", url: "/notes", icon: Mic },
        { title: "Study Lab", url: "/study-lab", icon: FlaskConical },
        { title: "Assignments", url: "/assignments", icon: BookOpen },
        { title: "Exams", url: "/exams", icon: GraduationCap },
      ],
    },
    {
      label: "Journey",
      items: [
        { title: "Path to Graduation", url: "/path-to-graduation", icon: Map },
        { title: "Scholarships", url: "/scholarships", icon: Award },
      ],
    },
    {
      label: "Community",
      items: [
        { title: "Class Intelligence", url: "/course-intelligence", icon: TrendingUp },
        { title: "Exam Debrief", url: "/exam-debrief", icon: MessageSquare },
        { title: "Progress", url: "/progress", icon: BarChart3 },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "Canvas", url: "/integrations/canvas", icon: Link2 },
        { title: "Settings", url: "/settings", icon: Settings },
        { title: "Profile", url: "/settings", icon: User },
      ],
    },
  ];
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, isDemoMode, signOut, mode } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const { classes: myClasses } = useMyClasses();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Single source of truth: mode drives which class list we show.
  // "real" → user's Supabase classes only (empty if none yet).
  // "demo" → demo tour classes. Loading stays neutral in AppLayout.
  const realMode = mode === "real";
  const classList = realMode ? myClasses : mode === "demo" ? demoClasses : [];
  const groups = buildGroups(classList)
    .map((group) => ({
      ...group,
      items: realMode
        ? group.items.filter((item) => !COMING_SOON_FOR_REAL.has(item.url))
        : group.items,
    }))
    .filter((group) => group.items.length > 0);
  const canSavePasskey = !!user && realMode && canUsePasskeys();

  // The mobile sheet stays mounted while routes change. Close it after every
  // navigation so the destination is immediately visible and reachable.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, location.pathname, location.search, setOpenMobile]);

  async function onSavePasskey() {
    setPasskeyBusy(true);
    try {
      const { error } = await registerPasskey();
      if (error) {
        toast.error("Couldn't set up faster sign-in", { description: humanizePasskeyError(error) });
        return;
      }
      toast.success("Faster sign-in is ready", {
        description: "Next time, use Face ID, Touch ID, or your device passkey.",
      });
    } catch (error) {
      toast.error("Couldn't set up faster sign-in", { description: humanizePasskeyError(error) });
    } finally {
      setPasskeyBusy(false);
    }
  }




  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="pt-4">

        <div className={`flex items-start px-4 pb-4 ${collapsed ? "px-2" : ""}`}>
          {collapsed ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 rounded-lg bg-gradient-calm flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">C</span>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-calm flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-bold text-base">C</span>
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground leading-tight">Campus</h2>
                <p className="text-xs text-muted-foreground leading-tight">Companion</p>
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label="Close navigation"
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:hidden"
            onClick={() => setOpenMobile(false)}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 px-3">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title + item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className="hover:bg-sidebar-accent/60 transition-all rounded-lg group"
                        activeClassName="bg-gradient-to-r from-primary/15 to-accent/10 text-primary font-medium border border-primary/20 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                      >
                        {item.dotColor ? (
                          <span className={`mr-2 h-2.5 w-2.5 rounded-full flex-shrink-0 ${item.dotColor}`} />
                        ) : (
                          <item.icon className="mr-2 h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110" />
                        )}
                        {!collapsed && (
                          <span className="tracking-tight truncate flex-1 flex items-center gap-1.5">
                            <span className="truncate">{item.title}</span>
                            {realMode && COMING_SOON_FOR_REAL.has(item.url) && (
                              <span className="ml-auto text-[9px] uppercase tracking-wider font-medium text-muted-foreground/70 border border-border rounded px-1 py-0.5">
                                Coming soon
                              </span>
                            )}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <div className="mt-auto p-2 border-t border-border/60 space-y-1">
          {canSavePasskey && (
            <button
              type="button"
              disabled={passkeyBusy}
              onClick={() => void onSavePasskey()}
              className="w-full flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors disabled:opacity-50"
            >
              <ScanFace className="h-4 w-4 flex-shrink-0" />
              {!collapsed && (
                <span className="truncate">{passkeyBusy ? "Setting up\u2026" : "Faster sign-in"}</span>
              )}
            </button>
          )}
          {user ? (
            <button
              onClick={async () => {
                await signOut();
                nav("/login", { replace: true });
              }}
              className="w-full flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">Sign out</span>}
            </button>
          ) : isDemoMode ? (
            <button
              onClick={() => nav("/login")}
              className="w-full flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm text-primary hover:bg-sidebar-accent/60 transition-colors"
            >
              <LogIn className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">Sign in \u00b7 demo mode</span>}
            </button>
          ) : null}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
