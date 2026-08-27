import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasConnectGate } from "./CanvasConnectGate";

const feature = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/lib/canvas/feature", () => ({
  isCanvasConnectEnabled: () => feature.enabled,
}));

function TestRouter({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/integrations/canvas"]}>
      <Routes>
        <Route
          path="/integrations/canvas"
          element={<CanvasConnectGate>{children}</CanvasConnectGate>}
        />
        <Route path="/classes" element={<p>Classes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CanvasConnectGate", () => {
  beforeEach(() => {
    feature.enabled = false;
  });

  it("redirects a direct Canvas URL to the safe manual class flow by default", () => {
    render(<TestRouter><p>Canvas controls</p></TestRouter>);

    expect(screen.getByText("Classes")).toBeInTheDocument();
    expect(screen.queryByText("Canvas controls")).not.toBeInTheDocument();
  });

  it("renders Canvas only after the public build flag is explicitly enabled", () => {
    feature.enabled = true;
    render(<TestRouter><p>Canvas controls</p></TestRouter>);

    expect(screen.getByText("Canvas controls")).toBeInTheDocument();
    expect(screen.queryByText("Classes")).not.toBeInTheDocument();
  });
});
