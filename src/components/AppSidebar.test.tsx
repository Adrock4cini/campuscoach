import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./AppSidebar";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
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
    useSidebar: () => ({ state: "expanded" }),
  };
});

describe("signed-in product navigation", () => {
  it("keeps the complete product map visible and marks guarded pages as previews", () => {
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /Path to Graduation Preview/i })).toHaveAttribute(
      "href",
      "/path-to-graduation",
    );
    expect(screen.getByRole("link", { name: /Your Week Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: /Notes & Recordings Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scholarships Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Class Intelligence Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Exam Debrief Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Progress Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "College Algebra" })).toHaveAttribute(
      "href",
      "/classes/math-1",
    );
  });
});
