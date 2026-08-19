import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./AppSidebar";

const router = vi.hoisted(() => ({
  pathname: "/dashboard",
  search: "",
}));
const sidebar = vi.hoisted(() => ({
  isMobile: false,
  setOpenMobile: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: router.pathname, search: router.search }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "student-1" },
    isDemoMode: false,
    mode: "real",
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "math-1", name: "College Algebra", color: "bg-cyan-500" }],
  }),
}));

vi.mock("@/components/NavLink", () => ({
  NavLink: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/components/ui/sidebar", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;

  return {
    Sidebar: Wrapper,
    SidebarContent: Wrapper,
    SidebarGroup: Wrapper,
    SidebarGroupContent: Wrapper,
    SidebarGroupLabel: Wrapper,
    SidebarMenu: Wrapper,
    SidebarMenuButton: Wrapper,
    SidebarMenuItem: Wrapper,
    useSidebar: () => ({
      state: "expanded",
      isMobile: sidebar.isMobile,
      setOpenMobile: sidebar.setOpenMobile,
    }),
  };
});

describe("signed-in product navigation", () => {
  beforeEach(() => {
    router.pathname = "/dashboard";
    router.search = "";
    sidebar.isMobile = false;
    sidebar.setOpenMobile.mockReset();
  });

  it("keeps working destinations visible and hides unfinished product promises", () => {
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: "Notes & Recordings" })).toHaveAttribute("href", "/notes");
    expect(screen.queryByRole("link", { name: /Path to Graduation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Your Week/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Scholarships/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Class Intelligence/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Exam Debrief/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Canvas" })).toHaveAttribute(
      "href",
      "/integrations/canvas",
    );
    expect(screen.getByRole("link", { name: "College Algebra" })).toHaveAttribute(
      "href",
      "/classes/math-1",
    );
    expect(screen.queryByRole("button", { name: /faster sign-in/i })).not.toBeInTheDocument();
  }, 10_000);

  it("provides a 44px mobile close control and closes after navigation", () => {
    sidebar.isMobile = true;
    const { rerender } = render(<AppSidebar />);

    const close = screen.getByRole("button", { name: "Close navigation" });
    expect(close).toHaveClass("h-11", "w-11");
    fireEvent.click(close);
    expect(sidebar.setOpenMobile).toHaveBeenCalledWith(false);

    sidebar.setOpenMobile.mockClear();
    router.pathname = "/classes";
    rerender(<AppSidebar />);
    expect(sidebar.setOpenMobile).toHaveBeenCalledWith(false);
  });
});
