import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

const auth = vi.hoisted(() => ({
  mode: "loading" as "loading" | "real" | "demo",
  user: null as { id: string } | null,
  loading: true,
  recovering: false,
  agreementStatus: "checking" as "checking" | "accepted" | "required" | "error",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarTrigger: () => <button>Menu</button>,
}));

vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => <div>Demo sidebar</div> }));
vi.mock("@/components/CaptureButton", () => ({ CaptureButton: () => <button>Capture</button> }));
vi.mock("@/components/dashboard/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/CanvasAutoSync", () => ({ CanvasAutoSync: () => null }));
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
  CaptureProvider: ({ children }: { children: React.ReactNode }) => {
    const [draft, setDraft] = useState("");
    return <><input aria-label="Capture draft" value={draft} onChange={(event) => setDraft(event.target.value)} />{children}</>;
  },
}));

describe("AppLayout auth boundary", () => {
  beforeEach(() => {
    auth.mode = "loading";
    auth.user = null;
    auth.loading = true;
    auth.recovering = false;
    auth.agreementStatus = "checking";
  });

  it("keeps all demo navigation and capture actions hidden while auth resolves", () => {
    render(<AppLayout><div>Real route content</div></AppLayout>);

    expect(screen.getByText("Loading Campus Companion…")).toBeInTheDocument();
    expect(screen.queryByText("Demo sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
    expect(screen.queryByText("Real route content")).not.toBeInTheDocument();
  });

  it("renders a settled closed-beta route redirect without mounting the sample shell", () => {
    auth.mode = "loading";
    auth.loading = false;
    auth.recovering = false;

    render(<AppLayout><div>Login redirect gate</div></AppLayout>);

    expect(screen.getByText("Login redirect gate")).toBeInTheDocument();
    expect(screen.queryByText("Loading Campus Companion…")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Capture draft" })).not.toBeInTheDocument();
  });

  it("keeps a recovering signed-out account on the neutral loading shell", () => {
    auth.mode = "loading";
    auth.loading = false;
    auth.recovering = true;

    render(<AppLayout><div>Protected route</div></AppLayout>);

    expect(screen.getByText("Loading Campus Companion…")).toBeInTheDocument();
    expect(screen.queryByText("Protected route")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo sidebar")).not.toBeInTheDocument();
  });

  it("keeps search reachable on phone widths", () => {
    auth.mode = "real";
    auth.user = { id: "child-a" };
    auth.loading = false;
    auth.agreementStatus = "accepted";
    render(<AppLayout><div>Real route content</div></AppLayout>);

    const mobileSearch = screen.getByRole("button", { name: "Search" });
    expect(mobileSearch.className).toContain("md:hidden");
    expect(mobileSearch.className).toContain("h-11");
  });

  it("unmounts owner-scoped drafts when the signed-in account changes", () => {
    auth.mode = "real";
    auth.user = { id: "child-a" };
    auth.loading = false;
    auth.agreementStatus = "accepted";
    const { rerender } = render(<AppLayout><div>Real route content</div></AppLayout>);
    fireEvent.change(screen.getByRole("textbox", { name: "Capture draft" }), { target: { value: "Child A private note" } });
    expect(screen.getByRole("textbox", { name: "Capture draft" })).toHaveValue("Child A private note");

    auth.user = { id: "child-b" };
    rerender(<AppLayout><div>Real route content</div></AppLayout>);

    expect(screen.getByRole("textbox", { name: "Capture draft" })).toHaveValue("");
  });

  it("keeps owner-scoped drafts through a transient mode refresh", () => {
    auth.mode = "real";
    auth.user = { id: "child-a" };
    auth.loading = false;
    auth.agreementStatus = "accepted";
    const { rerender } = render(<AppLayout><div>Real route content</div></AppLayout>);
    fireEvent.change(screen.getByRole("textbox", { name: "Capture draft" }), { target: { value: "Keep this note" } });

    auth.mode = "loading";
    rerender(<AppLayout><div>Real route content</div></AppLayout>);
    auth.mode = "real";
    rerender(<AppLayout><div>Real route content</div></AppLayout>);

    expect(screen.getByRole("textbox", { name: "Capture draft" })).toHaveValue("Keep this note");
  });

  it("keeps the authenticated app shell unmounted until the service receipt is current", () => {
    auth.mode = "real";
    auth.user = { id: "child-a" };
    auth.loading = false;
    auth.agreementStatus = "required";

    render(<AppLayout><div>Agreement route gate</div></AppLayout>);

    expect(screen.getByText("Agreement route gate")).toBeInTheDocument();
    expect(screen.queryByText("Demo sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Capture draft" })).not.toBeInTheDocument();
  });
});
