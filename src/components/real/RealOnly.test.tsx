import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealOnly } from "./RealOnly";

const auth = vi.hoisted(() => ({
  mode: "demo" as "real" | "demo" | "loading",
}));
const accountScreenMount = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: auth.mode }),
}));

describe("account-only route boundary", () => {
  beforeEach(() => {
    auth.mode = "demo";
    accountScreenMount.mockClear();
  });

  it("explains the account requirement without mounting the account screen", () => {
    renderBoundary();

    expect(accountScreenMount).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Sign in to use this account feature" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByText(/connect Canvas/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/login|/onboarding?import=syllabus",
    );
  });

  it("mounts the account screen only after a real session is established", () => {
    auth.mode = "real";
    renderBoundary();

    expect(accountScreenMount).toHaveBeenCalledOnce();
    expect(screen.getByText("Account-backed screen")).toBeInTheDocument();
  });

  it("stays fail closed while authentication is unresolved", () => {
    auth.mode = "loading";
    renderBoundary();

    expect(accountScreenMount).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Checking account" })).toBeInTheDocument();
  });
});

function renderBoundary() {
  return render(
    <MemoryRouter initialEntries={["/onboarding?import=syllabus"]}>
      <RealOnly>
        <AccountBackedScreen />
      </RealOnly>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  const state = location.state as { next?: string } | null;
  return <span data-testid="location">{location.pathname}|{state?.next ?? ""}</span>;
}

function AccountBackedScreen() {
  accountScreenMount();
  return <div>Account-backed screen</div>;
}
