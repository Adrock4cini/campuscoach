import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealComingSoon } from "./RealComingSoon";

const auth = vi.hoisted(() => ({
  mode: "real" as "real" | "demo" | "loading",
}));
const previewMount = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: auth.mode }),
}));

describe("signed-in concept preview boundary", () => {
  beforeEach(() => {
    auth.mode = "real";
    previewMount.mockClear();
  });

  it("never mounts an interactive sample page for a signed-in student", () => {
    renderPage();

    expect(previewMount).not.toHaveBeenCalled();
    expect(screen.queryByText("Unsafe sample page")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view demo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Interactive sample pages are hidden while you’re signed in",
    );
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("keeps the standalone anonymous demo tour interactive", () => {
    auth.mode = "demo";
    renderPage();

    expect(previewMount).toHaveBeenCalledOnce();
    expect(screen.getByText("Unsafe sample page")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("does not mount either data mode while authentication is unresolved", () => {
    auth.mode = "loading";
    renderPage();

    expect(previewMount).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RealComingSoon title="Concept — coming soon">
        <UnsafeSamplePage />
      </RealComingSoon>
    </MemoryRouter>,
  );
}

function UnsafeSamplePage() {
  previewMount();
  return <button type="button">Unsafe sample page</button>;
}
