import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  FlaskConical,
  FileText,
  BarChart3,
  Settings,
  GraduationCap,
  ClipboardList,
  Mic,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Award,
  Map,
} from "lucide-react";
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

const groups = [
  {
    label: "Today",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Your Week", url: "/your-week", icon: Sparkles },
      { title: "Calendar", url: "/calendar", icon: CalendarDays },
      { title: "Assignments", url: "/assignments", icon: ClipboardList },
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
    label: "Library",
    items: [
      { title: "My Classes", url: "/classes", icon: BookOpen },
      { title: "Notes & Recordings", url: "/notes", icon: Mic },
      { title: "Study Lab", url: "/study-lab", icon: FlaskConical },
    ],
  },
  {
    label: "Class Intelligence",
    items: [
      { title: "Class Intel", url: "/course-intelligence", icon: TrendingUp },
      { title: "Exam Debrief", url: "/exam-debrief", icon: MessageSquare },
      { title: "Progress", url: "/progress", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Settings", url: "/settings", icon: Settings }],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className="hover:bg-sidebar-accent/60 transition-all rounded-lg group"
                        activeClassName="bg-gradient-to-r from-primary/15 to-accent/10 text-primary font-medium border border-primary/20 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                      >
                        <item.icon className="mr-2 h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110" />
                        {!collapsed && <span className="tracking-tight">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
