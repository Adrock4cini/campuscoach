import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Calendar } from "./calendar";

describe("Calendar selection styling", () => {
  it("keeps selection on the day button without a second colored cell behind it", () => {
    const selected = new Date(2026, 7, 9);
    const { container } = render(
      <Calendar mode="single" month={selected} selected={selected} />,
    );

    const selectedButton = container.querySelector<HTMLButtonElement>("button[aria-selected='true']");
    expect(selectedButton).not.toBeNull();
    expect(selectedButton).toHaveClass("bg-primary");
    expect(selectedButton?.parentElement?.className).not.toContain(
      "[&:has([aria-selected])]:bg-accent",
    );
  });
});
