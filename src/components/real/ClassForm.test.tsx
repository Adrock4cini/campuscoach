import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassForm } from "./ClassForm";
import { emptyClassEditorValues } from "@/lib/realData/classes";

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ClassForm
      mode="create"
      initialValues={{
        ...emptyClassEditorValues("Fall 2026"),
        timeZone: "America/Denver",
      }}
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  return onSubmit;
}

describe("ClassForm", () => {
  it("uses selectors and saves weekdays in canonical order", async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "Biology II" } });
    fireEvent.click(screen.getByRole("button", { name: "Thu" }));
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    fireEvent.change(screen.getByLabelText("Starts (optional)"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Ends (optional)"), { target: { value: "10:15" } });
    fireEvent.change(screen.getByLabelText("Term starts"), { target: { value: "2026-08-24" } });
    fireEvent.change(screen.getByLabelText("Term ends"), { target: { value: "2026-12-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "Biology II",
      term: "Fall 2026",
      weekdays: ["Mon", "Thu"],
      semesterStartDate: "2026-08-24",
      semesterEndDate: "2026-12-12",
    });
  });

  it("blocks a recurring class without semester boundaries", async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "Biology II" } });
    fireEvent.click(screen.getByRole("button", { name: "Wed" }));
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));

    expect(await screen.findByText(/choose term dates so meetings stop/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps entered values visible after a save failure", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    renderForm(onSubmit);
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "Chemistry" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/entries are still here/i);
    expect(screen.getByLabelText("Class name")).toHaveValue("Chemistry");
  });
});
