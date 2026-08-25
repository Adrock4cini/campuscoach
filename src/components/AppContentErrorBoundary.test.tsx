import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppContentErrorBoundary } from "./AppContentErrorBoundary";

function BrokenRoute(): React.ReactNode {
  throw new Error("test route failed");
}

describe("AppContentErrorBoundary", () => {
  it("shows recovery actions when protected content throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppContentErrorBoundary resetKey="/study-lab">
        <BrokenRoute />
      </AppContentErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload this page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Today" })).toBeInTheDocument();
  });

  it("recovers when navigation changes the reset key", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(
      <AppContentErrorBoundary resetKey="/broken"><BrokenRoute /></AppContentErrorBoundary>,
    );
    view.rerender(<AppContentErrorBoundary resetKey="/dashboard"><p>Today is ready</p></AppContentErrorBoundary>);
    expect(screen.getByText("Today is ready")).toBeInTheDocument();
  });
});