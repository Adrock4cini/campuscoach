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
import type { LucideIcon } from "lucide-react";
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

function buildGroups(
  classList: { id: string; name: string; color: string }[],
  realMode: boolean,
): SidebarGroupDefinition[] {
  const classItems = [
    { title: "All Classes", url: "/classes", icon: BookOpen },
    ...classList.map((c) => ({
      title: c.name.split(" ").slice(0, 2).join(" "),
      url: `/classes/${c.id}`,
      icon: BookOpen,
      dotColor: c.color,
    })),
  ];

  // Signed-in students only see destinations that are backed by their real
  // data. Demo mode remains the place to preview the longer-term product.
  if (realMode) {
    return [
      {
        label: "Today",
        items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }],
      },
      {
        label: "Classes",
        items: classItems,
      },
      {
        label: "Study",
        items: [
          { title: "Study Lab", url: "/study-lab", icon: FlaskConical },
          { title: "Assignments", url: "/assignments", icon: BookOpen },
          { title: "Exams", url: "/exams", icon: GraduationCap },
        ],
      },
    ];
  }

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
  const groups = buildGroups(classList, realMode);




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
                          <span className="tracking-tight truncate flex-1">{item.title}</span>
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
