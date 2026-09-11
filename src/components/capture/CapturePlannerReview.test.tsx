import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapturePlannerReview } from "./CapturePlannerReview";

const mocks = vi.hoisted(() => ({ owner: "student", load: vi.fn(), confirm: vi.fn() }));
vi.mock("@/hooks/useClassIntelligence", () => ({ getAuthenticatedUserId: () => mocks.owner }));
vi.mock("@/lib/capture/plannerPersistence", () => ({ loadPlannerDates: mocks.load, confirmPlannerDate: mocks.confirm }));
const proposals = [
  { key: "assignment:1", captureId: "capture", plannerId: "a", classId: "psych", kind: "assignment", title: "Essay", date: "2026-09-12", excerpt: "Essay due Fri September 12", sourceLabel: "PSYC slides", warnings: ["Year missing from source; 2026 is suggested from the capture date. Check the year."] },
  { key: "exam:2", captureId: "capture", plannerId: "b", classId: "psych", kind: "exam", title: "Quiz 1", date: "2026-09-19", excerpt: "Quiz 1 September 19", sourceLabel: "PSYC slides", warnings: [] },
];
beforeEach(() => { vi.clearAllMocks(); mocks.owner = "student"; mocks.load.mockResolvedValue(proposals); mocks.confirm.mockResolvedValue("added"); });
const mount = () => render(<CapturePlannerReview classId="psych" className="Psychology" captureIds={["capture"]} />);
async function review() { fireEvent.click(await screen.findByRole("button", { name: "Review dates for planner" })); }

describe("planner confirmation UI", () => {
  it("requires source review and explicit selection, then confirms the selected date only", async () => {
    mount(); await review();
    expect(screen.getByText(/Nothing is added until/)).toBeInTheDocument();
    expect(screen.getByText(/written weekday does not match/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 0 checked dates" })).toBeDisabled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-09-11" } });
    expect(screen.queryByText(/written weekday does not match/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add 1 checked date" }));
    await screen.findByText(/1 added to your planner/);
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith("student", expect.objectContaining({ captureId: "capture", kind: "assignment" }), { title: "Essay", date: "2026-09-11" });
    expect(screen.getByText("1 possible date found")).toBeInTheDocument();
  });
  it("changing a checked date clears confirmation", async () => {
    mount(); await review(); fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-09-14" } });
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Add 0 checked dates" })).toBeDisabled();
  });
  it("review later and remount never save or lose the pending dates", async () => {
    const view = mount(); await review();
    fireEvent.click(screen.getByRole("button", { name: "Review later" }));
    view.unmount(); mount();
    await screen.findByText("2 possible dates found"); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("partial failure keeps the successful row saved and retries only the other row", async () => {
    mocks.confirm.mockResolvedValueOnce("added").mockRejectedValueOnce(new Error("Offline"));
    mount(); await review(); screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 checked dates" }));
    await screen.findByText("Offline");
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add 1 checked date" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(3));
    expect(mocks.confirm.mock.calls[2][1].kind).toBe("exam");
  });
  it("hides old drafts after a class/account change and performs no anonymous queries", async () => {
    const view = mount(); await review(); mocks.owner = "";
    view.rerender(<CapturePlannerReview classId="psych" />);
    expect(screen.queryByText("Essay")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("surfaces load failure with retry, not an empty no-dates claim", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Could not check saved material"));
    mount(); await screen.findByText("Could not check saved material");
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved dates" }));
    await screen.findByText("2 possible dates found");
  });
});
