import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "loading" }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarTrigger: () => <button>Menu</button>,
}));

vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => <div>Demo sidebar</div> }));
vi.mock("@/components/CaptureButton", () => ({ CaptureButton: () => <button>Capture</button> }));
vi.mock("@/components/OnboardingDialog", () => ({ OnboardingDialog: () => null }));
vi.mock("@/components/FocusModeToggle", () => ({ FocusModeToggle: () => null }));
vi.mock("@/components/CommandPalette", () => ({
  CommandPalette: () => null,
  useCommandPalette: () => ({ open: false, setOpen: vi.fn() }),
}));
vi.mock("@/contexts/FocusModeContext", () => ({
  FocusModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFocusMode: () => ({ mode: "balanced" }),
}));
vi.mock("@/contexts/CaptureContext", () => ({
  CaptureProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("AppLayout auth boundary", () => {
  it("keeps all demo navigation and capture actions hidden while auth resolves", () => {
    render(<AppLayout><div>Real route content</div></AppLayout>);

    expect(screen.getByText("Loading Campus Companion…")).toBeInTheDocument();
    expect(screen.queryByText("Demo sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
    expect(screen.queryByText("Real route content")).not.toBeInTheDocument();
  });
});
