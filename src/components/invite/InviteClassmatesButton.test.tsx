import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteClassmatesButton } from "./InviteClassmatesButton";

describe("InviteClassmatesButton launch boundary", () => {
  it("does not expose a share control until a real join route exists", () => {
    render(<InviteClassmatesButton classId="real-class" className="Biology 101" />);

    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/smarter study insights/i)).not.toBeInTheDocument();
  });
});
