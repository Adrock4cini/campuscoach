import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import { CaptureFlow } from "./CaptureFlow";

const mocks = vi.hoisted(() => ({
  classes: [] as ClassInfo[],
  loading: true,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isDemoMode: false,
  }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
    isReal: true,
    loading: mocks.loading,
  }),
}));

const math = {
  id: "math",
  name: "Math",
} as ClassInfo;

const science = {
  id: "science",
  name: "Science",
} as ClassInfo;

function renderCapture(initialClassId?: string) {
  return render(
    <MemoryRouter>
      <CaptureFlow
        open
        initialKind="quick-note"
        initialClassId={initialClassId}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("CaptureFlow class boundaries", () => {
  beforeEach(() => {
    mocks.classes = [];
    mocks.loading = true;
  });

  it("does not silently choose the first class after global capture loads", () => {
    const view = renderCapture();
    expect(screen.getByText("Loading your classes…")).toBeInTheDocument();

    mocks.classes = [math, science];
    mocks.loading = false;
    view.rerender(
      <MemoryRouter>
        <CaptureFlow open initialKind="quick-note" onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const classPicker = screen.getByRole("combobox", { name: "Class" });
    expect(classPicker).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a class" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Type here…"), {
      target: { value: "Atoms have protons" },
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    fireEvent.change(classPicker, { target: { value: "science" } });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("preserves the class supplied by a class-scoped capture action", () => {
    mocks.classes = [math, science];
    mocks.loading = false;

    renderCapture("science");

    expect(screen.getByRole("combobox", { name: "Class" })).toHaveValue("science");
  });
});
