/**
 * Device-only seams we cannot exercise in a real iPhone browser here are
 * pinned as component/style regressions instead: sheets and study modals must
 * keep their own scroll container plus bottom safe-area padding so the primary
 * action stays reachable above the home indicator, the virtual keyboard, and
 * the fixed mobile bottom nav.
 */
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

vi.mock("@/contexts/FocusModeContext", () => ({
  useFocusMode: () => ({ mode: "calm", setMode: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real" }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({ classes: [], loading: false, error: null, reload: vi.fn() }),
}));

const read = (path: string) => readFileSync(path, "utf8");

describe("bottom-safe study and capture surfaces", () => {
  it("keeps the capture sheet scrollable with safe-area bottom padding", () => {
    const source = read("src/components/capture/CaptureFlow.tsx");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    // No fixed footer inside the sheet: the action column scrolls with content.
    expect(source).not.toContain("fixed bottom-0");
  });

  it.each([
    "src/components/capture/StudyFromCaptureDrawer.tsx",
    "src/components/capture/CaptureDetailDrawer.tsx",
    "src/components/ChapterDetailDrawer.tsx",
  ])("gives %s a scroll container and safe-area bottom padding", (path) => {
    const source = read(path);
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("pb-[max(1.5rem,env(safe-area-inset-bottom))]");
  });

  it.each([
    "src/components/study/RealStudyRunner.tsx",
    "src/components/study/RealMatchingSession.tsx",
  ])("keeps %s within the dynamic viewport and above the home indicator", (path) => {
    const source = read(path);
    expect(source).toContain("max-h-[calc(100dvh_-_1rem)]");
    expect(source).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("sizes dialogs to the dynamic viewport so 320–430px widths never overflow", () => {
    const dialog = read("src/components/ui/dialog.tsx");
    expect(dialog).toContain("w-[calc(100vw_-_1rem)]");
    expect(dialog).toContain("max-h-[calc(100dvh-1rem)]");
    expect(dialog).toContain("overflow-x-hidden");
  });
});

describe("mobile command palette", () => {
  function renderPalette(onOpenChange = vi.fn()) {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <CommandPalette open onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    return onOpenChange;
  }

  it("opens with a focused search input", () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/search your classes/i);
    expect(input).toHaveFocus();
  });

  it("anchors near the top on phones so the keyboard cannot cover the input", () => {
    const command = read("src/components/ui/command.tsx");
    expect(command).toContain("top-4");
    expect(command).toContain("translate-y-0");
    expect(command).toContain("sm:translate-y-[-50%]");
    expect(command).toContain("max-h-[60dvh]");
    // Result rows meet the 44px touch target minimum.
    expect(command).toContain("min-h-11");
  });

  it("closes and returns to the origin route when a destination is chosen", () => {
    const onOpenChange = renderPalette();
    fireEvent.click(screen.getByText("Calendar"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not tease unavailable routes to signed-in students", () => {
    renderPalette();
    expect(screen.queryByText("Progress")).not.toBeInTheDocument();
    expect(screen.queryByText("Scholarships")).not.toBeInTheDocument();
    expect(screen.queryByText("Path to Graduation")).not.toBeInTheDocument();
    expect(screen.queryByText(/focus sprint/i)).not.toBeInTheDocument();
  });
});
