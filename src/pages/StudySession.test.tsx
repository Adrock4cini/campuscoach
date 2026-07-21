import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import StudySession from "./StudySession";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real" }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe("StudySession real-data boundary", () => {
  it("redirects signed-in students away from the sample question engine", async () => {
    render(
      <MemoryRouter initialEntries={[
        "/study-lab/session?mode=multiple-choice&classId=math&captureId=capture-1",
      ]}>
        <Routes>
          <Route path="/study-lab/session" element={<StudySession />} />
          <Route path="/study-lab" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/study-lab?classId=math&captureId=capture-1&format=multiple_choice",
    );
  });
});
