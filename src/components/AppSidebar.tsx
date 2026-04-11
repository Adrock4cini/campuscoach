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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Classes", url: "/classes", icon: BookOpen },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Study Lab", url: "/study-lab", icon: FlaskConical },
  { title: "Assignments", url: "/assignments", icon: ClipboardList },
  { title: "Exams", url: "/exams", icon: GraduationCap },
  { title: "Notes & Recordings", url: "/notes", icon: Mic },
  { title: "Exam Debrief", url: "/exam-debrief", icon: MessageSquare },
  { title: "Course Intel", url: "/course-intelligence", icon: TrendingUp },
  { title: "Progress", url: "/progress", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
