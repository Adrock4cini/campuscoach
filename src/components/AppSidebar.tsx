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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
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

const COMING_SOON_FOR_REAL = new Set<string>([
  "/your-week",
  "/calendar",
  "/notes",
  "/path-to-graduation",
  "/scholarships",
  "/course-intelligence",
  "/progress",
]);

function buildGroups(classList: { id: string; name: string; color: string }[]) {
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
      items: [
        { title: "All Classes", url: "/classes", icon: BookOpen },
        ...classList.map((c) => ({
          title: c.name.split(" ").slice(0, 2).join(" "),
          url: `/classes/${c.id}`,
          icon: BookOpen,
          dotColor: c.color,
        })),
      ],
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
        { title: "Settings", url: "/settings", icon: Settings },
        { title: "Profile", url: "/settings", icon: User },
      ],
    },
  ];
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, isDemoMode, signOut, mode } = useAuth();
  const nav = useNavigate();
  const { classes: myClasses } = useMyClasses();
  // Single source of truth: mode drives which class list we show.
  // "real" → user's Supabase classes only (empty if none yet).
  // "demo" or "loading" → demo tour classes.
  const realMode = mode === "real";
  const classList = realMode ? myClasses : demoClasses;
  const groups = buildGroups(classList);




  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="pt-4">

        <div className={`px-4 pb-4 ${collapsed ? "px-2" : ""}`}>
          {collapsed ? (
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 rounded-lg bg-gradient-calm flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">C</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-gradient-calm flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-bold text-base">C</span>
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground leading-tight">Campus</h2>
                <p className="text-xs text-muted-foreground leading-tight">Companion</p>
              </div>
            </div>
          )}
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
                                Soon
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
        <div className="mt-auto p-2 border-t border-border/60">
          {user ? (
            <button
              onClick={async () => {
                await signOut();
                nav("/login", { replace: true });
              }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">Sign out</span>}
            </button>
          ) : isDemoMode ? (
            <button
              onClick={() => nav("/login")}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-primary hover:bg-sidebar-accent/60 transition-colors"
            >
              <LogIn className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">Sign in · demo mode</span>}
            </button>
          ) : null}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
