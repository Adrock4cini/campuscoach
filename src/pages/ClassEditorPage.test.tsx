import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassEditorPage from "./ClassEditorPage";

const mocks = vi.hoisted(() => ({
  classes: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  createClass: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { term: "Fall 2026" },
  }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
    loading: mocks.loading,
    error: mocks.error,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/realData/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realData/classes")>();
  return {
    ...actual,
    createStableClassId: () => "draft-class-uuid",
    createClass: mocks.createClass,
    updateClass: mocks.updateClass,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/classes/new" element={<ClassEditorPage />} />
        <Route path="/classes/:classId/edit" element={<ClassEditorPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClassEditorPage identity and navigation", () => {
  beforeEach(() => {
    mocks.classes = [];
    mocks.loading = false;
    mocks.error = null;
    mocks.createClass.mockReset().mockResolvedValue({
      uuid: "draft-class-uuid",
      clientClassId: "draft-class-uuid",
    });
    mocks.updateClass.mockReset().mockResolvedValue({
      uuid: "database-class-uuid",
      clientClassId: "legacy-route-key",
    });
  });

  it("creates with a stable draft id that does not depend on the class name", async () => {
    renderRoute("/classes/new");

    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "Biology" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));

    await waitFor(() => expect(mocks.createClass).toHaveBeenCalledWith(
      "user-1",
      "draft-class-uuid",
      expect.objectContaining({ name: "Biology", term: "Fall 2026" }),
    ));
    expect(await screen.findByTestId("location")).toHaveTextContent("/classes/draft-class-uuid");
  });

  it("renames by database uuid while preserving the existing route identity", async () => {
    mocks.classes = [{
      uuid: "database-class-uuid",
      id: "legacy-route-key",
      name: "Biology",
      professor: "Dr. Chen",
      location: "Science 204",
      days: [],
      time: "",
      endTime: "",
      color: "bg-primary",
      currentTopic: "",
      nextExamDate: "",
      readiness: 0,
      suggestedAction: "",
      gradingWeights: [],
      chapters: [],
      term: "Fall 2026",
    }];
    renderRoute("/classes/legacy-route-key/edit");

    const name = screen.getByLabelText("Class name");
    expect(name).toHaveValue("Biology");
    fireEvent.change(name, { target: { value: "General Biology" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateClass).toHaveBeenCalledWith(
      "user-1",
      "database-class-uuid",
      expect.objectContaining({ name: "General Biology" }),
    ));
    expect(await screen.findByTestId("location")).toHaveTextContent("/classes/legacy-route-key");
  });

  it("keeps typed edits mounted during a background class refresh", () => {
    mocks.classes = [{
      uuid: "database-class-uuid",
      id: "legacy-route-key",
      name: "Biology",
      professor: "",
      location: "",
      days: [],
      time: "",
      color: "bg-primary",
      currentTopic: "",
      nextExamDate: "",
      readiness: 0,
      suggestedAction: "",
      gradingWeights: [],
      chapters: [],
      term: "Fall 2026",
    }];
    const view = renderRoute("/classes/legacy-route-key/edit");
    fireEvent.change(screen.getByLabelText("Class name"), {
      target: { value: "Biology Lab" },
    });

    mocks.loading = true;
    view.rerender(
      <MemoryRouter initialEntries={["/classes/legacy-route-key/edit"]}>
        <Routes>
          <Route path="/classes/:classId/edit" element={<ClassEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Class name")).toHaveValue("Biology Lab");
    expect(screen.queryByText("Loading your class…")).not.toBeInTheDocument();

    mocks.loading = false;
    mocks.error = "Couldn’t load your classes";
    view.rerender(
      <MemoryRouter initialEntries={["/classes/legacy-route-key/edit"]}>
        <Routes>
          <Route path="/classes/:classId/edit" element={<ClassEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Class name")).toHaveValue("Biology Lab");
    expect(screen.getByRole("status")).toHaveTextContent(/keeping the last details loaded/i);
  });
});
