import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SchoolCombobox } from "./SchoolCombobox";

const emptySchoolQuery = {
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  ilike: vi.fn(),
  then: vi.fn(),
};

emptySchoolQuery.select.mockReturnValue(emptySchoolQuery);
emptySchoolQuery.order.mockReturnValue(emptySchoolQuery);
emptySchoolQuery.limit.mockReturnValue(emptySchoolQuery);
emptySchoolQuery.ilike.mockResolvedValue({ data: [] });
emptySchoolQuery.then.mockImplementation((resolve, reject) =>
  Promise.resolve({ data: [] }).then(resolve, reject)
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => emptySchoolQuery),
  },
}));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SchoolCombobox", () => {
  it("lets a student use an unlisted school without requiring a college keyword", async () => {
    const onChange = vi.fn();
    render(<SchoolCombobox value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText("Type to search…"), {
      target: { value: "North Summit Academy" },
    });

    const customName = await screen.findByText("North Summit Academy");
    fireEvent.click(customName.closest('[role="option"]')!);
    expect(onChange).toHaveBeenCalledWith("North Summit Academy");
  });

  it("still canonicalizes a known school alias", async () => {
    const onChange = vi.fn();
    render(<SchoolCombobox value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText("Type to search…"), {
      target: { value: "USU" },
    });

    fireEvent.click(await screen.findByRole("option", { name: "Utah State University" }));
    expect(onChange).toHaveBeenCalledWith("Utah State University");
  });
});
