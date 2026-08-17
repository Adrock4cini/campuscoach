import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildDemoDashboardModel } from "@/lib/demo/dashboardSampleAdapter";
import { DemoCoachHero } from "./DemoCoachHero";

describe("sample dashboard coach", () => {
  it("uses the production coach presentation with local-only weak spots", () => {
    render(
      <MemoryRouter>
        <DemoCoachHero model={buildDemoDashboardModel(new Date("2030-09-10T08:00:00-06:00"))} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Today's focus")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open class" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/classes\//),
    );
    fireEvent.click(screen.getByRole("button", { name: "Why this is first" }));
    fireEvent.click(screen.getByRole("button", { name: "Check weak spots" }));

    expect(screen.getByText("These sample concepts would be prioritized next.")).toBeInTheDocument();
    expect(screen.getByText("Polynomial long division")).toBeInTheDocument();
  });
});
